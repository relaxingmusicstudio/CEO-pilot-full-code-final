-- Fix qa_seed_ceo_alerts to match actual schema (priority, not severity)
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
    -- Return existing alert (latest)
    SELECT id INTO v_alert_id FROM ceo_alerts ORDER BY created_at DESC LIMIT 1;
    RETURN v_alert_id;
  END IF;
  
  -- Insert new alert (using actual schema: priority instead of severity)
  v_alert_id := gen_random_uuid();
  
  IF v_has_tenant_id_col THEN
    INSERT INTO ceo_alerts (id, tenant_id, alert_type, priority, title, message, source, metadata, created_at)
    VALUES (
      v_alert_id,
      p_tenant_id,
      'system',
      'low',
      'QA Seed Alert',
      'This alert was seeded by qa_seed_ceo_alerts for testing purposes.',
      'qa_seed',
      jsonb_build_object('qa_seed', true, 'seeded_at', now()),
      now()
    );
  ELSE
    -- Use metadata for tenant_id if no direct column
    INSERT INTO ceo_alerts (id, alert_type, priority, title, message, source, metadata, created_at)
    VALUES (
      v_alert_id,
      'system',
      'low',
      'QA Seed Alert',
      'This alert was seeded by qa_seed_ceo_alerts for testing purposes.',
      'qa_seed',
      jsonb_build_object('tenant_id', p_tenant_id, 'qa_seed', true, 'seeded_at', now()),
      now()
    );
  END IF;
  
  RETURN v_alert_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.qa_seed_ceo_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_seed_ceo_alerts(uuid) TO service_role;