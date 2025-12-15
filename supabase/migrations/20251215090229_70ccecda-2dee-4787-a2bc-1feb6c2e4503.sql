-- AI Rate Limits Configuration Table
CREATE TABLE public.ai_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  priority_level TEXT NOT NULL DEFAULT 'medium' CHECK (priority_level IN ('high', 'medium', 'low')),
  requests_per_minute INTEGER DEFAULT 10,
  requests_per_hour INTEGER DEFAULT 100,
  requests_per_day INTEGER DEFAULT 1000,
  off_hours_multiplier NUMERIC DEFAULT 0.5,
  off_hours_start TIME DEFAULT '22:00:00',
  off_hours_end TIME DEFAULT '06:00:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_name)
);

-- AI Rate Limit Usage Tracking
CREATE TABLE public.ai_rate_limit_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  window_type TEXT NOT NULL CHECK (window_type IN ('minute', 'hour', 'day')),
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  request_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_name, window_type, window_start)
);

-- AI Response Cache Table
CREATE TABLE public.ai_response_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  prompt_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  messages_hash TEXT NOT NULL,
  response_json JSONB NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_estimate NUMERIC DEFAULT 0,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enhanced AI Cost Tracking Table
CREATE TABLE public.ai_cost_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC DEFAULT 0,
  cached BOOLEAN DEFAULT false,
  priority TEXT DEFAULT 'medium',
  latency_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX idx_ai_rate_limit_usage_lookup ON public.ai_rate_limit_usage(agent_name, window_type, window_start);
CREATE INDEX idx_ai_response_cache_key ON public.ai_response_cache(cache_key);
CREATE INDEX idx_ai_response_cache_expires ON public.ai_response_cache(expires_at);
CREATE INDEX idx_ai_cost_log_agent ON public.ai_cost_log(agent_name, created_at);
CREATE INDEX idx_ai_cost_log_date ON public.ai_cost_log(created_at);

-- Enable RLS
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_rate_limit_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_cost_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_rate_limits
CREATE POLICY "Admins can manage ai_rate_limits" ON public.ai_rate_limits FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view ai_rate_limits" ON public.ai_rate_limits FOR SELECT USING (true);
CREATE POLICY "Service role can manage ai_rate_limits" ON public.ai_rate_limits FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for ai_rate_limit_usage
CREATE POLICY "Service role can manage ai_rate_limit_usage" ON public.ai_rate_limit_usage FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can view ai_rate_limit_usage" ON public.ai_rate_limit_usage FOR SELECT USING (true);

-- RLS Policies for ai_response_cache
CREATE POLICY "Service role can manage ai_response_cache" ON public.ai_response_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can view ai_response_cache" ON public.ai_response_cache FOR SELECT USING (true);

-- RLS Policies for ai_cost_log
CREATE POLICY "Service role can manage ai_cost_log" ON public.ai_cost_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can view ai_cost_log" ON public.ai_cost_log FOR SELECT USING (true);

-- Add update trigger for ai_rate_limits
CREATE TRIGGER update_ai_rate_limits_updated_at
BEFORE UPDATE ON public.ai_rate_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default rate limits for existing agents
INSERT INTO public.ai_rate_limits (agent_name, priority_level, requests_per_minute, requests_per_hour, requests_per_day) VALUES
('ceo-agent', 'high', 30, 300, 3000),
('alex-chat', 'high', 20, 200, 2000),
('content-generator', 'medium', 10, 100, 1000),
('prompt-enhancer', 'medium', 15, 150, 1500),
('lead-enrichment', 'medium', 10, 100, 1000),
('methodology-selector', 'low', 5, 50, 500),
('analyze-lead', 'medium', 10, 100, 1000),
('strategic-planner', 'low', 5, 50, 500),
('billing-agent', 'medium', 10, 100, 1000),
('finance-agent', 'medium', 10, 100, 1000),
('comment-responder', 'low', 5, 50, 500),
('content-analyzer', 'low', 5, 50, 500),
('knowledge-base', 'medium', 15, 150, 1500),
('funnel-ai', 'medium', 10, 100, 1000),
('video-quality-agent', 'low', 5, 50, 500),
('video-editor-agent', 'low', 5, 50, 500),
('pattern-detector', 'low', 5, 50, 500),
('conflict-resolution', 'medium', 10, 100, 1000),
('multi-agent-coordinator', 'high', 20, 200, 2000),
('infrastructure-agent', 'medium', 10, 100, 1000)
ON CONFLICT (agent_name) DO NOTHING;