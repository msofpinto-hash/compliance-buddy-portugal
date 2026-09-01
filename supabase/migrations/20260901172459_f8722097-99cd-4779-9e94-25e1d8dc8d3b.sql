DO $$
DECLARE rid bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://nbyrcboutdtzwslfhthe.supabase.co/functions/v1/bulk-suggest-categories',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-token', internal.cron_token()),
    body := jsonb_build_object(
      'legislationIds', (
        SELECT to_jsonb(array_agg(x.id)) FROM (
          SELECT DISTINCT l.id
          FROM public.legislation l
          JOIN public.organization_legislation ol ON ol.legislation_id = l.id
          JOIN public.organizations o ON o.id = ol.organization_id
          WHERE o.name ILIKE 'AMCOR%'
            AND NOT EXISTS (SELECT 1 FROM public.legislation_category_mapping m WHERE m.legislation_id = l.id)
          LIMIT 80
        ) x
      ),
      'autoAssign', true
    )
  ) INTO rid;
END $$;