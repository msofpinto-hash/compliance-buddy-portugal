-- Fix RLS policy for rate_limits - restrict to service role only
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limits;

-- Only service role (Edge Functions) can manage rate limits
CREATE POLICY "Service role can manage rate limits"
ON public.rate_limits
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role');