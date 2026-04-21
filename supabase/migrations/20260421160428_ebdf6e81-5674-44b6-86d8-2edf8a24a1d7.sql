UPDATE public.external_source_status
SET status = 'offline',
    error_message = 'API DRE OpenData indisponível há vários meses (último sucesso em janeiro). A correção PT continua a funcionar via fallback Firecrawl + DRE Web.',
    blocked_until = now() + interval '24 hours',
    updated_at = now()
WHERE source_name = 'dre_opendata';