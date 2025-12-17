-- Create tenant_knowledge table for CEO knowledge seeds (cloned from templates)
CREATE TABLE IF NOT EXISTS public.tenant_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  content text NOT NULL,
  source text DEFAULT 'template', -- 'template', 'ceo_conversation', 'manual'
  priority integer DEFAULT 5,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, category, title)
);

-- Create template_knowledge_seeds for READ-ONLY template content
CREATE TABLE IF NOT EXISTS public.template_knowledge_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL REFERENCES tenant_templates(template_key) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  content text NOT NULL,
  priority integer DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  UNIQUE(template_key, category, title)
);

-- Create template_content_blocks for READ-ONLY page content
CREATE TABLE IF NOT EXISTS public.template_content_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL REFERENCES tenant_templates(template_key) ON DELETE CASCADE,
  page_key text NOT NULL, -- e.g. 'homepage', 'about', 'services'
  block_key text NOT NULL, -- e.g. 'hero', 'features', 'cta'
  content jsonb NOT NULL DEFAULT '{}',
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(template_key, page_key, block_key)
);

-- Create tenant_content_blocks for tenant-owned cloned content
CREATE TABLE IF NOT EXISTS public.tenant_content_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  block_key text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, page_key, block_key)
);

-- Enable RLS
ALTER TABLE public.tenant_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_knowledge_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_content_blocks ENABLE ROW LEVEL SECURITY;

-- RLS for tenant_knowledge (tenant isolation)
CREATE POLICY "Users can view own tenant knowledge"
ON public.tenant_knowledge FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can manage own tenant knowledge"
ON public.tenant_knowledge FOR ALL
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Service role full access tenant_knowledge"
ON public.tenant_knowledge FOR ALL
USING (true) WITH CHECK (true);

-- RLS for template tables (read-only for everyone, admin can manage)
CREATE POLICY "Anyone can view template seeds"
ON public.template_knowledge_seeds FOR SELECT
USING (true);

CREATE POLICY "Admins can manage template seeds"
ON public.template_knowledge_seeds FOR ALL
USING (is_platform_admin());

CREATE POLICY "Anyone can view template blocks"
ON public.template_content_blocks FOR SELECT
USING (true);

CREATE POLICY "Admins can manage template blocks"
ON public.template_content_blocks FOR ALL
USING (is_platform_admin());

-- RLS for tenant_content_blocks (tenant isolation)
CREATE POLICY "Users can view own tenant blocks"
ON public.tenant_content_blocks FOR SELECT
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can manage own tenant blocks"
ON public.tenant_content_blocks FOR ALL
USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Service role full access tenant_blocks"
ON public.tenant_content_blocks FOR ALL
USING (true) WITH CHECK (true);

-- Function to clone template content to tenant (deterministic, one-time)
CREATE OR REPLACE FUNCTION public.clone_template_to_tenant(
  p_tenant_id uuid,
  p_template_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clone knowledge seeds (no FK back to template)
  INSERT INTO tenant_knowledge (tenant_id, category, title, content, source, priority, metadata)
  SELECT 
    p_tenant_id,
    category,
    title,
    content,
    'template',
    priority,
    jsonb_build_object('cloned_from_template', p_template_key, 'cloned_at', now())
  FROM template_knowledge_seeds
  WHERE template_key = p_template_key
  ON CONFLICT (tenant_id, category, title) DO NOTHING;

  -- Clone content blocks (no FK back to template)
  INSERT INTO tenant_content_blocks (tenant_id, page_key, block_key, content, display_order)
  SELECT 
    p_tenant_id,
    page_key,
    block_key,
    content,
    display_order
  FROM template_content_blocks
  WHERE template_key = p_template_key
  ON CONFLICT (tenant_id, page_key, block_key) DO NOTHING;

  RETURN true;
END;
$$;

-- Update provision_tenant to use cloning
CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text,
  p_owner_user_id uuid,
  p_template_key text DEFAULT 'base',
  p_plan tenant_plan DEFAULT 'starter'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_template tenant_templates%ROWTYPE;
  v_slug text;
BEGIN
  -- Generate slug from name
  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '_', 'g'));

  -- Get template (READ-ONLY reference)
  SELECT * INTO v_template FROM tenant_templates WHERE template_key = p_template_key;

  -- Create tenant in draft status
  INSERT INTO tenants (name, slug, owner_user_id, template_source, plan, status, settings)
  VALUES (
    p_name, 
    v_slug || '_' || substr(gen_random_uuid()::text, 1, 8), 
    p_owner_user_id, 
    p_template_key, 
    p_plan, 
    'draft', 
    COALESCE(v_template.default_settings, '{}'::jsonb)
  )
  RETURNING id INTO v_tenant_id;

  -- Associate user with tenant
  UPDATE profiles SET tenant_id = v_tenant_id WHERE id = p_owner_user_id;

  -- Create initial business_dna from template defaults (COPIED, not referenced)
  INSERT INTO business_dna (tenant_id, business_name, industry, brand_voice)
  SELECT v_tenant_id, p_name,
    COALESCE(v_template.default_business_dna->>'industry', 'general'),
    COALESCE(v_template.default_business_dna->'brand_voice', '{"tone": "professional"}'::jsonb);

  -- Create initial business_profile
  INSERT INTO business_profile (tenant_id, business_name, industry)
  SELECT v_tenant_id, p_name,
    COALESCE(v_template.default_business_dna->>'industry', 'general');

  -- Clone template content to tenant-owned tables
  PERFORM clone_template_to_tenant(v_tenant_id, p_template_key);

  RETURN v_tenant_id;
END;
$$;

-- Admin function to create tenant from template
CREATE OR REPLACE FUNCTION public.admin_create_tenant(
  p_name text,
  p_template_key text DEFAULT 'base',
  p_plan tenant_plan DEFAULT 'starter',
  p_owner_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_owner_id uuid;
BEGIN
  -- Only platform admins can use this
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can create tenants';
  END IF;

  -- Find owner by email if provided
  IF p_owner_email IS NOT NULL THEN
    SELECT id INTO v_owner_id FROM auth.users WHERE email = p_owner_email;
  END IF;

  -- Use provision_tenant for consistency
  v_tenant_id := provision_tenant(p_name, v_owner_id, p_template_key, p_plan);

  RETURN v_tenant_id;
END;
$$;

-- Seed base template with empty knowledge (CEO must gather everything)
-- Base template has NO content - purely conversational onboarding
INSERT INTO template_knowledge_seeds (template_key, category, title, content, priority)
VALUES 
  ('base', 'onboarding', 'Welcome', 'Welcome to CEO in a Box. I am ready to learn about your business.', 1)
ON CONFLICT DO NOTHING;

-- Seed HVAC demo template with demo-specific content
INSERT INTO template_knowledge_seeds (template_key, category, title, content, priority)
VALUES 
  ('hvac', 'industry', 'HVAC Overview', 'The HVAC industry is valued at $156.2 billion with an average repair cost of $351.', 1),
  ('hvac', 'pain_points', 'Missed Calls', 'HVAC contractors miss 27% of incoming calls. 80% of those callers hang up on voicemail.', 2),
  ('hvac', 'metrics', 'Customer Value', 'Average HVAC customer lifetime value is $15,340 with acquisition cost of $296-$350.', 3)
ON CONFLICT DO NOTHING;

-- Seed base template content blocks (empty placeholders)
INSERT INTO template_content_blocks (template_key, page_key, block_key, content, display_order)
VALUES 
  ('base', 'homepage', 'hero', '{"headline": "", "subheadline": "", "cta_text": "Get Started"}', 0),
  ('base', 'homepage', 'features', '{"items": []}', 1),
  ('base', 'homepage', 'testimonials', '{"items": []}', 2)
ON CONFLICT DO NOTHING;

-- Seed HVAC demo content blocks
INSERT INTO template_content_blocks (template_key, page_key, block_key, content, display_order)
VALUES 
  ('hvac', 'homepage', 'hero', '{"headline": "Never Miss Another HVAC Call", "subheadline": "AI-powered receptionist for HVAC contractors", "cta_text": "See Demo"}', 0),
  ('hvac', 'homepage', 'features', '{"items": [{"title": "24/7 Call Answering", "description": "AI answers every call in under 3 rings"}]}', 1)
ON CONFLICT DO NOTHING;