-- Phase 1 Final Hardening: Replace extensions.http with pg_net (async) + fallback
-- 
-- Verify with:
--   SELECT action_type, entity_id, success, timestamp FROM platform_audit_log 
--   WHERE entity_type = 'scheduler' ORDER BY timestamp DESC LIMIT 10;
--   
--   SELECT public.call_ceo_scheduler('run_daily_briefs');

DROP FUNCTION IF EXISTS public.call_ceo_scheduler(text);

CREATE OR REPLACE FUNCTION public.call_ceo_scheduler(p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
  v_start_time timestamptz := clock_timestamp();
  v_url text;
  v_secret text;
  v_idempotency_key text;
  v_duration_ms int;
  v_request_id bigint;
  v_has_pg_net boolean;
  v_has_http_ext boolean;
  v_response_status int;
  v_response_body jsonb;
  v_success boolean;
  v_error_msg text;
  v_method text := 'none';
BEGIN
  -- Get scheduler secret from DB setting
  v_secret := current_setting('app.internal_scheduler_secret', true);
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'action', p_action,
      'error', 'INTERNAL_SCHEDULER_SECRET not configured in DB',
      'duration_ms', 0
    );
  END IF;

  -- Get Supabase URL
  v_url := current_setting('app.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://xtybowbfihlmtdtdmoyn.supabase.co';
  END IF;

  -- Compute idempotency key based on action and time window
  v_idempotency_key := 'scheduler_' || p_action || '_' || 
    CASE p_action
      WHEN 'run_daily_briefs' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      WHEN 'run_cost_rollup' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"') || lpad((extract(hour from now() AT TIME ZONE 'UTC')::int / 6 * 6)::text, 2, '0')
      WHEN 'run_outreach_queue' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:') || lpad((extract(minute from now() AT TIME ZONE 'UTC')::int / 15 * 15)::text, 2, '0')
      ELSE to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI')
    END;

  -- Check idempotency (skip if already ran in this window)
  BEGIN
    INSERT INTO scheduler_idempotency (job_key) VALUES (v_idempotency_key);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', true,
      'action', p_action,
      'status', 'skipped',
      'reason', 'duplicate_job',
      'job_key', v_idempotency_key,
      'duration_ms', 0
    );
  END;

  -- HEARTBEAT 1: Log cron_invocation_started BEFORE network call
  BEGIN
    INSERT INTO platform_audit_log (
      entity_type, entity_id, action_type, actor_id, actor_type, description, success, timestamp
    ) VALUES (
      'scheduler', p_action, 'cron_invocation_started', 'system', 'cron',
      'Cron job started: ' || p_action, true, clock_timestamp()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to log cron_invocation_started: %', SQLERRM;
  END;

  -- Check which HTTP extension is available
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'http_post' AND pronamespace = 'net'::regnamespace) INTO v_has_pg_net;
  SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'http' AND pronamespace = 'extensions'::regnamespace) INTO v_has_http_ext;

  -- Try pg_net first (async, preferred)
  IF v_has_pg_net THEN
    BEGIN
      SELECT net.http_post(
        url := v_url || '/functions/v1/ceo-scheduler',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Internal-Secret', v_secret
        ),
        body := jsonb_build_object('action', p_action)
      ) INTO v_request_id;
      
      v_method := 'pg_net';
      v_success := true;
      v_response_status := 202; -- Accepted (async)
      v_error_msg := null;
      v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::int;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_msg := 'pg_net failed: ' || SQLERRM;
      v_success := false;
      v_response_status := 0;
      v_method := 'pg_net_error';
    END;
  END IF;

  -- Fallback to extensions.http if pg_net failed or unavailable
  IF NOT v_success AND v_has_http_ext THEN
    BEGIN
      SELECT 
        status,
        content::jsonb
      INTO v_response_status, v_response_body
      FROM extensions.http((
        'POST',
        v_url || '/functions/v1/ceo-scheduler',
        ARRAY[
          extensions.http_header('Content-Type', 'application/json'),
          extensions.http_header('X-Internal-Secret', v_secret)
        ],
        'application/json',
        jsonb_build_object('action', p_action)::text
      )::extensions.http_request);

      v_method := 'extensions_http';
      v_success := v_response_status >= 200 AND v_response_status < 300;
      v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::int;

      IF NOT v_success THEN
        v_error_msg := coalesce(v_response_body->>'error', 'HTTP ' || v_response_status);
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_success := false;
      v_error_msg := coalesce(v_error_msg, '') || ' | extensions.http failed: ' || SQLERRM;
      v_response_status := 0;
      v_method := 'extensions_http_error';
      v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::int;
    END;
  END IF;

  -- No HTTP method available
  IF NOT v_has_pg_net AND NOT v_has_http_ext THEN
    v_success := false;
    v_error_msg := 'No HTTP extension available (need pg_net or extensions.http)';
    v_response_status := 0;
    v_method := 'no_http_ext';
    v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::int;
  END IF;

  -- HEARTBEAT 2: Log cron_invocation_finished AFTER network call
  BEGIN
    INSERT INTO platform_audit_log (
      entity_type, entity_id, action_type, actor_id, actor_type, description, 
      success, duration_ms, metadata, timestamp
    ) VALUES (
      'scheduler', p_action, 'cron_invocation_finished', 'system', 'cron',
      CASE 
        WHEN v_success AND v_method = 'pg_net' THEN 'Cron job queued (async): ' || p_action
        WHEN v_success THEN 'Cron job completed: ' || p_action 
        ELSE 'Cron job failed: ' || p_action 
      END,
      v_success, v_duration_ms,
      jsonb_build_object(
        'status_code', v_response_status,
        'job_key', v_idempotency_key,
        'method', v_method,
        'request_id', v_request_id,
        'error', v_error_msg,
        'note', CASE WHEN v_method = 'pg_net' THEN 'queued via pg_net (async)' ELSE null END
      ),
      clock_timestamp()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to log cron_invocation_finished: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'ok', v_success,
    'action', p_action,
    'status_code', v_response_status,
    'method', v_method,
    'request_id', v_request_id,
    'response', v_response_body,
    'error', v_error_msg,
    'duration_ms', v_duration_ms,
    'job_key', v_idempotency_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.call_ceo_scheduler(text) TO authenticated;

COMMENT ON FUNCTION public.call_ceo_scheduler(text) IS 'Calls ceo-scheduler edge function via pg_net (async) or extensions.http (sync fallback). Writes heartbeat audit logs.';