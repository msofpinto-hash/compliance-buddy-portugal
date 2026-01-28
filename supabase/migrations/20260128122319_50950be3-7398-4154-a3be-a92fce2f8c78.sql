-- Create RPC to get legislation IDs with generic titles (for job processing)
CREATE OR REPLACE FUNCTION public.get_generic_title_ids(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, number text, title text, document_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, number, title, document_url
  FROM legislation
  WHERE document_url IS NOT NULL
    AND (origin = 'PT' OR origin = 'dre')
    AND (no_digital_version IS NULL OR no_digital_version = false)
    AND (
      -- Title equals the number AND is short (truly generic, no date description)
      (title = number AND length(title) < 30 AND title !~* ', de \d')
      -- Very short titles are generic
      OR length(trim(title)) < 15
      -- Placeholder titles
      OR title ILIKE '%diploma referenciado%'
      -- Only treat "Documento ..." as placeholder when it's at the START
      OR title ~* '^documento\b'
      -- Titles that are just the document type without description (and no date)
      OR (
        title ~* '^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Diretiva|Decisão|Declaração|Acórdão|Aviso|Parecer|Deliberação)\s*(n\.?[ºo°]?\s*\d|$)'
        AND length(title) < 30
        AND title !~* ', de \d'
      )
      -- Titles starting with # (markdown remnants)
      OR title LIKE '#%'
    )
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.get_generic_title_ids TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_generic_title_ids TO service_role;