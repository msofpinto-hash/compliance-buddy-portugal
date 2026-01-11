-- Create function to count legislation without categories
CREATE OR REPLACE FUNCTION public.get_legislation_without_categories_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM legislation l
  WHERE NOT EXISTS (
    SELECT 1 FROM legislation_category_mapping lcm 
    WHERE lcm.legislation_id = l.id
  )
$$;