-- Create funnels table
CREATE TABLE public.funnels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  goal TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  target_score_min INTEGER DEFAULT 0,
  target_score_max INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create funnel stages table
CREATE TABLE public.funnel_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  stage_type TEXT DEFAULT 'page',
  target_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create funnel enrollments (which visitors are in which funnels)
CREATE TABLE public.funnel_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id),
  current_stage_id UUID REFERENCES public.funnel_stages(id),
  enrolled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  converted BOOLEAN DEFAULT false,
  ai_assigned BOOLEAN DEFAULT false,
  assignment_reason TEXT
);

-- Create A/B tests table
CREATE TABLE public.ab_test_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  element_type TEXT NOT NULL,
  original_value TEXT,
  status TEXT DEFAULT 'draft',
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  winner_variant_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create A/B test variants table
CREATE TABLE public.ab_test_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.ab_test_experiments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  traffic_percentage INTEGER DEFAULT 50,
  views INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create stage conversions tracking
CREATE TABLE public.funnel_stage_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  variant_id UUID REFERENCES public.ab_test_variants(id),
  entered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  exited_at TIMESTAMP WITH TIME ZONE,
  converted BOOLEAN DEFAULT false,
  time_spent_seconds INTEGER
);

-- Enable RLS
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_stage_conversions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for funnels
CREATE POLICY "Admins can manage funnels" ON public.funnels FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active funnels" ON public.funnels FOR SELECT USING (is_active = true);

-- RLS Policies for funnel_stages
CREATE POLICY "Admins can manage stages" ON public.funnel_stages FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view stages" ON public.funnel_stages FOR SELECT USING (true);

-- RLS Policies for funnel_enrollments
CREATE POLICY "Admins can manage enrollments" ON public.funnel_enrollments FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert enrollments" ON public.funnel_enrollments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update own enrollment" ON public.funnel_enrollments FOR UPDATE USING (true);

-- RLS Policies for ab_test_experiments
CREATE POLICY "Admins can manage experiments" ON public.ab_test_experiments FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active experiments" ON public.ab_test_experiments FOR SELECT USING (status = 'active');

-- RLS Policies for ab_test_variants
CREATE POLICY "Admins can manage variants" ON public.ab_test_variants FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view variants" ON public.ab_test_variants FOR SELECT USING (true);
CREATE POLICY "Anyone can update variant stats" ON public.ab_test_variants FOR UPDATE USING (true);

-- RLS Policies for funnel_stage_conversions
CREATE POLICY "Admins can view conversions" ON public.funnel_stage_conversions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert conversions" ON public.funnel_stage_conversions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update conversions" ON public.funnel_stage_conversions FOR UPDATE USING (true);

-- Create indexes for performance
CREATE INDEX idx_funnel_enrollments_visitor ON public.funnel_enrollments(visitor_id);
CREATE INDEX idx_funnel_enrollments_funnel ON public.funnel_enrollments(funnel_id);
CREATE INDEX idx_stage_conversions_funnel ON public.funnel_stage_conversions(funnel_id);
CREATE INDEX idx_stage_conversions_stage ON public.funnel_stage_conversions(stage_id);
CREATE INDEX idx_ab_variants_experiment ON public.ab_test_variants(experiment_id);

-- Add update trigger for funnels
CREATE TRIGGER update_funnels_updated_at
BEFORE UPDATE ON public.funnels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add update trigger for ab_test_experiments
CREATE TRIGGER update_ab_experiments_updated_at
BEFORE UPDATE ON public.ab_test_experiments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default funnel
INSERT INTO public.funnels (name, description, goal, is_default, target_score_min, target_score_max)
VALUES 
  ('Main Sales Funnel', 'Default funnel for all visitors', 'Book a service call', true, 0, 100),
  ('Hot Lead Fast Track', 'Accelerated funnel for high-intent leads', 'Immediate booking', false, 70, 100),
  ('Nurture Funnel', 'Educational funnel for cold leads', 'Build trust and awareness', false, 0, 40);

-- Insert stages for Main Sales Funnel
INSERT INTO public.funnel_stages (funnel_id, name, stage_order, stage_type, target_action)
SELECT id, 'Landing Page', 1, 'page', 'view_landing' FROM public.funnels WHERE name = 'Main Sales Funnel'
UNION ALL
SELECT id, 'Calculator', 2, 'interaction', 'use_calculator' FROM public.funnels WHERE name = 'Main Sales Funnel'
UNION ALL
SELECT id, 'Demo Request', 3, 'page', 'request_demo' FROM public.funnels WHERE name = 'Main Sales Funnel'
UNION ALL
SELECT id, 'Contact Form', 4, 'form', 'submit_contact' FROM public.funnels WHERE name = 'Main Sales Funnel'
UNION ALL
SELECT id, 'Booked Call', 5, 'conversion', 'book_call' FROM public.funnels WHERE name = 'Main Sales Funnel';

-- Insert stages for Hot Lead Fast Track
INSERT INTO public.funnel_stages (funnel_id, name, stage_order, stage_type, target_action)
SELECT id, 'Pricing Page', 1, 'page', 'view_pricing' FROM public.funnels WHERE name = 'Hot Lead Fast Track'
UNION ALL
SELECT id, 'Direct Contact', 2, 'form', 'submit_contact' FROM public.funnels WHERE name = 'Hot Lead Fast Track'
UNION ALL
SELECT id, 'Booked Call', 3, 'conversion', 'book_call' FROM public.funnels WHERE name = 'Hot Lead Fast Track';

-- Insert stages for Nurture Funnel
INSERT INTO public.funnel_stages (funnel_id, name, stage_order, stage_type, target_action)
SELECT id, 'Blog/Content', 1, 'page', 'view_content' FROM public.funnels WHERE name = 'Nurture Funnel'
UNION ALL
SELECT id, 'Playbook Download', 2, 'interaction', 'download_playbook' FROM public.funnels WHERE name = 'Nurture Funnel'
UNION ALL
SELECT id, 'Email Signup', 3, 'form', 'email_signup' FROM public.funnels WHERE name = 'Nurture Funnel'
UNION ALL
SELECT id, 'Calculator', 4, 'interaction', 'use_calculator' FROM public.funnels WHERE name = 'Nurture Funnel'
UNION ALL
SELECT id, 'Contact Form', 5, 'conversion', 'submit_contact' FROM public.funnels WHERE name = 'Nurture Funnel';