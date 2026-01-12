-- Enable realtime for sync_logs table
ALTER TABLE public.sync_logs REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_logs;