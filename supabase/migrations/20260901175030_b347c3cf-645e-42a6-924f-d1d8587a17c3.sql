ALTER TABLE public.organization_goals
  ADD COLUMN IF NOT EXISTS auto_metric text;

INSERT INTO public.organization_goals
  (organization_id, title, description, area, unit, target_value, current_value, start_date, due_date, status, auto_metric)
SELECT o.id, v.title, v.description, v.area, '%', v.target, 0, date '2026-01-01', date '2026-12-31', 'em_curso', v.metric
FROM public.organizations o
CROSS JOIN (VALUES
  ('Conformidade legal global de 95%','Percentagem de requisitos legais aplicáveis avaliados como conformes.','Geral',95,'conformidade_requisitos'),
  ('Avaliação de 100% dos requisitos aplicáveis','Todos os requisitos legais aplicáveis devem ter estado de conformidade atribuído.','Geral',100,'requisitos_avaliados'),
  ('Encerrar 90% das ações do plano de ação','Percentagem de ações corretivas concluídas face ao total planeado.','Geral',90,'acoes_concluidas'),
  ('Zero ações em atraso','Percentagem de ações dentro do prazo definido.','Geral',100,'acoes_no_prazo'),
  ('12 verificações de conformidade legal mensais','Realizar e encerrar uma verificação mensal por mês ao longo do ano.','Geral',100,'verificacoes_mensais'),
  ('Responder a 100% dos pedidos de evidência','Pedidos de evidência submetidos ou aprovados dentro do prazo.','Geral',100,'evidencias_respondidas')
) AS v(title, description, area, target, metric)
WHERE o.name = 'AMCOR FLEXIBLES PORTO'
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_goals g
    WHERE g.organization_id = o.id AND g.auto_metric = v.metric
  );