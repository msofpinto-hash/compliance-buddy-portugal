-- Create table to link audit requirements with documents
CREATE TABLE public.audit_requirement_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_requirement_id uuid NOT NULL REFERENCES public.audit_requirements(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(audit_requirement_id, document_id)
);

-- Enable RLS
ALTER TABLE public.audit_requirement_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage audit requirement documents"
ON public.audit_requirement_documents
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients can view their audit requirement documents"
ON public.audit_requirement_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM audit_requirements ar
    JOIN audits a ON a.id = ar.audit_id
    WHERE ar.id = audit_requirement_documents.audit_requirement_id
    AND user_belongs_to_org(auth.uid(), a.organization_id)
  )
);