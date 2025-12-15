-- =====================================================
-- FINAL ITERATION: AUTONOMOUS BUSINESS OPERATING SYSTEM
-- Infrastructure, Escalation, Financial, Conflict Resolution
-- =====================================================

-- 1. INFRASTRUCTURE AGENT TABLES
-- System health snapshots already exist, add scaling metadata
CREATE TABLE IF NOT EXISTS public.system_scaling_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (event_type IN ('scale_up', 'scale_down', 'failover', 'recovery')),
  agent_type TEXT NOT NULL,
  previous_instances INTEGER DEFAULT 1,
  new_instances INTEGER DEFAULT 1,
  trigger_reason TEXT,
  cost_impact_estimate DECIMAL(10,2),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- API cost tracking per agent
CREATE TABLE IF NOT EXISTS public.agent_cost_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  agent_type TEXT NOT NULL,
  api_calls INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 100,
  avg_latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date, agent_type)
);

-- 2. HUMAN ESCALATION BRIDGE TABLES
CREATE TABLE IF NOT EXISTS public.escalation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rule_name TEXT NOT NULL,
  description TEXT,
  trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER DEFAULT 5,
  escalation_channel TEXT DEFAULT 'dashboard' CHECK (escalation_channel IN ('dashboard', 'email', 'slack', 'sms')),
  assigned_to TEXT,
  is_active BOOLEAN DEFAULT true,
  auto_resolve_hours INTEGER DEFAULT 24
);

CREATE TABLE IF NOT EXISTS public.escalation_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rule_id UUID REFERENCES public.escalation_rules(id),
  lead_id UUID REFERENCES public.leads(id),
  client_id UUID REFERENCES public.clients(id),
  source_agent TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}'::jsonb,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'resolved', 'expired')),
  assigned_to TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  outcome TEXT,
  response_time_minutes INTEGER
);

-- 3. FINANCIAL INTEGRATOR TABLES
CREATE TABLE IF NOT EXISTS public.revenue_attribution (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  client_id UUID REFERENCES public.clients(id),
  lead_id UUID REFERENCES public.leads(id),
  revenue_amount DECIMAL(12,2) NOT NULL,
  revenue_type TEXT DEFAULT 'one_time' CHECK (revenue_type IN ('one_time', 'recurring', 'expansion', 'renewal')),
  attribution_source TEXT,
  campaign_id TEXT,
  touchpoints JSONB DEFAULT '[]'::jsonb,
  agent_contributions JSONB DEFAULT '{}'::jsonb,
  stripe_payment_id TEXT,
  currency TEXT DEFAULT 'USD',
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.agent_roi_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  agent_type TEXT NOT NULL,
  attributed_revenue DECIMAL(12,2) DEFAULT 0,
  cost_spent DECIMAL(12,2) DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  roi_percentage DECIMAL(8,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date, agent_type)
);

CREATE TABLE IF NOT EXISTS public.financial_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  forecast_date DATE NOT NULL,
  forecast_type TEXT DEFAULT 'monthly' CHECK (forecast_type IN ('daily', 'weekly', 'monthly', 'quarterly')),
  predicted_revenue DECIMAL(12,2),
  predicted_costs DECIMAL(12,2),
  predicted_mrr DECIMAL(12,2),
  confidence_score DECIMAL(5,2),
  factors JSONB DEFAULT '{}'::jsonb,
  actual_revenue DECIMAL(12,2),
  variance_percentage DECIMAL(8,2)
);

-- 4. CONFLICT RESOLUTION ENGINE TABLES
CREATE TABLE IF NOT EXISTS public.action_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  agent_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('lead', 'client', 'account', 'contact')),
  target_id UUID NOT NULL,
  priority INTEGER DEFAULT 5,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'approved', 'executing', 'completed', 'cancelled', 'conflicted')),
  action_payload JSONB DEFAULT '{}'::jsonb,
  conflict_resolution TEXT,
  executed_at TIMESTAMP WITH TIME ZONE,
  result JSONB
);

CREATE TABLE IF NOT EXISTS public.conflict_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  conflicting_actions JSONB NOT NULL,
  resolution_method TEXT,
  winner_action_id UUID REFERENCES public.action_queue(id),
  deferred_action_ids UUID[],
  cancelled_action_ids UUID[],
  reasoning TEXT
);

CREATE TABLE IF NOT EXISTS public.action_priority_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rule_name TEXT NOT NULL,
  agent_type TEXT,
  action_type TEXT,
  base_priority INTEGER DEFAULT 5,
  priority_modifiers JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true
);

-- 5. STRATEGIC PLANNING AGENT TABLES
CREATE TABLE IF NOT EXISTS public.strategic_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  goal_type TEXT DEFAULT 'okr' CHECK (goal_type IN ('okr', 'kpi', 'initiative', 'experiment')),
  title TEXT NOT NULL,
  description TEXT,
  target_metric TEXT,
  target_value DECIMAL(12,2),
  current_value DECIMAL(12,2) DEFAULT 0,
  unit TEXT,
  deadline DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'achieved', 'missed', 'paused')),
  progress_percentage DECIMAL(5,2) DEFAULT 0,
  parent_goal_id UUID REFERENCES public.strategic_goals(id),
  owner TEXT,
  ai_generated BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.strategic_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recommendation_type TEXT DEFAULT 'optimization' CHECK (recommendation_type IN ('optimization', 'expansion', 'cost_reduction', 'risk_mitigation', 'experiment')),
  title TEXT NOT NULL,
  description TEXT,
  expected_impact JSONB DEFAULT '{}'::jsonb,
  confidence_score DECIMAL(5,2),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'implemented', 'expired')),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by TEXT,
  implementation_notes TEXT,
  outcome_data JSONB,
  source_analysis TEXT
);

CREATE TABLE IF NOT EXISTS public.scenario_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scenario_name TEXT NOT NULL,
  scenario_type TEXT DEFAULT 'what_if' CHECK (scenario_type IN ('what_if', 'forecast', 'stress_test', 'comparison')),
  input_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  baseline_metrics JSONB DEFAULT '{}'::jsonb,
  projected_outcomes JSONB DEFAULT '{}'::jsonb,
  confidence_interval JSONB DEFAULT '{}'::jsonb,
  assumptions TEXT[],
  conclusion TEXT,
  recommended_action TEXT
);

-- 6. SHARED MEMORY LAYER (Central Agent State)
CREATE TABLE IF NOT EXISTS public.agent_shared_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  category TEXT DEFAULT 'general',
  expires_at TIMESTAMP WITH TIME ZONE,
  last_accessed_by TEXT
);

-- Enable RLS on all new tables
ALTER TABLE public.system_scaling_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_cost_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_roi_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conflict_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_priority_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenario_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_shared_state ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for authenticated users
CREATE POLICY "Authenticated users can manage system_scaling_events" ON public.system_scaling_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage agent_cost_tracking" ON public.agent_cost_tracking FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage escalation_rules" ON public.escalation_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage escalation_queue" ON public.escalation_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage revenue_attribution" ON public.revenue_attribution FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage agent_roi_metrics" ON public.agent_roi_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage financial_forecasts" ON public.financial_forecasts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage action_queue" ON public.action_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage conflict_log" ON public.conflict_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage action_priority_rules" ON public.action_priority_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage strategic_goals" ON public.strategic_goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage strategic_recommendations" ON public.strategic_recommendations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage scenario_simulations" ON public.scenario_simulations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage agent_shared_state" ON public.agent_shared_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role policies for edge functions
CREATE POLICY "Service role full access to system_scaling_events" ON public.system_scaling_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to agent_cost_tracking" ON public.agent_cost_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to escalation_rules" ON public.escalation_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to escalation_queue" ON public.escalation_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to revenue_attribution" ON public.revenue_attribution FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to agent_roi_metrics" ON public.agent_roi_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to financial_forecasts" ON public.financial_forecasts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to action_queue" ON public.action_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to conflict_log" ON public.conflict_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to action_priority_rules" ON public.action_priority_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to strategic_goals" ON public.strategic_goals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to strategic_recommendations" ON public.strategic_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to scenario_simulations" ON public.scenario_simulations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access to agent_shared_state" ON public.agent_shared_state FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insert default escalation rules
INSERT INTO public.escalation_rules (rule_name, description, trigger_conditions, priority, escalation_channel) VALUES
('Hot Lead Timeout', 'Escalate if hot lead not contacted within 2 hours', '{"lead_temperature": "hot", "contact_delay_minutes": 120}'::jsonb, 10, 'dashboard'),
('Negative Sentiment', 'Escalate on detected negative customer sentiment', '{"sentiment_score": {"lt": -0.5}}'::jsonb, 9, 'slack'),
('Human Request', 'Customer explicitly requested human contact', '{"keywords": ["human", "person", "manager", "speak to"]}'::jsonb, 10, 'dashboard'),
('High Value Deal', 'Escalate deals over $10k for human review', '{"deal_value": {"gt": 10000}}'::jsonb, 8, 'email'),
('Churn Risk', 'Client health score dropped below 40', '{"health_score": {"lt": 40}}'::jsonb, 9, 'dashboard');

-- Insert default action priority rules
INSERT INTO public.action_priority_rules (rule_name, agent_type, action_type, base_priority, priority_modifiers) VALUES
('Human Task Override', NULL, 'human_assigned', 10, '{"always_wins": true}'::jsonb),
('Hot Lead Follow-up', 'sales', 'follow_up', 9, '{"lead_temperature": {"hot": 2, "warm": 1}}'::jsonb),
('Scheduled Call', 'dialer', 'outbound_call', 8, '{"scheduled": true}'::jsonb),
('Nurture Email', 'sequences', 'send_email', 5, '{}'::jsonb),
('Social Engagement', 'social', 'reply_comment', 4, '{}'::jsonb),
('Content Publish', 'content', 'publish', 3, '{}'::jsonb);

-- Insert initial strategic goals
INSERT INTO public.strategic_goals (goal_type, title, description, target_metric, target_value, unit, deadline, status) VALUES
('okr', 'Q1 Revenue Target', 'Achieve $50,000 monthly recurring revenue', 'mrr', 50000, 'USD', CURRENT_DATE + INTERVAL '90 days', 'active'),
('okr', 'Lead Generation', 'Generate 500 qualified leads per month', 'qualified_leads', 500, 'leads', CURRENT_DATE + INTERVAL '30 days', 'active'),
('kpi', 'Customer Retention', 'Maintain 95% customer retention rate', 'retention_rate', 95, 'percent', NULL, 'active'),
('initiative', 'AI Automation Rate', 'Achieve 80% task automation without human intervention', 'automation_rate', 80, 'percent', CURRENT_DATE + INTERVAL '60 days', 'active');

-- Add updated_at trigger to new tables
CREATE TRIGGER update_agent_cost_tracking_updated_at BEFORE UPDATE ON public.agent_cost_tracking FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_escalation_rules_updated_at BEFORE UPDATE ON public.escalation_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_escalation_queue_updated_at BEFORE UPDATE ON public.escalation_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_action_queue_updated_at BEFORE UPDATE ON public.action_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_strategic_goals_updated_at BEFORE UPDATE ON public.strategic_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_shared_state_updated_at BEFORE UPDATE ON public.agent_shared_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();