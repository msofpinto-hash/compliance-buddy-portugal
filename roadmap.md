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
- [ ] Importar página a página o restante da lista exaustiva (PDF SIAWISE), corrigindo quebras de página falhadas pelo parser
- [ ] Corrigir/validar URLs de todos os diplomas carregados
- [ ] Importar requisitos via URL depois de os URLs estarem corrigidos
