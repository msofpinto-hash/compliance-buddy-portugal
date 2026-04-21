CREATE TABLE IF NOT EXISTS public.url_validation_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL,
  legislation_id uuid NOT NULL,
  number text,
  title text,
  document_url text NOT NULL,
  status text NOT NULL,
  status_code integer,
  error_message text,
  cleared boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_url_validation_results_job ON public.url_validation_results (job_id, status);
CREATE INDEX IF NOT EXISTS idx_url_validation_results_checked_at ON public.url_validation_results (checked_at DESC);

ALTER TABLE public.url_validation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage url validation results"
  ON public.url_validation_results
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.url_validation_results;
ALTER TABLE public.url_validation_results REPLICA IDENTITY FULL;