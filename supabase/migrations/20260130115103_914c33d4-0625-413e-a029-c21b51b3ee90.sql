-- Fix linter WARN 2: avoid WITH CHECK (true) on anonymous INSERT policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'login_attempts'
      AND policyname = 'Allow anonymous insert login attempts'
  ) THEN
    EXECUTE 'DROP POLICY "Allow anonymous insert login attempts" ON public.login_attempts';
  END IF;
END $$;

CREATE POLICY "Allow anonymous insert login attempts"
ON public.login_attempts
FOR INSERT
TO public
WITH CHECK (
  email IS NOT NULL
  AND email = lower(email)
  AND length(email) BETWEEN 3 AND 320
  AND position('@' in email) > 1
);
