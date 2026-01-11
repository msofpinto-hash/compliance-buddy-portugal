-- Remove anonymous read access to sync_logs (security fix)
-- This policy exposes internal sync operations to unauthenticated users
DROP POLICY IF EXISTS "Allow anonymous read access to sync_logs" ON public.sync_logs;