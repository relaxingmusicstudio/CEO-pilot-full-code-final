-- Add only missing RLS policies for integration tables
-- Some already exist from the initial migration

-- credential_usage_log policies
DROP POLICY IF EXISTS "Authenticated users can view credential_usage_log" ON public.credential_usage_log;
CREATE POLICY "Authenticated users can view credential_usage_log"
ON public.credential_usage_log FOR SELECT
USING (auth.role() = 'authenticated');

-- service_registry policies  
DROP POLICY IF EXISTS "Anyone can view service_registry" ON public.service_registry;
CREATE POLICY "Anyone can view service_registry"
ON public.service_registry FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage service_registry" ON public.service_registry;
CREATE POLICY "Admins can manage service_registry"
ON public.service_registry FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- service_relationships policies
DROP POLICY IF EXISTS "Anyone can view service_relationships" ON public.service_relationships;
CREATE POLICY "Anyone can view service_relationships"
ON public.service_relationships FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage service_relationships" ON public.service_relationships;
CREATE POLICY "Admins can manage service_relationships"
ON public.service_relationships FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- integration_templates policies
DROP POLICY IF EXISTS "Anyone can view integration_templates" ON public.integration_templates;
CREATE POLICY "Anyone can view integration_templates"
ON public.integration_templates FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage integration_templates" ON public.integration_templates;
CREATE POLICY "Admins can manage integration_templates"
ON public.integration_templates FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- integration_permission_violations policies
DROP POLICY IF EXISTS "Admins can view integration_permission_violations" ON public.integration_permission_violations;
CREATE POLICY "Admins can view integration_permission_violations"
ON public.integration_permission_violations FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));