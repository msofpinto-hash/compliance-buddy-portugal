-- Add applicability_type column to applicabilities table
ALTER TABLE public.applicabilities 
ADD COLUMN IF NOT EXISTS applicability_type text DEFAULT 'nao_avaliado';

-- Add a comment to document the valid values
COMMENT ON COLUMN public.applicabilities.applicability_type IS 
'Tipo de aplicabilidade: aplicavel_direto, aplicavel_indireto, aplicavel_condicionado, nao_aplicavel, informativo, nao_avaliado';