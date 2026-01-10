-- Create legislation relations table
CREATE TABLE public.legislation_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_legislation_id UUID NOT NULL REFERENCES public.legislation(id) ON DELETE CASCADE,
  target_legislation_id UUID NOT NULL REFERENCES public.legislation(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('revogado', 'revogacao_parcial', 'alteracao', 'transposicao', 'regulamentacao')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_legislation_id, target_legislation_id, relation_type)
);

-- Enable RLS
ALTER TABLE public.legislation_relations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow anonymous read access to relations"
ON public.legislation_relations
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage relations"
ON public.legislation_relations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_legislation_relations_updated_at
  BEFORE UPDATE ON public.legislation_relations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Add comment
COMMENT ON TABLE public.legislation_relations IS 'Stores relationships between legislation documents';