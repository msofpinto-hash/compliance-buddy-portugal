ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS no_action_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conclusion_note text,
  ADD COLUMN IF NOT EXISTS executed_at date;