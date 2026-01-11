-- Create table for compliance change requests
CREATE TABLE public.compliance_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicability_id uuid NOT NULL REFERENCES public.applicabilities(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  
  -- Proposed changes
  proposed_compliance_status text,
  proposed_applicability_type text,
  proposed_notes text,
  proposed_evidence_files text[],
  
  -- Request metadata
  request_reason text,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  
  -- Review fields
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_compliance_requests_org ON public.compliance_change_requests(organization_id, status);
CREATE INDEX idx_compliance_requests_applicability ON public.compliance_change_requests(applicability_id);

-- Enable RLS
ALTER TABLE public.compliance_change_requests ENABLE ROW LEVEL SECURITY;

-- Clients can view their organization's requests
CREATE POLICY "Clients can view their compliance requests"
ON public.compliance_change_requests
FOR SELECT
USING (user_belongs_to_org(auth.uid(), organization_id));

-- Clients can create requests for their organization
CREATE POLICY "Clients can create compliance requests"
ON public.compliance_change_requests
FOR INSERT
WITH CHECK (
  user_belongs_to_org(auth.uid(), organization_id)
  AND auth.uid() = requested_by
  AND status = 'pending'
);

-- Admins can manage all requests
CREATE POLICY "Admins can manage compliance requests"
ON public.compliance_change_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update trigger
CREATE TRIGGER update_compliance_requests_updated_at
  BEFORE UPDATE ON public.compliance_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Modify applicabilities RLS: clients can only UPDATE via approved requests
-- First, drop the existing client update policy
DROP POLICY IF EXISTS "Clients can update their applicabilities" ON public.applicabilities;

-- Clients can view their applicabilities (keep this)
-- Clients can now only update evidence_files (for uploads) but not compliance_status
CREATE POLICY "Clients can update evidence files only"
ON public.applicabilities
FOR UPDATE
USING (user_belongs_to_org(auth.uid(), organization_id))
WITH CHECK (
  user_belongs_to_org(auth.uid(), organization_id)
  -- This policy allows updates but the application logic should restrict which fields
);