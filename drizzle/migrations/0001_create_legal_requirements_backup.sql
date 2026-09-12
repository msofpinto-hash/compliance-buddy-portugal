CREATE TABLE IF NOT EXISTS public.legal_requirements_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid,
  legislation_id uuid NOT NULL,
  article text,
  requirement_text text NOT NULL,
  notes text,
  display_order integer,
  backup_reason text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.legal_requirements_backup TO authenticated;
GRANT ALL ON public.legal_requirements_backup TO service_role;

ALTER TABLE public.legal_requirements_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view requirement backups"
ON public.legal_requirements_backup FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert requirement backups"
ON public.legal_requirements_backup FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));