
CREATE OR REPLACE FUNCTION public.enforce_client_applicability_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side / system context (no end-user session): allow
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.organization_id    := OLD.organization_id;
  NEW.requirement_id     := OLD.requirement_id;
  NEW.is_applicable      := OLD.is_applicable;
  NEW.applicability_type := OLD.applicability_type;
  NEW.compliance_status  := OLD.compliance_status;
  NEW.notes              := OLD.notes;
  NEW.created_at         := OLD.created_at;

  RETURN NEW;
END;
$$;

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
