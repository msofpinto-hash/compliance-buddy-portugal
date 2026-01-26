
CREATE OR REPLACE FUNCTION public.count_generic_titles()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM legislation
  WHERE document_url IS NOT NULL
    AND (origin = 'PT' OR origin = 'dre')
    AND (no_digital_version IS NULL OR no_digital_version = false)
    AND (
      -- Title equals the number (definitely generic)
      title = number 
      -- Very short titles are generic
      OR length(trim(title)) < 15
      -- Placeholder titles
      OR title ILIKE '%diploma referenciado%'
      -- Only treat "Documento ..." as placeholder when it's at the START
      OR title ~* '^documento\b'
      -- Titles that are just the document type without description
      OR (
        title ~* '^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Diretiva|Decisão|Declaração|Acórdão|Aviso|Parecer|Deliberação)\s*(n\.?[ºo°]?\s*\d|$)'
        AND length(title) < 50
      )
      -- Titles starting with # (markdown remnants)
      OR title LIKE '#%'
    )
$function$;
