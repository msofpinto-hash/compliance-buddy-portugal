-- Create storage bucket for requirement documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('requirement-documents', 'requirement-documents', false);

-- RLS policies for requirement documents bucket
-- Admins can do everything
CREATE POLICY "Admins can manage all requirement documents"
ON storage.objects
FOR ALL
USING (bucket_id = 'requirement-documents' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'requirement-documents' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Clients can view documents from their organizations
CREATE POLICY "Clients can view their organization documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'requirement-documents' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.organization_id::text = (storage.foldername(name))[1]
  )
);

-- Clients can upload documents to their organizations
CREATE POLICY "Clients can upload to their organization"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'requirement-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.organization_id::text = (storage.foldername(name))[1]
  )
);

-- Clients can delete their own uploaded documents
CREATE POLICY "Clients can delete their organization documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'requirement-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.organization_id::text = (storage.foldername(name))[1]
  )
);

-- Add file_url column to applicabilities table to link documents to requirements
ALTER TABLE public.applicabilities 
ADD COLUMN IF NOT EXISTS evidence_files text[] DEFAULT '{}';

-- Allow clients to update their own applicabilities (for adding evidence)
CREATE POLICY "Clients can update their applicabilities"
ON public.applicabilities
FOR UPDATE
USING (public.user_belongs_to_org(auth.uid(), organization_id))
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));