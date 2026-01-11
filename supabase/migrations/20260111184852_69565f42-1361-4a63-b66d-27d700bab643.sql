-- Create login_attempts table to track failed login attempts
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

-- Create index for efficient lookups
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts (email, attempted_at DESC);

-- Enable RLS
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (needed for tracking before auth)
CREATE POLICY "Allow anonymous insert login attempts"
ON public.login_attempts
FOR INSERT
WITH CHECK (true);

-- Only service role can read/manage (for security)
CREATE POLICY "Service role can manage login attempts"
ON public.login_attempts
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to check if login is allowed (not blocked)
CREATE OR REPLACE FUNCTION public.check_login_allowed(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_attempts integer;
  v_last_attempt timestamp with time zone;
  v_lockout_minutes integer := 15;
  v_max_attempts integer := 5;
  v_lockout_until timestamp with time zone;
  v_is_blocked boolean;
BEGIN
  -- Count failed attempts in the last lockout period
  SELECT 
    COUNT(*),
    MAX(attempted_at)
  INTO v_failed_attempts, v_last_attempt
  FROM public.login_attempts
  WHERE email = lower(p_email)
    AND success = false
    AND attempted_at > now() - (v_lockout_minutes || ' minutes')::interval;
  
  -- Check if blocked
  v_is_blocked := v_failed_attempts >= v_max_attempts;
  
  -- Calculate lockout end time
  IF v_is_blocked AND v_last_attempt IS NOT NULL THEN
    v_lockout_until := v_last_attempt + (v_lockout_minutes || ' minutes')::interval;
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', NOT v_is_blocked,
    'failed_attempts', v_failed_attempts,
    'max_attempts', v_max_attempts,
    'remaining_attempts', GREATEST(0, v_max_attempts - v_failed_attempts),
    'lockout_until', v_lockout_until,
    'lockout_minutes', v_lockout_minutes
  );
END;
$$;

-- Function to record a login attempt
CREATE OR REPLACE FUNCTION public.record_login_attempt(p_email text, p_success boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_attempts (email, success)
  VALUES (lower(p_email), p_success);
  
  -- If successful, clear previous failed attempts for this email
  IF p_success THEN
    DELETE FROM public.login_attempts
    WHERE email = lower(p_email)
      AND success = false;
  END IF;
  
  -- Clean up old attempts (older than 24 hours)
  DELETE FROM public.login_attempts
  WHERE attempted_at < now() - interval '24 hours';
END;
$$;

-- Grant execute to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.check_login_allowed(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, boolean) TO anon, authenticated;