-- Create clients table for paying customers
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  business_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'scale')),
  mrr NUMERIC NOT NULL DEFAULT 0,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  churned_at TIMESTAMP WITH TIME ZONE,
  last_contact TIMESTAMP WITH TIME ZONE DEFAULT now(),
  health_score INTEGER DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create client_usage table for tracking engagement
CREATE TABLE public.client_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  api_calls INTEGER DEFAULT 0,
  conversations_handled INTEGER DEFAULT 0,
  appointments_booked INTEGER DEFAULT 0,
  leads_captured INTEGER DEFAULT 0,
  login_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, date)
);

-- Create client_tickets table for support tracking
CREATE TABLE public.client_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_tickets ENABLE ROW LEVEL SECURITY;

-- RLS policies for clients
CREATE POLICY "Admins can manage clients" ON public.clients
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert clients" ON public.clients
  FOR INSERT WITH CHECK (true);

-- RLS policies for client_usage
CREATE POLICY "Admins can manage client usage" ON public.client_usage
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert client usage" ON public.client_usage
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update client usage" ON public.client_usage
  FOR UPDATE USING (true);

-- RLS policies for client_tickets
CREATE POLICY "Admins can manage tickets" ON public.client_tickets
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert tickets" ON public.client_tickets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update tickets" ON public.client_tickets
  FOR UPDATE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_tickets_updated_at
  BEFORE UPDATE ON public.client_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();