-- Add revocation_date column to legislation table
ALTER TABLE public.legislation 
ADD COLUMN revocation_date date DEFAULT NULL;