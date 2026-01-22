-- Create junction table for categories to themes (many-to-many)
CREATE TABLE public.category_theme_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES public.theme_categories(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category_id, theme_id)
);

-- Enable RLS
ALTER TABLE public.category_theme_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view category theme links"
ON public.category_theme_links
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage category theme links"
ON public.category_theme_links
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Migrate existing data: copy current theme_id relationships to the new table
INSERT INTO public.category_theme_links (category_id, theme_id)
SELECT id, theme_id FROM public.theme_categories
WHERE theme_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Create index for performance
CREATE INDEX idx_category_theme_links_category ON public.category_theme_links(category_id);
CREATE INDEX idx_category_theme_links_theme ON public.category_theme_links(theme_id);