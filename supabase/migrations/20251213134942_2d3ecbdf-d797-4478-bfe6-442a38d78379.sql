-- =============================================
-- PHONE & SMS SYSTEM TABLES
-- =============================================

-- Phone numbers management
CREATE TABLE public.phone_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  friendly_name TEXT,
  provider TEXT DEFAULT 'twilio',
  capabilities JSONB DEFAULT '{"sms": true, "voice": true, "mms": false}'::jsonb,
  status TEXT DEFAULT 'active',
  assigned_to TEXT,
  monthly_cost NUMERIC(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Call logs
CREATE TABLE public.call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_call_id TEXT,
  phone_number_id UUID REFERENCES public.phone_numbers(id),
  contact_id UUID REFERENCES public.contacts_unified(id),
  lead_id UUID REFERENCES public.leads(id),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number TEXT,
  to_number TEXT,
  status TEXT DEFAULT 'initiated',
  duration_seconds INTEGER,
  recording_url TEXT,
  transcription TEXT,
  disposition TEXT,
  disposition_notes TEXT,
  ai_handled BOOLEAN DEFAULT false,
  vapi_call_id TEXT,
  cost NUMERIC(10,4),
  started_at TIMESTAMP WITH TIME ZONE,
  answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Voicemail drops
CREATE TABLE public.voicemail_drops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  audio_url TEXT,
  duration_seconds INTEGER,
  times_used INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SMS opt-outs for compliance
CREATE TABLE public.sms_opt_outs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  opted_out_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT,
  source TEXT
);

-- Power dialer queue
CREATE TABLE public.dialer_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts_unified(id),
  lead_id UUID REFERENCES public.leads(id),
  campaign_id UUID,
  phone_number TEXT NOT NULL,
  priority INTEGER DEFAULT 50,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'completed', 'failed', 'skipped')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- COLD OUTREACH TABLES
-- =============================================

-- Cold outreach campaigns
CREATE TABLE public.cold_outreach_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT DEFAULT 'email' CHECK (campaign_type IN ('email', 'sms', 'phone', 'linkedin', 'multi-channel')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  settings JSONB DEFAULT '{}'::jsonb,
  daily_limit INTEGER DEFAULT 50,
  timezone TEXT DEFAULT 'America/New_York',
  send_window_start TIME DEFAULT '09:00',
  send_window_end TIME DEFAULT '17:00',
  send_days TEXT[] DEFAULT ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  total_contacts INTEGER DEFAULT 0,
  contacts_reached INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Cold outreach contacts (imported leads)
CREATE TABLE public.cold_outreach_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.cold_outreach_campaigns(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  title TEXT,
  linkedin_url TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'replied', 'bounced', 'unsubscribed', 'converted')),
  current_step INTEGER DEFAULT 0,
  last_contacted_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  do_not_contact BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Cold outreach sequences (email/sms templates)
CREATE TABLE public.cold_outreach_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.cold_outreach_campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'sms', 'phone', 'linkedin')),
  delay_days INTEGER DEFAULT 0,
  delay_hours INTEGER DEFAULT 0,
  subject TEXT,
  body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Cold outreach sends (tracking individual sends)
CREATE TABLE public.cold_outreach_sends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.cold_outreach_campaigns(id),
  contact_id UUID REFERENCES public.cold_outreach_contacts(id),
  sequence_id UUID REFERENCES public.cold_outreach_sequences(id),
  channel TEXT NOT NULL,
  external_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- WARM NURTURE TABLES
-- =============================================

-- Warm nurture campaigns
CREATE TABLE public.warm_nurture_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'website_visit', 'email_open', 'form_submit', 'score_threshold', 'tag_added')),
  trigger_conditions JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  enrolled_count INTEGER DEFAULT 0,
  converted_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Nurture touchpoints (steps in nurture campaign)
CREATE TABLE public.nurture_touchpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.warm_nurture_campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  touchpoint_type TEXT NOT NULL CHECK (touchpoint_type IN ('email', 'sms', 'call', 'wait', 'condition', 'tag', 'webhook')),
  delay_minutes INTEGER DEFAULT 0,
  content JSONB DEFAULT '{}'::jsonb,
  conditions JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  executed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Nurture enrollments
CREATE TABLE public.nurture_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.warm_nurture_campaigns(id),
  contact_id UUID REFERENCES public.contacts_unified(id),
  lead_id UUID REFERENCES public.leads(id),
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'converted', 'unsubscribed')),
  enrolled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  next_touchpoint_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- SMS CAMPAIGNS
-- =============================================

-- SMS campaigns (for blasts)
CREATE TABLE public.sms_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'blast' CHECK (campaign_type IN ('blast', 'drip')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'paused')),
  phone_number_id UUID REFERENCES public.phone_numbers(id),
  scheduled_at TIMESTAMP WITH TIME ZONE,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  opt_out_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- SMS campaign recipients
CREATE TABLE public.sms_campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts_unified(id),
  phone_number TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'replied', 'opted_out')),
  external_message_id TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_call_logs_contact ON public.call_logs(contact_id);
CREATE INDEX idx_call_logs_lead ON public.call_logs(lead_id);
CREATE INDEX idx_call_logs_status ON public.call_logs(status);
CREATE INDEX idx_dialer_queue_status ON public.dialer_queue(status, priority DESC);
CREATE INDEX idx_cold_outreach_contacts_campaign ON public.cold_outreach_contacts(campaign_id);
CREATE INDEX idx_cold_outreach_contacts_status ON public.cold_outreach_contacts(status);
CREATE INDEX idx_cold_outreach_sends_campaign ON public.cold_outreach_sends(campaign_id);
CREATE INDEX idx_nurture_enrollments_campaign ON public.nurture_enrollments(campaign_id);
CREATE INDEX idx_sms_campaign_recipients_campaign ON public.sms_campaign_recipients(campaign_id);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voicemail_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialer_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_outreach_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_outreach_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_outreach_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warm_nurture_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurture_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurture_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Admin policies (authenticated users with admin role can access all)
CREATE POLICY "Admins can manage phone_numbers" ON public.phone_numbers FOR ALL USING (true);
CREATE POLICY "Admins can manage call_logs" ON public.call_logs FOR ALL USING (true);
CREATE POLICY "Admins can manage voicemail_drops" ON public.voicemail_drops FOR ALL USING (true);
CREATE POLICY "Admins can manage sms_opt_outs" ON public.sms_opt_outs FOR ALL USING (true);
CREATE POLICY "Admins can manage dialer_queue" ON public.dialer_queue FOR ALL USING (true);
CREATE POLICY "Admins can manage cold_outreach_campaigns" ON public.cold_outreach_campaigns FOR ALL USING (true);
CREATE POLICY "Admins can manage cold_outreach_contacts" ON public.cold_outreach_contacts FOR ALL USING (true);
CREATE POLICY "Admins can manage cold_outreach_sequences" ON public.cold_outreach_sequences FOR ALL USING (true);
CREATE POLICY "Admins can manage cold_outreach_sends" ON public.cold_outreach_sends FOR ALL USING (true);
CREATE POLICY "Admins can manage warm_nurture_campaigns" ON public.warm_nurture_campaigns FOR ALL USING (true);
CREATE POLICY "Admins can manage nurture_touchpoints" ON public.nurture_touchpoints FOR ALL USING (true);
CREATE POLICY "Admins can manage nurture_enrollments" ON public.nurture_enrollments FOR ALL USING (true);
CREATE POLICY "Admins can manage sms_campaigns" ON public.sms_campaigns FOR ALL USING (true);
CREATE POLICY "Admins can manage sms_campaign_recipients" ON public.sms_campaign_recipients FOR ALL USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_phone_numbers_updated_at BEFORE UPDATE ON public.phone_numbers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dialer_queue_updated_at BEFORE UPDATE ON public.dialer_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cold_outreach_campaigns_updated_at BEFORE UPDATE ON public.cold_outreach_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cold_outreach_contacts_updated_at BEFORE UPDATE ON public.cold_outreach_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cold_outreach_sequences_updated_at BEFORE UPDATE ON public.cold_outreach_sequences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_warm_nurture_campaigns_updated_at BEFORE UPDATE ON public.warm_nurture_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sms_campaigns_updated_at BEFORE UPDATE ON public.sms_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();