-- Remove anonymous read access policy from legal_requirements
DROP POLICY IF EXISTS "Allow read access to requirements" ON public.legal_requirements;

-- The "Authenticated users can view requirements" policy already exists and uses USING (true)
-- This is acceptable since the app requires authentication for all routes
-- and legal requirements are shared across all authenticated users

-- For profiles table, the policies are already correct:
-- - Users can only view/update their own profile (auth.uid() = id)
-- - Admins can view/update all profiles (has_role check)
-- No changes needed for profiles - the finding was incorrect