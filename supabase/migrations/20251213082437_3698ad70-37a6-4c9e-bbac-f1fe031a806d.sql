-- Create app_role enum for admin access
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- User roles table for admin dashboard access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles without recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Track all visitor sessions persistently
CREATE TABLE public.visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT UNIQUE NOT NULL,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  total_visits INTEGER DEFAULT 1,
  device TEXT,
  browser TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  landing_page TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

-- Store all chatbot conversations with full transcripts
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT REFERENCES public.visitors(visitor_id),
  session_id TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  lead_data JSONB,
  ai_analysis JSONB,
  conversation_phase TEXT,
  outcome TEXT, -- 'qualified', 'dropped', 'objection', 'converted'
  duration_seconds INTEGER,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Qualified leads with conversion tracking
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT REFERENCES public.visitors(visitor_id),
  conversation_id UUID REFERENCES public.conversations(id),
  name TEXT,
  email TEXT,
  phone TEXT,
  business_name TEXT,
  trade TEXT,
  team_size TEXT,
  call_volume TEXT,
  timeline TEXT,
  interests TEXT[],
  lead_score INTEGER,
  lead_temperature TEXT,
  conversion_probability INTEGER,
  buying_signals TEXT[],
  objections TEXT[],
  ghl_contact_id TEXT,
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'demo_scheduled', 'closed_won', 'closed_lost'
  revenue_value DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Granular event tracking for analytics
CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT,
  session_id TEXT,
  event_type TEXT NOT NULL, -- 'page_view', 'section_view', 'cta_click', 'calculator_use', 'demo_play', 'chatbot_open', etc.
  event_data JSONB,
  page_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- A/B test results tracking
CREATE TABLE public.ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  variant TEXT NOT NULL,
  visitor_id TEXT,
  converted BOOLEAN DEFAULT FALSE,
  conversion_value DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX idx_visitors_visitor_id ON public.visitors(visitor_id);
CREATE INDEX idx_visitors_created_at ON public.visitors(created_at);
CREATE INDEX idx_conversations_visitor_id ON public.conversations(visitor_id);
CREATE INDEX idx_conversations_created_at ON public.conversations(created_at);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_lead_score ON public.leads(lead_score);
CREATE INDEX idx_leads_created_at ON public.leads(created_at);
CREATE INDEX idx_analytics_events_visitor_id ON public.analytics_events(visitor_id);
CREATE INDEX idx_analytics_events_event_type ON public.analytics_events(event_type);
CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at);

-- RLS Policies

-- User roles: only admins can view
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Visitors: public insert (for tracking), admin select
CREATE POLICY "Anyone can insert visitors" ON public.visitors
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all visitors" ON public.visitors
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can update visitors" ON public.visitors
  FOR UPDATE USING (true);

-- Conversations: public insert, admin select
CREATE POLICY "Anyone can insert conversations" ON public.conversations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update conversations" ON public.conversations
  FOR UPDATE USING (true);

CREATE POLICY "Admins can view all conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Leads: public insert, admin full access
CREATE POLICY "Anyone can insert leads" ON public.leads
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all leads" ON public.leads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Analytics events: public insert, admin select
CREATE POLICY "Anyone can insert analytics events" ON public.analytics_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all analytics events" ON public.analytics_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- A/B tests: public insert, admin full access
CREATE POLICY "Anyone can insert ab tests" ON public.ab_tests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all ab tests" ON public.ab_tests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ab tests" ON public.ab_tests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();