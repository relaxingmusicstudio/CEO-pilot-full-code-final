-- Phase 2E: Lead Ownership Enforcement Migration
-- Enforces field-level ownership via BEFORE UPDATE trigger on public.leads

-- =============================================================================
-- 1) DEFENSIVE DROPS
-- =============================================================================

DROP TRIGGER IF EXISTS enforce_lead_ownership ON public.leads;
DROP FUNCTION IF EXISTS public.check_lead_update_allowed();
DROP FUNCTION IF EXISTS public.cold_update_lead_fields(uuid, text, integer, timestamptz, text, text, boolean);
DROP FUNCTION IF EXISTS public.sales_update_lead_fields(uuid, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.convert_lead(uuid, timestamptz, text, numeric);

-- =============================================================================
-- 2) TRIGGER FUNCTION: check_lead_update_allowed
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_lead_update_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rpc_cold_agent boolean;
  v_rpc_sales_agent boolean;
  v_rpc_conversion boolean;
  v_rpc_funnels boolean;
  v_cold_statuses text[] := ARRAY['cold', 'warm', 'contacted', 'nurturing', 'new'];
  v_sales_statuses text[] := ARRAY['qualified', 'disqualified', 'opportunity', 'negotiating', 'closed_won', 'closed_lost', 'converted'];
  v_funnels_changed boolean := false;
  v_cold_changed boolean := false;
  v_sales_changed boolean := false;
  v_conversion_changed boolean := false;
BEGIN
  -- Read context flags (fail-safe to false if not set)
  v_rpc_cold_agent := COALESCE(current_setting('app.rpc_cold_agent', true), '') = 'true';
  v_rpc_sales_agent := COALESCE(current_setting('app.rpc_sales_agent', true), '') = 'true';
  v_rpc_conversion := COALESCE(current_setting('app.rpc_conversion', true), '') = 'true';
  v_rpc_funnels := COALESCE(current_setting('app.rpc_funnels', true), '') = 'true';

  -- Check funnels-owned fields: source, utm_source, utm_medium, utm_campaign, utm_term, utm_content
  IF (OLD.source IS DISTINCT FROM NEW.source) OR
     (OLD.utm_source IS DISTINCT FROM NEW.utm_source) OR
     (OLD.utm_medium IS DISTINCT FROM NEW.utm_medium) OR
     (OLD.utm_campaign IS DISTINCT FROM NEW.utm_campaign) OR
     (OLD.utm_term IS DISTINCT FROM NEW.utm_term) OR
     (OLD.utm_content IS DISTINCT FROM NEW.utm_content) THEN
    v_funnels_changed := true;
  END IF;

  -- Check cold-owned fields: lead_score, last_call_date, last_call_outcome, last_call_notes, total_call_attempts
  IF (OLD.lead_score IS DISTINCT FROM NEW.lead_score) OR
     (OLD.last_call_date IS DISTINCT FROM NEW.last_call_date) OR
     (OLD.last_call_outcome IS DISTINCT FROM NEW.last_call_outcome) OR
     (OLD.last_call_notes IS DISTINCT FROM NEW.last_call_notes) OR
     (OLD.total_call_attempts IS DISTINCT FROM NEW.total_call_attempts) THEN
    v_cold_changed := true;
  END IF;

  -- Check cold-owned status transitions (to cold statuses)
  IF (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status = ANY(v_cold_statuses)) THEN
    v_cold_changed := true;
  END IF;

  -- Check sales-owned fields: assigned_to, custom_fields->'qualification_data'
  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) OR
     ((OLD.custom_fields->>'qualification_data') IS DISTINCT FROM (NEW.custom_fields->>'qualification_data')) THEN
    v_sales_changed := true;
  END IF;

  -- Check sales-owned status transitions (to sales statuses, except converted which has special handling)
  IF (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status = ANY(v_sales_statuses)) AND (NEW.status != 'converted') THEN
    v_sales_changed := true;
  END IF;

  -- Check conversion: status changing to 'converted'
  IF (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status = 'converted') THEN
    v_conversion_changed := true;
  END IF;

  -- Enforce funnels ownership
  IF v_funnels_changed AND NOT v_rpc_funnels THEN
    RAISE EXCEPTION 'LEAD_OWNERSHIP_VIOLATION: Funnels-owned fields (source, utm_*) can only be updated via funnels_update_lead RPC. Set app.rpc_funnels context.';
  END IF;

  -- Enforce cold agent ownership
  IF v_cold_changed AND NOT v_rpc_cold_agent THEN
    RAISE EXCEPTION 'LEAD_OWNERSHIP_VIOLATION: Cold-agent-owned fields (lead_score, last_call_*, total_call_attempts, status in [cold,warm,contacted,nurturing,new]) can only be updated via cold_update_lead_fields RPC. Set app.rpc_cold_agent context.';
  END IF;

  -- Enforce sales agent ownership
  IF v_sales_changed AND NOT v_rpc_sales_agent THEN
    RAISE EXCEPTION 'LEAD_OWNERSHIP_VIOLATION: Sales-agent-owned fields (assigned_to, qualification_data, status in [qualified,disqualified,opportunity,negotiating,closed_won,closed_lost]) can only be updated via sales_update_lead_fields RPC. Set app.rpc_sales_agent context.';
  END IF;

  -- Enforce conversion ownership (conversion OR sales agent can convert)
  IF v_conversion_changed AND NOT (v_rpc_conversion OR v_rpc_sales_agent) THEN
    RAISE EXCEPTION 'LEAD_OWNERSHIP_VIOLATION: Setting status to "converted" requires convert_lead RPC or sales_update_lead_fields RPC. Set app.rpc_conversion or app.rpc_sales_agent context.';
  END IF;

  -- If no restricted fields changed, or all checks passed, allow update
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3) CREATE TRIGGER
-- =============================================================================

CREATE TRIGGER enforce_lead_ownership
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lead_update_allowed();

-- =============================================================================
-- 4a) RPC: cold_update_lead_fields
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cold_update_lead_fields(
  p_lead_id uuid,
  p_status text DEFAULT NULL,
  p_engagement_score integer DEFAULT NULL,
  p_last_contacted timestamptz DEFAULT NULL,
  p_last_call_outcome text DEFAULT NULL,
  p_last_call_notes text DEFAULT NULL,
  p_increment_call_attempts boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_exists boolean;
  v_old_record leads%ROWTYPE;
  v_new_record leads%ROWTYPE;
  v_allowed_statuses text[] := ARRAY['cold', 'warm', 'contacted', 'nurturing', 'new'];
BEGIN
  -- Set context flag to bypass trigger for cold agent
  PERFORM set_config('app.rpc_cold_agent', 'true', true);

  -- Validate lead exists
  SELECT * INTO v_old_record FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  -- Validate status if provided
  IF p_status IS NOT NULL AND NOT (p_status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cold agent can only set status to: %s', array_to_string(v_allowed_statuses, ', '))
    );
  END IF;

  -- Perform update
  UPDATE leads
  SET
    status = COALESCE(p_status, status),
    lead_score = COALESCE(p_engagement_score, lead_score),
    last_call_date = COALESCE(p_last_contacted, last_call_date),
    last_call_outcome = COALESCE(p_last_call_outcome, last_call_outcome),
    last_call_notes = COALESCE(p_last_call_notes, last_call_notes),
    total_call_attempts = CASE 
      WHEN p_increment_call_attempts THEN COALESCE(total_call_attempts, 0) + 1 
      ELSE total_call_attempts 
    END,
    updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_new_record;

  -- Log to action_history
  INSERT INTO action_history (
    action_id,
    action_table,
    action_type,
    actor_type,
    actor_module,
    target_type,
    target_id,
    previous_state,
    new_state,
    executed_at
  ) VALUES (
    gen_random_uuid(),
    'leads',
    'cold_update',
    'agent',
    'cold_agent',
    'lead',
    p_lead_id::text,
    to_jsonb(v_old_record),
    to_jsonb(v_new_record),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'updated_fields', jsonb_build_object(
      'status', v_new_record.status,
      'lead_score', v_new_record.lead_score,
      'last_call_date', v_new_record.last_call_date,
      'last_call_outcome', v_new_record.last_call_outcome,
      'total_call_attempts', v_new_record.total_call_attempts
    )
  );
END;
$$;

-- =============================================================================
-- 4b) RPC: sales_update_lead_fields
-- =============================================================================

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
  v_old_record leads%ROWTYPE;
  v_new_record leads%ROWTYPE;
  v_allowed_statuses text[] := ARRAY['qualified', 'disqualified', 'opportunity', 'negotiating', 'closed_won', 'closed_lost', 'converted'];
  v_updated_custom_fields jsonb;
BEGIN
  -- Set context flag to bypass trigger for sales agent
  PERFORM set_config('app.rpc_sales_agent', 'true', true);

  -- Validate lead exists
  SELECT * INTO v_old_record FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  -- Validate status if provided
  IF p_status IS NOT NULL AND NOT (p_status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Sales agent can only set status to: %s', array_to_string(v_allowed_statuses, ', '))
    );
  END IF;

  -- Merge qualification_data into custom_fields
  v_updated_custom_fields := COALESCE(v_old_record.custom_fields, '{}'::jsonb);
  IF p_qualification_data IS NOT NULL THEN
    v_updated_custom_fields := v_updated_custom_fields || jsonb_build_object('qualification_data', p_qualification_data);
  END IF;

  -- Perform update
  UPDATE leads
  SET
    status = COALESCE(p_status, status),
    assigned_to = COALESCE(p_assigned_to, assigned_to),
    custom_fields = v_updated_custom_fields,
    updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_new_record;

  -- Log to action_history
  INSERT INTO action_history (
    action_id,
    action_table,
    action_type,
    actor_type,
    actor_module,
    target_type,
    target_id,
    previous_state,
    new_state,
    executed_at
  ) VALUES (
    gen_random_uuid(),
    'leads',
    'sales_update',
    'agent',
    'sales_agent',
    'lead',
    p_lead_id::text,
    to_jsonb(v_old_record),
    to_jsonb(v_new_record),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'updated_fields', jsonb_build_object(
      'status', v_new_record.status,
      'assigned_to', v_new_record.assigned_to,
      'custom_fields', v_new_record.custom_fields
    )
  );
END;
$$;

-- =============================================================================
-- 4c) RPC: convert_lead
-- =============================================================================

CREATE OR REPLACE FUNCTION public.convert_lead(
  p_lead_id uuid,
  p_converted_at timestamptz DEFAULT now(),
  p_notes text DEFAULT NULL,
  p_revenue_value numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_record leads%ROWTYPE;
  v_new_record leads%ROWTYPE;
BEGIN
  -- Set context flag to bypass trigger for conversion
  PERFORM set_config('app.rpc_conversion', 'true', true);

  -- Validate lead exists
  SELECT * INTO v_old_record FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  -- Check if already converted
  IF v_old_record.status = 'converted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead is already converted');
  END IF;

  -- Perform update
  UPDATE leads
  SET
    status = 'converted',
    converted_at = p_converted_at,
    notes = COALESCE(p_notes, notes),
    revenue_value = COALESCE(p_revenue_value, revenue_value),
    updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_new_record;

  -- Log to action_history
  INSERT INTO action_history (
    action_id,
    action_table,
    action_type,
    actor_type,
    actor_module,
    target_type,
    target_id,
    previous_state,
    new_state,
    executed_at
  ) VALUES (
    gen_random_uuid(),
    'leads',
    'convert',
    'system',
    'conversion_flow',
    'lead',
    p_lead_id::text,
    to_jsonb(v_old_record),
    to_jsonb(v_new_record),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'converted_at', p_converted_at,
    'previous_status', v_old_record.status,
    'revenue_value', v_new_record.revenue_value
  );
END;
$$;

-- =============================================================================
-- 5) GRANT EXECUTE PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.cold_update_lead_fields(uuid, text, integer, timestamptz, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cold_update_lead_fields(uuid, text, integer, timestamptz, text, text, boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.sales_update_lead_fields(uuid, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_update_lead_fields(uuid, text, jsonb, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.convert_lead(uuid, timestamptz, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead(uuid, timestamptz, text, numeric) TO service_role;