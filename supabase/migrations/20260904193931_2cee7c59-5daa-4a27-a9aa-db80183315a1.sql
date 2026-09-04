CREATE TABLE public.standards_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reference_period text NOT NULL,
  period_date date,
  document_type text,
  document_ref text,
  document_name text,
  publication_date text,
  modification_date text,
  issuer text,
  impact_iso_14001 boolean NOT NULL DEFAULT false,
  impact_iso_45001 boolean NOT NULL DEFAULT false,
  applicability_informative boolean NOT NULL DEFAULT false,
  applicability_direct boolean NOT NULL DEFAULT false,
  applicability_indirect boolean NOT NULL DEFAULT false,
  descriptive text,
  actions text,
  responsible text,
  implementation_deadline text,
  implementation_status text,
  display_order integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.standards_control TO authenticated;
GRANT ALL ON public.standards_control TO service_role;

ALTER TABLE public.standards_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage standards control"
ON public.standards_control FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org members view standards control"
ON public.standards_control FOR SELECT TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE INDEX idx_standards_control_org_period ON public.standards_control (organization_id, reference_period);

CREATE TRIGGER trg_standards_control_updated_at
BEFORE UPDATE ON public.standards_control
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();