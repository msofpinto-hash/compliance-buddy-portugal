-- Create function to get legislation IDs with short summaries (< 20 chars)
-- This allows efficient fetching without row limits
CREATE OR REPLACE FUNCTION public.get_short_summary_ids(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, number text, title text, summary text, document_url text, origin text, publication_date text, effective_date text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, number, title, summary, document_url, origin, 
         publication_date::text, effective_date::text
  FROM legislation
  WHERE document_url IS NOT NULL
    AND (summary IS NULL OR length(trim(summary)) < 20)
  ORDER BY created_at ASC
  LIMIT p_limit
  OFFSET p_offset
$$;