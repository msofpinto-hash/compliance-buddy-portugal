-- Allow admins to insert legislation_category_mapping
CREATE POLICY "Admins can insert mappings" 
ON public.legislation_category_mapping 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete legislation_category_mapping  
CREATE POLICY "Admins can delete mappings"
ON public.legislation_category_mapping 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert legal_requirements
CREATE POLICY "Admins can insert requirements"
ON public.legal_requirements 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete legal_requirements
CREATE POLICY "Admins can delete requirements"
ON public.legal_requirements 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow anonymous read access to legal_requirements for demo
CREATE POLICY "Allow read access to requirements"
ON public.legal_requirements 
FOR SELECT 
USING (true);