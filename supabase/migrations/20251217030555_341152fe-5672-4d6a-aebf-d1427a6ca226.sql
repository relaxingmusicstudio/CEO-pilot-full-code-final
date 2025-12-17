-- #9: Action History Table for Rollback
CREATE TABLE IF NOT EXISTS public.action_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL,
  action_table TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  previous_state JSONB,
  new_state JSONB,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_by TEXT,
  rolled_back BOOLEAN DEFAULT false,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.action_history ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can view
CREATE POLICY "Authenticated users can view action_history"
  ON public.action_history FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Policy: Only service role can insert
CREATE POLICY "Service role can insert action_history"
  ON public.action_history FOR INSERT
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_action_history_action_id ON public.action_history(action_id);
CREATE INDEX idx_action_history_target ON public.action_history(target_type, target_id);

-- #10: Set autopilot auto_execute flags to FALSE by default
UPDATE public.ceo_autopilot_config
SET 
  auto_execute_followups = false,
  auto_manage_campaigns = false,
  auto_respond_clients = false,
  updated_at = now()
WHERE id IS NOT NULL;

-- Add monthly_spend_cap_cents column to tenants if not exists
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS monthly_ai_spend_cap_cents INTEGER DEFAULT 10000;

-- Add spend tracking view
CREATE OR REPLACE VIEW public.monthly_ai_spend AS
SELECT 
  DATE_TRUNC('month', created_at) as month,
  agent_name,
  SUM(cost_usd) as total_cost_usd,
  COUNT(*) as request_count
FROM public.ai_cost_log
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', created_at), agent_name;