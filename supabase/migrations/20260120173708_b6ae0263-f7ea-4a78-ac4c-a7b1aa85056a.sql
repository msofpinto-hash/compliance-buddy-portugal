-- Add new fields to organizations table for client data
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS nipc text,
ADD COLUMN IF NOT EXISTS contract_reference text,
ADD COLUMN IF NOT EXISTS contract_start_date date,
ADD COLUMN IF NOT EXISTS contract_end_date date,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS responsible_name text,
ADD COLUMN IF NOT EXISTS responsible_email text,
ADD COLUMN IF NOT EXISTS responsible_phone text,
ADD COLUMN IF NOT EXISTS notes text;