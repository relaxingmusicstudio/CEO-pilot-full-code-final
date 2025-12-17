-- CEO Job Runs table for tracking scheduled job executions
CREATE TABLE public.ceo_job_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id),
  job_type TEXT NOT NULL CHECK (job_type IN ('daily_brief', 'cost_rollup', 'metrics_cache')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  error TEXT,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_ceo_job_runs_tenant_created ON public.ceo_job_runs(tenant_id, created_at DESC);
CREATE INDEX idx_ceo_job_runs_job_type ON public.ceo_job_runs(job_type);
CREATE INDEX idx_ceo_job_runs_status ON public.ceo_job_runs(status);
CREATE INDEX idx_ceo_job_runs_created ON public.ceo_job_runs(created_at DESC);

-- Enable RLS
ALTER TABLE public.ceo_job_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for ceo_job_runs
CREATE POLICY "Users can view their tenant's job runs"
  ON public.ceo_job_runs
  FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() OR public.is_platform_admin());

CREATE POLICY "System can insert job runs"
  ON public.ceo_job_runs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update job runs"
  ON public.ceo_job_runs
  FOR UPDATE
  USING (true);

-- Rate limiting table for CEO functions
CREATE TABLE public.ceo_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id),
  action_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for rate limit checks
CREATE INDEX idx_ceo_rate_limits_tenant_action ON public.ceo_rate_limits(tenant_id, action_type, window_start DESC);

-- Enable RLS
ALTER TABLE public.ceo_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS policies for ceo_rate_limits
CREATE POLICY "System can manage rate limits"
  ON public.ceo_rate_limits
  FOR ALL
  USING (true);

-- Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_cost_tracking_created ON public.agent_cost_tracking(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ceo_decisions_created ON public.ceo_decisions(created_at DESC);

COMMENT ON TABLE public.ceo_job_runs IS 'Tracks scheduled CEO job executions (daily brief, cost rollup, etc.)';
COMMENT ON TABLE public.ceo_rate_limits IS 'Rate limiting for CEO dashboard refresh actions';