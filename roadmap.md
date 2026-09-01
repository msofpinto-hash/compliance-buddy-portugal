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
- [ ] Página de fontes oficiais: aprovar/rejeitar fontes com histórico e motivo
- [ ] Página de conformidade por cliente: estado de cada requisito + evidências (admin e cliente)
