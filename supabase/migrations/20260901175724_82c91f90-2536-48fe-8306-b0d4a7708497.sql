CREATE TABLE public.audit_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_id, document_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_documents TO authenticated;
GRANT ALL ON public.audit_documents TO service_role;

ALTER TABLE public.audit_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit documents"
ON public.audit_documents FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Org members view audit documents"
ON public.audit_documents FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.audits a
  WHERE a.id = audit_documents.audit_id
    AND public.user_belongs_to_org(auth.uid(), a.organization_id)
));

CREATE INDEX idx_audit_documents_audit ON public.audit_documents(audit_id);