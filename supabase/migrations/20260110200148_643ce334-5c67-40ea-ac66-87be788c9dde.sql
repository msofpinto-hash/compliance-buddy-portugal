-- Criar tabela para associar legislação a organizações
CREATE TABLE public.organization_legislation (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    legislation_id UUID NOT NULL REFERENCES public.legislation(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES auth.users(id),
    notes TEXT,
    UNIQUE(organization_id, legislation_id)
);

-- Enable RLS
ALTER TABLE public.organization_legislation ENABLE ROW LEVEL SECURITY;

-- Admins can manage all mappings
CREATE POLICY "Admins can manage organization legislation" 
ON public.organization_legislation 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view their own legislation
CREATE POLICY "Clients can view their organization legislation" 
ON public.organization_legislation 
FOR SELECT 
USING (user_belongs_to_org(auth.uid(), organization_id));

-- Create index for better performance
CREATE INDEX idx_org_legislation_org_id ON public.organization_legislation(organization_id);
CREATE INDEX idx_org_legislation_leg_id ON public.organization_legislation(legislation_id);