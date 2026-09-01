DO $$
DECLARE
  v_key text;
  v_ids jsonb;
BEGIN
  SELECT substring(command from 'Bearer ([A-Za-z0-9._-]+)') INTO v_key
  FROM cron.job WHERE jobname = 'auto-retry-failed-jobs';

  SELECT to_jsonb(array_agg(x.id))
  INTO v_ids
  FROM (
    SELECT DISTINCT l.id
    FROM public.legislation l
    JOIN public.organization_legislation ol ON ol.legislation_id = l.id
    JOIN public.organizations o ON o.id = ol.organization_id
    WHERE o.name ILIKE 'AMCOR%'
      AND NOT EXISTS (SELECT 1 FROM public.legislation_category_mapping m WHERE m.legislation_id = l.id)
    LIMIT 80
  ) x;

  IF v_key IS NOT NULL AND v_ids IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://nbyrcboutdtzwslfhthe.supabase.co/functions/v1/bulk-suggest-categories',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object('legislationIds', v_ids, 'autoAssign', true)
    );
  END IF;
END $$;