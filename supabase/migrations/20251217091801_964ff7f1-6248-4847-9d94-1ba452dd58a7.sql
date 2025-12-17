-- =============================================
-- PHASE 2E: LEAD OWNERSHIP ENFORCEMENT (HARD BLOCK)
-- System Contract v1.1.1
-- =============================================

-- Drop existing trigger and functions completely
DROP TRIGGER IF EXISTS enforce_lead_ownership ON public.leads;
DROP FUNCTION IF EXISTS public.check_lead_update_allowed();

-- Drop ALL overloaded versions of the RPCs
DROP FUNCTION IF EXISTS public.cold_update_lead_fields(uuid, text, integer, timestamptz);
DROP FUNCTION IF EXISTS public.cold_update_lead_fields(uuid, text, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS public.cold_update_lead_fields(uuid, text, integer, timestamptz, text, text, boolean);
DROP FUNCTION IF EXISTS public.sales_update_lead_fields(uuid, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.convert_lead(uuid, timestamptz, text, numeric);
DROP FUNCTION IF EXISTS public.funnels_update_lead(uuid, text, text, text, text, text, text);

-- =============================================
-- COMPREHENSIVE LEAD OWNERSHIP TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.check_lead_update_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rpc_cold boolean;
  v_rpc_sales boolean;
  v_rpc_funnels boolean;
  v_rpc_conversion boolean;
  
  v_cold_status text[] := ARRAY['cold', 'warm', 'contacted', 'nurturing'];
  v_sales_status text[] := ARRAY['qualified', 'disqualified', 'opportunity', 'negotiating', 'closed_won', 'closed_lost'];
BEGIN
  -- Read RPC context flags
  v_rpc_cold := current_setting('app.rpc_cold_agent', true) = 'true';
  v_rpc_sales := current_setting('app.rpc_sales_agent', true) = 'true';
  v_rpc_funnels := current_setting('app.rpc_funnels', true) = 'true';
  v_rpc_conversion := current_setting('app.rpc_conversion', true) = 'true';
  
  -- Legacy backward compat: general RPC context allows all
  IF current_setting('app.rpc_context', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  -- RULE A: Funnel fields (source, utm_*) - only funnels module
  IF NOT v_rpc_funnels THEN
    IF OLD.source IS DISTINCT FROM NEW.source THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "source" can only be set by Funnels module.';
    END IF;
    IF OLD.utm_source IS DISTINCT FROM NEW.utm_source THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "utm_source" can only be set by Funnels module.';
    END IF;
    IF OLD.utm_medium IS DISTINCT FROM NEW.utm_medium THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "utm_medium" can only be set by Funnels module.';
    END IF;
    IF OLD.utm_campaign IS DISTINCT FROM NEW.utm_campaign THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "utm_campaign" can only be set by Funnels module.';
    END IF;
    IF OLD.utm_term IS DISTINCT FROM NEW.utm_term THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "utm_term" can only be set by Funnels module.';
    END IF;
    IF OLD.utm_content IS DISTINCT FROM NEW.utm_content THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "utm_content" can only be set by Funnels module.';
    END IF;
  END IF;
  
  -- RULE B: Cold Agent fields
  IF NOT v_rpc_cold THEN
    IF OLD.lead_score IS DISTINCT FROM NEW.lead_score THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "lead_score" requires cold_update_lead_fields RPC.';
    END IF;
    IF OLD.last_call_date IS DISTINCT FROM NEW.last_call_date THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "last_call_date" requires cold_update_lead_fields RPC.';
    END IF;
    IF OLD.total_call_attempts IS DISTINCT FROM NEW.total_call_attempts THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "total_call_attempts" requires cold_update_lead_fields RPC.';
    END IF;
    IF OLD.last_call_outcome IS DISTINCT FROM NEW.last_call_outcome THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "last_call_outcome" requires cold_update_lead_fields RPC.';
    END IF;
    IF OLD.last_call_notes IS DISTINCT FROM NEW.last_call_notes THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "last_call_notes" requires cold_update_lead_fields RPC.';
    END IF;
    
    -- Cold status changes
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = ANY(v_cold_status) THEN
      RAISE EXCEPTION '[OWNERSHIP] Status "%" requires cold_update_lead_fields RPC.', NEW.status;
    END IF;
  END IF;
  
  -- RULE C: Sales Agent fields
  IF NOT v_rpc_sales AND NOT v_rpc_conversion THEN
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "assigned_to" requires sales_update_lead_fields RPC.';
    END IF;
    
    IF (OLD.custom_fields->>'qualification_data') IS DISTINCT FROM (NEW.custom_fields->>'qualification_data') THEN
      RAISE EXCEPTION '[OWNERSHIP] Field "custom_fields.qualification_data" requires sales_update_lead_fields RPC.';
    END IF;
    
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = ANY(v_sales_status) THEN
      RAISE EXCEPTION '[OWNERSHIP] Status "%" requires sales_update_lead_fields RPC.', NEW.status;
    END IF;
  END IF;
  
  -- RULE D: Conversion status
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'converted' THEN
    IF NOT v_rpc_conversion AND NOT v_rpc_sales THEN
      RAISE EXCEPTION '[OWNERSHIP] Status "converted" requires convert_lead RPC.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_lead_ownership
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lead_update_allowed();

-- =============================================
-- RPC: cold_update_lead_fields
-- =============================================
CREATE FUNCTION public.cold_update_lead_fields(
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
  v_allowed_statuses text[] := ARRAY['cold', 'warm', 'contacted', 'nurturing', 'new'];
  v_current_attempts int;
BEGIN
  PERFORM set_config('app.rpc_cold_agent', 'true', true);
  
  IF p_status IS NOT NULL AND NOT (p_status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cold Agent can only set status to: cold, warm, contacted, nurturing, new');
  END IF;
  
  IF p_increment_call_attempts THEN
    SELECT COALESCE(total_call_attempts, 0) INTO v_current_attempts FROM leads WHERE id = p_lead_id;
  END IF;
  
  UPDATE leads SET
    status = COALESCE(p_status, status),
    lead_score = COALESCE(p_engagement_score, lead_score),
    last_call_date = COALESCE(p_last_contacted, last_call_date),
    last_call_outcome = COALESCE(p_last_call_outcome, last_call_outcome),
    last_call_notes = COALESCE(p_last_call_notes, last_call_notes),
    total_call_attempts = CASE WHEN p_increment_call_attempts THEN COALESCE(v_current_attempts, 0) + 1 ELSE total_call_attempts END,
    updated_at = now()
  WHERE id = p_lead_id;
  
  INSERT INTO action_history (action_table, action_id, action_type, target_type, target_id, actor_type, actor_module, new_state)
  VALUES ('leads', gen_random_uuid(), 'cold_update', 'lead', p_lead_id::text, 'module', 'cold_agent', 
    jsonb_build_object('status', p_status, 'engagement_score', p_engagement_score, 'last_call_outcome', p_last_call_outcome));
  
  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

-- =============================================
-- RPC: sales_update_lead_fields
-- =============================================
CREATE FUNCTION public.sales_update_lead_fields(
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
  v_allowed_statuses text[] := ARRAY['qualified', 'disqualified', 'opportunity', 'negotiating', 'closed_won', 'closed_lost', 'converted'];
BEGIN
  PERFORM set_config('app.rpc_sales_agent', 'true', true);
  
  IF p_status IS NOT NULL AND NOT (p_status = ANY(v_allowed_statuses)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sales Agent can only set status to: qualified, disqualified, opportunity, negotiating, closed_won, closed_lost, converted');
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
  
  INSERT INTO action_history (action_table, action_id, action_type, target_type, target_id, actor_type, actor_module, new_state)
  VALUES ('leads', gen_random_uuid(), 'sales_update', 'lead', p_lead_id::text, 'module', 'sales_agent',
    jsonb_build_object('status', p_status, 'assigned_to', p_assigned_to));
  
  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

-- =============================================
-- RPC: convert_lead
-- =============================================
CREATE FUNCTION public.convert_lead(
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
BEGIN
  PERFORM set_config('app.rpc_conversion', 'true', true);
  
  UPDATE leads SET
    status = 'converted',
    converted_at = p_converted_at,
    notes = COALESCE(p_notes, notes),
    revenue_value = COALESCE(p_revenue_value, revenue_value),
    updated_at = now()
  WHERE id = p_lead_id;
  
  INSERT INTO action_history (action_table, action_id, action_type, target_type, target_id, actor_type, actor_module, new_state)
  VALUES ('leads', gen_random_uuid(), 'lead_converted', 'lead', p_lead_id::text, 'module', 'conversion_flow',
    jsonb_build_object('converted_at', p_converted_at, 'revenue_value', p_revenue_value));
  
  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.cold_update_lead_fields(uuid, text, integer, timestamptz, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sales_update_lead_fields(uuid, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_lead(uuid, timestamptz, text, numeric) TO authenticated, service_role;