-- Add logo_url column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN logo_url TEXT;

-- Add comment
COMMENT ON COLUMN public.organizations.logo_url IS 'URL of the organization logo stored in Supabase Storage';