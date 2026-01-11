-- Drop existing user policies for alerts
DROP POLICY IF EXISTS "Users can view own alerts" ON public.alerts;
DROP POLICY IF EXISTS "Users can update own alerts" ON public.alerts;

-- Create new policies with organization isolation
-- Users can view alerts that are either:
-- 1. Directly assigned to them (user_id = auth.uid())
-- 2. Assigned to their organization (organization_id matches their org)
CREATE POLICY "Users can view their alerts"
ON public.alerts
FOR SELECT
USING (
  auth.uid() = user_id 
  OR (organization_id IS NOT NULL AND user_belongs_to_org(auth.uid(), organization_id))
);

-- Users can only update alerts assigned directly to them
CREATE POLICY "Users can update their alerts"
ON public.alerts
FOR UPDATE
USING (
  auth.uid() = user_id 
  OR (organization_id IS NOT NULL AND user_belongs_to_org(auth.uid(), organization_id))
);