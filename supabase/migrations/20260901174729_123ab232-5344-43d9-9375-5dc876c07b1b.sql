ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS audit_type text NOT NULL DEFAULT 'anual';

ALTER TABLE public.audits
  ADD CONSTRAINT audits_audit_type_check CHECK (audit_type IN ('anual','mensal'));

CREATE OR REPLACE FUNCTION public.auto_action_plan_from_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_title text;
  v_leg text;
BEGIN
  IF NEW.compliance_status IS NOT DISTINCT FROM 'nao_conforme' THEN
    SELECT a.organization_id INTO v_org FROM public.audits a WHERE a.id = NEW.audit_id;
    IF v_org IS NULL THEN RETURN NEW; END IF;

    IF EXISTS (SELECT 1 FROM public.action_plans p WHERE p.audit_requirement_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(l.number, l.title) INTO v_leg FROM public.legislation l WHERE l.id = NEW.legislation_id;
    SELECT left(COALESCE(r.article || ' - ', '') || r.requirement_text, 200)
      INTO v_title FROM public.legal_requirements r WHERE r.id = NEW.requirement_id;

    INSERT INTO public.action_plans (organization_id, requirement_id, audit_requirement_id, title, description, status, priority)
    VALUES (
      v_org,
      NEW.requirement_id,
      NEW.id,
      COALESCE('Não conformidade: ' || v_title, 'Não conformidade detetada em auditoria'),
      COALESCE('Diploma: ' || v_leg || E'\n', '') || COALESCE('Constatação: ' || NEW.findings, ''),
      'pendente',
      'alta'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.compliance_status = 'nao_conforme' THEN
    UPDATE public.action_plans
    SET status = 'cancelado', updated_at = now()
    WHERE audit_requirement_id = NEW.id AND status = 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_action_plan_from_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.propagate_legislation_applicability() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auto_action_plan_from_audit_trg ON public.audit_requirements;
CREATE TRIGGER auto_action_plan_from_audit_trg
AFTER INSERT OR UPDATE OF compliance_status ON public.audit_requirements
FOR EACH ROW EXECUTE FUNCTION public.auto_action_plan_from_audit();