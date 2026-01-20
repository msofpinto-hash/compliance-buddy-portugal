-- Add CAE and social object fields to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS cae_principal TEXT,
ADD COLUMN IF NOT EXISTS cae_secundarios TEXT[],
ADD COLUMN IF NOT EXISTS objeto_social TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Portugal';