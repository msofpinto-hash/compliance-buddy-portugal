REVOKE ALL ON FUNCTION public.enforce_client_applicability_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.propagate_legislation_applicability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_client_applicability_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.propagate_legislation_applicability() TO service_role;