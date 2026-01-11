-- Create rate limiting table
CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL, -- IP, user_id, or function name combo
  function_name text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_rate_limits_lookup ON public.rate_limits (identifier, function_name, window_start);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role can manage rate limits (Edge Functions use service role)
CREATE POLICY "Service role can manage rate limits"
ON public.rate_limits
FOR ALL
USING (true)
WITH CHECK (true);

-- Create function to check and update rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier text,
  p_function_name text,
  p_max_requests integer DEFAULT 60,
  p_window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamp with time zone;
  v_current_count integer;
  v_is_allowed boolean;
BEGIN
  -- Calculate window start
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;
  
  -- Clean old entries (older than window)
  DELETE FROM rate_limits 
  WHERE identifier = p_identifier 
    AND function_name = p_function_name 
    AND window_start < v_window_start;
  
  -- Get current count in window
  SELECT COALESCE(SUM(request_count), 0) INTO v_current_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND function_name = p_function_name
    AND window_start >= v_window_start;
  
  -- Check if allowed
  v_is_allowed := v_current_count < p_max_requests;
  
  -- If allowed, record the request
  IF v_is_allowed THEN
    INSERT INTO rate_limits (identifier, function_name, window_start)
    VALUES (p_identifier, p_function_name, now());
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_is_allowed,
    'current_count', v_current_count + CASE WHEN v_is_allowed THEN 1 ELSE 0 END,
    'max_requests', p_max_requests,
    'remaining', GREATEST(0, p_max_requests - v_current_count - CASE WHEN v_is_allowed THEN 1 ELSE 0 END),
    'reset_at', (now() + (p_window_seconds || ' seconds')::interval)
  );
END;
$$;

-- Grant execute to authenticated and service role
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO authenticated, service_role;