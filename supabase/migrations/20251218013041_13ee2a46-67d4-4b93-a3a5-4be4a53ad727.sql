-- Batch 2.1 Extra Production Protection
-- Migration: Fingerprint hardening, dedupe constraints, RLS, audit safety

-- 1) Ensure pgcrypto extension exists
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Create helper function is_platform_admin for RLS (if not exists)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'platform_admin'
  );
$$;

-- 3) Normalize functions with EXACT parameter names for RPC compatibility

-- Rename existing if they have different param names (idempotent approach)
CREATE OR REPLACE FUNCTION public.normalize_email(raw_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF raw_email IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN lower(trim(raw_email));
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(raw_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF raw_phone IS NULL THEN
    RETURN NULL;
  END IF;
  -- Remove all non-digit characters
  RETURN regexp_replace(raw_phone, '[^0-9]', '', 'g');
END;
$$;

-- 4) compute_lead_fingerprint with pgcrypto digest and NULL guards
CREATE OR REPLACE FUNCTION public.compute_lead_fingerprint(
  p_email text,
  p_phone text,
  p_company_name text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_phone text;
  v_company text;
  v_raw text;
BEGIN
  -- Normalize inputs with NULL guards
  v_email := COALESCE(public.normalize_email(p_email), '');
  v_phone := COALESCE(public.normalize_phone(p_phone), '');
  v_company := COALESCE(lower(trim(p_company_name)), '');
  
  -- Concatenate with pipe delimiter
  v_raw := v_email || '|' || v_phone || '|' || v_company;
  
  -- Return first 32 chars of SHA256 hex using pgcrypto
  RETURN LEFT(encode(digest(v_raw, 'sha256'), 'hex'), 32);
END;
$$;

-- 5) Unique partial index to enforce one primary profile per tenant+fingerprint
DROP INDEX IF EXISTS public.lead_profiles_one_primary_per_fingerprint;
CREATE UNIQUE INDEX IF NOT EXISTS lead_profiles_one_primary_per_fingerprint
ON public.lead_profiles (tenant_id, fingerprint)
WHERE is_primary = true;

-- 6) Drop existing RLS policies for lead_profiles and recreate with strict tenant isolation
DO $$
BEGIN
  -- Drop existing policies (safe even if they don't exist)
  DROP POLICY IF EXISTS "lead_profiles_tenant_select" ON public.lead_profiles;
  DROP POLICY IF EXISTS "lead_profiles_tenant_insert" ON public.lead_profiles;
  DROP POLICY IF EXISTS "lead_profiles_tenant_update" ON public.lead_profiles;
  DROP POLICY IF EXISTS "lead_profiles_admin_all" ON public.lead_profiles;
  DROP POLICY IF EXISTS "lead_profiles_service_role_all" ON public.lead_profiles;
  DROP POLICY IF EXISTS "Users can view their tenant's lead profiles" ON public.lead_profiles;
  DROP POLICY IF EXISTS "Users can create lead profiles for their tenant" ON public.lead_profiles;
  DROP POLICY IF EXISTS "Users can update their tenant's lead profiles" ON public.lead_profiles;
  DROP POLICY IF EXISTS "Platform admins can manage all lead profiles" ON public.lead_profiles;
END $$;

-- Enable RLS if not already
ALTER TABLE public.lead_profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users: strict tenant isolation
CREATE POLICY "lead_profiles_tenant_select"
ON public.lead_profiles
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "lead_profiles_tenant_insert"
ON public.lead_profiles
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "lead_profiles_tenant_update"
ON public.lead_profiles
FOR UPDATE
TO authenticated
USING (tenant_id = public.get_user_tenant_id())
WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Platform admins can access all tenants (uses our new helper function)
CREATE POLICY "lead_profiles_admin_all"
ON public.lead_profiles
FOR ALL
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- Service role: explicit full access (future-proof)
CREATE POLICY "lead_profiles_service_role_all"
ON public.lead_profiles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7) Permissions: least privilege for authenticated, full for service_role
REVOKE ALL ON public.lead_profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lead_profiles TO authenticated;
GRANT ALL ON public.lead_profiles TO service_role;

-- 8) Create request_nonces table for replay protection (if not exists)
CREATE TABLE IF NOT EXISTS public.request_nonces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id text NOT NULL,
  nonce text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(nonce)
);

-- Enable RLS on nonces table
ALTER TABLE public.request_nonces ENABLE ROW LEVEL SECURITY;

-- Service role only for nonces (edge function internal use)
CREATE POLICY "request_nonces_service_role_all"
ON public.request_nonces
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_request_nonces_created_at ON public.request_nonces(created_at);

-- 9) Audit trigger with SECURITY DEFINER and safe array handling
CREATE OR REPLACE FUNCTION public.audit_lead_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_type text;
  v_old_merged_count int;
  v_new_merged_count int;
BEGIN
  -- Safe array length calculation with COALESCE
  v_old_merged_count := COALESCE(array_length(OLD.merged_from, 1), 0);
  v_new_merged_count := COALESCE(array_length(NEW.merged_from, 1), 0);

  IF TG_OP = 'INSERT' THEN
    v_action_type := 'lead_profile_created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF v_new_merged_count > v_old_merged_count THEN
      v_action_type := 'lead_profile_merged';
    ELSE
      v_action_type := 'lead_profile_updated';
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  -- Insert only guaranteed columns (omit optional columns for safety)
  BEGIN
    INSERT INTO public.platform_audit_log (
      tenant_id,
      timestamp,
      agent_name,
      action_type,
      entity_type,
      entity_id,
      description,
      request_snapshot,
      success
    ) VALUES (
      NEW.tenant_id,
      now(),
      'lead_profile_trigger',
      v_action_type,
      'lead_profile',
      NEW.id,
      v_action_type || ': ' || COALESCE(NEW.fingerprint, 'no-fingerprint'),
      jsonb_build_object(
        'fingerprint', NEW.fingerprint,
        'segment', NEW.segment,
        'is_primary', NEW.is_primary,
        'trigger_op', TG_OP
      ),
      true
    );
  EXCEPTION WHEN OTHERS THEN
    -- Non-blocking: log warning but don't fail the transaction
    RAISE WARNING 'Audit log insert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Drop and recreate trigger to ensure latest function is used
DROP TRIGGER IF EXISTS audit_lead_profile_changes ON public.lead_profiles;
CREATE TRIGGER audit_lead_profile_changes
AFTER INSERT OR UPDATE ON public.lead_profiles
FOR EACH ROW
EXECUTE FUNCTION public.audit_lead_profile_changes();

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_lead_fingerprint(text, text, text) TO authenticated, service_role;