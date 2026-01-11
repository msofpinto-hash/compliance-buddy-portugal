-- Enable realtime for legal_requirements and legislation tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.legal_requirements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.legislation;