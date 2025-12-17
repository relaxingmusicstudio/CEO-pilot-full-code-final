-- =============================================
-- PHASE 2: Event Spine + Lead Ownership Enforcement
-- System Contract v1.1.1
-- =============================================

-- 1) system_events: Canonical event store (append-only, idempotent)
CREATE TABLE IF NOT EXISTS public.system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  emitted_by text NOT NULL,
  emitted_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for idempotency (tenant-scoped)
CREATE UNIQUE INDEX IF NOT EXISTS system_events_idempotency_idx 
  ON public.system_events(tenant_id, idempotency_key) 
  WHERE tenant_id IS NOT NULL;

-- For global events (no tenant)
CREATE UNIQUE INDEX IF NOT EXISTS system_events_idempotency_global_idx 
  ON public.system_events(idempotency_key) 
  WHERE tenant_id IS NULL;

-- Indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS system_events_pending_idx 
  ON public.system_events(event_type, status, next_attempt_at) 
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS system_events_entity_idx 
  ON public.system_events(entity_type, entity_id);

-- 2) system_event_consumers: Track consumer state
CREATE TABLE IF NOT EXISTS public.system_event_consumers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_name text NOT NULL,
  event_type text NOT NULL,
  last_processed_at timestamptz NULL,
  last_event_id uuid NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(consumer_name, event_type)
);

-- 3) system_event_dead_letter: Failed events after max retries
CREATE TABLE IF NOT EXISTS public.system_event_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid NOT NULL REFERENCES public.system_events(id) ON DELETE CASCADE,
  consumer_name text NOT NULL,
  dead_lettered_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS system_event_dead_letter_event_idx 
  ON public.system_event_dead_letter(original_event_id);

CREATE INDEX IF NOT EXISTS system_event_dead_letter_consumer_idx 
  ON public.system_event_dead_letter(consumer_name, dead_lettered_at DESC);

-- Enable RLS on event tables
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_event_consumers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_event_dead_letter ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Service role can do everything, authenticated users can read their tenant's events
CREATE POLICY "Service role full access on system_events" 
  ON public.system_events FOR ALL 
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can read own tenant events" 
  ON public.system_events FOR SELECT 
  USING (tenant_id = public.get_user_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "Service role full access on system_event_consumers" 
  ON public.system_event_consumers FOR ALL 
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on system_event_dead_letter" 
  ON public.system_event_dead_letter FOR ALL 
  USING (true) WITH CHECK (true);

-- =============================================
-- LEAD OWNERSHIP ENFORCEMENT
-- Prevent direct updates to ownership-controlled fields
-- =============================================

-- Create a function to check if update is via RPC context
CREATE OR REPLACE FUNCTION public.is_rpc_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.rpc_context', true) = 'true'
$$;

-- Create RLS policy to prevent direct lead updates to controlled fields
-- This works by denying UPDATE unless called from RPC context
CREATE OR REPLACE FUNCTION public.check_lead_update_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_rpc boolean;
  v_cold_fields text[] := ARRAY['lead_score', 'last_call_date', 'total_call_attempts', 'last_call_outcome', 'last_call_notes'];
  v_sales_fields text[] := ARRAY['assigned_to', 'custom_fields'];
  v_restricted_statuses text[] := ARRAY['qualified', 'disqualified', 'opportunity', 'negotiating', 'closed_won', 'closed_lost'];
BEGIN
  -- Check if we're in RPC context
  v_is_rpc := current_setting('app.rpc_context', true) = 'true';
  
  -- If RPC context, allow all updates
  IF v_is_rpc THEN
    RETURN NEW;
  END IF;
  
  -- Block status changes to sales-controlled statuses without RPC
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = ANY(v_restricted_statuses) THEN
      RAISE EXCEPTION 'Lead status change to "%" requires sales_update_lead_fields RPC', NEW.status;
    END IF;
  END IF;
  
  -- Block assigned_to changes without RPC
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    RAISE EXCEPTION 'Lead assigned_to changes require sales_update_lead_fields RPC';
  END IF;
  
  -- Allow other updates (basic fields, notes, etc.)
  RETURN NEW;
END;
$$;

-- Apply trigger to leads table (if not exists)
DROP TRIGGER IF EXISTS enforce_lead_ownership ON public.leads;
CREATE TRIGGER enforce_lead_ownership
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lead_update_allowed();

-- Update cold_update_lead_fields to set RPC context
CREATE OR REPLACE FUNCTION public.cold_update_lead_fields(
  p_lead_id uuid, 
  p_status text DEFAULT NULL, 
  p_engagement_score integer DEFAULT NULL, 
  p_last_contacted timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_statuses text[] := ARRAY['cold', 'warm', 'contacted', 'nurturing'];
BEGIN
  -- Set RPC context flag
  PERFORM set_config('app.rpc_context', 'true', true);
  
  -- Validate status if provided
  IF p_status IS NOT NULL AND NOT (p_status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cold Agent can only set status to: cold, warm, contacted, nurturing');
  END IF;
  
  UPDATE leads SET
    status = COALESCE(p_status, status),
    lead_score = COALESCE(p_engagement_score, lead_score),
    last_call_date = COALESCE(p_last_contacted, last_call_date),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Audit log
  INSERT INTO action_history (action_table, action_id, action_type, target_type, target_id, actor_type, actor_module, new_state)
  VALUES ('leads', gen_random_uuid(), 'cold_update', 'lead', p_lead_id::text, 'module', 'cold_agent', 
    jsonb_build_object('status', p_status, 'engagement_score', p_engagement_score));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Update sales_update_lead_fields to set RPC context
CREATE OR REPLACE FUNCTION public.sales_update_lead_fields(
  p_lead_id uuid, 
  p_status text DEFAULT NULL, 
  p_qualification_data jsonb DEFAULT NULL, 
  p_assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_statuses text[] := ARRAY['qualified', 'disqualified', 'opportunity', 'negotiating', 'closed_won', 'closed_lost'];
BEGIN
  -- Set RPC context flag
  PERFORM set_config('app.rpc_context', 'true', true);
  
  -- Validate status if provided
  IF p_status IS NOT NULL AND NOT (p_status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales Agent can only set status to: qualified, disqualified, opportunity, negotiating, closed_won, closed_lost');
  END IF;
  
  UPDATE leads SET
    status = COALESCE(p_status, status),
    custom_fields = CASE 
      WHEN p_qualification_data IS NOT NULL 
      THEN COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object('qualification_data', p_qualification_data)
      ELSE custom_fields
    END,
    assigned_to = COALESCE(p_assigned_to, assigned_to),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Audit log
  INSERT INTO action_history (action_table, action_id, action_type, target_type, target_id, actor_type, actor_module, new_state)
  VALUES ('leads', gen_random_uuid(), 'sales_update', 'lead', p_lead_id::text, 'module', 'sales_agent',
    jsonb_build_object('status', p_status, 'assigned_to', p_assigned_to));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Register default event consumers
INSERT INTO public.system_event_consumers (consumer_name, event_type, enabled)
VALUES 
  ('cold_agent_enroller', 'lead_created', true),
  ('ceo_notifier', 'lead_created', true),
  ('audit_logger', 'lead_created', true)
ON CONFLICT (consumer_name, event_type) DO NOTHING;

-- Enable realtime for event monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_events;