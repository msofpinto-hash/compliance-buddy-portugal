-- Add applicability_type column to organization_legislation table
ALTER TABLE public.organization_legislation 
ADD COLUMN IF NOT EXISTS applicability_type text DEFAULT 'nao_avaliado';

-- Add a comment to document the valid values
COMMENT ON COLUMN public.organization_legislation.applicability_type IS 
'Tipo de aplicabilidade do diploma: aplicavel_direto, aplicavel_indireto, aplicavel_condicionado, nao_aplicavel, informativo, nao_avaliado';