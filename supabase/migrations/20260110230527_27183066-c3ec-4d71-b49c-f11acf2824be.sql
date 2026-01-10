-- Create table to link organizations to themes they have access to
CREATE TABLE public.organization_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(organization_id, theme_id)
);

-- Enable RLS
ALTER TABLE public.organization_themes ENABLE ROW LEVEL SECURITY;

-- Admins can manage all organization themes
CREATE POLICY "Admins can manage organization themes"
ON public.organization_themes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Clients can view their organization's themes
CREATE POLICY "Clients can view their organization themes"
ON public.organization_themes
FOR SELECT
TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id));

-- Add index for performance
CREATE INDEX idx_organization_themes_org ON public.organization_themes(organization_id);
CREATE INDEX idx_organization_themes_theme ON public.organization_themes(theme_id);