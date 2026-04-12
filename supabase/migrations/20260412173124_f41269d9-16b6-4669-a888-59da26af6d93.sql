
UPDATE sync_logs SET status = 'completed_timeout', completed_at = now(), error_message = 'Auto-cancelled: stale job (>30min without progress)'
WHERE status = 'running' AND started_at < now() - interval '30 minutes';
