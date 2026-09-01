CREATE TABLE public.organization_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  area text,
  unit text,
  target_value numeric NOT NULL DEFAULT 100,
  current_value numeric NOT NULL DEFAULT 0,
  start_date date,
  due_date date,
  status text NOT NULL DEFAULT 'em_curso',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_goals TO authenticated;
GRANT ALL ON public.organization_goals TO service_role;

ALTER TABLE public.organization_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all goals"
ON public.organization_goals FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Org members view their goals"
ON public.organization_goals FOR SELECT TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members update goal progress"
ON public.organization_goals FOR UPDATE TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id))
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE TRIGGER organization_goals_updated_at
BEFORE UPDATE ON public.organization_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_organization_goals_org ON public.organization_goals(organization_id);