-- CEO Decisions table for tracking executive decision-making
CREATE TABLE public.ceo_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id),
  decision TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  expected_impact JSONB DEFAULT '{}'::jsonb,
  actual_outcome JSONB DEFAULT NULL,
  purpose TEXT NOT NULL DEFAULT 'ceo_strategy',
  model_used TEXT,
  provider_used TEXT,
  tokens_estimated INTEGER,
  cost_estimated_cents INTEGER,
  context_snapshot JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'superseded')),
  executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX idx_ceo_decisions_tenant_created ON public.ceo_decisions(tenant_id, created_at DESC);
CREATE INDEX idx_ceo_decisions_purpose ON public.ceo_decisions(purpose);
CREATE INDEX idx_ceo_decisions_status ON public.ceo_decisions(status);

-- Enable RLS
ALTER TABLE public.ceo_decisions ENABLE ROW LEVEL SECURITY;

-- RLS policies for ceo_decisions
CREATE POLICY "Users can view their tenant's decisions"
  ON public.ceo_decisions
  FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() OR public.is_platform_admin());

CREATE POLICY "System can insert decisions"
  ON public.ceo_decisions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their tenant's decisions"
  ON public.ceo_decisions
  FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id() OR public.is_platform_admin());

-- Add trigger for updated_at
CREATE TRIGGER update_ceo_decisions_updated_at
  BEFORE UPDATE ON public.ceo_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add purpose column to agent_cost_tracking if not exists
ALTER TABLE public.agent_cost_tracking 
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT;

-- Create index for cost tracking by purpose
CREATE INDEX IF NOT EXISTS idx_agent_cost_tracking_purpose ON public.agent_cost_tracking(purpose);

COMMENT ON TABLE public.ceo_decisions IS 'Tracks CEO agent decisions with reasoning, confidence, and outcomes for learning loop';