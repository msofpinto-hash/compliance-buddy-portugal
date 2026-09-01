# Roadmap — Importação AMCOR FLEXIBLES PORTO

Organização alvo: AMCOR FLEXIBLES PORTO (`92a5d692-18d4-401c-b7cd-9fd211cfbb6d`)
Auditoria ACL importada: `a43f1798-6f58-41c6-ae25-c856629c7534` (2026-02-13)

## Tarefas
- [x] Extrair texto integral do PDF "Relatório Legislação" (538 pág.)
- [x] Extrair texto integral do PDF da última auditoria/ACL (314 pág.)
- [x] Parsear temas/descritores (716 diplomas, 2.051 requisitos)
- [x] Mapear diplomas contra a tabela `legislation` (333 já existentes)
- [x] Criar diplomas em falta (383 criados, `source='amcor-import'`)
- [x] Importar requisitos legais (1.422 novos, 629 reutilizados)
- [x] Associar diplomas à organização (713 em `organization_legislation`)
- [x] Associar categorias/temas (459 mapeamentos, 3 temas)
- [x] Importar estados de conformidade ACL (670 avaliações)
- [x] Criar registo de auditoria ACL 2026-02-13 (`closed`)
- [x] Criar planos de ação (3 alta / 7 média)
- [ ] Enriquecimento automático dos 383 novos diplomas (URLs DRE/EUR-Lex + sumários) — a correr em background
- [ ] Categorização IA dos diplomas sem categoria — bloqueada por créditos do AI Gateway

## Redesign Dashboard (2026-09-01)
- [ ] Redesenhar /dashboard com tema de sustentabilidade, estética moderna e imagens de fundo

- [x] Alinhar cores da app com incredibleanddynamic.com (verde sage, terracota, creme)

## Fontes externas (2026-09-01)
- [x] Marcar dre.pt e EUR-Lex como fontes oficiais aprovadas (painel + extração)
- [x] Scan de segurança completo e correção das falhas remanescentes (edge functions autenticadas, gatilhos de âmbito, permissões de RPC)

## Novas páginas (2026-09-01)
- [x] Página de fontes oficiais: aprovar/rejeitar fontes com histórico e motivo
- [x] Página de conformidade por cliente: estado de cada requisito + evidências (admin e cliente)

## Metas e Indicadores (2026-09-01)
- [x] Imagens de fundo nos cabeçalhos dos módulos (igual ao Painel)
- [ ] Metas e indicadores no separador Indicadores: objetivos, prazos e progresso

## AMCOR — âmbito temático (2026-09-01)
- [ ] Limitar visibilidade aos temas Ambiente e SST para a AMCOR
- [ ] Corrigir dados (categorias, requisitos, relações) apenas nesses temas
- [x] Biblioteca: mostrar apenas os temas atribuídos à organização do cliente
- [ ] Automatismo: diploma classificado como 'informativo' ou 'não aplicável' propaga a classificação a todos os seus requisitos legais
- [ ] Correção contínua de requisitos e relações dos temas Ambiente e SST
- [ ] Evidências: importar catálogo de evidências habituais por diploma (ficheiros Pedidos - A / Pedidos - S)
- [x] Auditorias: submenus Plano de auditorias / Histórico, distinguir Auditoria anual de conformidade legal vs Verificação mensal, resultados ligados automaticamente ao Plano de Ação
- [x] Metas e indicadores: objetivos reais da AMCOR com progresso automático a partir de auditorias e planos de ação

## Anexos VCL mensal
- [x] Anexar listas, Excel e atas (PDF/XLSX) às verificações mensais 2026 da AMCOR
- [x] Excluir ficheiros Word dos anexos

## Auditorias
- [x] Substituir "Plano de auditorias" por calendário (semanal/mensal/anual) com datas planeadas vs executadas
- [x] Calendário com datas reais 2025/2026 (planeado = executado)
- [x] Importar documentação real da AMCOR para cada auditoria (substituir ficheiros de exemplo)

## Evidências (2026-09-01)
- [x] Criar pedidos de evidência reais para a AMCOR a partir dos ficheiros Pedidos - A / Pedidos - S
- [x] Página de evidências: lista por auditoria com evidências já atribuídas e em falta
- [x] Mostrar apenas temas Ambiente e SST na página de evidências
- [x] Melhorar layout da página de evidências (chips de tema, grupos com progresso)

## Evidências AMCOR (2026-09-01)
- [x] Consolidar pedidos por linha do ficheiro (41 pedidos, não divididos)
- [x] Associar diplomas (referências legais) a cada pedido
- [x] Atribuir descritores (grupos BDLEG) a partir dos PDFs de Ambiente e SST
- [ ] Admin escolhe que pedidos ficam visíveis ao cliente (auto por aplicabilidade direta/indireta)
- [ ] Corrigir corte lateral dos cartões de grupo de evidências
- [ ] Admin (mariana.pinto@incredibleanddynamic.com) atua como admin dentro da área de cada cliente; cliente só edita planos de ação e carrega evidências

## Evidências
- [x] Submissão com múltiplos ficheiros, comentários e datas de emissão/validade

## Admin edita tudo no portal do cliente
- [x] Aplicabilidade de diplomas/requisitos editável só por admin (cliente vê)
- [x] Conformidade: admin edita estado e notas
- [x] Calendário de auditorias: clicar no evento abre documentação (pré-visualizar/exportar)
- [x] Plano/informação da auditoria editável pelo admin no próprio diálogo

- [x] Forçar modo claro em toda a plataforma (modais, dropzone, overlays)
