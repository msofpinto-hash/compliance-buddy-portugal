-- Add priority column to action_plans table
ALTER TABLE public.action_plans 
ADD COLUMN priority text DEFAULT 'media' 
CHECK (priority IN ('alta', 'media', 'baixa'));