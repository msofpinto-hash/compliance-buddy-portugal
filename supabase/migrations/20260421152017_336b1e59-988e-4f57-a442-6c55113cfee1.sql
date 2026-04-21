-- Add file tracking columns to legislation
ALTER TABLE public.legislation
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS uploaded_file_url text,
  ADD COLUMN IF NOT EXISTS uploaded_file_name text;

CREATE INDEX IF NOT EXISTS idx_legislation_file_hash ON public.legislation(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legislation_number_lower ON public.legislation(lower(number));

-- Storage bucket for uploaded legislation files (admin-only, private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('legislation-uploads', 'legislation-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies: only admins can read/write
DROP POLICY IF EXISTS "Admins can read legislation uploads" ON storage.objects;
CREATE POLICY "Admins can read legislation uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'legislation-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can upload legislation files" ON storage.objects;
CREATE POLICY "Admins can upload legislation files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'legislation-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update legislation uploads" ON storage.objects;
CREATE POLICY "Admins can update legislation uploads"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'legislation-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete legislation uploads" ON storage.objects;
CREATE POLICY "Admins can delete legislation uploads"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'legislation-uploads' AND public.has_role(auth.uid(), 'admin'::public.app_role));