DELETE FROM public.organization_themes ot
USING public.organizations o, public.themes t
WHERE ot.organization_id = o.id
  AND ot.theme_id = t.id
  AND o.name ILIKE 'AMCOR%'
  AND t.name NOT IN ('Ambiente', 'Segurança e saúde no trabalho');