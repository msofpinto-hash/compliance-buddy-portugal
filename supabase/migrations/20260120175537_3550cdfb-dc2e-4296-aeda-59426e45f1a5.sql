-- Create table for contract document versions
CREATE TABLE public.contract_document_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('proposal', 'purchase_order')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  version_number INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_contract_doc_versions_org_type ON public.contract_document_versions(organization_id, document_type);

-- Enable RLS
ALTER TABLE public.contract_document_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies (admin only)
CREATE POLICY "Admins can view contract document versions"
ON public.contract_document_versions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert contract document versions"
ON public.contract_document_versions FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete contract document versions"
ON public.contract_document_versions FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));