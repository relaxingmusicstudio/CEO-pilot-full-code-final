-- Batch 2.1 Extra Production Protection (Fixes)
-- File: supabase/migrations/20251218094500_batch_2_1_prod_protection_fixes.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- A1/A2) RPC param-name wrapper enforcement (idempotent)
-- ============================================================
DO $do$
DECLARE
  v_argnames text[];
  v_oid oid;
  v_has_fn boolean;
  v_has_v1 boolean;
BEGIN
  -- --------------------
  -- normalize_email
  -- --------------------
  v_has_fn := to_regprocedure('public.normalize_email(text)') IS NOT NULL;

  IF v_has_fn THEN
    SELECT p.oid, p.proargnames
    INTO v_oid, v_argnames
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'normalize_email'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
    LIMIT 1;

    IF v_oid IS NOT NULL AND (v_argnames IS NULL OR v_argnames[1] IS DISTINCT FROM 'raw_email') THEN
      v_has_v1 := to_regprocedure('public.normalize_email_v1(text)') IS NOT NULL;
      IF NOT v_has_v1 THEN
        EXECUTE 'ALTER FUNCTION public.normalize_email(text) RENAME TO normalize_email_v1';
      END IF;

      EXECUTE $sql$
        CREATE OR REPLACE FUNCTION public.normalize_email(raw_email text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        SET search_path TO public
        AS $fn$
          SELECT public.normalize_email_v1(raw_email)
        $fn$;
      $sql$;
    END IF;
  ELSE
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.normalize_email(raw_email text)
      RETURNS text
      LANGUAGE plpgsql
      IMMUTABLE
      SET search_path TO public
      AS $fn$
      BEGIN
        IF raw_email IS NULL THEN
          RETURN NULL;
        END IF;
        RETURN lower(trim(raw_email));
      END;
      $fn$;
    $sql$;
  END IF;

  -- --------------------
  -- normalize_phone
  -- --------------------
  v_has_fn := to_regprocedure('public.normalize_phone(text)') IS NOT NULL;

  IF v_has_fn THEN
    SELECT p.oid, p.proargnames
    INTO v_oid, v_argnames
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'normalize_phone'
      AND pg_get_function_identity_arguments(p.oid) = 'text'
    LIMIT 1;

    IF v_oid IS NOT NULL AND (v_argnames IS NULL OR v_argnames[1] IS DISTINCT FROM 'raw_phone') THEN
      v_has_v1 := to_regprocedure('public.normalize_phone_v1(text)') IS NOT NULL;
      IF NOT v_has_v1 THEN
        EXECUTE 'ALTER FUNCTION public.normalize_phone(text) RENAME TO normalize_phone_v1';
      END IF;

      EXECUTE $sql$
        CREATE OR REPLACE FUNCTION public.normalize_phone(raw_phone text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        SET search_path TO public
        AS $fn$
          SELECT public.normalize_phone_v1(raw_phone)
        $fn$;
      $sql$;
    END IF;
  ELSE
    -- A2 spec exact
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.normalize_phone(raw_phone text)
      RETURNS text
      LANGUAGE plpgsql
      IMMUTABLE
      SET search_path TO public
      AS $fn$
      DECLARE
        digits text;
        len int;
      BEGIN
        IF raw_phone IS NULL THEN
          RETURN NULL;
        END IF;

        digits := regexp_replace(raw_phone, '[^0-9]', '', 'g');
        len := length(digits);

        IF len = 11 AND left(digits, 1) = '1' THEN
          RETURN right(digits, 10);
        END IF;

        IF len > 10 THEN
          RETURN right(digits, 10);
        END IF;

        RETURN digits;
      END;
      $fn$;
    $sql$;
  END IF;
END;
$do$;

-- ============================================================
-- A4) compute_lead_fingerprint (idempotent)
-- ============================================================
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
  v_email := COALESCE(public.normalize_email(p_email), '');
  v_phone := COALESCE(public.normalize_phone(p_phone), '');
  v_company := COALESCE(lower(trim(p_company_name)), '');
  v_raw := v_email || '|' || v_phone || '|' || v_company;
  RETURN LEFT(encode(digest(v_raw, 'sha256'), 'hex'), 32);
END;
$$;

-- ============================================================
-- A5) Unique partial index
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS lead_profiles_one_primary_per_fingerprint
ON public.lead_profiles (tenant_id, fingerprint)
WHERE is_primary = true;

-- ============================================================
-- A3) Future-proof role helper (text overload)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role
  );
$$;

-- ============================================================
-- A6) lead_profiles RLS policy fixes (admin policy: no optional helper)
-- ============================================================
ALTER TABLE public.lead_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_profiles_service_role_all ON public.lead_profiles;
CREATE POLICY lead_profiles_service_role_all
ON public.lead_profiles
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS lead_profiles_admin_all ON public.lead_profiles;
CREATE POLICY lead_profiles_admin_all
ON public.lead_profiles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'platform_admin'::text))
WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::text));

-- ============================================================
-- A7) request_nonces (idempotent)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.request_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  nonce text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_nonces_nonce_unique UNIQUE (nonce)
);

ALTER TABLE public.request_nonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS request_nonces_service_role_all ON public.request_nonces;
CREATE POLICY request_nonces_service_role_all
ON public.request_nonces
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS request_nonces_created_at_idx
ON public.request_nonces (created_at);

-- ============================================================
-- A8) Audit trigger safety (silent failure, guaranteed columns only)
-- ============================================================
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
      clock_timestamp(),
      'lead_profile_trigger',
      v_action_type,
      'lead_profile',
      NEW.id::text,
      v_action_type || ': ' || COALESCE(NEW.fingerprint, 'no-fp'),
      jsonb_build_object(
        'fp', left(COALESCE(NEW.fingerprint, ''), 6),
        'seg', NEW.segment,
        'pri', NEW.is_primary
      ),
      true
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_lead_profile_changes ON public.lead_profiles;
CREATE TRIGGER trg_audit_lead_profile_changes
AFTER INSERT OR UPDATE ON public.lead_profiles
FOR EACH ROW
EXECUTE FUNCTION public.audit_lead_profile_changes();

-- ============================================================
-- A4) Reduce attack surface: revoke anon execute
-- ============================================================
DO $do$
BEGIN
  IF to_regprocedure('public.normalize_email(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.normalize_email(text) FROM anon';
  END IF;
  IF to_regprocedure('public.normalize_phone(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.normalize_phone(text) FROM anon';
  END IF;
  IF to_regprocedure('public.compute_lead_fingerprint(text, text, text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.compute_lead_fingerprint(text, text, text) FROM anon';
  END IF;
END;
$do$;

GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_lead_fingerprint(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
