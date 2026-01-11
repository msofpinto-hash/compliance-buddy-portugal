-- Add objectives field for "Objetivos da Auditoria"
ALTER TABLE public.audits 
ADD COLUMN objectives TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.audits.objectives IS 'Objectives and goals of the audit';