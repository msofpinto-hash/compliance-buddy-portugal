-- Add scope field for "estabelecimentos abrangidos" (covered establishments)
ALTER TABLE public.audits 
ADD COLUMN scope TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.audits.scope IS 'Establishments/facilities covered by the audit';