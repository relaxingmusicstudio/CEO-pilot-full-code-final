
-- Client Onboarding Progress Table
CREATE TABLE public.client_onboarding (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 10,
  progress_percentage INTEGER DEFAULT 0,
  go_live_date TIMESTAMP WITH TIME ZONE,
  assigned_csm UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- Client Deliverables Table
CREATE TABLE public.client_deliverables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  deliverable_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provisioned_at TIMESTAMP WITH TIME ZONE,
  configuration JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Onboarding Tasks Table
CREATE TABLE public.onboarding_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  task_name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'setup',
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 1,
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Client Training Sessions Table
CREATE TABLE public.client_training_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'scheduled',
  recording_url TEXT,
  notes TEXT,
  attendees JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Product Configurations Table
CREATE TABLE public.product_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, config_key)
);

-- Referral Program Table
CREATE TABLE public.referral_program (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  referred_email TEXT NOT NULL,
  referred_client_id UUID REFERENCES public.clients(id),
  referral_code TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_amount NUMERIC DEFAULT 0,
  reward_paid_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- NPS Surveys Table
CREATE TABLE public.nps_surveys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  score INTEGER CHECK (score >= 0 AND score <= 10),
  feedback TEXT,
  survey_type TEXT DEFAULT 'standard',
  milestone TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Client Value Reports Table
CREATE TABLE public.client_value_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metrics JSONB DEFAULT '{}'::jsonb,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  pdf_url TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Expansion Revenue Table
CREATE TABLE public.expansion_revenue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  revenue_type TEXT NOT NULL,
  old_mrr NUMERIC DEFAULT 0,
  new_mrr NUMERIC DEFAULT 0,
  change_amount NUMERIC DEFAULT 0,
  reason TEXT,
  effective_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.client_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_program ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_value_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expansion_revenue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_onboarding
CREATE POLICY "Admins can manage client onboarding" ON public.client_onboarding FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert client onboarding" ON public.client_onboarding FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update client onboarding" ON public.client_onboarding FOR UPDATE USING (true);
CREATE POLICY "Anyone can view client onboarding" ON public.client_onboarding FOR SELECT USING (true);

-- RLS Policies for client_deliverables
CREATE POLICY "Admins can manage client deliverables" ON public.client_deliverables FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert client deliverables" ON public.client_deliverables FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update client deliverables" ON public.client_deliverables FOR UPDATE USING (true);
CREATE POLICY "Anyone can view client deliverables" ON public.client_deliverables FOR SELECT USING (true);

-- RLS Policies for onboarding_tasks
CREATE POLICY "Admins can manage onboarding tasks" ON public.onboarding_tasks FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert onboarding tasks" ON public.onboarding_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update onboarding tasks" ON public.onboarding_tasks FOR UPDATE USING (true);
CREATE POLICY "Anyone can view onboarding tasks" ON public.onboarding_tasks FOR SELECT USING (true);

-- RLS Policies for client_training_sessions
CREATE POLICY "Admins can manage training sessions" ON public.client_training_sessions FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert training sessions" ON public.client_training_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update training sessions" ON public.client_training_sessions FOR UPDATE USING (true);
CREATE POLICY "Anyone can view training sessions" ON public.client_training_sessions FOR SELECT USING (true);

-- RLS Policies for product_configurations
CREATE POLICY "Admins can manage product configurations" ON public.product_configurations FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert product configurations" ON public.product_configurations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update product configurations" ON public.product_configurations FOR UPDATE USING (true);
CREATE POLICY "Anyone can view product configurations" ON public.product_configurations FOR SELECT USING (true);

-- RLS Policies for referral_program
CREATE POLICY "Admins can manage referral program" ON public.referral_program FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert referrals" ON public.referral_program FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update referrals" ON public.referral_program FOR UPDATE USING (true);
CREATE POLICY "Anyone can view referrals" ON public.referral_program FOR SELECT USING (true);

-- RLS Policies for nps_surveys
CREATE POLICY "Admins can manage NPS surveys" ON public.nps_surveys FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert NPS surveys" ON public.nps_surveys FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update NPS surveys" ON public.nps_surveys FOR UPDATE USING (true);
CREATE POLICY "Anyone can view NPS surveys" ON public.nps_surveys FOR SELECT USING (true);

-- RLS Policies for client_value_reports
CREATE POLICY "Admins can manage value reports" ON public.client_value_reports FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert value reports" ON public.client_value_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view value reports" ON public.client_value_reports FOR SELECT USING (true);

-- RLS Policies for expansion_revenue
CREATE POLICY "Admins can manage expansion revenue" ON public.expansion_revenue FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can insert expansion revenue" ON public.expansion_revenue FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view expansion revenue" ON public.expansion_revenue FOR SELECT USING (true);

-- Add updated_at triggers
CREATE TRIGGER update_client_onboarding_updated_at BEFORE UPDATE ON public.client_onboarding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_client_deliverables_updated_at BEFORE UPDATE ON public.client_deliverables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_onboarding_tasks_updated_at BEFORE UPDATE ON public.onboarding_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_client_training_sessions_updated_at BEFORE UPDATE ON public.client_training_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_product_configurations_updated_at BEFORE UPDATE ON public.product_configurations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_referral_program_updated_at BEFORE UPDATE ON public.referral_program FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
