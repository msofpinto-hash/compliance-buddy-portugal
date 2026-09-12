CREATE TABLE public.legislation_category_mapping_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL,
  legislation_id uuid NOT NULL,
  category_id uuid NOT NULL,
  action text NOT NULL,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.legislation_category_mapping_audit TO authenticated;
GRANT ALL ON public.legislation_category_mapping_audit TO service_role;

ALTER TABLE public.legislation_category_mapping_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view category mapping audit"
ON public.legislation_category_mapping_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_lcma_legislation ON public.legislation_category_mapping_audit (legislation_id);
CREATE INDEX idx_lcma_deleted_at ON public.legislation_category_mapping_audit (deleted_at DESC);

CREATE OR REPLACE FUNCTION public.log_category_mapping_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.legislation_category_mapping_audit (mapping_id, legislation_id, category_id, action, deleted_by)
  VALUES (OLD.id, OLD.legislation_id, OLD.category_id, 'delete', auth.uid());
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_log_category_mapping_delete
BEFORE DELETE ON public.legislation_category_mapping
FOR EACH ROW EXECUTE FUNCTION public.log_category_mapping_delete();