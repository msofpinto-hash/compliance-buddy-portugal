ALTER TABLE public.legislation
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS ce_number text;

CREATE INDEX IF NOT EXISTS idx_legislation_document_type ON public.legislation (document_type);
CREATE INDEX IF NOT EXISTS idx_legislation_ce_number ON public.legislation (ce_number);

CREATE TABLE IF NOT EXISTS public.legislation_duplicate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key text NOT NULL,
  match_type text NOT NULL,
  legislation_ids uuid[] NOT NULL DEFAULT '{}',
  decision text NOT NULL DEFAULT 'pending',
  notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT legislation_duplicate_reviews_group_key_unique UNIQUE (group_key),
  CONSTRAINT legislation_duplicate_reviews_decision_check CHECK (decision IN ('pending','updated','ignored'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legislation_duplicate_reviews TO authenticated;
GRANT ALL ON public.legislation_duplicate_reviews TO service_role;

ALTER TABLE public.legislation_duplicate_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage duplicate reviews"
ON public.legislation_duplicate_reviews
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_legislation_duplicate_reviews_updated_at
BEFORE UPDATE ON public.legislation_duplicate_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();