-- Add service_type column to organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS service_type text;

-- Add a comment to document the expected values
COMMENT ON COLUMN public.organizations.service_type IS 'Tipo de serviço contratado: essencial, continua, avancada, dedicada';