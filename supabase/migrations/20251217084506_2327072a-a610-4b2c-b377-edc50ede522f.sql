-- Phase 1D: Budget/Volume Cap Tracking + Emergency Stop + Lead Ownership RPCs
-- System Contract v1.1.1 Implementation

-- 1. Add emergency stop to business_profile
ALTER TABLE public.business_profile 
ADD COLUMN IF NOT EXISTS emergency_stop_active boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS emergency_stop_reason text,
ADD COLUMN IF NOT EXISTS emergency_stop_at timestamptz;

-- 2. Budget usage tracking table
CREATE TABLE IF NOT EXISTS public.budget_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('ad_spend', 'ai_api_costs', 'video_generation', 'sms_voice', 'email')),
  amount_cents integer NOT NULL DEFAULT 0,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start date NOT NULL,
  module_source text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_usage_category_period ON public.budget_usage_log (category, period_type, period_start);
ALTER TABLE public.budget_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access budget_usage_log" ON public.budget_usage_log;
CREATE POLICY "Service role full access budget_usage_log" ON public.budget_usage_log FOR ALL USING (true) WITH CHECK (true);

-- 3. Budget caps configuration
CREATE TABLE IF NOT EXISTS public.budget_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  cap_cents integer NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category, period_type)
);

ALTER TABLE public.budget_caps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access budget_caps" ON public.budget_caps;
CREATE POLICY "Service role full access budget_caps" ON public.budget_caps FOR ALL USING (true) WITH CHECK (true);

-- Insert default caps (per System Contract v1.1.1)
INSERT INTO public.budget_caps (category, period_type, cap_cents) VALUES
  ('ad_spend', 'daily', 5000),
  ('ai_api_costs', 'daily', 2500),
  ('video_generation', 'daily', 3000),
  ('sms_voice', 'daily', 2000),
  ('email', 'daily', 500)
ON CONFLICT (category, period_type) DO NOTHING;

-- 4. Postgres function: Check if emergency stop is active
CREATE OR REPLACE FUNCTION public.is_emergency_stop_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT emergency_stop_active FROM business_profile LIMIT 1),
    false
  );
$$;

-- 5. Postgres function: Get budget usage for period
CREATE OR REPLACE FUNCTION public.get_budget_usage(
  p_category text,
  p_period_type text,
  p_period_start date DEFAULT CURRENT_DATE
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_cents), 0)::integer
  FROM budget_usage_log
  WHERE category = p_category
    AND period_type = p_period_type
    AND period_start = p_period_start;
$$;

-- 6. Postgres function: Check budget cap
CREATE OR REPLACE FUNCTION public.check_budget_cap(
  p_category text,
  p_amount_cents integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap_cents integer;
  v_used_cents integer;
  v_remaining integer;
BEGIN
  -- Get daily cap
  SELECT cap_cents INTO v_cap_cents
  FROM budget_caps
  WHERE category = p_category
    AND period_type = 'daily'
    AND is_active = true;
  
  IF v_cap_cents IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_cap_configured');
  END IF;
  
  -- Get current usage
  v_used_cents := get_budget_usage(p_category, 'daily', CURRENT_DATE);
  v_remaining := v_cap_cents - v_used_cents;
  
  IF v_remaining < p_amount_cents THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'BUDGET_CAP_EXCEEDED',
      'cap_cents', v_cap_cents,
      'used_cents', v_used_cents,
      'remaining_cents', v_remaining,
      'requested_cents', p_amount_cents
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'cap_cents', v_cap_cents,
    'used_cents', v_used_cents,
    'remaining_cents', v_remaining
  );
END;
$$;

-- 7. Postgres function: Record budget usage
CREATE OR REPLACE FUNCTION public.record_budget_usage(
  p_category text,
  p_amount_cents integer,
  p_module_source text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO budget_usage_log (category, amount_cents, period_type, period_start, module_source, metadata)
  VALUES (p_category, p_amount_cents, 'daily', CURRENT_DATE, p_module_source, p_metadata)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- 8. Lead field ownership RPCs (System Contract v1.1.1 Patch)
-- Cold Agent can update: status (cold->warm), engagement_score, last_contacted
CREATE OR REPLACE FUNCTION public.cold_update_lead_fields(
  p_lead_id uuid,
  p_status text DEFAULT NULL,
  p_engagement_score integer DEFAULT NULL,
  p_last_contacted timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_statuses text[] := ARRAY['cold', 'warm', 'contacted', 'nurturing'];
BEGIN
  -- Validate status if provided
  IF p_status IS NOT NULL AND NOT (p_status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cold Agent can only set status to: cold, warm, contacted, nurturing');
  END IF;
  
  UPDATE leads SET
    status = COALESCE(p_status, status),
    lead_score = COALESCE(p_engagement_score, lead_score),
    last_call_date = COALESCE(p_last_contacted, last_call_date),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Audit log
  INSERT INTO action_history (action_table, action_id, action_type, target_type, target_id, actor_type, actor_module, new_state)
  VALUES ('leads', gen_random_uuid(), 'cold_update', 'lead', p_lead_id::text, 'module', 'cold_agent', 
    jsonb_build_object('status', p_status, 'engagement_score', p_engagement_score));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Sales Agent can update: status (qualified/disqualified), qualification_data, assigned_to
CREATE OR REPLACE FUNCTION public.sales_update_lead_fields(
  p_lead_id uuid,
  p_status text DEFAULT NULL,
  p_qualification_data jsonb DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_statuses text[] := ARRAY['qualified', 'disqualified', 'opportunity', 'negotiating', 'closed_won', 'closed_lost'];
BEGIN
  -- Validate status if provided
  IF p_status IS NOT NULL AND NOT (p_status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales Agent can only set status to: qualified, disqualified, opportunity, negotiating, closed_won, closed_lost');
  END IF;
  
  UPDATE leads SET
    status = COALESCE(p_status, status),
    custom_fields = CASE 
      WHEN p_qualification_data IS NOT NULL 
      THEN COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object('qualification_data', p_qualification_data)
      ELSE custom_fields
    END,
    assigned_to = COALESCE(p_assigned_to, assigned_to),
    updated_at = now()
  WHERE id = p_lead_id;
  
  -- Audit log
  INSERT INTO action_history (action_table, action_id, action_type, target_type, target_id, actor_type, actor_module, new_state)
  VALUES ('leads', gen_random_uuid(), 'sales_update', 'lead', p_lead_id::text, 'module', 'sales_agent',
    jsonb_build_object('status', p_status, 'assigned_to', p_assigned_to));
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. Master compliance check function (wraps all checks)
CREATE OR REPLACE FUNCTION public.check_outbound_compliance(
  p_contact_id uuid,
  p_channel text,
  p_consent_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suppressed boolean;
  v_has_consent boolean;
  v_channel_touches integer;
  v_total_touches integer;
  v_channel_cap integer;
  v_total_cap integer := 5;
  v_emergency_stop boolean;
BEGIN
  -- Check emergency stop first
  SELECT COALESCE(emergency_stop_active, false) INTO v_emergency_stop
  FROM business_profile LIMIT 1;
  
  IF v_emergency_stop THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'EMERGENCY_STOP', 'message', 'System emergency stop is active');
  END IF;
  
  -- Check suppression
  SELECT EXISTS(
    SELECT 1 FROM contact_suppression 
    WHERE contact_id = p_contact_id 
      AND channel IN (p_channel, 'all')
      AND reactivated_at IS NULL
  ) INTO v_suppressed;
  
  IF v_suppressed THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'SUPPRESSED', 'message', 'Contact is suppressed');
  END IF;
  
  -- Check consent
  SELECT EXISTS(
    SELECT 1 FROM contact_consent
    WHERE contact_id = p_contact_id
      AND channel = p_channel
      AND revoked_at IS NULL
      AND (p_consent_type IS NULL OR consent_type = p_consent_type)
  ) INTO v_has_consent;
  
  IF NOT v_has_consent THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'NO_CONSENT', 'message', 'No valid consent for channel');
  END IF;
  
  -- Get channel cap
  v_channel_cap := CASE p_channel
    WHEN 'sms' THEN 3
    WHEN 'voice' THEN 2
    WHEN 'email' THEN 1
    ELSE 3
  END;
  
  -- Check channel frequency
  SELECT COUNT(*) INTO v_channel_touches
  FROM outbound_touch_log
  WHERE contact_id = p_contact_id
    AND channel = p_channel
    AND status = 'sent'
    AND created_at > now() - interval '24 hours';
  
  IF v_channel_touches >= v_channel_cap THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'FREQUENCY_CAP_CHANNEL', 
      'message', format('Channel cap exceeded: %s/%s', v_channel_touches, v_channel_cap),
      'touches', v_channel_touches, 'cap', v_channel_cap);
  END IF;
  
  -- Check total frequency
  SELECT COUNT(*) INTO v_total_touches
  FROM outbound_touch_log
  WHERE contact_id = p_contact_id
    AND status = 'sent'
    AND created_at > now() - interval '24 hours';
  
  IF v_total_touches >= v_total_cap THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'FREQUENCY_CAP_TOTAL',
      'message', format('Total cap exceeded: %s/%s', v_total_touches, v_total_cap),
      'touches', v_total_touches, 'cap', v_total_cap);
  END IF;
  
  RETURN jsonb_build_object('allowed', true, 'channel_touches', v_channel_touches, 'total_touches', v_total_touches);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_emergency_stop_active() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_budget_usage(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_budget_cap(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_budget_usage(text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cold_update_lead_fields(uuid, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_update_lead_fields(uuid, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_outbound_compliance(uuid, text, text) TO authenticated, anon;