ALTER TABLE public.external_source_status
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS base_url text,
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

UPDATE public.external_source_status SET display_name='DRE OpenData', base_url='https://dre.pt' WHERE source_name='dre_opendata';
UPDATE public.external_source_status SET display_name='Diário da República (dre.pt)', base_url='https://diariodarepublica.pt', is_official=true WHERE source_name='dre_website';
UPDATE public.external_source_status SET display_name='EUR-Lex', base_url='https://eur-lex.europa.eu', is_official=true WHERE source_name='eurlex';
UPDATE public.external_source_status SET display_name='Firecrawl' WHERE source_name='firecrawl';