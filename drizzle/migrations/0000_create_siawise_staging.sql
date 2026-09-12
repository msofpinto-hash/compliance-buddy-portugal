CREATE TABLE public.siawise_requirements_staging (
  id BIGSERIAL PRIMARY KEY,
  legislation_id UUID NOT NULL,
  article TEXT,
  requirement_text TEXT NOT NULL,
  display_order INTEGER,
  notes TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.siawise_requirements_staging TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.siawise_requirements_staging_id_seq TO authenticated;
GRANT ALL ON public.siawise_requirements_staging TO service_role;
GRANT ALL ON SEQUENCE public.siawise_requirements_staging_id_seq TO service_role;

ALTER TABLE public.siawise_requirements_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage siawise staging"
ON public.siawise_requirements_staging
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));