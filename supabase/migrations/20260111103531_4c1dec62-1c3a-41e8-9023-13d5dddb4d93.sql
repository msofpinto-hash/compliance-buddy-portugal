-- Create enum for available modules
CREATE TYPE public.app_module AS ENUM ('legislacao', 'planos_acao', 'auditorias', 'documentos', 'indicadores');

-- Create table for user module permissions
CREATE TABLE public.user_module_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    module app_module NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID,
    UNIQUE (user_id, organization_id, module)
);

-- Enable RLS
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Security definer function to check module access
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id UUID, _org_id UUID, _module app_module)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_module_permissions
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND module = _module
  )
$$;

-- Function to get user's accessible modules for an organization
CREATE OR REPLACE FUNCTION public.get_user_modules(_user_id UUID, _org_id UUID)
RETURNS app_module[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(module), ARRAY[]::app_module[])
  FROM public.user_module_permissions
  WHERE user_id = _user_id
    AND organization_id = _org_id
$$;

-- RLS Policies for user_module_permissions
-- Admins can view all permissions
CREATE POLICY "Admins can view all module permissions"
ON public.user_module_permissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own permissions
CREATE POLICY "Users can view their own module permissions"
ON public.user_module_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins can insert permissions
CREATE POLICY "Admins can insert module permissions"
ON public.user_module_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can update permissions
CREATE POLICY "Admins can update module permissions"
ON public.user_module_permissions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can delete permissions
CREATE POLICY "Admins can delete module permissions"
ON public.user_module_permissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));