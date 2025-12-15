-- Migration 4: Create subscription_plans table with feature gating
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  price_monthly_cents integer DEFAULT 0,
  features_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent_limits jsonb DEFAULT '{"max_tasks_per_day": 50, "max_agents": 3}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insert default plans
INSERT INTO subscription_plans (plan_key, display_name, price_monthly_cents, features_json) VALUES
  ('trial', 'Trial', 0, '{"basic_agents": true, "ceo_chat": true, "approval_queue": true}'),
  ('starter', 'Starter', 4900, '{"basic_agents": true, "ceo_chat": true, "approval_queue": true, "integrations": 3}'),
  ('growth', 'Growth', 14900, '{"basic_agents": true, "advanced_agents": true, "ceo_chat": true, "approval_queue": true, "integrations": 10, "custom_training": true}'),
  ('scale', 'Scale', 49900, '{"all_features": true, "unlimited_integrations": true, "white_label": true, "priority_support": true}')
ON CONFLICT (plan_key) DO NOTHING;

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Anyone can view plans
CREATE POLICY "Anyone can view subscription_plans" ON subscription_plans FOR SELECT USING (true);

-- Admins can manage plans
CREATE POLICY "Admins can manage subscription_plans" ON subscription_plans FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create feature check function
CREATE OR REPLACE FUNCTION check_feature_access(check_tenant_id uuid, feature text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tenant_plan text;
  plan_features jsonb;
BEGIN
  SELECT subscription_plan INTO tenant_plan FROM tenants WHERE id = check_tenant_id;
  SELECT features_json INTO plan_features FROM subscription_plans WHERE plan_key = tenant_plan;
  RETURN COALESCE((plan_features->>feature)::boolean, (plan_features->>'all_features')::boolean, false);
END;
$$;