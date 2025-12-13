-- Content Patterns: Stores winner/loser patterns learned from content performance
CREATE TABLE public.content_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL, -- video, image, text, audio
  pattern_type TEXT NOT NULL DEFAULT 'neutral', -- winner, loser, neutral
  pattern_category TEXT NOT NULL, -- headline, hook, cta, visual_style, music_mood, script_structure
  pattern_description TEXT NOT NULL,
  example_prompt TEXT,
  engagement_score NUMERIC DEFAULT 0,
  confidence_score NUMERIC DEFAULT 0.5,
  times_used INTEGER DEFAULT 0,
  times_successful INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Content Performance: Tracks how each piece of content performed
CREATE TABLE public.content_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID REFERENCES public.content(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL,
  platform TEXT,
  views INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  watch_time_avg NUMERIC,
  completion_rate NUMERIC,
  user_rating INTEGER, -- 1-5 scale
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  classification TEXT DEFAULT 'neutral', -- winner, loser, neutral
  extracted_patterns JSONB DEFAULT '[]'::jsonb,
  original_prompt TEXT,
  enhanced_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Scraped Inspiration: Stores patterns from viral/successful content found online
CREATE TABLE public.scraped_inspiration (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url TEXT,
  source_platform TEXT,
  content_type TEXT NOT NULL,
  niche TEXT DEFAULT 'hvac',
  title TEXT,
  description TEXT,
  engagement_metrics JSONB DEFAULT '{}'::jsonb,
  extracted_patterns JSONB DEFAULT '[]'::jsonb,
  viral_score INTEGER DEFAULT 0,
  is_processed BOOLEAN DEFAULT false,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_inspiration ENABLE ROW LEVEL SECURITY;

-- RLS Policies for content_patterns
CREATE POLICY "Admins can manage content patterns" ON public.content_patterns
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view content patterns" ON public.content_patterns
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert content patterns" ON public.content_patterns
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update content patterns" ON public.content_patterns
  FOR UPDATE USING (true);

-- RLS Policies for content_performance
CREATE POLICY "Admins can manage content performance" ON public.content_performance
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view content performance" ON public.content_performance
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert content performance" ON public.content_performance
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update content performance" ON public.content_performance
  FOR UPDATE USING (true);

-- RLS Policies for scraped_inspiration
CREATE POLICY "Admins can manage scraped inspiration" ON public.scraped_inspiration
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view scraped inspiration" ON public.scraped_inspiration
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert scraped inspiration" ON public.scraped_inspiration
  FOR INSERT WITH CHECK (true);

-- Create trigger for updated_at on content_patterns
CREATE TRIGGER update_content_patterns_updated_at
  BEFORE UPDATE ON public.content_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();