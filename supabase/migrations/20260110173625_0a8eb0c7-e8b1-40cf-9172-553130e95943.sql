-- Allow anonymous read access to legislation for demo
CREATE POLICY "Allow anonymous read access to legislation" 
ON public.legislation 
FOR SELECT 
USING (true);

-- Allow anonymous read access to legislation_category_mapping for demo
CREATE POLICY "Allow anonymous read access to mappings" 
ON public.legislation_category_mapping 
FOR SELECT 
USING (true);

-- Allow anonymous read access to themes for demo  
CREATE POLICY "Allow anonymous read access to themes"
ON public.themes
FOR SELECT
USING (true);

-- Allow anonymous read access to theme_categories for demo
CREATE POLICY "Allow anonymous read access to categories"
ON public.theme_categories
FOR SELECT
USING (true);