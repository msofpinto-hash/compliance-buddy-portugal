-- Drop existing user policies on profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Recreate with explicit authentication checks
-- Users can only view their own profile AND must be authenticated
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (
  auth.role() = 'authenticated' AND auth.uid() = id
);

-- Users can only update their own profile AND must be authenticated
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (
  auth.role() = 'authenticated' AND auth.uid() = id
)
WITH CHECK (
  auth.role() = 'authenticated' AND auth.uid() = id
);

-- Users can only insert their own profile AND must be authenticated
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated' AND auth.uid() = id
);