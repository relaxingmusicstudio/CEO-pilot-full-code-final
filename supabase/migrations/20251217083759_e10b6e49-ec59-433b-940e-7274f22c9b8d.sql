-- Phase 1A: Create contact_consent table
CREATE TABLE IF NOT EXISTS public.contact_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  channel text NOT NULL,
  consent_type text NOT NULL,
  consent_text text,
  source text NOT NULL,
  ip_address text,
  form_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_channel text,
  CONSTRAINT contact_consent_channel_check CHECK (channel IN ('sms', 'email', 'voice', 'all')),
  CONSTRAINT contact_consent_type_check CHECK (consent_type IN ('express_written', 'prior_express', 'opt_in', 'implied'))
);

CREATE INDEX IF NOT EXISTS idx_contact_consent_contact ON public.contact_consent (contact_id);

ALTER TABLE public.contact_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access contact_consent" ON public.contact_consent;
CREATE POLICY "Service role full access contact_consent" ON public.contact_consent
  FOR ALL USING (true) WITH CHECK (true);

-- Phase 1B: Create contact_suppression table
CREATE TABLE IF NOT EXISTS public.contact_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  channel text NOT NULL,
  reason text NOT NULL,
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  reactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_suppression_channel_check CHECK (channel IN ('sms', 'email', 'voice', 'all'))
);

CREATE INDEX IF NOT EXISTS idx_contact_suppression_contact ON public.contact_suppression (contact_id);

ALTER TABLE public.contact_suppression ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access contact_suppression" ON public.contact_suppression;
CREATE POLICY "Service role full access contact_suppression" ON public.contact_suppression
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view contact_suppression" ON public.contact_suppression;
CREATE POLICY "Anyone can view contact_suppression" ON public.contact_suppression
  FOR SELECT USING (true);

-- Phase 1C: Create outbound_touch_log table
CREATE TABLE IF NOT EXISTS public.outbound_touch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  channel text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  message_id uuid,
  call_id uuid,
  template_id text,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'sent',
  block_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_touch_channel_check CHECK (channel IN ('sms', 'email', 'voice')),
  CONSTRAINT outbound_touch_direction_check CHECK (direction IN ('outbound', 'inbound')),
  CONSTRAINT outbound_touch_status_check CHECK (status IN ('sent', 'blocked', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_outbound_touch_contact ON public.outbound_touch_log (contact_id);
CREATE INDEX IF NOT EXISTS idx_outbound_touch_created ON public.outbound_touch_log (created_at DESC);

ALTER TABLE public.outbound_touch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access outbound_touch_log" ON public.outbound_touch_log;
CREATE POLICY "Service role full access outbound_touch_log" ON public.outbound_touch_log
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view outbound_touch_log" ON public.outbound_touch_log;
CREATE POLICY "Anyone can view outbound_touch_log" ON public.outbound_touch_log
  FOR SELECT USING (true);

-- Phase 1D: Extend action_history for audit
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'action_history' AND column_name = 'actor_type') THEN
    ALTER TABLE public.action_history ADD COLUMN actor_type text DEFAULT 'system';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'action_history' AND column_name = 'actor_module') THEN
    ALTER TABLE public.action_history ADD COLUMN actor_module text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'action_history' AND column_name = 'override') THEN
    ALTER TABLE public.action_history ADD COLUMN override boolean DEFAULT false;
  END IF;
END $$;