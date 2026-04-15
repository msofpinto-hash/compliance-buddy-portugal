

## Extração de Requisitos EU - Continuação

### Estado Atual
- **833** diplomas EU já têm requisitos extraídos
- **1.068** diplomas EU ainda pendentes
- **0** jobs ativos — pipeline livre para novos lotes

### Plano de Execução

1. **Lançar lotes paralelos** da Edge Function `scrape-requirements-from-url` com `origin: "EU"` e `limit: 10` por lote (para respeitar timeouts)
2. **Executar 5 lotes em paralelo** para maximizar throughput (50 diplomas por ciclo)
3. **Repetir o processo** até cobrir os 1.068 pendentes ou até esgotar o tempo da sessão
4. **Monitorizar erros** — se houver falhas consecutivas (402/429), pausar automaticamente

### Detalhes Técnicos
- Usa o método `nativeScrape` (fetch direto) para EUR-Lex — sem custos de Firecrawl
- Cada invocação chama a IA (Gemini Flash) para extrair artigos do texto scrapeado
- Estimativa: ~5 diplomas/minuto → ~3.5 horas para os 1.068 restantes
- Serão lançados lotes iniciais agora; pode pedir mais rondas depois

