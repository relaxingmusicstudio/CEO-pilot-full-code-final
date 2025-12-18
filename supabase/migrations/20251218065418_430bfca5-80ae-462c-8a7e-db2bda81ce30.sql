-- Fix permissions for lead normalization RPCs
-- Grant execute permissions to all relevant roles

-- Grant to authenticated users
GRANT EXECUTE ON FUNCTION public.normalize_lead_atomic(uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_lead_atomic(uuid, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_lead_atomic(uuid, text, text, text, text, text, text, text) TO anon;

-- Grant compute_lead_fingerprint
GRANT EXECUTE ON FUNCTION public.compute_lead_fingerprint(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_lead_fingerprint(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_lead_fingerprint(text, text, text) TO anon;

-- Grant normalize_email  
GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO anon;

-- Grant normalize_phone
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO anon;

-- Grant check_and_increment_rate_limit
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) TO anon;

-- Also ensure the tables used by these functions have proper permissions
GRANT SELECT, INSERT, UPDATE ON public.lead_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lead_profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_normalize_rate_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_normalize_rate_limits TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.leads TO service_role;