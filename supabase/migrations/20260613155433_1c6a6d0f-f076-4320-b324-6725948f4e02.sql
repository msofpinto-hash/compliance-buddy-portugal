CREATE OR REPLACE FUNCTION public.count_pending_relations()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int
  FROM legislation l
  LEFT JOIN legislation_relations_processed lrp ON lrp.legislation_id = l.id
  WHERE lrp.id IS NULL
    AND l.document_url IS NOT NULL
    AND (l.no_digital_version IS NULL OR l.no_digital_version = false);
$function$;

CREATE OR REPLACE FUNCTION public.count_pending_requirements(p_origin text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int
  FROM legislation l
  LEFT JOIN legal_requirements lr ON lr.legislation_id = l.id
  WHERE l.document_url IS NOT NULL
    AND (l.no_digital_version IS NULL OR l.no_digital_version = false)
    AND lr.id IS NULL
    AND (
      (p_origin = 'PT' AND (l.origin = 'PT' OR l.origin = 'dre' OR l.origin IS NULL))
      OR (p_origin = 'EU' AND (l.origin = 'EU' OR l.origin = 'eurlex'))
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_legislation_without_requirements(p_origin text DEFAULT NULL::text, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, number text, title text, summary text, document_url text, origin text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT l.id, l.number, l.title, l.summary, l.document_url, l.origin
  FROM legislation l
  LEFT JOIN legal_requirements lr ON lr.legislation_id = l.id
  WHERE l.document_url IS NOT NULL
    AND (l.no_digital_version IS NULL OR l.no_digital_version = false)
    AND lr.id IS NULL
    AND (
      p_origin IS NULL
      OR (p_origin = 'PT' AND (l.origin = 'PT' OR l.origin = 'dre' OR l.origin IS NULL))
      OR (p_origin = 'EU' AND (l.origin = 'EU' OR l.origin = 'eurlex'))
    )
  ORDER BY l.publication_date DESC NULLS LAST
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_legislation_without_categories_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM legislation l
  WHERE (l.no_digital_version IS NULL OR l.no_digital_version = false)
    AND NOT EXISTS (
      SELECT 1 FROM legislation_category_mapping lcm 
      WHERE lcm.legislation_id = l.id
    );
$function$;

GRANT EXECUTE ON FUNCTION public.count_pending_relations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_pending_requirements(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_legislation_without_requirements(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_legislation_without_categories_count() TO authenticated, service_role;