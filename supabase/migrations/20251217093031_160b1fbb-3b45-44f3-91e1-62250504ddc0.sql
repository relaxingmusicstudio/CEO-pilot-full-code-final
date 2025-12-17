-- PHASE 2E HOTFIX: Patch check_lead_update_allowed to match actual leads schema
-- Removes references to utm_term and utm_content (columns don't exist)

-- =============================================================================
-- 1) RECREATE TRIGGER FUNCTION WITH CORRECTED COLUMN REFERENCES
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_lead_update_allowed()
RETURNS trigger
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

  -- Check funnels-owned fields: source, utm_source, utm_medium, utm_campaign
  -- NOTE: utm_term and utm_content do NOT exist on leads table
  IF (OLD.source IS DISTINCT FROM NEW.source) OR
     (OLD.utm_source IS DISTINCT FROM NEW.utm_source) OR
     (OLD.utm_medium IS DISTINCT FROM NEW.utm_medium) OR
     (OLD.utm_campaign IS DISTINCT FROM NEW.utm_campaign) THEN
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
    RAISE EXCEPTION 'LEAD_OWNERSHIP_VIOLATION: Funnels-owned fields (source, utm_source, utm_medium, utm_campaign) can only be updated via funnels_update_lead_fields RPC. Set app.rpc_funnels context.';
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
-- 2) RECREATE TRIGGER (safe drop + create)
-- =============================================================================

DROP TRIGGER IF EXISTS enforce_lead_ownership ON public.leads;

CREATE TRIGGER enforce_lead_ownership
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lead_update_allowed();

-- =============================================================================
-- 3) PATCH funnels_update_lead_fields to match schema (remove utm_term/utm_content)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.funnels_update_lead_fields(
  p_lead_id uuid,
  p_source text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL
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
  -- Set context flag to bypass trigger for funnels
  PERFORM set_config('app.rpc_funnels', 'true', true);

  -- Validate lead exists
  SELECT * INTO v_old_record FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;

  -- Perform update (only funnels-owned fields that exist)
  UPDATE leads
  SET
    source = COALESCE(p_source, source),
    utm_source = COALESCE(p_utm_source, utm_source),
    utm_medium = COALESCE(p_utm_medium, utm_medium),
    utm_campaign = COALESCE(p_utm_campaign, utm_campaign),
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
    'funnels_update',
    'system',
    'funnels',
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
      'source', v_new_record.source,
      'utm_source', v_new_record.utm_source,
      'utm_medium', v_new_record.utm_medium,
      'utm_campaign', v_new_record.utm_campaign
    )
  );
END;
$$;

-- Permissions for funnels RPC (service_role only)
REVOKE ALL ON FUNCTION public.funnels_update_lead_fields(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.funnels_update_lead_fields(uuid, text, text, text, text) TO service_role;