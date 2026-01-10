-- Add is_approved column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

-- Add approved_at and approved_by columns for audit
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Allow admins to view all profiles (for approval management)
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update profiles (for approval)
CREATE POLICY "Admins can update profiles" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));