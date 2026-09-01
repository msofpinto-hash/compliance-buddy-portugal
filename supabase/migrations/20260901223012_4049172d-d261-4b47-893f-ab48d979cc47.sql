
-- 1) Herdar classificação quando novos requisitos são criados
CREATE OR REPLACE FUNCTION public.inherit_legislation_applicability_on_requirement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.applicabilities (organization_id, requirement_id, is_applicable, applicability_type, compliance_status)
  SELECT ol.organization_id,
         NEW.id,
         (ol.applicability_type <> 'nao_aplicavel'),
         ol.applicability_type,
         CASE WHEN ol.applicability_type = 'nao_aplicavel' THEN 'nao_aplicavel' ELSE NULL END
  FROM public.organization_legislation ol
  WHERE ol.legislation_id = NEW.legislation_id
    AND ol.applicability_type IN ('informativo', 'nao_aplicavel')
    AND NOT EXISTS (
      SELECT 1 FROM public.applicabilities a
      WHERE a.requirement_id = NEW.id AND a.organization_id = ol.organization_id
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_applicability_on_requirement_trg ON public.legal_requirements;
CREATE TRIGGER inherit_applicability_on_requirement_trg
AFTER INSERT ON public.legal_requirements
FOR EACH ROW EXECUTE FUNCTION public.inherit_legislation_applicability_on_requirement();

-- 2) Backfill: atualizar avaliações existentes
UPDATE public.applicabilities a
SET applicability_type = ol.applicability_type,
    is_applicable = (ol.applicability_type <> 'nao_aplicavel'),
    compliance_status = CASE WHEN ol.applicability_type = 'nao_aplicavel' THEN 'nao_aplicavel' ELSE a.compliance_status END,
    updated_at = now()
FROM public.legal_requirements r
JOIN public.organization_legislation ol ON ol.legislation_id = r.legislation_id
WHERE r.id = a.requirement_id
  AND ol.organization_id = a.organization_id
  AND ol.applicability_type IN ('informativo', 'nao_aplicavel')
  AND a.applicability_type IS DISTINCT FROM ol.applicability_type;

-- 3) Backfill: criar avaliações em falta
INSERT INTO public.applicabilities (organization_id, requirement_id, is_applicable, applicability_type, compliance_status)
SELECT ol.organization_id, r.id,
       (ol.applicability_type <> 'nao_aplicavel'),
       ol.applicability_type,
       CASE WHEN ol.applicability_type = 'nao_aplicavel' THEN 'nao_aplicavel' ELSE NULL END
FROM public.organization_legislation ol
JOIN public.legal_requirements r ON r.legislation_id = ol.legislation_id
WHERE ol.applicability_type IN ('informativo', 'nao_aplicavel')
  AND NOT EXISTS (
    SELECT 1 FROM public.applicabilities a
    WHERE a.requirement_id = r.id AND a.organization_id = ol.organization_id
  );
