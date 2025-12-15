-- Create business_knowledge table for persistent knowledge base
CREATE TABLE public.business_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  is_ai_accessible BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create business_profile table for business information
CREATE TABLE public.business_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  service_area TEXT,
  services TEXT[] DEFAULT '{}',
  avg_job_value DECIMAL(10,2) DEFAULT 351,
  monthly_call_volume INTEGER DEFAULT 80,
  business_hours JSONB DEFAULT '{"start": "08:00", "end": "18:00", "days": ["monday","tuesday","wednesday","thursday","friday"]}',
  timezone TEXT DEFAULT 'America/New_York',
  ai_preferences JSONB DEFAULT '{"tone": "professional", "responseLength": "concise", "personality": "helpful"}',
  notification_settings JSONB DEFAULT '{"emailAlerts": true, "smsAlerts": false, "dailyDigest": true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.business_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profile ENABLE ROW LEVEL SECURITY;

-- RLS policies for business_knowledge
CREATE POLICY "Admins can manage business_knowledge" ON public.business_knowledge
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view business_knowledge" ON public.business_knowledge
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert business_knowledge" ON public.business_knowledge
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update business_knowledge" ON public.business_knowledge
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete business_knowledge" ON public.business_knowledge
  FOR DELETE USING (true);

-- RLS policies for business_profile
CREATE POLICY "Admins can manage business_profile" ON public.business_profile
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view business_profile" ON public.business_profile
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert business_profile" ON public.business_profile
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update business_profile" ON public.business_profile
  FOR UPDATE USING (true);

-- Indexes for performance
CREATE INDEX idx_business_knowledge_category ON public.business_knowledge(category);
CREATE INDEX idx_business_knowledge_ai_accessible ON public.business_knowledge(is_ai_accessible);
CREATE INDEX idx_business_knowledge_keywords ON public.business_knowledge USING GIN(keywords);

-- Trigger for updated_at
CREATE TRIGGER update_business_knowledge_updated_at
  BEFORE UPDATE ON public.business_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_profile_updated_at
  BEFORE UPDATE ON public.business_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();