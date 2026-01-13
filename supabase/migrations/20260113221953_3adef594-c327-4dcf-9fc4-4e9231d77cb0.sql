-- Add field to mark legislation without digital version available
ALTER TABLE public.legislation 
ADD COLUMN no_digital_version boolean DEFAULT false;

-- Add comment explaining the field
COMMENT ON COLUMN public.legislation.no_digital_version IS 'Marks legislation that has no digital version available online (e.g., old decrees from Estado Novo period). These should be excluded from data quality problem counters.';

-- Mark the two known cases
UPDATE public.legislation 
SET no_digital_version = true 
WHERE number IN ('Decreto-Lei n.º 34021', 'Decreto-Lei n.º 45935');