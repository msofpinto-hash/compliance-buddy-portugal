-- Fix linter WARN 1: reinstall pg_net in extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
