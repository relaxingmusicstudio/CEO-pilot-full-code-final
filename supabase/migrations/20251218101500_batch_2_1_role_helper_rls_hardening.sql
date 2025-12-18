-- Batch 2.1 Role Helper RLS Hardening
-- Purpose: prevent future RLS recursion when has_role() queries user_roles under RLS.
-- row_security=off ensures SECURITY DEFINER role checks remain stable even if RLS changes later.


CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role
  );
$$;


REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
