-- CEO Action Queue - Claude queues actions for your approval
CREATE TABLE public.ceo_action_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  payload JSONB DEFAULT '{}',
  claude_reasoning TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired')),
  source TEXT DEFAULT 'claude',
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by TEXT,
  executed_at TIMESTAMP WITH TIME ZONE,
  execution_result JSONB,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- CEO Standing Orders - Pre-approved rules Claude can execute
CREATE TABLE public.ceo_standing_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_payload JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  executions_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- CEO Alerts Log - Track alerts sent
CREATE TABLE public.ceo_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL,
  priority TEXT DEFAULT 'info' CHECK (priority IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT,
  source TEXT DEFAULT 'claude',
  metadata JSONB DEFAULT '{}',
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  sent_via TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Claude Activity Log - What Claude did overnight
CREATE TABLE public.claude_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_type TEXT NOT NULL,
  description TEXT,
  details JSONB DEFAULT '{}',
  result TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ceo_action_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_standing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ceo_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claude_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only authenticated users (you) can access
CREATE POLICY "Authenticated users can view action queue" ON public.ceo_action_queue FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage action queue" ON public.ceo_action_queue FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view standing orders" ON public.ceo_standing_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage standing orders" ON public.ceo_standing_orders FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view alerts" ON public.ceo_alerts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage alerts" ON public.ceo_alerts FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view claude activity" ON public.claude_activity_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage claude activity" ON public.claude_activity_log FOR ALL USING (auth.role() = 'authenticated');

-- Service role policies for edge functions
CREATE POLICY "Service role full access action queue" ON public.ceo_action_queue FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access standing orders" ON public.ceo_standing_orders FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access alerts" ON public.ceo_alerts FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role full access claude activity" ON public.claude_activity_log FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Indexes for performance
CREATE INDEX idx_ceo_action_queue_status ON public.ceo_action_queue(status);
CREATE INDEX idx_ceo_action_queue_created ON public.ceo_action_queue(created_at DESC);
CREATE INDEX idx_ceo_standing_orders_active ON public.ceo_standing_orders(is_active);
CREATE INDEX idx_ceo_alerts_created ON public.ceo_alerts(created_at DESC);
CREATE INDEX idx_claude_activity_created ON public.claude_activity_log(created_at DESC);

-- Updated at triggers
CREATE TRIGGER update_ceo_action_queue_updated_at BEFORE UPDATE ON public.ceo_action_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ceo_standing_orders_updated_at BEFORE UPDATE ON public.ceo_standing_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default standing orders
INSERT INTO public.ceo_standing_orders (rule_name, rule_type, description, conditions, action_type, action_payload) VALUES
('Alert on Hot Lead Stale', 'monitoring', 'Alert if hot leads have no activity for 48 hours', '{"lead_score_min": 70, "inactive_hours": 48}', 'send_alert', '{"priority": "warning", "message": "Hot lead going cold"}'),
('Alert on System Health', 'monitoring', 'Alert if system health drops below threshold', '{"health_score_min": 70}', 'send_alert', '{"priority": "critical", "message": "System health degraded"}'),
('Auto-approve Social Posts', 'automation', 'Auto-approve social media posts for specific categories', '{"content_types": ["social_post"], "categories": ["tips", "engagement"]}', 'approve_content', '{}'),
('Alert on Churn Risk', 'monitoring', 'Alert when client shows churn signals', '{"churn_probability_min": 0.6}', 'send_alert', '{"priority": "warning", "message": "Client at risk of churning"}')