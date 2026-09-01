# Roadmap

## Concluído — Importação lista exaustiva AMCOR (PDF SIAWISE)
- [x] Extrair todos os diplomas do PDF (523 páginas) com descritor/subdescritor e aplicabilidade
- [x] Importar/atualizar diplomas em falta na base de dados (3 inseridos)
- [x] Associar cada diploma ao descritor/subdescritor correto (taxonomia do relatório)
- [x] Definir aplicabilidade na AMCOR FLEXIBLES PORTO (662 aplicáveis, 6 informativos)
- [x] Eliminar da base de dados toda a legislação que não consta da lista (671 diplomas mantidos)
- [x] Manter apenas as relações entre diplomas que ficam
- [x] NÃO apagar descritores nem subdescritores (temas e categorias mantidos)
- [x] Exportação Excel passa a ler diretamente da base de dados (aplicáveis + requisitos por tema)
- [x] Biblioteca: aplicar aplicabilidade em massa aos diplomas do descritor/subdescritor selecionado
- [x] Extração de requisitos DRE via PDF oficial (sem Firecrawl)
- [x] Fusão de descritores Nacional/Comunitário num único descritor por nome

## Em curso — Gestão de temas/descritores e importação restante
- [x] Página /gestao-temas: escolher tema, confirmar descritores/subdescritores e associar automaticamente os diplomas ao cliente
- [x] Mover vários diplomas de um descritor para outro (multi-seleção)
- [x] Eliminar descritores/subdescritores (diplomas mantidos na biblioteca)
- [x] Retirar diplomas do cliente e corrigir aplicabilidades em massa
- [x] Importar página a página o restante da lista exaustiva (PDF SIAWISE), corrigindo quebras de página falhadas pelo parser (773 entradas, +198 diplomas novos)
- [x] Corrigir/validar URLs dos diplomas carregados (restam 5 sem link)
- [~] Importar requisitos via URL (jobs em curso em segundo plano)
- [ ] Gestão de temas: mover descritores/subdescritores entre temas (Ambiente <-> SST) quando o nome se repete
- [x] Biblioteca do cliente: mover descritores entre temas, renomear e eliminar descritores
- [x] Biblioteca do cliente: mover diplomas selecionados entre descritores e associar novos descritores
- [x] Biblioteca: painel de requisitos por descritor/tema (diploma, aplicabilidade AMCOR, estado da extração) com correção automática
- [~] Concluir extração dos diplomas pendentes (65 restantes, quase todos EU/EUR-Lex) — cron a correr a cada 2 min

## Em curso (2026-09-01)
- [x] Automatismo: diploma informativo -> requisitos informativos (trigger + backfill)
- [x] UI: refrescar requisitos após mudar aplicabilidade do diploma
- [x] Extração de relações dos diplomas (função extract-relations-from-text)
- [x] Eliminar diplomas duplicados (869 -> 839)
- [x] Corrigir adicionar relação por URL (validações + botão sempre clicável)
- [ ] Corrigir extração de requisitos por URL no diálogo do diploma (usar scraping real da URL)
