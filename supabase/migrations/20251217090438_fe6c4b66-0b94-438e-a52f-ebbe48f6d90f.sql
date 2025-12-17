-- Phase 2A: Event Spine with Fortune-500 Reliability
-- Atomic claiming, idempotency, dead-lettering

-- =============================================
-- TABLE: system_events (canonical event log)
-- =============================================
CREATE TABLE IF NOT EXISTS public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  emitted_by text NOT NULL,
  emitted_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NULL,
  last_error text NULL,
  processed_at timestamptz NULL,
  processed_by text NULL
);

-- Unique constraint on idempotency_key (global uniqueness)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_events_idempotency_key_key') THEN
    ALTER TABLE public.system_events ADD CONSTRAINT system_events_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_system_events_claim ON public.system_events (event_type, status, next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_system_events_emitted_at ON public.system_events (emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_tenant ON public.system_events (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_events_entity ON public.system_events (entity_type, entity_id);

-- =============================================
-- TABLE: system_event_consumers (subscriber registry)
-- =============================================
CREATE TABLE IF NOT EXISTS public.system_event_consumers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_name text NOT NULL,
  event_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_processed_at timestamptz NULL,
  last_event_id uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consumer_name, event_type)
);

CREATE INDEX IF NOT EXISTS idx_system_event_consumers_enabled ON public.system_event_consumers (event_type) WHERE enabled = true;

-- =============================================
-- TABLE: system_event_dead_letter (failed events)
-- =============================================
CREATE TABLE IF NOT EXISTS public.system_event_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid NOT NULL REFERENCES public.system_events(id) ON DELETE CASCADE,
  consumer_name text NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dead_lettered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_event ON public.system_event_dead_letter (original_event_id);
CREATE INDEX IF NOT EXISTS idx_dead_letter_consumer ON public.system_event_dead_letter (consumer_name);
CREATE INDEX IF NOT EXISTS idx_dead_letter_time ON public.system_event_dead_letter (dead_lettered_at DESC);

-- =============================================
-- RPC: claim_system_events (ATOMIC with FOR UPDATE SKIP LOCKED)
-- =============================================
CREATE OR REPLACE FUNCTION public.claim_system_events(
  p_event_type text,
  p_limit int DEFAULT 10
)
RETURNS SETOF public.system_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT se.id
    FROM public.system_events se
    WHERE se.event_type = p_event_type
      AND se.status IN ('pending', 'failed')
      AND (se.next_attempt_at IS NULL OR se.next_attempt_at <= now())
    ORDER BY se.emitted_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.system_events
  SET status = 'processing',
      attempts = attempts + 1
  FROM claimable
  WHERE system_events.id = claimable.id
  RETURNING system_events.*;
END;
$$;

-- =============================================
-- RPC: mark_event_processed
-- =============================================
CREATE OR REPLACE FUNCTION public.mark_event_processed(
  p_event_id uuid,
  p_consumer_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
BEGIN
  -- Get event type and update event
  UPDATE public.system_events
  SET status = 'processed',
      processed_at = now(),
      processed_by = p_consumer_name,
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
$$;

-- =============================================
-- RPC: mark_event_failed (with dead-lettering)
-- =============================================
CREATE OR REPLACE FUNCTION public.mark_event_failed(
  p_event_id uuid,
  p_consumer_name text,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- =============================================
-- RLS Policies
-- =============================================
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_event_consumers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_event_dead_letter ENABLE ROW LEVEL SECURITY;

-- Service role bypass for edge functions
DROP POLICY IF EXISTS "Service role full access to system_events" ON public.system_events;
CREATE POLICY "Service role full access to system_events" ON public.system_events
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to system_event_consumers" ON public.system_event_consumers;
CREATE POLICY "Service role full access to system_event_consumers" ON public.system_event_consumers
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access to system_event_dead_letter" ON public.system_event_dead_letter;
CREATE POLICY "Service role full access to system_event_dead_letter" ON public.system_event_dead_letter
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- Seed default consumer
-- =============================================
INSERT INTO public.system_event_consumers (consumer_name, event_type, enabled)
VALUES ('cold_agent_enroller', 'lead_created', true)
ON CONFLICT (consumer_name, event_type) DO NOTHING;