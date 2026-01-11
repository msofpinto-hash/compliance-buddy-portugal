-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view evidence templates" ON public.evidence_templates;

-- Create restricted policy: users can only view templates assigned to their organization
CREATE POLICY "Users can view assigned templates"
ON public.evidence_templates
FOR SELECT
USING (
  -- Admins can see all templates
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Clients can only see templates assigned to their organization via evidence requests
  EXISTS (
    SELECT 1 FROM public.organization_evidence_requests oer
    WHERE oer.template_id = evidence_templates.id
    AND user_belongs_to_org(auth.uid(), oer.organization_id)
  )
);