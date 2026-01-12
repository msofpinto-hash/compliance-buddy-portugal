-- Add display_order column to legal_requirements table
ALTER TABLE public.legal_requirements 
ADD COLUMN display_order integer DEFAULT 0;

-- Update existing requirements to have sequential order based on article
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY legislation_id ORDER BY article NULLS LAST, created_at) as rn
  FROM public.legal_requirements
)
UPDATE public.legal_requirements lr
SET display_order = ordered.rn
FROM ordered
WHERE lr.id = ordered.id;