-- Create ceo_autopilot_settings table
CREATE TABLE IF NOT EXISTS public.ceo_autopilot_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_active BOOLEAN DEFAULT true,
  mode TEXT DEFAULT 'supervised',
  daily_budget_cents INTEGER DEFAULT 5000,
  max_actions_per_hour INTEGER DEFAULT 10,
  allowed_action_types TEXT[] DEFAULT ARRAY['content', 'outreach', 'follow_up'],
  confidence_threshold NUMERIC DEFAULT 0.8,
  notify_on_action BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create system_health_metrics table
CREATE TABLE IF NOT EXISTS public.system_health_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  status TEXT DEFAULT 'healthy',
  component TEXT NOT NULL,
  details JSONB,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ceo_autopilot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_metrics ENABLE ROW LEVEL SECURITY;

-- Create public read policies (for dashboard)
CREATE POLICY "Allow public read on ceo_autopilot_settings"
ON public.ceo_autopilot_settings FOR SELECT USING (true);

CREATE POLICY "Allow public read on system_health_metrics"
ON public.system_health_metrics FOR SELECT USING (true);

CREATE POLICY "Allow public insert on system_health_metrics"
ON public.system_health_metrics FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on ceo_autopilot_settings"
ON public.ceo_autopilot_settings FOR UPDATE USING (true);

-- Create index for faster queries
CREATE INDEX idx_system_health_recorded_at ON public.system_health_metrics(recorded_at DESC);
CREATE INDEX idx_system_health_component ON public.system_health_metrics(component);