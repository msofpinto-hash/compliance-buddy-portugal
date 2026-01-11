-- Create table to track read legislation per user
CREATE TABLE public.user_legislation_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  legislation_id UUID NOT NULL REFERENCES public.legislation(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, legislation_id)
);

-- Enable RLS
ALTER TABLE public.user_legislation_reads ENABLE ROW LEVEL SECURITY;

-- Users can view their own reads
CREATE POLICY "Users can view their own reads"
ON public.user_legislation_reads
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own reads
CREATE POLICY "Users can insert their own reads"
ON public.user_legislation_reads
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reads
CREATE POLICY "Users can delete their own reads"
ON public.user_legislation_reads
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_user_legislation_reads_user_id ON public.user_legislation_reads(user_id);
CREATE INDEX idx_user_legislation_reads_legislation_id ON public.user_legislation_reads(legislation_id);