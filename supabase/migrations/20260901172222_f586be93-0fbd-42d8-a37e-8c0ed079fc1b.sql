CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS internal.service_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON internal.service_tokens FROM anon, authenticated;
GRANT ALL ON internal.service_tokens TO service_role;
ALTER TABLE internal.service_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO internal.service_tokens(name, token)
VALUES ('cron', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION internal.cron_token()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = internal
AS $$ SELECT token FROM internal.service_tokens WHERE name = 'cron' $$;

REVOKE ALL ON FUNCTION internal.cron_token() FROM public, anon, authenticated;