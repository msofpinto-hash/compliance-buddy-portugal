-- Create a function to get legislation IDs without categories
CREATE OR REPLACE FUNCTION public.get_legislation_without_categories_ids(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM legislation l
  LEFT JOIN legislation_category_mapping lcm ON lcm.legislation_id = l.id
  WHERE lcm.id IS NULL
    AND l.revocation_date IS NULL
  ORDER BY l.created_at DESC
  LIMIT p_limit;
$$;