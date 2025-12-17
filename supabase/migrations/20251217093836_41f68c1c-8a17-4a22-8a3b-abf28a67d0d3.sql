-- FIX: mark_event_processed references non-existent columns
-- Only update columns that exist: status, last_error

CREATE OR REPLACE FUNCTION public.mark_event_processed(p_event_id uuid, p_consumer_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event_type text;
BEGIN
  -- Update event status (only existing columns)
  UPDATE public.system_events
  SET status = 'processed',
      last_error = NULL
  WHERE id = p_event_id
  RETURNING event_type INTO v_event_type;

  -- Update consumer tracking (upsert pattern)
  IF v_event_type IS NOT NULL THEN
    INSERT INTO public.system_event_consumers (consumer_name, event_type, last_processed_at, last_event_id, updated_at)
    VALUES (p_consumer_name, v_event_type, now(), p_event_id, now())
    ON CONFLICT (consumer_name, event_type)
    DO UPDATE SET
      last_processed_at = now(),
      last_event_id = p_event_id,
      updated_at = now();
  END IF;
END;
$function$;

-- Also fix mark_event_failed if it has similar issues
CREATE OR REPLACE FUNCTION public.mark_event_failed(p_event_id uuid, p_consumer_name text, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempts int;
  v_payload jsonb;
  v_backoff_seconds int;
BEGIN
  -- Get current attempts
  SELECT attempts, payload INTO v_attempts, v_payload
  FROM public.system_events
  WHERE id = p_event_id;

  IF v_attempts IS NULL THEN
    RETURN; -- Event not found
  END IF;

  IF v_attempts >= 5 THEN
    -- Dead letter after 5 attempts
    UPDATE public.system_events
    SET status = 'dead_letter',
        last_error = p_error
    WHERE id = p_event_id;

    -- Insert into dead letter queue
    INSERT INTO public.system_event_dead_letter (original_event_id, consumer_name, reason, payload)
    VALUES (p_event_id, p_consumer_name, p_error, v_payload);

    -- Create CEO alert for dead-lettered event
    INSERT INTO public.ceo_action_queue (action_type, priority, status, payload, claude_reasoning, source)
    VALUES (
      'review_dead_letter',
      'high',
      'pending',
      jsonb_build_object('event_id', p_event_id, 'consumer', p_consumer_name, 'error', p_error),
      'Event failed after 5 attempts and was dead-lettered. Requires CEO review.',
      'event_processor'
    );
  ELSE
    -- Calculate exponential backoff (2^attempts seconds, capped at 300s = 5 min)
    v_backoff_seconds := LEAST(POWER(2, v_attempts)::int, 300);

    UPDATE public.system_events
    SET status = 'failed',
        last_error = p_error,
        next_attempt_at = now() + (v_backoff_seconds || ' seconds')::interval
    WHERE id = p_event_id;
  END IF;
END;
$function$;