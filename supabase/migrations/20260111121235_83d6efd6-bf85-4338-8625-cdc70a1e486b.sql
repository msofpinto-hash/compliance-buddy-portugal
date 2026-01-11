-- Add validity date and user notes to documents table for evidence tracking
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS validity_date date NULL,
ADD COLUMN IF NOT EXISTS user_notes text NULL;

COMMENT ON COLUMN public.documents.validity_date IS 'Data de validade do documento (ex: certificados, licenças)';
COMMENT ON COLUMN public.documents.user_notes IS 'Comentários adicionados pelo utilizador sobre o documento';