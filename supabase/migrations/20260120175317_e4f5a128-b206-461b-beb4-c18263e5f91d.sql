-- Add columns for contract documents
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS proposal_url TEXT,
ADD COLUMN IF NOT EXISTS purchase_order_url TEXT;

-- Create storage bucket for contract documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-documents', 'contract-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for contract-documents bucket (admin only)
CREATE POLICY "Admins can view contract documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'contract-documents' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can upload contract documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'contract-documents' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update contract documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'contract-documents' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete contract documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'contract-documents' 
  AND public.has_role(auth.uid(), 'admin')
);