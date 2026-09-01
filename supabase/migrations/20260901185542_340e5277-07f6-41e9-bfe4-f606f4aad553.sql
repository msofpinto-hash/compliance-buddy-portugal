REVOKE ALL ON FUNCTION public.evidence_request_auto_visible(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_evidence_visibility(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recompute_evidence_visibility() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_evidence_request_visibility() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evidence_request_auto_visible(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_evidence_visibility(uuid) TO service_role;