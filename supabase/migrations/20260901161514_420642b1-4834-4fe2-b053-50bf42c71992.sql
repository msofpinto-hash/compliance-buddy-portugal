CREATE POLICY "Clients can update their organization documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'requirement-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id::text = (storage.foldername(objects.name))[1]
  )
)
WITH CHECK (
  bucket_id = 'requirement-documents'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id::text = (storage.foldername(objects.name))[1]
  )
);

DROP POLICY IF EXISTS "Authenticated users can view category theme links" ON public.category_theme_links;
CREATE POLICY "Authenticated users can view category theme links"
ON public.category_theme_links
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON public.category_theme_links FROM anon;