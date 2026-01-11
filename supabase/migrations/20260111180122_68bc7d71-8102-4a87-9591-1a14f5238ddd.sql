-- Fix overly permissive RLS policies for service role operations

-- 1. Fix sync_logs policies - restrict to service role only
DROP POLICY IF EXISTS "Allow service role insert to sync_logs" ON public.sync_logs;
DROP POLICY IF EXISTS "Allow service role update to sync_logs" ON public.sync_logs;

-- These policies use auth.jwt() to check for service_role
-- Service role requests bypass RLS by default, but if RLS is enforced,
-- these policies ensure only service role can perform these operations
CREATE POLICY "Service role can insert sync_logs"
ON public.sync_logs
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Service role can update sync_logs"
ON public.sync_logs
FOR UPDATE
USING (
  auth.jwt() ->> 'role' = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Fix legislation_relations_processed policies
DROP POLICY IF EXISTS "Service role can manage processed status" ON public.legislation_relations_processed;

CREATE POLICY "Service role can insert processed status"
ON public.legislation_relations_processed
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Service role can update processed status"
ON public.legislation_relations_processed
FOR UPDATE
USING (
  auth.jwt() ->> 'role' = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Service role can delete processed status"
ON public.legislation_relations_processed
FOR DELETE
USING (
  auth.jwt() ->> 'role' = 'service_role'
  OR has_role(auth.uid(), 'admin'::app_role)
);