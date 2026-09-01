DO $$
DECLARE
  r record;
  anon_allowed text[] := ARRAY['check_login_allowed','record_login_attempt'];
  trigger_only text[] := ARRAY[
    'update_updated_at','handle_new_user','enforce_client_audit_update_scope',
    'enforce_client_evidence_request_scope','enforce_client_applicability_scope'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    IF r.proname = ANY(trigger_only) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    ELSIF NOT (r.proname = ANY(anon_allowed)) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
    END IF;
  END LOOP;
END $$;