DO $$
DECLARE
  r RECORD;
  v_year TEXT;
  v_seq TEXT;
  v_letter TEXT;
  v_celex TEXT;
  v_url TEXT;
  v_new_date DATE;
  v_doc_type TEXT;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT id, number, title, document_type, publication_date, document_url, ce_number, source
    FROM legislation
    WHERE origin = 'PT'
      AND (
        lower(document_type) IN (
          'comunicação','comunicacao','comunicaçao',
          'regulamento de execução','regulamento delegado',
          'decisão de execução','decisão delegada','diretiva delegada'
        )
        OR
        (
          lower(document_type) IN ('regulamento','decisão','decisao','recomendação','recomendacao')
          AND source IN ('relatorio_siawise','pdf_import_amcor','listagem_cliente_s','pdf-import')
          AND (document_url IS NULL OR document_url NOT LIKE '%diariodarepublica.pt/dr/detalhe%')
        )
      )
  LOOP
    v_doc_type := lower(coalesce(r.document_type, ''));
    IF v_doc_type LIKE '%regulamento%' THEN
      v_letter := 'R';
    ELSIF v_doc_type LIKE '%diretiva%' OR v_doc_type LIKE '%directiva%' THEN
      v_letter := 'L';
    ELSIF v_doc_type LIKE '%decis%' THEN
      v_letter := 'D';
    ELSE
      v_letter := NULL;
    END IF;

    v_year := (regexp_match(r.number, '(\d{4})\s*/\s*\d+'))[1];
    v_seq  := (regexp_match(r.number, '\d{4}\s*/\s*(\d+)'))[1];

    IF v_year IS NULL THEN
      v_year := (regexp_match(r.number, '(\d+)\s*/\s*(\d{4})'))[2];
      v_seq  := (regexp_match(r.number, '(\d+)\s*/\s*\d{4}'))[1];
    END IF;

    IF v_year IS NOT NULL AND v_seq IS NOT NULL AND v_letter IS NOT NULL THEN
      v_celex := '3' || v_year || v_letter || lpad(v_seq, 4, '0');
      v_url := 'https://eur-lex.europa.eu/legal-content/PT/ALL/?uri=CELEX:' || v_celex;
    ELSE
      v_celex := NULL;
      v_url := NULL;
    END IF;

    v_new_date := r.publication_date;
    IF v_year IS NOT NULL AND r.publication_date IS NOT NULL THEN
      IF extract(year from r.publication_date)::text <> v_year
         AND v_year::int BETWEEN 1950 AND 2100 THEN
        v_new_date := make_date(v_year::int, extract(month from r.publication_date)::int, extract(day from r.publication_date)::int);
      END IF;
    END IF;

    UPDATE legislation SET
      origin = 'EU',
      document_url = coalesce(document_url, v_url),
      ce_number = coalesce(ce_number, v_celex),
      publication_date = v_new_date,
      updated_at = now()
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Reclassificados % diplomas para origem EU', v_count;
END $$;