-- =============================================================
-- Phase 1: Scheduler + Webhooks Infrastructure (Corrected)
-- =============================================================

-- 1) Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2) Create inbound_webhooks table for raw webhook storage
CREATE TABLE IF NOT EXISTS public.inbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  headers JSONB NULL,
  payload JSONB NOT NULL,
  dedupe_key TEXT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error TEXT NULL,
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for deduplication per tenant+source
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_webhooks_dedupe 
ON public.inbound_webhooks(tenant_id, source, dedupe_key) 
WHERE dedupe_key IS NOT NULL;

-- Index for querying by tenant
CREATE INDEX IF NOT EXISTS idx_inbound_webhooks_tenant ON public.inbound_webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbound_webhooks_status ON public.inbound_webhooks(status);

-- Enable RLS
ALTER TABLE public.inbound_webhooks ENABLE ROW LEVEL SECURITY;

-- RLS policies for inbound_webhooks
DROP POLICY IF EXISTS "Service role full access to inbound_webhooks" ON public.inbound_webhooks;
CREATE POLICY "Service role full access to inbound_webhooks" 
ON public.inbound_webhooks FOR ALL 
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tenant isolation for inbound_webhooks" ON public.inbound_webhooks;
CREATE POLICY "Tenant isolation for inbound_webhooks" 
ON public.inbound_webhooks FOR ALL 
USING (tenant_id = get_user_tenant_id() OR tenant_id IS NULL);

-- 3) Create tenant_integrations table for API key lookups
CREATE TABLE IF NOT EXISTS public.tenant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  meta_app_secret TEXT NULL,
  meta_verify_token TEXT NULL,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_provider UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_lookup ON public.tenant_integrations(api_key_hash) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenant_integrations
DROP POLICY IF EXISTS "Service role full access to tenant_integrations" ON public.tenant_integrations;
CREATE POLICY "Service role full access to tenant_integrations" 
ON public.tenant_integrations FOR ALL 
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tenant isolation for tenant_integrations" ON public.tenant_integrations;
CREATE POLICY "Tenant isolation for tenant_integrations" 
ON public.tenant_integrations FOR ALL 
USING (tenant_id = get_user_tenant_id());

-- 4) Create scheduler_idempotency table to prevent duplicate job runs
CREATE TABLE IF NOT EXISTS public.scheduler_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_scheduler_idempotency_created ON public.scheduler_idempotency(created_at);

-- Enable RLS (service role only)
ALTER TABLE public.scheduler_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only for scheduler_idempotency" ON public.scheduler_idempotency;
CREATE POLICY "Service role only for scheduler_idempotency" 
ON public.scheduler_idempotency FOR ALL 
USING (true) WITH CHECK (true);

-- 5) Add missing columns to leads table if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='persona_type') THEN
    ALTER TABLE public.leads ADD COLUMN persona_type TEXT DEFAULT 'b2c_local';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='qualification_framework') THEN
    ALTER TABLE public.leads ADD COLUMN qualification_framework TEXT DEFAULT 'speed_to_lead';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='inbound_webhook_id') THEN
    ALTER TABLE public.leads ADD COLUMN inbound_webhook_id UUID NULL;
  END IF;
END $$;