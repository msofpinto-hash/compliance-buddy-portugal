UPDATE legislation
SET origin = 'PT',
    ce_number = NULL,
    updated_at = now()
WHERE origin = 'EU'
  AND lower(document_type) IN ('recomendação','recomendacao')
  AND (lower(title) ~ 'oit|internacional|trabalho' OR lower(number) ~ 'oit');