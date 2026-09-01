CREATE TABLE IF NOT EXISTS public.legislation_keep (id uuid PRIMARY KEY);
GRANT ALL ON public.legislation_keep TO service_role;
ALTER TABLE public.legislation_keep ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage legislation_keep" ON public.legislation_keep FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));