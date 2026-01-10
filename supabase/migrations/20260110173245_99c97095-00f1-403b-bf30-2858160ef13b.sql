-- Add policy to allow anonymous read access to sync_logs for demo
CREATE POLICY "Allow anonymous read access to sync_logs" 
ON public.sync_logs 
FOR SELECT 
USING (true);

-- Add policy to allow anonymous insert to sync_logs (for the edge function)
CREATE POLICY "Allow service role insert to sync_logs" 
ON public.sync_logs 
FOR INSERT 
WITH CHECK (true);

-- Add policy to allow anonymous update to sync_logs (for the edge function)
CREATE POLICY "Allow service role update to sync_logs" 
ON public.sync_logs 
FOR UPDATE 
USING (true);