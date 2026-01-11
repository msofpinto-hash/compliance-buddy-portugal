-- Add new fields to audits table
ALTER TABLE public.audits
ADD COLUMN IF NOT EXISTS interlocutors text,
ADD COLUMN IF NOT EXISTS methodology text,
ADD COLUMN IF NOT EXISTS strengths text,
ADD COLUMN IF NOT EXISTS weaknesses text,
ADD COLUMN IF NOT EXISTS executive_summary text;