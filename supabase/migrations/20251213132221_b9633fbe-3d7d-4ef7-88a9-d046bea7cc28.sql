-- Marketing Spend Tracking Table
CREATE TABLE public.marketing_spend (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  campaign TEXT,
  spend_amount NUMERIC NOT NULL DEFAULT 0,
  spend_date DATE NOT NULL DEFAULT CURRENT_DATE,
  leads_generated INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_attributed NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Client Interventions Table
CREATE TABLE public.client_interventions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  intervention_type TEXT NOT NULL,
  trigger_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to UUID,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_interventions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for marketing_spend
CREATE POLICY "Admins can manage marketing spend" ON public.marketing_spend
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert marketing spend" ON public.marketing_spend
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view marketing spend" ON public.marketing_spend
  FOR SELECT USING (true);

-- RLS Policies for client_interventions
CREATE POLICY "Admins can manage interventions" ON public.client_interventions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert interventions" ON public.client_interventions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update interventions" ON public.client_interventions
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can view interventions" ON public.client_interventions
  FOR SELECT USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_client_interventions_updated_at
  BEFORE UPDATE ON public.client_interventions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();