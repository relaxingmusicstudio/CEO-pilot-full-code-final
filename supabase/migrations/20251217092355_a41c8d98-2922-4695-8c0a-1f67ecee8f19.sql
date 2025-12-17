-- Phase 2E: Funnels-owned Lead Update RPC
-- This function allows funnels/save-analytics to update lead source and UTM fields

-- =============================================================================
-- 1) DROP EXISTING FUNCTION IF EXISTS
-- =============================================================================

DROP FUNCTION IF EXISTS public.funnels_update_lead_fields(uuid, text, text, text, text, text, text);

-- =============================================================================
-- 2) CREATE FUNCTION: funnels_update_lead_fields
-- =============================================================================

CREATE OR REPLACE FUNCTION public.funnels_update_lead_fields(
  p_lead_id uuid,
  p_source text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_utm_content text DEFAULT NULL
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

  -- Perform update (only funnels-owned fields)
  UPDATE leads
  SET
    source = COALESCE(p_source, source),
    utm_source = COALESCE(p_utm_source, utm_source),
    utm_medium = COALESCE(p_utm_medium, utm_medium),
    utm_campaign = COALESCE(p_utm_campaign, utm_campaign),
    utm_term = COALESCE(p_utm_term, utm_term),
    utm_content = COALESCE(p_utm_content, utm_content),
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
      'utm_campaign', v_new_record.utm_campaign,
      'utm_term', v_new_record.utm_term,
      'utm_content', v_new_record.utm_content
    )
  );
END;
$$;

-- =============================================================================
-- 3) SET PERMISSIONS (service_role ONLY)
-- =============================================================================

-- Revoke all from public first
REVOKE ALL ON FUNCTION public.funnels_update_lead_fields(uuid, text, text, text, text, text, text) FROM PUBLIC;

-- Grant only to service_role (backend/edge functions only)
GRANT EXECUTE ON FUNCTION public.funnels_update_lead_fields(uuid, text, text, text, text, text, text) TO service_role;