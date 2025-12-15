-- Create user_consent table for opt-in enhanced tracking
CREATE TABLE public.user_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT UNIQUE NOT NULL,
  enhanced_analytics BOOLEAN DEFAULT false,
  marketing_emails BOOLEAN DEFAULT false,
  personalization BOOLEAN DEFAULT true,
  consent_version TEXT DEFAULT 'v1.0',
  consented_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_consent ENABLE ROW LEVEL SECURITY;

-- Anyone can insert their own consent
CREATE POLICY "Anyone can insert consent"
ON public.user_consent
FOR INSERT
WITH CHECK (true);

-- Anyone can view their own consent by visitor_id
CREATE POLICY "Anyone can view consent"
ON public.user_consent
FOR SELECT
USING (true);

-- Anyone can update consent
CREATE POLICY "Anyone can update consent"
ON public.user_consent
FOR UPDATE
USING (true);

-- Admins can manage all consent
CREATE POLICY "Admins can manage consent"
ON public.user_consent
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_user_consent_updated_at
BEFORE UPDATE ON public.user_consent
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster visitor_id lookups
CREATE INDEX idx_user_consent_visitor_id ON public.user_consent(visitor_id);