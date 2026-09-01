# Roadmap — Importação AMCOR FLEXIBLES PORTO

Organização alvo: AMCOR FLEXIBLES PORTO (`92a5d692-18d4-401c-b7cd-9fd211cfbb6d`)

## Tarefas
- [ ] Extrair texto integral do PDF "Relatório Legislação" (538 pág.) — lista de diplomas + requisitos por descritor/tema
- [ ] Extrair texto integral do PDF da última auditoria/ACL (314 pág., data 2026-02-13)
- [ ] Parsear temas/descritores (ex.: Ambiente / Legislação Nacional / Geral / Diplomas Gerais)
- [ ] Mapear diplomas do PDF contra a tabela `legislation` (matching por número/data)
- [ ] Criar + enriquecer diplomas em falta (URL DRE/EUR-Lex, sumário, requisitos)
- [ ] Importar requisitos legais (blocos `RL`) para `legal_requirements`
- [ ] Associar diplomas à organização (`organization_legislation`) com aplicabilidade
- [ ] Importar estados de conformidade ACL para `applicabilities`
- [ ] Criar registo de auditoria (`audits` + `audit_requirements`) com a ACL de 2026-02-13
- [ ] Importar planos de ação (quando fornecidos)
- [ ] Relatório final: importados / criados / por resolver
