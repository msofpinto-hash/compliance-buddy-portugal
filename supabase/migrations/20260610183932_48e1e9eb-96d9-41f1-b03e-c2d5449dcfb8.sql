
CREATE OR REPLACE FUNCTION public.count_pending_requirements(p_origin text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COUNT(*)::int
  FROM legislation l
  LEFT JOIN legal_requirements lr ON lr.legislation_id = l.id
  WHERE l.document_url IS NOT NULL
    AND lr.id IS NULL
    AND (
      (p_origin = 'PT' AND (l.origin = 'PT' OR l.origin = 'dre' OR l.origin IS NULL))
      OR (p_origin = 'EU' AND (l.origin = 'EU' OR l.origin = 'eurlex'))
    );
$$;

CREATE OR REPLACE FUNCTION public.count_pending_relations()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COUNT(*)::int
  FROM legislation l
  LEFT JOIN legislation_relations_processed lrp ON lrp.legislation_id = l.id
  WHERE lrp.id IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.count_pending_requirements(text) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.count_pending_relations() TO authenticated, service_role, anon;
