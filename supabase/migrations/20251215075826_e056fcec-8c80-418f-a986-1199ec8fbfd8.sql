-- Video Provider Configuration
CREATE TABLE public.video_provider_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  priority INTEGER DEFAULT 1,
  is_enabled BOOLEAN DEFAULT true,
  cost_per_second_cents NUMERIC DEFAULT 0,
  quality_score INTEGER DEFAULT 80,
  max_duration_seconds INTEGER DEFAULT 60,
  capabilities JSONB DEFAULT '{}',
  api_key_configured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Video Provider Health Tracking
CREATE TABLE public.video_provider_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'disabled', 'error')),
  is_auto_disabled BOOLEAN DEFAULT false,
  consecutive_failures INTEGER DEFAULT 0,
  total_failures INTEGER DEFAULT 0,
  success_rate NUMERIC DEFAULT 100,
  avg_latency_ms INTEGER,
  total_videos_generated INTEGER DEFAULT 0,
  total_seconds_generated INTEGER DEFAULT 0,
  total_cost_cents INTEGER DEFAULT 0,
  auto_disable_threshold INTEGER DEFAULT 3,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Video Generation Events (Cost Analytics)
CREATE TABLE public.video_generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  video_id TEXT,
  project_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  duration_seconds INTEGER,
  cost_cents INTEGER DEFAULT 0,
  latency_ms INTEGER,
  error_message TEXT,
  ai_decision_reason TEXT,
  quality_score INTEGER,
  fallback_from TEXT,
  request_params JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Video Assets Library
CREATE TABLE public.video_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('screen_recording', 'avatar_clip', 'graphic', 'audio', 'template', 'b_roll')),
  title TEXT,
  description TEXT,
  file_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  file_size_bytes INTEGER,
  mime_type TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Video Projects
CREATE TABLE public.video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  template_id UUID,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'editing', 'rendering', 'completed', 'failed')),
  render_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  total_cost_cents INTEGER DEFAULT 0,
  quality_check_passed BOOLEAN,
  quality_check_result JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Video Project Items (Timeline)
CREATE TABLE public.video_project_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES video_assets(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('avatar', 'screen', 'graphic', 'audio', 'text', 'transition')),
  track_index INTEGER DEFAULT 0,
  start_time_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 1000,
  layer_props JSONB DEFAULT '{}',
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Video Templates
CREATE TABLE public.video_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  thumbnail_url TEXT,
  duration_estimate_seconds INTEGER,
  structure JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.video_provider_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_generation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for video_provider_config
CREATE POLICY "Anyone can view provider config" ON public.video_provider_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage provider config" ON public.video_provider_config FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for video_provider_health
CREATE POLICY "Anyone can view provider health" ON public.video_provider_health FOR SELECT USING (true);
CREATE POLICY "Anyone can insert provider health" ON public.video_provider_health FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update provider health" ON public.video_provider_health FOR UPDATE USING (true);

-- RLS Policies for video_generation_events
CREATE POLICY "Anyone can view generation events" ON public.video_generation_events FOR SELECT USING (true);
CREATE POLICY "Anyone can insert generation events" ON public.video_generation_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update generation events" ON public.video_generation_events FOR UPDATE USING (true);

-- RLS Policies for video_assets
CREATE POLICY "Anyone can view video assets" ON public.video_assets FOR SELECT USING (true);
CREATE POLICY "Anyone can insert video assets" ON public.video_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update video assets" ON public.video_assets FOR UPDATE USING (true);
CREATE POLICY "Admins can delete video assets" ON public.video_assets FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for video_projects
CREATE POLICY "Anyone can view video projects" ON public.video_projects FOR SELECT USING (true);
CREATE POLICY "Anyone can insert video projects" ON public.video_projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update video projects" ON public.video_projects FOR UPDATE USING (true);
CREATE POLICY "Admins can delete video projects" ON public.video_projects FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for video_project_items
CREATE POLICY "Anyone can view project items" ON public.video_project_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert project items" ON public.video_project_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update project items" ON public.video_project_items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete project items" ON public.video_project_items FOR DELETE USING (true);

-- RLS Policies for video_templates
CREATE POLICY "Anyone can view templates" ON public.video_templates FOR SELECT USING (true);
CREATE POLICY "Admins can manage templates" ON public.video_templates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default provider configurations
INSERT INTO public.video_provider_config (provider, priority, cost_per_second_cents, quality_score, max_duration_seconds, capabilities, api_key_configured) VALUES
  ('lovable_veo', 1, 0, 85, 8, '{"text_to_video": true, "avatar": false, "max_resolution": "1080p"}', true),
  ('d_id', 2, 5, 88, 120, '{"text_to_video": false, "avatar": true, "lip_sync": true, "max_resolution": "1080p"}', false),
  ('heygen', 3, 8, 92, 300, '{"text_to_video": false, "avatar": true, "custom_avatars": true, "lip_sync": true, "max_resolution": "4k"}', false);

-- Insert default provider health records
INSERT INTO public.video_provider_health (provider, status, success_rate) VALUES
  ('lovable_veo', 'healthy', 100),
  ('d_id', 'healthy', 100),
  ('heygen', 'healthy', 100);

-- Add updated_at triggers
CREATE TRIGGER update_video_provider_config_updated_at BEFORE UPDATE ON public.video_provider_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_video_provider_health_updated_at BEFORE UPDATE ON public.video_provider_health FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_video_assets_updated_at BEFORE UPDATE ON public.video_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_video_projects_updated_at BEFORE UPDATE ON public.video_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_video_project_items_updated_at BEFORE UPDATE ON public.video_project_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_video_templates_updated_at BEFORE UPDATE ON public.video_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();