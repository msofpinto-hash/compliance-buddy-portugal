CREATE TABLE public.standards_control_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standard_id uuid,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  document_ref text,
  document_name text,
  changed_by uuid,
  changed_by_name text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.standards_control_history TO authenticated;
GRANT ALL ON public.standards_control_history TO service_role;
ALTER TABLE public.standards_control_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view standards history"
ON public.standards_control_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "System can insert standards history"
ON public.standards_control_history FOR INSERT TO authenticated
WITH CHECK (true);

CREATE INDEX idx_standards_history_standard ON public.standards_control_history(standard_id);
CREATE INDEX idx_standards_history_org ON public.standards_control_history(organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_standards_control_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '[]'::jsonb;
  v_name text;
  v_key text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  SELECT COALESCE(p.full_name, p.email) INTO v_name FROM public.profiles p WHERE p.id = auth.uid();

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key NOT IN ('updated_at','created_at','id','organization_id','created_by')
         AND (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
        v_changes := v_changes || jsonb_build_object(
          'field', v_key,
          'old', v_old -> v_key,
          'new', v_new -> v_key
        );
      END IF;
    END LOOP;

    IF jsonb_array_length(v_changes) = 0 THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.standards_control_history (standard_id, organization_id, action, document_ref, document_name, changed_by, changed_by_name, changes)
    VALUES (NEW.id, NEW.organization_id, 'update', NEW.document_ref, NEW.document_name, auth.uid(), v_name, v_changes);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.standards_control_history (standard_id, organization_id, action, document_ref, document_name, changed_by, changed_by_name, changes)
    VALUES (NEW.id, NEW.organization_id, 'insert', NEW.document_ref, NEW.document_name, auth.uid(), v_name, '[]'::jsonb);
    RETURN NEW;
  ELSE
    INSERT INTO public.standards_control_history (standard_id, organization_id, action, document_ref, document_name, changed_by, changed_by_name, changes)
    VALUES (NULL, OLD.organization_id, 'delete', OLD.document_ref, OLD.document_name, auth.uid(), v_name, '[]'::jsonb);
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_standards_control_history
AFTER INSERT OR UPDATE OR DELETE ON public.standards_control
FOR EACH ROW EXECUTE FUNCTION public.log_standards_control_change();

CREATE TABLE public.standards_control_audits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standard_id uuid NOT NULL REFERENCES public.standards_control(id) ON DELETE CASCADE,
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  link_source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (standard_id, audit_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.standards_control_audits TO authenticated;
GRANT ALL ON public.standards_control_audits TO service_role;
ALTER TABLE public.standards_control_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view standards audit links"
ON public.standards_control_audits FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.standards_control s
    WHERE s.id = standard_id AND public.user_belongs_to_org(auth.uid(), s.organization_id)
  )
);

CREATE POLICY "Admins manage standards audit links"
ON public.standards_control_audits FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_standards_audits_standard ON public.standards_control_audits(standard_id);
CREATE INDEX idx_standards_audits_audit ON public.standards_control_audits(audit_id);