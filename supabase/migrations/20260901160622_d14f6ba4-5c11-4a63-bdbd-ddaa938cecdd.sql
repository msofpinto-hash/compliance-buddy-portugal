-- 1) external_source_status: remove public read
DROP POLICY IF EXISTS "Anyone can read source status" ON public.external_source_status;
CREATE POLICY "Admins can read source status" ON public.external_source_status
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE SELECT ON public.external_source_status FROM anon;

-- 2) Remove anonymous read access on legislation/taxonomy tables
DROP POLICY IF EXISTS "Allow anonymous read access to legislation" ON public.legislation;
DROP POLICY IF EXISTS "Allow anonymous read access to mappings" ON public.legislation_category_mapping;
DROP POLICY IF EXISTS "Allow anonymous read access to relations" ON public.legislation_relations;
DROP POLICY IF EXISTS "Allow anonymous read access to themes" ON public.themes;
DROP POLICY IF EXISTS "Allow anonymous read access to categories" ON public.theme_categories;

DROP POLICY IF EXISTS "Authenticated users can view relations" ON public.legislation_relations;
CREATE POLICY "Authenticated users can view relations" ON public.legislation_relations
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.legislation, public.legislation_category_mapping, public.legislation_relations, public.themes, public.theme_categories FROM anon;
GRANT SELECT ON public.legislation, public.legislation_category_mapping, public.legislation_relations, public.themes, public.theme_categories TO authenticated;

-- 3) audits: restrict client plan approval to own org + only approval columns
DROP POLICY IF EXISTS "Clients can approve audit plans" ON public.audits;
CREATE POLICY "Clients can approve audit plans" ON public.audits
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id) AND status = 'planned'::audit_status)
  WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE OR REPLACE FUNCTION public.enforce_client_audit_update_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admin (client) users may only change approval-related columns
  NEW.organization_id   := OLD.organization_id;
  NEW.title             := OLD.title;
  NEW.description       := OLD.description;
  NEW.auditor           := OLD.auditor;
  NEW.audit_date        := OLD.audit_date;
  NEW.findings          := OLD.findings;
  NEW.recommendations   := OLD.recommendations;
  NEW.created_by        := OLD.created_by;
  NEW.created_at        := OLD.created_at;
  NEW.interlocutors     := OLD.interlocutors;
  NEW.methodology       := OLD.methodology;
  NEW.strengths         := OLD.strengths;
  NEW.weaknesses        := OLD.weaknesses;
  NEW.executive_summary := OLD.executive_summary;
  NEW.scope             := OLD.scope;
  NEW.objectives        := OLD.objectives;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_client_audit_update_scope_trg ON public.audits;
CREATE TRIGGER enforce_client_audit_update_scope_trg
BEFORE UPDATE ON public.audits
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_audit_update_scope();