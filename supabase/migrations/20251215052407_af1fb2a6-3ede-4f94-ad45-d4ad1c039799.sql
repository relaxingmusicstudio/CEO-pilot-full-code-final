-- Phase 1: Create user_patterns table for predictive learning
CREATE TABLE public.user_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  visitor_id TEXT,
  trigger_type TEXT NOT NULL,
  trigger_details JSONB DEFAULT '{}',
  action_type TEXT NOT NULL,
  action_payload JSONB DEFAULT '{}',
  confidence_score DECIMAL(3,2) DEFAULT 0.5,
  hit_count INTEGER DEFAULT 1,
  miss_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for efficient pattern lookup
CREATE INDEX idx_user_patterns_user_id ON public.user_patterns(user_id);
CREATE INDEX idx_user_patterns_visitor_id ON public.user_patterns(visitor_id);
CREATE INDEX idx_user_patterns_trigger_type ON public.user_patterns(trigger_type);
CREATE INDEX idx_user_patterns_active ON public.user_patterns(is_active) WHERE is_active = true;
CREATE INDEX idx_user_patterns_confidence ON public.user_patterns(confidence_score DESC);

-- Enable RLS
ALTER TABLE public.user_patterns ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users and service role
CREATE POLICY "Allow service role full access on user_patterns"
ON public.user_patterns
FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_user_patterns_updated_at
BEFORE UPDATE ON public.user_patterns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.user_patterns IS 'Stores detected user behavior patterns for predictive suggestions';