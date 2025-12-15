-- =============================================
-- COMPLIANCE & LEAD ENRICHMENT ARCHITECTURE
-- =============================================

-- 1. Compliance Rules Table
CREATE TABLE public.compliance_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  rule_value TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'limit', -- limit, time, threshold, boolean
  category TEXT NOT NULL DEFAULT 'general', -- scraping, outreach, privacy, spend
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  enforcement_level TEXT NOT NULL DEFAULT 'block', -- block, warn, log
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Compliance Audit Log (Data Provenance Tracker)
CREATE TABLE public.compliance_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  action_type TEXT NOT NULL, -- scrape, outreach, data_collection, api_call
  resource_url TEXT,
  data_source TEXT,
  consent_basis TEXT, -- legitimate_interest, contract, consent
  compliance_status TEXT NOT NULL DEFAULT 'approved', -- approved, blocked, flagged, manual_review
  risk_score INTEGER DEFAULT 0,
  rule_checked TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Lead Enrichment Profiles
CREATE TABLE public.lead_enrichment_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Fit Scoring
  fit_score INTEGER DEFAULT 0,
  company_size TEXT,
  industry_match BOOLEAN DEFAULT false,
  annual_revenue_estimate NUMERIC,
  employee_count_estimate INTEGER,
  
  -- Interest Scoring
  interest_score INTEGER DEFAULT 0,
  content_downloads INTEGER DEFAULT 0,
  page_visits INTEGER DEFAULT 0,
  email_opens INTEGER DEFAULT 0,
  
  -- Engagement Scoring
  engagement_score INTEGER DEFAULT 0,
  call_responses INTEGER DEFAULT 0,
  form_submissions INTEGER DEFAULT 0,
  chat_interactions INTEGER DEFAULT 0,
  
  -- Intent Tags
  intent_tags TEXT[] DEFAULT '{}',
  buying_signals JSONB DEFAULT '[]',
  
  -- Compliance Flags
  contact_risk TEXT[] DEFAULT '{}', -- gdpr_applicable, ccpa_applicable, dnc_listed
  consent_verified BOOLEAN DEFAULT false,
  last_consent_date TIMESTAMP WITH TIME ZONE,
  
  -- Segmentation
  segment TEXT, -- hot_lead, marketing_nurture, cold_outreach, compliance_hold
  routing_agent TEXT, -- power_dialer, sequences, outreach, human_bypass
  
  -- Augmented Data
  enriched_data JSONB DEFAULT '{}',
  enrichment_source TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Enrichment Processing Queue
CREATE TABLE public.enrichment_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  stage TEXT NOT NULL DEFAULT 'ingestion', -- ingestion, augmentation, scoring, segmentation
  priority INTEGER DEFAULT 5,
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Compliance Health Metrics
CREATE TABLE public.compliance_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  health_score INTEGER NOT NULL DEFAULT 100,
  total_checks INTEGER DEFAULT 0,
  passed_checks INTEGER DEFAULT 0,
  blocked_actions INTEGER DEFAULT 0,
  flagged_actions INTEGER DEFAULT 0,
  risk_alerts INTEGER DEFAULT 0,
  top_risk_areas JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(date)
);

-- Enable RLS
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_enrichment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrichment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_health ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage compliance rules" ON public.compliance_rules FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view compliance rules" ON public.compliance_rules FOR SELECT USING (true);

CREATE POLICY "Admins can manage compliance audit log" ON public.compliance_audit_log FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert compliance audit log" ON public.compliance_audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view compliance audit log" ON public.compliance_audit_log FOR SELECT USING (true);

CREATE POLICY "Admins can manage lead enrichment profiles" ON public.lead_enrichment_profiles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert lead enrichment profiles" ON public.lead_enrichment_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update lead enrichment profiles" ON public.lead_enrichment_profiles FOR UPDATE USING (true);
CREATE POLICY "Anyone can view lead enrichment profiles" ON public.lead_enrichment_profiles FOR SELECT USING (true);

CREATE POLICY "Admins can manage enrichment queue" ON public.enrichment_queue FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert enrichment queue" ON public.enrichment_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update enrichment queue" ON public.enrichment_queue FOR UPDATE USING (true);
CREATE POLICY "Anyone can view enrichment queue" ON public.enrichment_queue FOR SELECT USING (true);

CREATE POLICY "Admins can manage compliance health" ON public.compliance_health FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can insert compliance health" ON public.compliance_health FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update compliance health" ON public.compliance_health FOR UPDATE USING (true);
CREATE POLICY "Anyone can view compliance health" ON public.compliance_health FOR SELECT USING (true);

-- Insert default compliance rules
INSERT INTO public.compliance_rules (rule_key, rule_value, rule_type, category, description, enforcement_level) VALUES
('MAX_DAILY_AD_SPEND', '100', 'limit', 'spend', 'Maximum daily ad spend in dollars', 'block'),
('DO_NOT_CALL_BEFORE', '09:00', 'time', 'outreach', 'Earliest time to make outbound calls', 'block'),
('DO_NOT_CALL_AFTER', '21:00', 'time', 'outreach', 'Latest time to make outbound calls', 'block'),
('ALERT_OWNER_IF_LEAD_SCORE_ABOVE', '80', 'threshold', 'general', 'Alert owner for high-value leads', 'log'),
('RESPECT_ROBOTS_TXT', 'true', 'boolean', 'scraping', 'Always check robots.txt before scraping', 'block'),
('FLAG_EU_PHONE_NUMBERS', 'true', 'boolean', 'privacy', 'Flag phone numbers from EU for GDPR compliance', 'warn'),
('MAX_EMAILS_PER_HOUR', '50', 'limit', 'outreach', 'Maximum emails to send per hour', 'block'),
('MAX_SMS_PER_DAY', '200', 'limit', 'outreach', 'Maximum SMS messages per day', 'block'),
('REQUIRE_CONSENT_FOR_MARKETING', 'true', 'boolean', 'privacy', 'Require explicit consent for marketing communications', 'block'),
('DATA_RETENTION_DAYS', '365', 'limit', 'privacy', 'Days to retain lead data', 'log'),
('MAX_SCRAPING_RATE_PER_MINUTE', '10', 'limit', 'scraping', 'Maximum scraping requests per minute', 'block'),
('REQUIRE_CEO_APPROVAL_FOR_NON_API', 'true', 'boolean', 'scraping', 'Require CEO approval for non-API data sources', 'warn');

-- Create updated_at trigger
CREATE TRIGGER update_compliance_rules_updated_at BEFORE UPDATE ON public.compliance_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lead_enrichment_profiles_updated_at BEFORE UPDATE ON public.lead_enrichment_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();