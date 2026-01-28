-- Refine the count_generic_titles function to exclude valid titles that equal number
-- A title like "Portaria n.º 1084/2003, de 29 de Setembro" is NOT generic even if title = number
-- because it contains a date description. Only consider it generic if title = number AND
-- the title is very short (less than 30 chars) or doesn't contain a date pattern

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
$function$;