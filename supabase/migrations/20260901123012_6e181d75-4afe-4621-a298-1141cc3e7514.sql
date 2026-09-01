CREATE OR REPLACE FUNCTION public.get_diplomas_progress_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT l.id,
         CASE WHEN l.origin IN ('EU','eurlex') THEN 'EU' ELSE 'PT' END AS o,
         EXISTS (SELECT 1 FROM legislation_category_mapping m WHERE m.legislation_id = l.id) AS has_cat,
         EXISTS (
           SELECT 1 FROM legislation_relations r
           WHERE r.source_legislation_id = l.id OR r.target_legislation_id = l.id
         ) AS has_rel,
         EXISTS (
           SELECT 1 FROM legislation_relations r
           JOIN legislation t ON t.id = r.target_legislation_id
           WHERE r.source_legislation_id = l.id AND t.origin IN ('EU','eurlex')
         ) OR EXISTS (
           SELECT 1 FROM legislation_relations r
           JOIN legislation s ON s.id = r.source_legislation_id
           WHERE r.target_legislation_id = l.id AND s.origin IN ('EU','eurlex')
         ) AS has_eu_link,
         EXISTS (SELECT 1 FROM legal_requirements q WHERE q.legislation_id = l.id) AS has_req
  FROM legislation l
  WHERE l.no_digital_version IS NULL OR l.no_digital_version = false
)
SELECT jsonb_build_object(
  'total', (SELECT count(*) FROM base),
  'pt', (SELECT count(*) FROM base WHERE o = 'PT'),
  'eu', (SELECT count(*) FROM base WHERE o = 'EU'),
  'with_category', (SELECT count(*) FROM base WHERE has_cat),
  'without_category', (SELECT count(*) FROM base WHERE NOT has_cat),
  'with_relations', (SELECT count(*) FROM base WHERE has_rel),
  'without_relations', (SELECT count(*) FROM base WHERE NOT has_rel),
  'with_eu_link', (SELECT count(*) FROM base WHERE o = 'PT' AND has_eu_link),
  'without_eu_link', (SELECT count(*) FROM base WHERE o = 'PT' AND NOT has_eu_link),
  'with_requirements', (SELECT count(*) FROM base WHERE has_req),
  'without_requirements', (SELECT count(*) FROM base WHERE NOT has_req),
  'total_relations', (SELECT count(*) FROM legislation_relations),
  'top_categories', COALESCE((
    SELECT jsonb_agg(x) FROM (
      SELECT tc.name AS name, count(*)::int AS value
      FROM legislation_category_mapping m
      JOIN theme_categories tc ON tc.id = m.category_id
      GROUP BY tc.name
      ORDER BY count(*) DESC
      LIMIT 10
    ) x
  ), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_diplomas_progress_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_diplomas_progress_stats() TO service_role;