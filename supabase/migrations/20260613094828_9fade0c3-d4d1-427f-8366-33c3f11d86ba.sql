
-- 1. login_attempts: drop public INSERT policy (frontend uses SECURITY DEFINER RPC record_login_attempt)
DROP POLICY IF EXISTS "Allow anonymous insert login attempts" ON public.login_attempts;

-- 2. evidence_template_legislation: restrict SELECT to authenticated role
DROP POLICY IF EXISTS "Authenticated users can view template legislation links" ON public.evidence_template_legislation;
CREATE POLICY "Authenticated users can view template legislation links"
  ON public.evidence_template_legislation
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. profiles: restrict "Admins can view all profiles" to authenticated role
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. user_roles: add restrictive policy to prevent privilege escalation by non-admins
-- (only admins / service_role can INSERT/UPDATE/DELETE)
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Revoke EXECUTE from anon on admin-only SECURITY DEFINER analytics/RPC functions
REVOKE EXECUTE ON FUNCTION public.count_pending_requirements(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_pending_relations() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_short_summaries() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_generic_titles() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_short_summary_ids(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_generic_title_ids(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_legislation_without_categories_ids(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_legislation_without_categories_count() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_legislation_without_requirements(text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_legislation_with_requirements_count() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_unchecked_dre_urls(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_processable_legislation_ids(text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_source_status(text, text, text, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_processing_failure(uuid, text, text, text, text, boolean, timestamp with time zone) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_source_available(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM anon, authenticated, PUBLIC;
