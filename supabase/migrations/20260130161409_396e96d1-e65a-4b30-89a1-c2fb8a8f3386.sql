-- =====================================================
-- SISTEMA DE FALHAS PERMANENTES (HARD FAIL)
-- Evita loops de retry infinitos para erros de fonte externa
-- =====================================================

-- 1. Tabela para rastrear itens que falharam permanentemente
CREATE TABLE public.legislation_processing_failures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legislation_id UUID NOT NULL REFERENCES public.legislation(id) ON DELETE CASCADE,
  failure_type TEXT NOT NULL, -- 'url_recovery', 'metadata_scrape', 'requirements_extraction', etc.
  failure_reason TEXT NOT NULL, -- 'source_offline', 'html_response', 'rate_limited', 'not_found'
  error_details TEXT,
  source TEXT, -- 'dre', 'eurlex', 'firecrawl'
  failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  retry_after TIMESTAMP WITH TIME ZONE, -- NULL = never retry, ou data específica
  retry_count INTEGER NOT NULL DEFAULT 0,
  is_permanent BOOLEAN NOT NULL DEFAULT false, -- true = não tentar mais
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(legislation_id, failure_type)
);

-- Índices para consultas eficientes
CREATE INDEX idx_processing_failures_legislation ON public.legislation_processing_failures(legislation_id);
CREATE INDEX idx_processing_failures_source ON public.legislation_processing_failures(source);
CREATE INDEX idx_processing_failures_type ON public.legislation_processing_failures(failure_type);
CREATE INDEX idx_processing_failures_permanent ON public.legislation_processing_failures(is_permanent) WHERE is_permanent = true;
CREATE INDEX idx_processing_failures_retry ON public.legislation_processing_failures(retry_after) WHERE retry_after IS NOT NULL;

-- Trigger para updated_at
CREATE TRIGGER update_processing_failures_updated_at
  BEFORE UPDATE ON public.legislation_processing_failures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 2. Tabela para estado das fontes externas
CREATE TABLE public.external_source_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name TEXT NOT NULL UNIQUE, -- 'dre_opendata', 'dre_website', 'eurlex', 'firecrawl'
  status TEXT NOT NULL DEFAULT 'online', -- 'online', 'offline', 'degraded', 'rate_limited'
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_failure_at TIMESTAMP WITH TIME ZONE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  blocked_until TIMESTAMP WITH TIME ZONE, -- NULL = não bloqueado
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER update_source_status_updated_at
  BEFORE UPDATE ON public.external_source_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Inserir fontes iniciais com estado atual
INSERT INTO public.external_source_status (source_name, status, error_message, blocked_until)
VALUES 
  ('dre_opendata', 'offline', 'API devolve HTML em vez de JSON', now() + interval '24 hours'),
  ('dre_website', 'degraded', 'Bloqueio anti-bot frequente', NULL),
  ('eurlex', 'online', NULL, NULL),
  ('firecrawl', 'online', NULL, NULL);

-- 3. Função RPC para verificar se uma fonte está disponível
CREATE OR REPLACE FUNCTION public.is_source_available(p_source_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN status = 'offline' THEN false
    WHEN blocked_until IS NOT NULL AND blocked_until > now() THEN false
    ELSE true
  END
  FROM external_source_status
  WHERE source_name = p_source_name
$$;

-- 4. Função RPC para obter IDs que não têm falhas permanentes para um tipo
CREATE OR REPLACE FUNCTION public.get_processable_legislation_ids(
  p_failure_type TEXT,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(id UUID)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.id
  FROM legislation l
  LEFT JOIN legislation_processing_failures lpf 
    ON lpf.legislation_id = l.id 
    AND lpf.failure_type = p_failure_type
  WHERE lpf.id IS NULL  -- Sem falha registada
     OR (lpf.is_permanent = false AND (lpf.retry_after IS NULL OR lpf.retry_after <= now()))
  LIMIT p_limit
$$;

-- 5. Função RPC para registar uma falha
CREATE OR REPLACE FUNCTION public.record_processing_failure(
  p_legislation_id UUID,
  p_failure_type TEXT,
  p_failure_reason TEXT,
  p_source TEXT,
  p_error_details TEXT DEFAULT NULL,
  p_is_permanent BOOLEAN DEFAULT false,
  p_retry_after TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO legislation_processing_failures (
    legislation_id, failure_type, failure_reason, source, 
    error_details, is_permanent, retry_after, retry_count
  )
  VALUES (
    p_legislation_id, p_failure_type, p_failure_reason, p_source,
    p_error_details, p_is_permanent, p_retry_after, 1
  )
  ON CONFLICT (legislation_id, failure_type) 
  DO UPDATE SET
    failure_reason = EXCLUDED.failure_reason,
    source = EXCLUDED.source,
    error_details = EXCLUDED.error_details,
    is_permanent = CASE 
      WHEN EXCLUDED.is_permanent THEN true 
      ELSE legislation_processing_failures.is_permanent 
    END,
    retry_after = EXCLUDED.retry_after,
    retry_count = legislation_processing_failures.retry_count + 1,
    failed_at = now(),
    updated_at = now()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- 6. Função RPC para atualizar estado de uma fonte
CREATE OR REPLACE FUNCTION public.update_source_status(
  p_source_name TEXT,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_block_hours INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE external_source_status
  SET 
    status = p_status,
    error_message = p_error_message,
    blocked_until = CASE 
      WHEN p_block_hours IS NOT NULL THEN now() + (p_block_hours || ' hours')::interval
      ELSE NULL
    END,
    last_failure_at = CASE WHEN p_status IN ('offline', 'degraded') THEN now() ELSE last_failure_at END,
    last_success_at = CASE WHEN p_status = 'online' THEN now() ELSE last_success_at END,
    failure_count = CASE 
      WHEN p_status IN ('offline', 'degraded') THEN failure_count + 1 
      WHEN p_status = 'online' THEN 0
      ELSE failure_count 
    END,
    updated_at = now()
  WHERE source_name = p_source_name;
END;
$$;

-- Enable RLS
ALTER TABLE public.legislation_processing_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_source_status ENABLE ROW LEVEL SECURITY;

-- Policies: admins podem ler/escrever, anónimos podem ler estado das fontes
CREATE POLICY "Admins can manage processing failures"
  ON public.legislation_processing_failures
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read source status"
  ON public.external_source_status
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage source status"
  ON public.external_source_status
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Comentários
COMMENT ON TABLE public.legislation_processing_failures IS 'Regista falhas de processamento para evitar loops de retry infinitos';
COMMENT ON TABLE public.external_source_status IS 'Estado das fontes externas (DRE, EUR-Lex, Firecrawl) para bloquear processamento quando offline';