-- Add fields for plan approval and adaptation requests
ALTER TABLE public.audits
ADD COLUMN IF NOT EXISTS plan_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS plan_approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS plan_feedback TEXT;

-- Add RLS policy for clients to update plan approval fields
CREATE POLICY "Clients can approve audit plans"
ON public.audits
FOR UPDATE
USING (
  status = 'planned' 
  AND organization_id IN (SELECT public.get_user_organizations(auth.uid()))
)
WITH CHECK (
  status = 'planned'
  AND organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);