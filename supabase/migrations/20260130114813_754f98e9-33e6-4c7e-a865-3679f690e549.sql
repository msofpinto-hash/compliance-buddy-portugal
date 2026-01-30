-- RPC para contar legislação que já tem pelo menos 1 requisito (evita LIMIT 15000 no frontend)
CREATE OR REPLACE FUNCTION public.get_legislation_with_requirements_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT legislation_id)::integer
  FROM public.legal_requirements;
$$;