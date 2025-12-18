-- Batch 2.2: Atomic Lead Normalize RPC
-- Purpose: Eliminate race conditions by moving dedupe + lead/profile creation into one transaction

CREATE OR REPLACE FUNCTION public.normalize_lead_atomic(
  p_tenant_id uuid,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_job_title text DEFAULT NULL,
  p_source text DEFAULT 'lead-normalize'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_fingerprint text;
  v_norm_email text;
  v_norm_phone text;
  v_segment text;
  v_lead_id uuid;
  v_profile_id uuid;
  v_status text;
  v_lead_name text;
  v_existing_profile record;
  v_existing_enrichment jsonb;
  v_existing_sources text[];
  v_merged_sources text[];
  v_new_enrichment jsonb;
BEGIN
  -- Normalize inputs
  v_norm_email := public.normalize_email(p_email);
  v_norm_phone := public.normalize_phone(p_phone);
  
  -- Compute fingerprint
  v_fingerprint := public.compute_lead_fingerprint(p_email, p_phone, p_company_name);
  
  -- Determine segment
  IF p_company_name IS NOT NULL OR p_job_title IS NOT NULL THEN
    v_segment := 'b2b';
  ELSIF v_norm_email IS NOT NULL 
    AND v_norm_email NOT LIKE '%@gmail.%' 
    AND v_norm_email NOT LIKE '%@yahoo.%' 
    AND v_norm_email NOT LIKE '%@hotmail.%' THEN
    v_segment := 'b2b';
  ELSIF v_norm_email IS NOT NULL OR v_norm_phone IS NOT NULL THEN
    v_segment := 'b2c';
  ELSE
    v_segment := 'unknown';
  END IF;

  -- Lock and check for existing primary profile
  SELECT id, lead_id, enrichment_data, company_name, job_title, segment
  INTO v_existing_profile
  FROM public.lead_profiles
  WHERE tenant_id = p_tenant_id
    AND fingerprint = v_fingerprint
    AND is_primary = true
  FOR UPDATE;

  IF FOUND THEN
    -- DEDUP PATH: Update existing profile
    v_status := 'deduped';
    v_profile_id := v_existing_profile.id;
    v_lead_id := v_existing_profile.lead_id;

    v_existing_enrichment := COALESCE(v_existing_profile.enrichment_data, '{}'::jsonb);
    
    -- Extract existing sources safely
    IF jsonb_typeof(v_existing_enrichment->'sources') = 'array' THEN
      SELECT array_agg(elem::text) INTO v_existing_sources
      FROM jsonb_array_elements_text(v_existing_enrichment->'sources') AS elem;
    ELSE
      v_existing_sources := ARRAY[]::text[];
    END IF;
    
    -- Merge sources (dedupe)
    IF p_source IS NOT NULL AND NOT (p_source = ANY(COALESCE(v_existing_sources, ARRAY[]::text[]))) THEN
      v_merged_sources := array_append(COALESCE(v_existing_sources, ARRAY[]::text[]), p_source);
    ELSE
      v_merged_sources := COALESCE(v_existing_sources, ARRAY[]::text[]);
    END IF;

    v_new_enrichment := v_existing_enrichment || jsonb_build_object(
      'last_seen_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'sources', to_jsonb(v_merged_sources)
    );

    UPDATE public.lead_profiles
    SET 
      enrichment_data = v_new_enrichment,
      company_name = COALESCE(lead_profiles.company_name, p_company_name),
      job_title = COALESCE(lead_profiles.job_title, p_job_title),
      segment = CASE 
        WHEN lead_profiles.segment = 'unknown' AND v_segment != 'unknown' THEN v_segment::lead_segment
        ELSE lead_profiles.segment 
      END,
      updated_at = now()
    WHERE id = v_profile_id;

  ELSE
    -- CREATE PATH: Insert new lead + profile atomically
    v_status := 'created';
    
    v_lead_name := NULLIF(TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')), '');
    IF v_lead_name IS NULL OR v_lead_name = '' THEN
      v_lead_name := 'Unknown';
    END IF;

    -- Insert lead
    INSERT INTO public.leads (
      tenant_id, name, email, phone, business_name, source, status, lead_temperature, metadata
    ) VALUES (
      p_tenant_id, v_lead_name, v_norm_email, v_norm_phone, p_company_name, 
      COALESCE(p_source, 'lead-normalize'), 'new', 'cold',
      jsonb_build_object('normalized_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    )
    RETURNING id INTO v_lead_id;

    -- Insert profile with ON CONFLICT for race safety
    INSERT INTO public.lead_profiles (
      lead_id, tenant_id, fingerprint, segment, temperature, company_name, job_title, is_primary, enrichment_data
    ) VALUES (
      v_lead_id, p_tenant_id, v_fingerprint, v_segment::lead_segment, 'ice_cold'::lead_temperature,
      p_company_name, p_job_title, true,
      jsonb_build_object(
        'sources', CASE WHEN p_source IS NOT NULL THEN jsonb_build_array(p_source) ELSE '[]'::jsonb END,
        'created_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
    ON CONFLICT (tenant_id, fingerprint) WHERE is_primary = true
    DO UPDATE SET
      enrichment_data = lead_profiles.enrichment_data || jsonb_build_object(
        'last_seen_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ),
      updated_at = now()
    RETURNING id, 
      CASE WHEN xmax = 0 THEN 'created' ELSE 'deduped' END
    INTO v_profile_id, v_status;

    -- If we hit the conflict path, we created an orphan lead - clean it up
    IF v_status = 'deduped' THEN
      -- Get the actual lead_id from the existing profile
      SELECT lead_id INTO v_lead_id FROM public.lead_profiles WHERE id = v_profile_id;
      
      -- Delete the orphan lead we just created (it's not linked to anything)
      DELETE FROM public.leads 
      WHERE id NOT IN (SELECT DISTINCT lead_id FROM public.lead_profiles WHERE lead_id IS NOT NULL)
        AND tenant_id = p_tenant_id
        AND created_at > now() - interval '5 seconds';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'lead_id', v_lead_id,
    'lead_profile_id', v_profile_id,
    'fingerprint', v_fingerprint,
    'segment', v_segment,
    'normalized', jsonb_build_object('email', v_norm_email, 'phone', v_norm_phone)
  );

EXCEPTION WHEN OTHERS THEN
  -- Return error without leaking PII
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'normalize_failed',
    'error_code', SQLSTATE,
    'fingerprint', LEFT(COALESCE(v_fingerprint, ''), 6)
  );
END;
$$;

-- Revoke from PUBLIC, grant only to service_role and authenticated
REVOKE EXECUTE ON FUNCTION public.normalize_lead_atomic(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_lead_atomic(uuid, text, text, text, text, text, text, text) TO service_role, authenticated;