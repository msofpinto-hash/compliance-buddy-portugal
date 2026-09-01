CREATE OR REPLACE FUNCTION public.propagate_legislation_applicability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.applicability_type IS NULL
     OR NEW.applicability_type NOT IN ('informativo', 'nao_aplicavel') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.applicability_type IS NOT DISTINCT FROM OLD.applicability_type THEN
    RETURN NEW;
  END IF;

  -- Atualiza avaliações existentes
  UPDATE public.applicabilities a
  SET applicability_type = NEW.applicability_type,
      is_applicable = (NEW.applicability_type <> 'nao_aplicavel'),
      compliance_status = CASE
        WHEN NEW.applicability_type = 'nao_aplicavel' THEN 'nao_aplicavel'
        ELSE a.compliance_status
      END,
      updated_at = now()
  FROM public.legal_requirements r
  WHERE r.id = a.requirement_id
    AND r.legislation_id = NEW.legislation_id
    AND a.organization_id = NEW.organization_id;

  -- Cria avaliações em falta
  INSERT INTO public.applicabilities (organization_id, requirement_id, is_applicable, applicability_type, compliance_status)
  SELECT NEW.organization_id, r.id,
         (NEW.applicability_type <> 'nao_aplicavel'),
         NEW.applicability_type,
         CASE WHEN NEW.applicability_type = 'nao_aplicavel' THEN 'nao_aplicavel' ELSE NULL END
  FROM public.legal_requirements r
  WHERE r.legislation_id = NEW.legislation_id
    AND NOT EXISTS (
      SELECT 1 FROM public.applicabilities a
      WHERE a.requirement_id = r.id AND a.organization_id = NEW.organization_id
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS propagate_legislation_applicability_trg ON public.organization_legislation;
CREATE TRIGGER propagate_legislation_applicability_trg
AFTER INSERT OR UPDATE OF applicability_type ON public.organization_legislation
FOR EACH ROW EXECUTE FUNCTION public.propagate_legislation_applicability();