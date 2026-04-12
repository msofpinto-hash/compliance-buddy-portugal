
-- 1. Remove /sitemap.xml suffix
UPDATE legislation 
SET document_url = regexp_replace(document_url, '/sitemap\.xml$', ''),
    updated_at = now()
WHERE document_url LIKE '%/sitemap.xml';

-- 2. Fix inverted URL format: /detalhe/tipo/ANO/NUMERO -> /detalhe/tipo/NUMERO-ANO
UPDATE legislation
SET document_url = regexp_replace(
  document_url, 
  '/detalhe/([^/]+)/(\d{4})/(\d+)', 
  '/detalhe/\1/\3-\2'
),
updated_at = now()
WHERE document_url ~ '/detalhe/[^/]+/\d{4}/\d+';

-- 3. Reset "Erro | DR" titles back to number
UPDATE legislation
SET title = number, updated_at = now()
WHERE title = 'Erro | DR';

-- 4. Clean markdown # prefix from titles
UPDATE legislation
SET title = regexp_replace(title, '^#\s*', ''), updated_at = now()
WHERE title LIKE '#%';

-- 5. Convert http:// to https://
UPDATE legislation
SET document_url = regexp_replace(document_url, '^http://', 'https://'),
    updated_at = now()
WHERE document_url LIKE 'http://dre.pt%';

-- 6. Mark PDF-only URLs as no_digital_version (can't be scraped)
UPDATE legislation
SET no_digital_version = true, updated_at = now()
WHERE document_url IS NOT NULL
  AND (document_url LIKE '%files.dre.pt%' OR document_url LIKE '%/application/file/%' OR document_url LIKE '%/application/conteudo/%')
  AND (no_digital_version IS NULL OR no_digital_version = false);
