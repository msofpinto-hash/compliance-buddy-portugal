-- Add new columns to profiles table for user management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_type text DEFAULT 'consulta';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language text DEFAULT 'pt';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS calendar_type text DEFAULT 'generico';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Add comments
COMMENT ON COLUMN public.profiles.user_type IS 'User type: consulta, editor, admin_org';
COMMENT ON COLUMN public.profiles.language IS 'User language preference: pt, en, es';
COMMENT ON COLUMN public.profiles.calendar_type IS 'Calendar type: generico, personalizado';