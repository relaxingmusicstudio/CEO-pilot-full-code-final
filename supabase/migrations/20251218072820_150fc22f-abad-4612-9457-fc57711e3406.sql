-- ============================================
-- QA ESCAPE HATCH RPCs
-- Diagnostic and seeding functions for debugging
-- ============================================

-- 1) qa_dependency_check: Returns comprehensive diagnostic info
CREATE OR REPLACE FUNCTION public.qa_dependency_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_types jsonb := '{}';
  v_functions jsonb := '{}';
  v_permissions jsonb := '{}';
  v_tables jsonb := '{}';
  v_suspects jsonb := '[]';
BEGIN
  -- Check types/enums
  v_types := jsonb_build_object(
    'lead_temperature_type', to_regtype('public.lead_temperature_type') IS NOT NULL,
    'lead_temperature', to_regtype('public.lead_temperature') IS NOT NULL,
    'lead_segment', to_regtype('public.lead_segment') IS NOT NULL,
    'lead_status', to_regtype('public.lead_status') IS NOT NULL,
    'tenant_plan', to_regtype('public.tenant_plan') IS NOT NULL,
    'app_role', to_regtype('public.app_role') IS NOT NULL
  );
  
  -- Check functions exist with correct signature
  v_functions := jsonb_build_object(
    'normalize_lead_atomic', to_regprocedure('public.normalize_lead_atomic(uuid, text, text, text, text, text, text, text)') IS NOT NULL,
    'compute_lead_fingerprint', to_regprocedure('public.compute_lead_fingerprint(text, text, text)') IS NOT NULL,
    'normalize_email', to_regprocedure('public.normalize_email(text)') IS NOT NULL,
    'normalize_phone', to_regprocedure('public.normalize_phone(text)') IS NOT NULL,
    'check_and_increment_rate_limit', to_regprocedure('public.check_and_increment_rate_limit(text, integer, integer)') IS NOT NULL
  );
  
  -- Check EXECUTE permissions for authenticated role
  v_permissions := jsonb_build_object(
    'normalize_lead_atomic', has_function_privilege('authenticated', 'public.normalize_lead_atomic(uuid, text, text, text, text, text, text, text)', 'EXECUTE'),
    'compute_lead_fingerprint', has_function_privilege('authenticated', 'public.compute_lead_fingerprint(text, text, text)', 'EXECUTE'),
    'normalize_email', has_function_privilege('authenticated', 'public.normalize_email(text)', 'EXECUTE'),
    'normalize_phone', has_function_privilege('authenticated', 'public.normalize_phone(text)', 'EXECUTE'),
    'check_and_increment_rate_limit', has_function_privilege('authenticated', 'public.check_and_increment_rate_limit(text, integer, integer)', 'EXECUTE')
  );
  
  -- Check tables exist
  v_tables := jsonb_build_object(
    'lead_profiles', to_regclass('public.lead_profiles') IS NOT NULL,
    'leads', to_regclass('public.leads') IS NOT NULL,
    'lead_normalize_rate_limits', to_regclass('public.lead_normalize_rate_limits') IS NOT NULL,
    'platform_audit_log', to_regclass('public.platform_audit_log') IS NOT NULL,
    'tenants', to_regclass('public.tenants') IS NOT NULL,
    'ceo_alerts', to_regclass('public.ceo_alerts') IS NOT NULL
  );
  
  -- Build suspects array for missing objects
  IF NOT (v_types->>'lead_temperature_type')::boolean THEN
    v_suspects := v_suspects || jsonb_build_array(jsonb_build_object(
      'object', 'lead_temperature_type',
      'type', 'enum',
      'fix_sql', 'CREATE TYPE public.lead_temperature_type AS ENUM (''ice_cold'', ''cold'', ''cool'', ''warm'', ''hot'');'
    ));
  END IF;
  
  IF NOT (v_types->>'lead_segment')::boolean THEN
    v_suspects := v_suspects || jsonb_build_array(jsonb_build_object(
      'object', 'lead_segment',
      'type', 'enum',
      'fix_sql', 'CREATE TYPE public.lead_segment AS ENUM (''b2b'', ''b2c'', ''unknown'');'
    ));
  END IF;
  
  IF NOT (v_functions->>'normalize_lead_atomic')::boolean THEN
    v_suspects := v_suspects || jsonb_build_array(jsonb_build_object(
      'object', 'normalize_lead_atomic',
      'type', 'function',
      'fix_sql', 'Function missing or signature mismatch - check migration files'
    ));
  END IF;
  
  IF NOT (v_permissions->>'normalize_lead_atomic')::boolean THEN
    v_suspects := v_suspects || jsonb_build_array(jsonb_build_object(
      'object', 'normalize_lead_atomic EXECUTE grant',
      'type', 'permission',
      'fix_sql', 'GRANT EXECUTE ON FUNCTION public.normalize_lead_atomic(uuid, text, text, text, text, text, text, text) TO authenticated;'
    ));
  END IF;
  
  IF NOT (v_permissions->>'check_and_increment_rate_limit')::boolean THEN
    v_suspects := v_suspects || jsonb_build_array(jsonb_build_object(
      'object', 'check_and_increment_rate_limit EXECUTE grant',
      'type', 'permission',
      'fix_sql', 'GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) TO authenticated;'
    ));
  END IF;
  
  IF NOT (v_tables->>'lead_normalize_rate_limits')::boolean THEN
    v_suspects := v_suspects || jsonb_build_array(jsonb_build_object(
      'object', 'lead_normalize_rate_limits',
      'type', 'table',
      'fix_sql', 'CREATE TABLE public.lead_normalize_rate_limits (rate_key text PRIMARY KEY, request_count integer DEFAULT 0, window_start timestamptz DEFAULT now());'
    ));
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_suspects) = 0,
    'checked_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'types', v_types,
    'functions', v_functions,
    'permissions', v_permissions,
    'tables', v_tables,
    'suspects', v_suspects,
    'suspect_count', jsonb_array_length(v_suspects)
  );
END;
$function$;

-- 2) qa_seed_ceo_alerts: Seed ceo_alerts if empty
CREATE OR REPLACE FUNCTION public.qa_seed_ceo_alerts(p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alert_id uuid;
  v_has_tenant_id_col boolean;
  v_row_count integer;
BEGIN
  -- Check if ceo_alerts has a direct tenant_id column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ceo_alerts' AND column_name = 'tenant_id'
  ) INTO v_has_tenant_id_col;
  
  -- Count existing rows
  SELECT COUNT(*) INTO v_row_count FROM ceo_alerts;
  
  IF v_row_count > 0 THEN
    -- Return existing alert (latest for tenant if discriminator exists)
    IF v_has_tenant_id_col THEN
      SELECT id INTO v_alert_id FROM ceo_alerts 
      WHERE tenant_id = p_tenant_id 
      ORDER BY created_at DESC LIMIT 1;
    END IF;
    
    -- Fallback to any alert
    IF v_alert_id IS NULL THEN
      SELECT id INTO v_alert_id FROM ceo_alerts 
      ORDER BY created_at DESC LIMIT 1;
    END IF;
    
    RETURN v_alert_id;
  END IF;
  
  -- Insert new alert
  v_alert_id := gen_random_uuid();
  
  IF v_has_tenant_id_col THEN
    INSERT INTO ceo_alerts (id, tenant_id, alert_type, severity, title, message, metadata, created_at)
    VALUES (
      v_alert_id,
      p_tenant_id,
      'system',
      'info',
      'QA Seed Alert',
      'This alert was seeded by qa_seed_ceo_alerts for testing purposes.',
      jsonb_build_object('qa_seed', true, 'seeded_at', now()),
      now()
    );
  ELSE
    -- Use metadata for tenant_id if no direct column
    INSERT INTO ceo_alerts (id, alert_type, severity, title, message, metadata, created_at)
    VALUES (
      v_alert_id,
      'system',
      'info',
      'QA Seed Alert',
      'This alert was seeded by qa_seed_ceo_alerts for testing purposes.',
      jsonb_build_object('tenant_id', p_tenant_id, 'qa_seed', true, 'seeded_at', now()),
      now()
    );
  END IF;
  
  RETURN v_alert_id;
END;
$function$;

-- 3) qa_seed_minimal_lead_data: Seed minimal lead + profile for testing
CREATE OR REPLACE FUNCTION public.qa_seed_minimal_lead_data(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_profile_id uuid;
  v_fingerprint text;
  v_test_email text;
BEGIN
  -- Generate unique test email
  v_test_email := 'qa_seed_' || substr(gen_random_uuid()::text, 1, 8) || '@qatest.local';
  
  -- Compute fingerprint
  v_fingerprint := compute_lead_fingerprint(v_test_email, NULL, 'QA Test Company');
  
  -- Check if lead_profile with this fingerprint already exists
  SELECT id INTO v_profile_id FROM lead_profiles 
  WHERE tenant_id = p_tenant_id AND fingerprint = v_fingerprint;
  
  IF v_profile_id IS NOT NULL THEN
    -- Get associated lead
    SELECT lead_id INTO v_lead_id FROM lead_profiles WHERE id = v_profile_id;
    
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'existing',
      'lead_id', v_lead_id,
      'lead_profile_id', v_profile_id,
      'fingerprint', v_fingerprint,
      'email', v_test_email
    );
  END IF;
  
  -- Create new lead
  INSERT INTO leads (
    tenant_id, name, email, business_name, source, status, lead_temperature, metadata
  ) VALUES (
    p_tenant_id,
    'QA Test Lead',
    v_test_email,
    'QA Test Company',
    'qa_seed',
    'new',
    'cold',
    jsonb_build_object('qa_seed', true, 'seeded_at', now())
  )
  RETURNING id INTO v_lead_id;
  
  -- Create lead_profile
  INSERT INTO lead_profiles (
    lead_id, tenant_id, fingerprint, segment, temperature, company_name, is_primary, enrichment_data
  ) VALUES (
    v_lead_id,
    p_tenant_id,
    v_fingerprint,
    'b2b',
    'ice_cold',
    'QA Test Company',
    true,
    jsonb_build_object('qa_seed', true, 'seeded_at', now())
  )
  RETURNING id INTO v_profile_id;
  
  RETURN jsonb_build_object(
    'ok', true,
    'status', 'created',
    'lead_id', v_lead_id,
    'lead_profile_id', v_profile_id,
    'fingerprint', v_fingerprint,
    'email', v_test_email
  );
END;
$function$;

-- Grant EXECUTE to authenticated role
GRANT EXECUTE ON FUNCTION public.qa_dependency_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_dependency_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.qa_seed_ceo_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_seed_ceo_alerts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.qa_seed_minimal_lead_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_seed_minimal_lead_data(uuid) TO service_role;