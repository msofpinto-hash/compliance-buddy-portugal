DO $$
DECLARE
  j record;
  new_cmd text;
  tok text := internal.cron_token();
BEGIN
  FOR j IN SELECT jobid, jobname, schedule, command FROM cron.job LOOP
    new_cmd := regexp_replace(
      j.command,
      '("Content-Type"\s*:\s*"application/json")',
      '\1, "x-internal-token": "' || tok || '"',
      'g'
    );
    IF new_cmd <> j.command THEN
      PERFORM cron.alter_job(j.jobid, command := new_cmd);
    END IF;
  END LOOP;

  PERFORM net.http_post(
    url := 'https://nbyrcboutdtzwslfhthe.supabase.co/functions/v1/bulk-suggest-categories',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-token', tok),
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
  );
END $$;