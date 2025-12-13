-- Create table to store configurable chatbot prompts
CREATE TABLE public.chatbot_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_key text NOT NULL UNIQUE,
  prompt_value text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  version integer DEFAULT 1,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chatbot_prompts ENABLE ROW LEVEL SECURITY;

-- Admins can view all prompts
CREATE POLICY "Admins can view chatbot prompts"
ON public.chatbot_prompts
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update prompts
CREATE POLICY "Admins can update chatbot prompts"
ON public.chatbot_prompts
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert prompts
CREATE POLICY "Admins can insert chatbot prompts"
ON public.chatbot_prompts
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Service role can read for edge functions (public read for service role)
CREATE POLICY "Service role can read prompts"
ON public.chatbot_prompts
FOR SELECT
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_chatbot_prompts_updated_at
BEFORE UPDATE ON public.chatbot_prompts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default prompts
INSERT INTO public.chatbot_prompts (prompt_key, prompt_value, description) VALUES
('opener', 'Hey there! Alex with ApexLocal360 👋 Quick question: are you the business owner?', 'Opening greeting message'),
('pricing_objection', 'Fair enough. Here''s the math—at $[loss]/month in missed calls, Starter ($497) pays for itself with ONE extra job. Average HVAC repair is $351, emergency calls are $500-$1,500, and system replacements run $8,000-$15,000. One saved call = profitable.', 'Response to pricing objection'),
('whats_the_catch', 'No catch! No contracts, cancel anytime. We''re confident once you see the missed calls you''re recovering, you won''t want to leave. Ready to give it a shot?', 'Response to "what''s the catch" objection'),
('closing_cta', 'Perfect [name]! Based on what you told me, you''re losing around $[loss]/month to missed calls. That''s $[loss*12]/year walking out the door. 🚨 The good news? You can fix this in 5 minutes.', 'Main closing call-to-action'),
('ai_agent_description', 'Our AI is trained on thousands of HVAC calls. It answers 24/7 (nights, weekends, holidays, extreme weather), handles 300-400% call spikes, books appointments directly into your calendar, and seamlessly transfers to you if needed.', 'Description of the AI agent capabilities');

-- Create prompt history table for tracking changes
CREATE TABLE public.chatbot_prompt_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id uuid REFERENCES public.chatbot_prompts(id) ON DELETE CASCADE,
  prompt_key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_by text,
  change_reason text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on history table
ALTER TABLE public.chatbot_prompt_history ENABLE ROW LEVEL SECURITY;

-- Admins can view prompt history
CREATE POLICY "Admins can view prompt history"
ON public.chatbot_prompt_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert history (from edge functions)
CREATE POLICY "Anyone can insert prompt history"
ON public.chatbot_prompt_history
FOR INSERT
WITH CHECK (true);