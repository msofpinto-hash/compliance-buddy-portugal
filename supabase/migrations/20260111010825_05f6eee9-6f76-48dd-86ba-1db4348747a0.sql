-- Create audit status enum
DO $$ BEGIN
  CREATE TYPE public.audit_status AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create audits table
CREATE TABLE public.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  auditor TEXT,
  audit_date DATE,
  status audit_status NOT NULL DEFAULT 'planned',
  findings TEXT,
  recommendations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Create audit_requirements table (links audits to requirements)
CREATE TABLE public.audit_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.legal_requirements(id) ON DELETE CASCADE,
  legislation_id UUID NOT NULL REFERENCES public.legislation(id) ON DELETE CASCADE,
  applicability_type TEXT NOT NULL, -- snapshot of applicability when added
  compliance_status TEXT DEFAULT 'pending', -- pending, compliant, non_compliant, partial
  evidence TEXT,
  findings TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(audit_id, requirement_id)
);

-- Enable RLS
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_requirements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for audits
CREATE POLICY "Admins can manage audits"
ON public.audits FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their audits"
ON public.audits FOR SELECT
USING (public.user_belongs_to_org(auth.uid(), organization_id));

-- RLS Policies for audit_requirements
CREATE POLICY "Admins can manage audit requirements"
ON public.audit_requirements FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their audit requirements"
ON public.audit_requirements FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.audits a
    WHERE a.id = audit_requirements.audit_id
    AND public.user_belongs_to_org(auth.uid(), a.organization_id)
  )
);

-- Create updated_at triggers
CREATE TRIGGER update_audits_updated_at
  BEFORE UPDATE ON public.audits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_audit_requirements_updated_at
  BEFORE UPDATE ON public.audit_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();