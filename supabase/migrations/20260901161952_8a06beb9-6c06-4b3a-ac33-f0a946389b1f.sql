ALTER TABLE public.external_source_status
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

ALTER TABLE public.external_source_status
  DROP CONSTRAINT IF EXISTS external_source_status_approval_status_check;
ALTER TABLE public.external_source_status
  ADD CONSTRAINT external_source_status_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

UPDATE public.external_source_status
SET approval_status = 'approved'
WHERE is_official = true AND approval_status = 'pending';

CREATE TABLE IF NOT EXISTS public.source_approval_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.external_source_status(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('approved','rejected','reset')),
  reason text,
  performed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.source_approval_history TO authenticated;
GRANT ALL ON public.source_approval_history TO service_role;

ALTER TABLE public.source_approval_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view source approval history"
ON public.source_approval_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert source approval history"
ON public.source_approval_history FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND performed_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_source_approval_history_source
  ON public.source_approval_history (source_id, created_at DESC);