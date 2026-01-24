
-- Function to count generic titles (PT legislation with URL)
CREATE OR REPLACE FUNCTION public.count_generic_titles()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM legislation
  WHERE document_url IS NOT NULL
    AND (origin = 'PT' OR origin = 'dre')
    AND (
      title = number 
      OR (
        title ~* '^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Diretiva|Decisão|Declaração|Acórdão|Aviso|Parecer)'
        AND length(title) < 80 
        AND title NOT LIKE '% - %'
      )
      OR title ILIKE '%diploma referenciado%'
      OR title ILIKE '%documento %'
      OR length(title) < 10
    )
$$;

-- Function to count short summaries (all legislation with URL)
CREATE OR REPLACE FUNCTION public.count_short_summaries()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM legislation
  WHERE document_url IS NOT NULL
    AND (summary IS NULL OR length(trim(summary)) < 20)
$$;
