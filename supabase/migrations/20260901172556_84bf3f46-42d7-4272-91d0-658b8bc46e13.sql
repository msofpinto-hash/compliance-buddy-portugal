CREATE OR REPLACE FUNCTION public.verify_internal_token(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = internal, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal.service_tokens
    WHERE name = 'cron' AND token = _token
  )
$$;

REVOKE ALL ON FUNCTION public.verify_internal_token(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_token(text) TO service_role;