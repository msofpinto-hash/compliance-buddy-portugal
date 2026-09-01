ALTER TABLE public.organization_evidence_requests
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visibility_mode text NOT NULL DEFAULT 'auto';

ALTER TABLE public.organization_evidence_requests
  DROP CONSTRAINT IF EXISTS organization_evidence_requests_visibility_mode_check;
ALTER TABLE public.organization_evidence_requests
  ADD CONSTRAINT organization_evidence_requests_visibility_mode_check
  CHECK (visibility_mode IN ('auto','manual'));

-- Auto visibility: request is shown only when at least one associated diploma
-- is classified for the organization as directly or indirectly applicable.
CREATE OR REPLACE FUNCTION public.evidence_request_auto_visible(_org_id uuid, _template_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.evidence_template_legislation etl
    JOIN public.organization_legislation ol
      ON ol.legislation_id = etl.legislation_id
     AND ol.organization_id = _org_id
    WHERE etl.template_id = _template_id
      AND ol.applicability_type IN ('aplicavel_direto','aplicavel_indireto')
  );
$$;

CREATE OR REPLACE FUNCTION public.recompute_evidence_visibility(_org_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.organization_evidence_requests r
  SET visible_to_client = public.evidence_request_auto_visible(r.organization_id, r.template_id),
      updated_at = now()
  WHERE r.visibility_mode = 'auto'
    AND (_org_id IS NULL OR r.organization_id = _org_id)
    AND r.visible_to_client IS DISTINCT FROM public.evidence_request_auto_visible(r.organization_id, r.template_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_evidence_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'organization_legislation' THEN
    PERFORM public.recompute_evidence_visibility(COALESCE(NEW.organization_id, OLD.organization_id));
  ELSE
    PERFORM public.recompute_evidence_visibility(NULL);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS evidence_visibility_from_legislation ON public.organization_legislation;
CREATE TRIGGER evidence_visibility_from_legislation
AFTER INSERT OR UPDATE OF applicability_type OR DELETE ON public.organization_legislation
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_evidence_visibility();

DROP TRIGGER IF EXISTS evidence_visibility_from_links ON public.evidence_template_legislation;
CREATE TRIGGER evidence_visibility_from_links
AFTER INSERT OR DELETE ON public.evidence_template_legislation
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_evidence_visibility();

-- New requests get their visibility computed on insert
CREATE OR REPLACE FUNCTION public.set_evidence_request_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.visibility_mode = 'auto' THEN
    NEW.visible_to_client := public.evidence_request_auto_visible(NEW.organization_id, NEW.template_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_evidence_request_visibility_trg ON public.organization_evidence_requests;
CREATE TRIGGER set_evidence_request_visibility_trg
BEFORE INSERT ON public.organization_evidence_requests
FOR EACH ROW EXECUTE FUNCTION public.set_evidence_request_visibility();

-- Clients only see requests marked as visible
DROP POLICY IF EXISTS "Clients can view their evidence requests" ON public.organization_evidence_requests;
CREATE POLICY "Clients can view their evidence requests"
ON public.organization_evidence_requests
FOR SELECT
TO authenticated
USING (user_belongs_to_org(auth.uid(), organization_id) AND visible_to_client = true);

SELECT public.recompute_evidence_visibility(NULL);