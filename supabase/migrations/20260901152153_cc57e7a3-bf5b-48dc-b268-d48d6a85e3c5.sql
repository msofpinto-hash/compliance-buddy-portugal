CREATE TABLE public.ai_usage_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation TEXT NOT NULL,
  model TEXT,
  legislation_id UUID REFERENCES public.legislation(id) ON DELETE SET NULL,
  input_summary TEXT,
  output_summary TEXT,
  auto_applied BOOLEAN NOT NULL DEFAULT false,
  human_validated BOOLEAN NOT NULL DEFAULT false,
  validated_by UUID,
  validated_at TIMESTAMP WITH TIME ZONE,
  triggered_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai usage log"
ON public.ai_usage_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert ai usage log"
ON public.ai_usage_log FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ai usage log"
ON public.ai_usage_log FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ai_usage_log_created_at ON public.ai_usage_log (created_at DESC);
CREATE INDEX idx_ai_usage_log_legislation ON public.ai_usage_log (legislation_id);