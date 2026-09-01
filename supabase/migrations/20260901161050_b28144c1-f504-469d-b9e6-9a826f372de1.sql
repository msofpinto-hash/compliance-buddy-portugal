-- 1) Harden audits client updates
CREATE OR REPLACE FUNCTION public.enforce_client_audit_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Only allow the two legitimate client transitions
  IF OLD.status = 'planned'::audit_status THEN
    NEW.status := OLD.status;           -- plan approval keeps the status
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
    IF NEW.plan_approved_at IS DISTINCT FROM OLD.plan_approved_at THEN
      NEW.plan_approved_by := auth.uid();
    END IF;
  ELSIF OLD.status = 'pending_approval'::audit_status THEN
    IF NEW.status NOT IN ('pending_approval'::audit_status, 'closed'::audit_status) THEN
      RAISE EXCEPTION 'Transição de estado não permitida';
    END IF;
    NEW.plan_approved_at := OLD.plan_approved_at;
    NEW.plan_approved_by := OLD.plan_approved_by;
    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.status = 'closed'::audit_status THEN
      NEW.approved_by := auth.uid();
    END IF;
  ELSE
    RAISE EXCEPTION 'Alteração não permitida neste estado';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Harden evidence request client updates
CREATE OR REPLACE FUNCTION public.enforce_client_evidence_request_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.organization_id := OLD.organization_id;
  NEW.template_id     := OLD.template_id;
  NEW.assigned_by     := OLD.assigned_by;
  NEW.due_date        := OLD.due_date;
  NEW.created_at      := OLD.created_at;
  NEW.reviewed_by     := OLD.reviewed_by;
  NEW.reviewed_at     := OLD.reviewed_at;

  -- Clients may only move a request to 'submitted' (or leave it unchanged)
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'submitted' THEN
    RAISE EXCEPTION 'Apenas é permitido submeter o pedido de evidências';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_client_evidence_request_scope_trg ON public.organization_evidence_requests;
CREATE TRIGGER enforce_client_evidence_request_scope_trg
BEFORE UPDATE ON public.organization_evidence_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_evidence_request_scope();