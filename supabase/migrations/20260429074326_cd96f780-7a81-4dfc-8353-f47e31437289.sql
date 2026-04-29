
CREATE OR REPLACE FUNCTION public.get_unchecked_dre_urls(p_limit integer DEFAULT 1000)
RETURNS TABLE(id uuid, number text, title text, document_url text, origin text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.number, l.title, l.document_url, l.origin
  FROM legislation l
  WHERE l.document_url IS NOT NULL
    AND l.document_url <> ''
    AND (l.origin = 'PT' OR l.origin = 'dre' OR l.origin IS NULL)
    AND (l.no_digital_version IS NULL OR l.no_digital_version = false)
    AND NOT EXISTS (
      SELECT 1 FROM url_validation_results r WHERE r.legislation_id = l.id
    )
  ORDER BY l.created_at ASC
  LIMIT p_limit;
$$;
