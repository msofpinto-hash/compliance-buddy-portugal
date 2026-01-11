-- Create evidence templates catalog table
CREATE TABLE public.evidence_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  area_ambiente BOOLEAN DEFAULT false,
  area_qualidade BOOLEAN DEFAULT false,
  area_seguranca BOOLEAN DEFAULT false,
  area_seguranca_alimentar BOOLEAN DEFAULT false,
  area_energia BOOLEAN DEFAULT false,
  area_florestas BOOLEAN DEFAULT false,
  area_saude BOOLEAN DEFAULT false,
  area_conciliacao BOOLEAN DEFAULT false,
  area_sustentabilidade BOOLEAN DEFAULT false,
  legislation_references TEXT, -- Raw text of legislation references for display
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create mapping table for linking templates to legislation
CREATE TABLE public.evidence_template_legislation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.evidence_templates(id) ON DELETE CASCADE,
  legislation_id UUID NOT NULL REFERENCES public.legislation(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, legislation_id)
);

-- Create organization evidence requests (assigned templates)
CREATE TABLE public.organization_evidence_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.evidence_templates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, submitted, approved, rejected
  due_date DATE,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, template_id)
);

-- Create documents linked to evidence requests
CREATE TABLE public.evidence_request_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.organization_evidence_requests(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id),
  UNIQUE(request_id, document_id)
);

-- Enable RLS on all tables
ALTER TABLE public.evidence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_template_legislation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_evidence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_request_documents ENABLE ROW LEVEL SECURITY;

-- RLS for evidence_templates (read-only for authenticated users, manage for admins)
CREATE POLICY "Authenticated users can view evidence templates"
ON public.evidence_templates FOR SELECT
USING (true);

CREATE POLICY "Admins can manage evidence templates"
ON public.evidence_templates FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS for evidence_template_legislation
CREATE POLICY "Authenticated users can view template legislation links"
ON public.evidence_template_legislation FOR SELECT
USING (true);

CREATE POLICY "Admins can manage template legislation links"
ON public.evidence_template_legislation FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS for organization_evidence_requests
CREATE POLICY "Admins can manage organization evidence requests"
ON public.organization_evidence_requests FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their evidence requests"
ON public.organization_evidence_requests FOR SELECT
USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Clients can update their evidence requests"
ON public.organization_evidence_requests FOR UPDATE
USING (user_belongs_to_org(auth.uid(), organization_id))
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

-- RLS for evidence_request_documents
CREATE POLICY "Admins can manage evidence request documents"
ON public.evidence_request_documents FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Clients can view their evidence request documents"
ON public.evidence_request_documents FOR SELECT
USING (EXISTS (
  SELECT 1 FROM organization_evidence_requests oer
  WHERE oer.id = evidence_request_documents.request_id
  AND user_belongs_to_org(auth.uid(), oer.organization_id)
));

CREATE POLICY "Clients can manage their evidence request documents"
ON public.evidence_request_documents FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM organization_evidence_requests oer
  WHERE oer.id = evidence_request_documents.request_id
  AND user_belongs_to_org(auth.uid(), oer.organization_id)
));

CREATE POLICY "Clients can delete their evidence request documents"
ON public.evidence_request_documents FOR DELETE
USING (EXISTS (
  SELECT 1 FROM organization_evidence_requests oer
  WHERE oer.id = evidence_request_documents.request_id
  AND user_belongs_to_org(auth.uid(), oer.organization_id)
));

-- Triggers for updated_at
CREATE TRIGGER update_evidence_templates_updated_at
BEFORE UPDATE ON public.evidence_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_organization_evidence_requests_updated_at
BEFORE UPDATE ON public.organization_evidence_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();