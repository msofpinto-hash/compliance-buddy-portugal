CREATE OR REPLACE FUNCTION public.enforce_client_applicability_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Clients may only attach/remove evidence files
  NEW.organization_id    := OLD.organization_id;
  NEW.requirement_id     := OLD.requirement_id;
  NEW.is_applicable      := OLD.is_applicable;
  NEW.applicability_type := OLD.applicability_type;
  NEW.compliance_status  := OLD.compliance_status;
  NEW.notes              := OLD.notes;
  NEW.created_at         := OLD.created_at;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_client_applicability_scope_trg ON public.applicabilities;
CREATE TRIGGER enforce_client_applicability_scope_trg
BEFORE UPDATE ON public.applicabilities
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_applicability_scope();