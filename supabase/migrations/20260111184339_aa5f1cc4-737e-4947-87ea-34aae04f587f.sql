-- Fix organization-logos storage bucket policies
-- Drop overly permissive policies that allow any authenticated user to manage logos
DROP POLICY IF EXISTS "Authenticated users can upload organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete organization logos" ON storage.objects;

-- Create admin-only policies for logo management
CREATE POLICY "Admins can upload organization logos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'organization-logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update organization logos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'organization-logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete organization logos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'organization-logos' 
  AND has_role(auth.uid(), 'admin'::app_role)
);