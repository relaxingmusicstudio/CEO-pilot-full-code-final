-- =============================================================================
-- PHASE 1: PG_NET DELIVERY RECONCILIATION
-- =============================================================================

-- Create the reconciliation function
CREATE OR REPLACE FUNCTION public.reconcile_scheduler_pg_net()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $function$
DECLARE
  v_scanned int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_missing_response int := 0;
  v_has_pg_net_responses boolean := false;
  v_log_record record;
  v_response_record record;
  v_request_id bigint;
BEGIN
  -- Check if pg_net response tracking is available
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'net' AND table_name = '_http_response'
    ) INTO v_has_pg_net_responses;
  EXCEPTION WHEN OTHERS THEN
    v_has_pg_net_responses := false;
  END;

  -- If no pg_net response table, try the http_request_queue view
  IF NOT v_has_pg_net_responses THEN
    BEGIN
      SELECT EXISTS(
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'net' AND table_name = 'http_request_queue'
      ) INTO v_has_pg_net_responses;
    EXCEPTION WHEN OTHERS THEN
      v_has_pg_net_responses := false;
    END;
  END IF;

  -- Loop through unreconciled audit logs
  FOR v_log_record IN
    SELECT 
      id,
      metadata,
      (metadata->>'request_id')::bigint as request_id
    FROM platform_audit_log
    WHERE entity_type = 'scheduler'
      AND action_type = 'cron_invocation_finished'
      AND metadata->>'method' = 'pg_net'
      AND metadata->>'request_id' IS NOT NULL
      AND (metadata->>'delivered' IS NULL OR metadata->>'delivered' != 'true')
      AND timestamp > now() - interval '1 hour'
    ORDER BY timestamp DESC
    LIMIT 100
  LOOP
    v_scanned := v_scanned + 1;
    v_request_id := v_log_record.request_id;

    IF v_has_pg_net_responses THEN
      BEGIN
        SELECT 
          status_code,
          error_msg,
          created
        INTO v_response_record
        FROM net._http_response
        WHERE id = v_request_id;
        
        IF FOUND THEN
          UPDATE platform_audit_log
          SET metadata = metadata || jsonb_build_object(
            'delivered', 'true',
            'delivered_status_code', v_response_record.status_code,
            'delivered_at', v_response_record.created,
            'delivered_error', v_response_record.error_msg,
            'reconciled_at', now()
          )
          WHERE id = v_log_record.id;
          
          v_updated := v_updated + 1;
        ELSE
          v_missing_response := v_missing_response + 1;
        END IF;
      EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'net._http_response not found';
        v_missing_response := v_missing_response + 1;
      WHEN OTHERS THEN
        RAISE NOTICE 'Error looking up response: %', SQLERRM;
        v_skipped := v_skipped + 1;
      END;
    ELSE
      UPDATE platform_audit_log
      SET metadata = metadata || jsonb_build_object(
        'delivered', 'unknown',
        'delivered_note', 'pg_net response table not available',
        'reconciled_at', now()
      )
      WHERE id = v_log_record.id;
      
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'scanned', v_scanned,
    'updated', v_updated,
    'skipped', v_skipped,
    'missing_response', v_missing_response,
    'has_pg_net_responses', v_has_pg_net_responses,
    'reconciled_at', now()
  );
END;
$function$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.reconcile_scheduler_pg_net() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_scheduler_pg_net() TO service_role;

-- Schedule cron job using proper quoting
SELECT cron.schedule(
  'ceo-scheduler-reconcile-pg-net',
  '*/5 * * * *',
  'SELECT public.reconcile_scheduler_pg_net();'
);