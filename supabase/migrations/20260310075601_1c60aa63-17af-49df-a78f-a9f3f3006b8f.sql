UPDATE external_source_status 
SET status = 'online', 
    blocked_until = NULL, 
    failure_count = 0, 
    error_message = NULL,
    updated_at = now()
WHERE source_name = 'dre_opendata'