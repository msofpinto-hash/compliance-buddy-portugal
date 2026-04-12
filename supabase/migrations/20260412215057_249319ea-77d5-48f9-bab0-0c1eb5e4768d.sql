CREATE OR REPLACE FUNCTION public.get_legislation_without_requirements(
  p_origin text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(id uuid, number text, title text, summary text, document_url text, origin text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.id, l.number, l.title, l.summary, l.document_url, l.origin
  FROM legislation l
  LEFT JOIN legal_requirements lr ON lr.legislation_id = l.id
  WHERE l.document_url IS NOT NULL
    AND lr.id IS NULL
    AND (
      p_origin IS NULL
      OR (p_origin = 'PT' AND (l.origin = 'PT' OR l.origin = 'dre' OR l.origin IS NULL))
      OR (p_origin = 'EU' AND (l.origin = 'EU' OR l.origin = 'eurlex'))
    )
  ORDER BY l.publication_date DESC NULLS LAST
  LIMIT p_limit;
$$;