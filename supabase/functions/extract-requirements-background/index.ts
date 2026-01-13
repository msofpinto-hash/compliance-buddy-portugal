import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Requirement {
  article: string;
  requirement_text: string;
  notes?: string;
}

// Regex to detect malformed articles containing diploma type keywords
const MALFORMED_ARTICLE_PATTERNS = [
  /\bDespacho\b/i,
  /\bPortaria\b/i,
  /\bDecreto\b/i,
  /\bRegulamento\b/i,
  /\bLei\s+n/i,
  /\bDiretiva\b/i,
  /\bDecisão\b/i,
  /\bDeclaração\b/i,
];

// Function to validate and clean article field
function cleanArticle(article: string | undefined | null, legislationNumber: string): string {
  if (!article) return 'Geral';
  
  const trimmed = article.trim();
  
  // Check if article contains diploma-type keywords (malformed)
  const isMalformed = MALFORMED_ARTICLE_PATTERNS.some(pattern => pattern.test(trimmed));
  
  if (isMalformed) {
    // Try to extract just the article part if it exists (e.g., "Despacho n.º 123, Art. 2º" -> "Art. 2º")
    const articleMatch = trimmed.match(/\b(Art(?:igo)?\.?\s*\d+[ºª]?(?:\s*,?\s*n\.?\s*º?\s*\d+)?)/i);
    if (articleMatch) {
      return articleMatch[1].substring(0, 50);
    }
    
    // Check for Anexo pattern
    const anexoMatch = trimmed.match(/\b(Anexo\s+[IVX\d]+)/i);
    if (anexoMatch) {
      return anexoMatch[1].substring(0, 50);
    }
    
    // If no valid article pattern found, return 'Geral'
    console.log(`Cleaned malformed article for ${legislationNumber}: "${trimmed}" -> "Geral"`);
    return 'Geral';
  }
  
  return trimmed.substring(0, 50);
}

// Use Lovable AI gateway - no external API key required
const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Scrape URL using Firecrawl
async function scrapeUrl(url: string, firecrawlApiKey: string): Promise<{ markdown: string; html: string } | null> {
  try {
    console.log('🔍 Scraping URL:', url);
    
    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.error('Firecrawl error:', response.status);
      return null;
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    console.log(`✅ Scraped ${markdown.length} chars from URL`);
    
    return {
      markdown,
      html: data.data?.html || data.html || '',
    };
  } catch (error) {
    console.error('Scrape error:', error);
    return null;
  }
}

// Check for error pages
function isErrorPage(content: string): boolean {
  const errorPatterns = [
    'The requested document does not exist',
    'Access denied',
    'Page not found',
    'página que acedeu não se encontra disponível',
    'Document not available',
    '404',
  ];
  
  // Check for error patterns or very short content
  if (content.length < 300) return true;
  return errorPatterns.some(pattern => content.toLowerCase().includes(pattern.toLowerCase()));
}

// Background extraction function
async function runBackgroundExtraction(
  supabase: any,
  lovableApiKey: string,
  userId: string | null,
  options: { 
    batchSize: number; 
    maxBatches: number; 
    origin?: string;
    useUrl?: boolean;
    firecrawlApiKey?: string;
  }
) {
  const { batchSize, maxBatches, origin, useUrl, firecrawlApiKey } = options;
  
  console.log(`🚀 Starting extraction with useUrl=${useUrl}, origin=${origin || 'all'}`);
  
  // Create a sync log entry to track progress
  const originLabel = origin === 'PT' ? 'PT' : origin === 'EU' ? 'EU' : 'Todos';
  const { data: logEntry, error: logError } = await supabase
    .from('sync_logs')
    .insert({
      sync_type: 'background-requirements-extraction',
      status: 'running',
      created_by: userId,
      items_processed: 0,
      items_added: 0,
      error_message: `Origem: ${originLabel}`,
    })
    .select()
    .single();

  if (logError) {
    console.error('Failed to create log entry:', logError);
    return;
  }

  const logId = logEntry.id;
  let totalProcessed = 0;
  let totalRequirements = 0;
  let batchesCompleted = 0;
  let urlScrapedCount = 0;
  let summaryFallbackCount = 0;

  try {
    while (batchesCompleted < maxBatches) {
      // Get ALL legislation IDs with requirements (paginated to avoid 1000 row limit)
      const idsWithReqs = new Set<string>();
      let page = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data: existingReqs, error: reqsError } = await supabase
          .from('legal_requirements')
          .select('legislation_id')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (reqsError) {
          console.error('Error fetching requirements:', reqsError);
          break;
        }
        
        if (!existingReqs || existingReqs.length === 0) break;
        
        existingReqs.forEach((r: any) => idsWithReqs.add(r.legislation_id));
        
        if (existingReqs.length < pageSize) break;
        page++;
      }
      
      console.log(`📊 Found ${idsWithReqs.size} legislation IDs with existing requirements`);
      
      // Build query with optional origin filter
      let query = supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin')
        .order('publication_date', { ascending: false });
      
      const originUpper = origin?.toUpperCase();
      if (originUpper === 'PT') {
        query = query.or('origin.eq.PT,origin.eq.dre,origin.is.null');
      } else if (originUpper === 'EU') {
        query = query.or('origin.eq.EU,origin.eq.eurlex');
      }
      
      const { data: allLegislation } = await query;
      
      const legislationWithoutReqs = allLegislation?.filter((l: any) => !idsWithReqs.has(l.id)) || [];
      const legislationToProcess = legislationWithoutReqs.slice(0, batchSize);
      
      console.log(`📋 ${origin || 'ALL'}: ${allLegislation?.length || 0} total, ${legislationWithoutReqs.length} without reqs, processing ${legislationToProcess.length}`);

      if (legislationToProcess.length === 0) {
        console.log('All legislation processed, stopping background extraction');
        break;
      }

      console.log(`📦 Batch ${batchesCompleted + 1}: processing ${legislationToProcess.length} items in parallel`);

      // Process in parallel chunks of 5 for much faster throughput
      const PARALLEL_CHUNK_SIZE = 5;
      
      for (let i = 0; i < legislationToProcess.length; i += PARALLEL_CHUNK_SIZE) {
        const chunk = legislationToProcess.slice(i, i + PARALLEL_CHUNK_SIZE);
        
        const results = await Promise.allSettled(chunk.map(async (leg: { id: string; number: string; title: string; summary: string | null; document_url: string | null; origin: string | null }) => {
          try {
            let textContent = '';
            let usedUrl = false;
            
            // Try to scrape URL if enabled and available
            if (useUrl && firecrawlApiKey && leg.document_url) {
              const scraped = await scrapeUrl(leg.document_url, firecrawlApiKey);
              
              if (scraped && scraped.markdown && !isErrorPage(scraped.markdown)) {
                textContent = scraped.markdown;
                usedUrl = true;
                console.log(`📄 ${leg.number}: Using scraped content (${textContent.length} chars)`);
              } else {
                console.log(`⚠️ ${leg.number}: Scrape failed or error page, falling back to summary`);
              }
            }
            
            // Build prompt based on available content AND origin
            let prompt: string;
            let useAdvancedModel = false;
            const isEU = leg.origin === 'EU' || leg.origin === 'eurlex' || 
                         leg.number?.toLowerCase().includes('regulamento') ||
                         leg.number?.toLowerCase().includes('diretiva') ||
                         leg.number?.toLowerCase().includes('decisão');
            
            if (textContent) {
              // Full text extraction - more comprehensive
              const truncatedText = textContent.length > 15000 ? textContent.substring(0, 15000) + '...' : textContent;
              useAdvancedModel = true;
              
              if (isEU) {
                // EU LEGISLATION - artigos, anexos OU texto corrido
                prompt = `Analisa o seguinte diploma EUROPEU e extrai os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
${leg.summary ? `SUMÁRIO: ${leg.summary}` : ''}

TEXTO COMPLETO DO DIPLOMA:
${truncatedText}

INSTRUÇÕES CRÍTICAS:
1. IGNORA TODO O TEXTO antes do primeiro "Artigo" (preâmbulo, considerandos, vistos, etc.)

2. SE O DIPLOMA TEM ARTIGOS (Artigo 1.º, Artigo 2.º, etc.):
   - Começa a extrair APENAS a partir do "Artigo 1.º" ou equivalente
   - Para cada ARTIGO encontrado, copia o texto INTEGRAL (incluindo todos os números e alíneas)
   - Se existirem ANEXOS, extrai também o seu conteúdo principal
   - article: "Artigo 1.º", "Artigo 2.º", "Anexo I", "Anexo II", etc.

3. SE O DIPLOMA NÃO TEM ARTIGOS (ex: Comunicações, Avisos, Pareceres, Resoluções simples):
   - Ignora o sumário/introdução
   - Copia o TEXTO CORRIDO integral do corpo do diploma
   - Divide em partes lógicas se o texto for muito longo
   - article: "Corpo", "Parte 1", "Parte 2", "Anexo", etc.

FORMATO:
- article: identificador do bloco de texto
- requirement_text: TEXTO INTEGRAL em PORTUGUÊS (máx 2000 caracteres)
- notes: contexto breve se necessário (opcional)

Retorna APENAS um array JSON válido:
[{"article": "Artigo 1.º", "requirement_text": "1 - O presente regulamento estabelece... 2 - Para efeitos do disposto...", "notes": "Objeto e âmbito"}]`;
              } else {
                // PT LEGISLATION - artigos, anexos OU texto corrido
                prompt = `Analisa o seguinte diploma PORTUGUÊS e extrai os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
${leg.summary ? `SUMÁRIO: ${leg.summary}` : ''}

TEXTO COMPLETO DO DIPLOMA:
${truncatedText}

INSTRUÇÕES CRÍTICAS:
1. IGNORA TODO O TEXTO antes do primeiro "Artigo" (preâmbulo, vistos, considerandos, etc.)

2. SE O DIPLOMA TEM ARTIGOS (Art. 1.º, Art. 2.º, Artigo 1.º, etc.):
   - Começa a extrair APENAS a partir do primeiro artigo
   - Para cada ARTIGO encontrado, copia o texto INTEGRAL (incluindo todos os números e alíneas)
   - Se existirem ANEXOS, extrai também o seu conteúdo principal
   - article: "Art. 1.º", "Art. 2.º", "Anexo I", "Anexo II", etc.

3. SE O DIPLOMA NÃO TEM ARTIGOS (ex: Despachos, Avisos, Pareceres, Anúncios, Declarações):
   - Ignora o sumário/introdução
   - Copia o TEXTO CORRIDO integral do corpo do diploma
   - Divide em partes lógicas se o texto for muito longo
   - article: "Corpo", "Parte 1", "Parte 2", "Anexo", etc.

FORMATO:
- article: identificador do bloco de texto
- requirement_text: TEXTO INTEGRAL do artigo ou bloco (máx 2000 caracteres)
- notes: contexto breve se necessário (opcional)

Retorna APENAS um array JSON válido:
[{"article": "Art. 1.º", "requirement_text": "1 - O presente decreto-lei estabelece... 2 - Para efeitos do disposto...", "notes": "Objeto"}]`;
              }
            } else {
              // Summary-based extraction - USE ADVANCED MODEL to compensate for lack of full text
              useAdvancedModel = true;
              
              if (isEU) {
                // EU SUMMARY-BASED
                prompt = `És um especialista em legislação EUROPEIA. Com base no título e sumário deste diploma, infere os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
SUMÁRIO: ${leg.summary || 'Não disponível'}
${leg.document_url ? `URL: ${leg.document_url}` : ''}

INSTRUÇÕES:
1. SE O DIPLOMA TEM ARTIGOS (Regulamentos, Diretivas, Decisões com articulado):
   - Infere os artigos prováveis (Artigo 1.º, Artigo 2.º, etc.)
   - article: "Artigo 1.º", "Artigo 2.º", "Anexo I", etc.

2. SE O DIPLOMA NÃO TEM ARTIGOS (Comunicações, Avisos, Pareceres, Recomendações):
   - Infere o conteúdo principal do corpo do texto
   - article: "Corpo", "Parte 1", "Conclusões", etc.

FORMATO:
- article: identificador do bloco
- requirement_text: texto provável em PORTUGUÊS (máx 1000 caracteres)
- notes: contexto breve (opcional)

Extrai entre 3 e 8 blocos.

Retorna APENAS um array JSON válido:
[{"article": "Artigo 1.º", "requirement_text": "O presente regulamento estabelece...", "notes": "Objeto"}]`;
              } else {
                // PT SUMMARY-BASED
                prompt = `És um especialista em legislação PORTUGUESA. Com base no título e sumário deste diploma, infere os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
SUMÁRIO: ${leg.summary || 'Não disponível'}
${leg.document_url ? `URL: ${leg.document_url}` : ''}

INSTRUÇÕES:
1. SE O DIPLOMA TEM ARTIGOS (Leis, Decretos-Lei, Portarias com articulado):
   - Infere os artigos prováveis (Art. 1.º, Art. 2.º, etc.)
   - article: "Art. 1.º", "Art. 2.º", "Anexo I", etc.

2. SE O DIPLOMA NÃO TEM ARTIGOS (Despachos, Avisos, Pareceres, Anúncios, Declarações):
   - Infere o conteúdo principal do corpo do texto
   - article: "Corpo", "Parte 1", "Conclusões", etc.

FORMATO:
- article: identificador do bloco
- requirement_text: texto provável em PORTUGUÊS (máx 1000 caracteres)
- notes: contexto breve (opcional)

Extrai entre 3 e 8 blocos.

Retorna APENAS um array JSON válido:
[{"article": "Art. 1.º", "requirement_text": "O presente decreto-lei estabelece...", "notes": "Objeto"}]`;
              }
            }

            const response = await fetch(AI_ENDPOINT, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lovableApiKey}`,
              },
              body: JSON.stringify({
                model: useAdvancedModel ? 'google/gemini-2.5-flash' : 'google/gemini-2.5-flash-lite',
                messages: [
                  { role: 'system', content: 'És um especialista em legislação portuguesa e europeia. Extrai requisitos legais de forma precisa e detalhada. Quando não tens o texto completo, infere requisitos prováveis com base no tipo de diploma e tema. Responde APENAS com JSON válido, sem markdown.' },
                  { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 4000,
              }),
            });

            if (!response.ok) {
              console.error(`AI API error for ${leg.number}:`, response.status);
              
              if (response.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 5000));
              } else if (response.status === 402) {
                console.error('Credits exhausted, stopping');
                throw new Error('Credits exhausted');
              }
              return { processed: false, usedUrl: false };
            }

            const aiData = await response.json();
            const content = aiData.choices?.[0]?.message?.content || '';
            
            let requirements: Requirement[] = [];
            try {
              let jsonContent = content.trim();
              if (jsonContent.startsWith('```json')) {
                jsonContent = jsonContent.replace(/^```json\s*\n?/, '').replace(/\n?\s*```$/, '');
              } else if (jsonContent.startsWith('```')) {
                jsonContent = jsonContent.replace(/^```\s*\n?/, '').replace(/\n?\s*```$/, '');
              }
              
              const arrayMatch = jsonContent.match(/\[[\s\S]*\]/);
              if (arrayMatch) {
                jsonContent = arrayMatch[0];
              }
              
              requirements = JSON.parse(jsonContent);
              
              if (!Array.isArray(requirements)) {
                requirements = [];
              }
              
              requirements = requirements
                .filter(r => r && typeof r === 'object' && r.requirement_text)
                .map(r => ({
                  article: cleanArticle(r.article, leg.number),
                  requirement_text: String(r.requirement_text).substring(0, 3000), // Increased for full article text
                  notes: r.notes ? String(r.notes).substring(0, 500) : undefined,
                }))
                .slice(0, 15); // Max 15 articles per legislation
                
            } catch (parseError) {
              console.error(`Parse error for ${leg.number}:`, parseError);
              return { processed: true, usedUrl, requirementsAdded: 0 };
            }

            let requirementsAdded = 0;
            if (requirements.length > 0) {
              // Check for existing requirements to avoid duplicates
              const { data: existingReqsForLeg } = await supabase
                .from('legal_requirements')
                .select('article, requirement_text')
                .eq('legislation_id', leg.id);

              const existingSet = new Set(
                (existingReqsForLeg || []).map((r: { article: string; requirement_text: string }) => `${r.article}::${r.requirement_text.substring(0, 100)}`)
              );

              // Filter out duplicates
              const newRequirements = requirements.filter(req => {
                const key = `${req.article}::${req.requirement_text.substring(0, 100)}`;
                return !existingSet.has(key);
              });

              if (newRequirements.length > 0) {
                const toInsert = newRequirements.map(req => ({
                  legislation_id: leg.id,
                  article: req.article,
                  requirement_text: req.requirement_text,
                  notes: req.notes || null,
                }));

                const { error: insertError } = await supabase
                  .from('legal_requirements')
                  .insert(toInsert);

                if (!insertError) {
                  requirementsAdded = newRequirements.length;
                  console.log(`✅ ${leg.number}: Inserted ${newRequirements.length} requirements (URL: ${usedUrl})`);
                }
              }
            }

            return { processed: true, usedUrl, requirementsAdded };

          } catch (error) {
            console.error(`Error processing ${leg.number}:`, error);
            if ((error as Error).message === 'Credits exhausted') {
              throw error;
            }
            return { processed: false, usedUrl: false };
          }
        }));

        // Aggregate results from parallel processing
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.processed) {
            totalProcessed++;
            totalRequirements += result.value.requirementsAdded || 0;
            if (result.value.usedUrl) {
              urlScrapedCount++;
            } else {
              summaryFallbackCount++;
            }
          }
        }
        
        // Check if any request was rate limited (429)
        const hasRateLimitError = results.some(
          r => r.status === 'rejected' && String(r.reason).includes('429')
        );
        
        // Reduced delay - 200ms between parallel chunks, 2s if rate limited
        const chunkDelay = hasRateLimitError ? 2000 : 200;
        await new Promise(resolve => setTimeout(resolve, chunkDelay));
      }

      batchesCompleted++;
      
      // Update progress in sync_logs
      await supabase
        .from('sync_logs')
        .update({
          items_processed: totalProcessed,
          items_added: totalRequirements,
          error_message: useUrl ? `URL: ${urlScrapedCount}, Sumário: ${summaryFallbackCount}` : null,
        })
        .eq('id', logId);

      console.log(`📊 Batch ${batchesCompleted}/${maxBatches} complete. Total: ${totalProcessed} processed, ${totalRequirements} reqs (URL: ${urlScrapedCount}, Summary: ${summaryFallbackCount})`);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Mark as completed
    await supabase
      .from('sync_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        items_processed: totalProcessed,
        items_added: totalRequirements,
        error_message: useUrl ? `✅ Concluído. URL: ${urlScrapedCount}, Sumário: ${summaryFallbackCount}` : null,
      })
      .eq('id', logId);

    console.log(`🎉 Background extraction completed: ${totalProcessed} processed, ${totalRequirements} requirements added (URL: ${urlScrapedCount}, Summary: ${summaryFallbackCount})`);

  } catch (error) {
    console.error('Background extraction error:', error);
    
    await supabase
      .from('sync_logs')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
        items_processed: totalProcessed,
        items_added: totalRequirements,
      })
      .eq('id', logId);
  }
}

// Helper function to check concurrency
async function checkConcurrency(supabase: any, syncType: string, maxAgeMinutes: number = 30): Promise<{ canProceed: boolean; runningJob?: any }> {
  // Mark old running jobs as timed out
  await supabase
    .from("sync_logs")
    .update({ 
      status: "completed_timeout", 
      completed_at: new Date().toISOString(),
      error_message: "Timeout automático após execução prolongada"
    })
    .eq("status", "running")
    .eq("sync_type", syncType)
    .lt("started_at", new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString());

  // Check for currently running jobs
  const { data: runningJobs } = await supabase
    .from("sync_logs")
    .select("id, started_at")
    .eq("sync_type", syncType)
    .eq("status", "running")
    .limit(1);

  if (runningJobs && runningJobs.length > 0) {
    return { canProceed: false, runningJob: runningJobs[0] };
  }

  return { canProceed: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SYNC_TYPE = 'background-requirements-extraction';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if this is an internal call with service role key
    const isServiceRoleCall = token === supabaseServiceKey;
    let userId: string | null = null;
    
    if (!isServiceRoleCall) {
      // Validate user JWT token
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized - invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = claimsData.claims.sub as string;

      // Only admins can extract requirements
      const { data: adminRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();

      if (!adminRole) {
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden - admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log('🔐 Internal service role call - bypassing user auth');
    }

    const { batchSize = 50, maxBatches = 20, origin, useUrl = false } = await req.json();

    // Validate useUrl - needs Firecrawl API key
    if (useUrl && !firecrawlApiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'useUrl requer o conector Firecrawl. Por favor ative em Definições → Conectores.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check concurrency - prevent multiple simultaneous runs
    const { canProceed, runningJob } = await checkConcurrency(supabase, SYNC_TYPE);
    if (!canProceed) {
      console.log(`⚠️ Job já em execução desde ${runningJob?.started_at}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Extração já em curso. Aguarde a conclusão ou verifique o painel de monitorização.",
          runningJobId: runningJob?.id,
          runningJobStartedAt: runningJob?.started_at,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Starting background extraction: batchSize=${batchSize}, maxBatches=${maxBatches}, origin=${origin || 'all'}, useUrl=${useUrl}`);

    // Start background task using Deno's EdgeRuntime
    // Use null for system calls since created_by expects UUID or null
    const createdBy = userId || null;
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      runBackgroundExtraction(supabase, lovableApiKey, createdBy, { 
        batchSize, 
        maxBatches, 
        origin,
        useUrl,
        firecrawlApiKey: useUrl ? firecrawlApiKey : undefined,
      })
    ) || runBackgroundExtraction(supabase, lovableApiKey, createdBy, { 
      batchSize, 
      maxBatches, 
      origin,
      useUrl,
      firecrawlApiKey: useUrl ? firecrawlApiKey : undefined,
    });

    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: useUrl 
          ? 'Extração com scraping de URLs iniciada em segundo plano.' 
          : 'Extração em segundo plano iniciada. Pode fechar esta janela.',
        trackingType: 'background-requirements-extraction',
        useUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error starting background extraction:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
