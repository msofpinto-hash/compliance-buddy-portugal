-- Add audit_requirement_id to link action plans to audit findings
ALTER TABLE public.action_plans
ADD COLUMN IF NOT EXISTS audit_requirement_id uuid REFERENCES public.audit_requirements(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_action_plans_audit_requirement ON public.action_plans(audit_requirement_id);