import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

// Use Lovable AI gateway
const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Thresholds to detect incomplete requirements
// Based on diploma type, we expect minimum articles
const INCOMPLETE_THRESHOLDS: Record<string, number> = {
  'decreto-lei': 10,
  'decreto regulamentar': 15,
  'lei': 8,
  'portaria': 5,
  'regulamento': 15,
  'diretiva': 10,
  'decisão': 5,
  'despacho': 2,
  'default': 5,
};

interface Legislation {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  document_url: string | null;
  origin: string | null;
  requirement_count: number;
}

interface Requirement {
  article: string;
  requirement_text: string;
  notes?: string;
}

// Regex to detect malformed articles
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

function cleanArticle(article: string | undefined | null, legislationNumber: string): string {
  if (!article) return 'Geral';
  
  const trimmed = article.trim();
  const isMalformed = MALFORMED_ARTICLE_PATTERNS.some(pattern => pattern.test(trimmed));
  
  if (isMalformed) {
    const articleMatch = trimmed.match(/\b(Art(?:igo)?\.?\s*\d+[ºª]?(?:\s*,?\s*n\.?\s*º?\s*\d+)?)/i);
    if (articleMatch) {
      return articleMatch[1].substring(0, 50);
    }
    const anexoMatch = trimmed.match(/\b(Anexo\s+[IVX\d]+)/i);
    if (anexoMatch) {
      return anexoMatch[1].substring(0, 50);
    }
    console.log(`Cleaned malformed article for ${legislationNumber}: "${trimmed}" -> "Geral"`);
    return 'Geral';
  }
  
  return trimmed.substring(0, 50);
}

function getExpectedMinRequirements(number: string): number {
  const lowerNumber = number.toLowerCase();
  
  for (const [type, min] of Object.entries(INCOMPLETE_THRESHOLDS)) {
    if (lowerNumber.includes(type)) {
      return min;
    }
  }
  
  // Specific case: "Decreto Regulamentar" should expect many more
  if (lowerNumber.includes('decreto regulamentar')) {
    return 50; // These often have 100+ articles in annexes
  }
  
  return INCOMPLETE_THRESHOLDS.default;
}

// Scrape URL using Firecrawl
async function scrapeUrl(url: string, firecrawlApiKey: string): Promise<string | null> {
  try {
    console.log('🔍 Scraping URL:', url);
    
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
        waitFor: 5000, // Longer wait for large documents
      }),
    });

    if (!response.ok) {
      console.error('Firecrawl error:', response.status);
      return null;
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    console.log(`✅ Scraped ${markdown.length} chars from URL`);
    
    return markdown;
  } catch (error) {
    console.error('Scrape error:', error);
    return null;
  }
}

function isErrorPage(content: string): boolean {
  const errorPatterns = [
    'The requested document does not exist',
    'Access denied',
    'Page not found',
    'página que acedeu não se encontra disponível',
    'Document not available',
    '404',
  ];
  
  if (content.length < 300) return true;
  return errorPatterns.some(pattern => content.toLowerCase().includes(pattern.toLowerCase()));
}

// Process a single legislation with full chunked extraction
async function processLegislation(
  supabase: any,
  leg: Legislation,
  lovableApiKey: string,
  firecrawlApiKey: string
): Promise<{ processed: boolean; requirementsAdded: number; error?: string }> {
  try {
    console.log(`📄 Processing ${leg.number} (current: ${leg.requirement_count} reqs)`);
    
    if (!leg.document_url) {
      console.log(`⚠️ ${leg.number}: No document_url, skipping`);
      return { processed: false, requirementsAdded: 0, error: 'No URL' };
    }
    
    // Scrape the full document
    const textContent = await scrapeUrl(leg.document_url, firecrawlApiKey);
    
    if (!textContent || isErrorPage(textContent)) {
      console.log(`⚠️ ${leg.number}: Scrape failed or error page`);
      return { processed: false, requirementsAdded: 0, error: 'Scrape failed' };
    }
    
    // For very large documents, split into chunks
    const MAX_CHUNK_SIZE = 30000;
    const textChunks: string[] = [];
    
    if (textContent.length > MAX_CHUNK_SIZE) {
      // Split by article markers
      const articleMarker = /(?=(?:Artigo|Art\.)\s+\d+)/gi;
      const parts = textContent.split(articleMarker).filter(p => p.trim());
      
      let currentChunk = '';
      for (const part of parts) {
        if ((currentChunk + part).length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
          textChunks.push(currentChunk);
          currentChunk = part;
        } else {
          currentChunk += part;
        }
      }
      if (currentChunk.trim()) {
        textChunks.push(currentChunk);
      }
      console.log(`📚 ${leg.number}: Large document (${textContent.length} chars) split into ${textChunks.length} chunks`);
    } else {
      textChunks.push(textContent);
    }
    
    const allRequirements: Requirement[] = [];
    const isEU = leg.origin === 'EU' || leg.origin === 'eurlex';
    
    for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
      const truncatedText = textChunks[chunkIndex];
      const chunkInfo = textChunks.length > 1 ? ` (parte ${chunkIndex + 1}/${textChunks.length})` : '';
      
      const prompt = isEU
        ? `Analisa o seguinte diploma EUROPEU${chunkInfo} e extrai TODOS os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
${leg.summary && chunkIndex === 0 ? `SUMÁRIO: ${leg.summary}` : ''}

TEXTO DO DIPLOMA${chunkInfo}:
${truncatedText}

INSTRUÇÕES CRÍTICAS:
1. IGNORA preâmbulos, considerandos, vistos - começa nos Artigos
2. Extrai CADA ARTIGO encontrado no texto com o seu texto INTEGRAL
3. Extrai também ANEXOS se existirem (cada secção do anexo é um requisito separado)
4. NÃO LIMITES o número de artigos - extrai ABSOLUTAMENTE TODOS
5. Para diplomas com anexos técnicos (regulamentos, tabelas), cria um requisito por secção

FORMATO:
- article: "Artigo 1.º", "Artigo 2.º", "Anexo I - Secção 1", etc.
- requirement_text: TEXTO INTEGRAL em PORTUGUÊS (máx 2500 caracteres por artigo)
- notes: contexto breve se necessário (opcional)

Retorna APENAS um array JSON válido com TODOS os artigos:
[{"article": "Artigo 1.º", "requirement_text": "1 - O presente regulamento estabelece...", "notes": "Objeto"}]`
        : `Analisa o seguinte diploma PORTUGUÊS${chunkInfo} e extrai TODOS os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
${leg.summary && chunkIndex === 0 ? `SUMÁRIO: ${leg.summary}` : ''}

TEXTO DO DIPLOMA${chunkInfo}:
${truncatedText}

INSTRUÇÕES CRÍTICAS:
1. IGNORA preâmbulos, vistos, considerandos - começa nos Artigos
2. Extrai CADA ARTIGO encontrado no texto com o seu texto INTEGRAL
3. Extrai também ANEXOS se existirem (cada secção do anexo é um requisito separado)
4. NÃO LIMITES o número de artigos - extrai ABSOLUTAMENTE TODOS
5. Para diplomas como Decretos Regulamentares (ex: 23/95 sobre águas), há centenas de artigos - extrai TODOS

FORMATO:
- article: "Art. 1.º", "Art. 2.º", "Anexo - Art. 1.º", etc.
- requirement_text: TEXTO INTEGRAL do artigo (máx 2500 caracteres por artigo)
- notes: contexto breve se necessário (opcional)

Retorna APENAS um array JSON válido com TODOS os artigos:
[{"article": "Art. 1.º", "requirement_text": "1 - O presente decreto-lei estabelece...", "notes": "Objeto"}]`;
      
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${lovableApiKey}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'És um especialista em legislação. Extrai ABSOLUTAMENTE TODOS os artigos/requisitos legais do texto. Para diplomas longos com anexos técnicos, podem existir centenas de artigos. NÃO LIMITES - extrai tudo. Responde APENAS com JSON válido.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 16000, // Higher limit for large documents
        }),
      });
      
      if (!response.ok) {
        console.error(`AI error for ${leg.number} chunk ${chunkIndex}:`, response.status);
        if (response.status === 429) {
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        continue;
      }
      
      const aiData = await response.json();
      const content = aiData.choices?.[0]?.message?.content || '';
      
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
        
        const chunkReqs = JSON.parse(jsonContent);
        if (Array.isArray(chunkReqs)) {
          const cleanedReqs = chunkReqs
            .filter((r: any) => r && typeof r === 'object' && r.requirement_text)
            .map((r: any) => ({
              article: cleanArticle(r.article, leg.number),
              requirement_text: String(r.requirement_text).substring(0, 3500),
              notes: r.notes ? String(r.notes).substring(0, 500) : undefined,
            }));
          allRequirements.push(...cleanedReqs);
          console.log(`📄 ${leg.number} chunk ${chunkIndex + 1}: extracted ${cleanedReqs.length} requirements`);
        }
      } catch (parseError) {
        console.error(`Parse error for ${leg.number} chunk ${chunkIndex}:`, parseError);
      }
      
      // Delay between chunks
      if (textChunks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    if (allRequirements.length === 0) {
      console.log(`⚠️ ${leg.number}: No requirements extracted`);
      return { processed: true, requirementsAdded: 0 };
    }
    
    // Delete existing requirements and insert new ones
    // This ensures we don't have duplicates and get fresh, complete data
    const { error: deleteError } = await supabase
      .from('legal_requirements')
      .delete()
      .eq('legislation_id', leg.id);
    
    if (deleteError) {
      console.error(`Delete error for ${leg.number}:`, deleteError);
      return { processed: false, requirementsAdded: 0, error: 'Delete failed' };
    }
    
    // Insert all new requirements
    const toInsert = allRequirements.map((req, index) => ({
      legislation_id: leg.id,
      article: req.article,
      requirement_text: req.requirement_text,
      notes: req.notes || null,
      display_order: index + 1,
    }));
    
    const { error: insertError } = await supabase
      .from('legal_requirements')
      .insert(toInsert);
    
    if (insertError) {
      console.error(`Insert error for ${leg.number}:`, insertError);
      return { processed: false, requirementsAdded: 0, error: 'Insert failed' };
    }
    
    console.log(`✅ ${leg.number}: Replaced ${leg.requirement_count} with ${allRequirements.length} requirements (${textChunks.length} chunks)`);
    return { processed: true, requirementsAdded: allRequirements.length };
    
  } catch (error) {
    console.error(`Error processing ${leg.number}:`, error);
    return { processed: false, requirementsAdded: 0, error: String(error) };
  }
}

// Main background processing function
async function runIncompletesFix(
  supabase: any,
  lovableApiKey: string,
  firecrawlApiKey: string,
  options: { batchSize: number; maxBatches: number; origin?: string; minRatio?: number }
) {
  const { batchSize, maxBatches, origin, minRatio = 0.3 } = options;
  
  console.log(`🚀 Starting incompletes fix: origin=${origin || 'all'}, minRatio=${minRatio}`);
  
  // Create sync log entry
  const originLabel = origin === 'PT' ? 'PT' : origin === 'EU' ? 'EU' : 'Todos';
  const { data: logEntry, error: logError } = await supabase
    .from('sync_logs')
    .insert({
      sync_type: 'fix-incomplete-requirements',
      status: 'running',
      items_processed: 0,
      items_added: 0,
      error_message: `Origem: ${originLabel}, corrigindo diplomas incompletos`,
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
  let skippedNoUrl = 0;
  let skippedScrapeFailed = 0;

  try {
    while (batchesCompleted < maxBatches) {
      // Find legislation with potentially incomplete requirements
      // We join with a count of requirements and filter by low counts
      let query = supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin');
      
      const originUpper = origin?.toUpperCase();
      if (originUpper === 'PT') {
        query = query.or('origin.eq.PT,origin.eq.dre,origin.is.null');
      } else if (originUpper === 'EU') {
        query = query.or('origin.eq.EU,origin.eq.eurlex');
      }
      
      // Only get legislation with document_url (we need to re-scrape)
      query = query.not('document_url', 'is', null);
      
      const { data: allLegislation, error: legError } = await query.order('publication_date', { ascending: false });
      
      if (legError) {
        console.error('Error fetching legislation:', legError);
        break;
      }
      
      if (!allLegislation || allLegislation.length === 0) {
        console.log('No legislation found');
        break;
      }
      
      // Get requirement counts for all legislation
      const legIds = allLegislation.map((l: any) => l.id);
      const { data: reqCounts } = await supabase
        .from('legal_requirements')
        .select('legislation_id')
        .in('legislation_id', legIds);
      
      const countMap = new Map<string, number>();
      if (reqCounts) {
        for (const r of reqCounts) {
          countMap.set(r.legislation_id, (countMap.get(r.legislation_id) || 0) + 1);
        }
      }
      
      // Find incomplete ones
      const incompleteLegislation: Legislation[] = [];
      for (const leg of allLegislation) {
        const count = countMap.get(leg.id) || 0;
        const expectedMin = getExpectedMinRequirements(leg.number);
        
        // Consider incomplete if:
        // 1. Has very few requirements (< 5)
        // 2. Has less than minRatio * expected minimum
        // 3. Specific case: Decreto Regulamentar with < 50 requirements
        const isIncomplete = 
          count < 5 ||
          count < expectedMin * minRatio ||
          (leg.number.toLowerCase().includes('decreto regulamentar') && count < 50);
        
        if (isIncomplete) {
          incompleteLegislation.push({
            ...leg,
            requirement_count: count,
          });
        }
      }
      
      // Sort by most incomplete first (lowest ratio)
      incompleteLegislation.sort((a, b) => {
        const ratioA = a.requirement_count / getExpectedMinRequirements(a.number);
        const ratioB = b.requirement_count / getExpectedMinRequirements(b.number);
        return ratioA - ratioB;
      });
      
      const toProcess = incompleteLegislation.slice(0, batchSize);
      
      console.log(`📋 Found ${incompleteLegislation.length} incomplete, processing ${toProcess.length}`);
      
      if (toProcess.length === 0) {
        console.log('✅ All legislation appears complete');
        break;
      }
      
      // Process one at a time (large documents need time)
      for (const leg of toProcess) {
        const result = await processLegislation(supabase, leg, lovableApiKey, firecrawlApiKey);
        
        if (result.processed) {
          totalProcessed++;
          totalRequirements += result.requirementsAdded;
        } else if (result.error === 'No URL') {
          skippedNoUrl++;
        } else if (result.error === 'Scrape failed') {
          skippedScrapeFailed++;
        }
        
        // Update progress
        await supabase
          .from('sync_logs')
          .update({
            items_processed: totalProcessed,
            items_added: totalRequirements,
            error_message: `Processados: ${totalProcessed}, Requisitos: ${totalRequirements}, Sem URL: ${skippedNoUrl}, Scrape falhou: ${skippedScrapeFailed}`,
          })
          .eq('id', logId);
        
        // Delay between documents
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      batchesCompleted++;
      console.log(`📊 Batch ${batchesCompleted}/${maxBatches}: ${totalProcessed} processed, ${totalRequirements} requirements`);
      
      // Check if we've run out of incomplete items
      if (toProcess.length < batchSize) {
        console.log('✅ Processed all incomplete legislation');
        break;
      }
    }
    
    // Mark as completed
    await supabase
      .from('sync_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        items_processed: totalProcessed,
        items_added: totalRequirements,
        error_message: `✅ Concluído. Corrigidos: ${totalProcessed}, Requisitos: ${totalRequirements}, Sem URL: ${skippedNoUrl}, Scrape falhou: ${skippedScrapeFailed}`,
      })
      .eq('id', logId);

    console.log(`🎉 Fix completed: ${totalProcessed} corrected, ${totalRequirements} requirements`);
    
  } catch (error) {
    console.error('Fix incompletes error:', error);
    
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

async function checkConcurrency(supabase: any, syncType: string, maxAgeMinutes: number = 60): Promise<{ canProceed: boolean; runningJob?: any }> {
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

  const SYNC_TYPE = 'fix-incomplete-requirements';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'FIRECRAWL_API_KEY não configurada. Ative o conector Firecrawl em Definições.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    
    const isServiceRoleCall = token === supabaseServiceKey;
    
    if (!isServiceRoleCall) {
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

      const userId = claimsData.claims.sub as string;

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
    }

    const { batchSize = 10, maxBatches = 100, origin, minRatio = 0.3 } = await req.json();

    // Check concurrency
    const { canProceed, runningJob } = await checkConcurrency(supabase, SYNC_TYPE);
    if (!canProceed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Correção já em curso. Aguarde a conclusão.",
          runningJobId: runningJob?.id,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Starting fix-incomplete-requirements: batchSize=${batchSize}, maxBatches=${maxBatches}, origin=${origin || 'all'}`);

    // Start background task
    // @ts-ignore
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      runIncompletesFix(supabase, lovableApiKey, firecrawlApiKey, { batchSize, maxBatches, origin, minRatio })
    ) || runIncompletesFix(supabase, lovableApiKey, firecrawlApiKey, { batchSize, maxBatches, origin, minRatio });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Correção de diplomas incompletos iniciada em segundo plano.',
        trackingType: SYNC_TYPE,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error starting fix:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
