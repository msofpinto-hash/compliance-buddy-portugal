import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LegislationUpdate {
  title?: string;
  summary?: string;
  entity?: string;
  effective_date?: string;
}

interface ProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  current?: number;
  total?: number;
  item?: {
    id: string;
    number: string;
    success: boolean;
    updates?: LegislationUpdate;
    error?: string;
  };
  summary?: {
    fixed: number;
    failed: number;
    processed: number;
  };
  error?: string;
}

function sendSSE(controller: ReadableStreamDefaultController<Uint8Array>, event: ProgressEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  controller.enqueue(new TextEncoder().encode(data));
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<any> {
  console.log('Scraping URL:', url);
  
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      });
      
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Attempt ${attempt} failed with status ${response.status}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`Firecrawl error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Attempt ${attempt} failed: ${error}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to scrape after retries');
}

// ========== VALIDATION HELPERS ==========
const INVALID_ENTITIES = [
  'pesquisar', 'search', 'buscar', 'procurar', 
  'menu', 'nav', 'navigation', 'header', 'footer',
  'login', 'entrar', 'registar', 'cookies',
  'aceitar', 'recusar', 'fechar', 'close',
  'undefined', 'null', ''
];

const INVALID_TITLE_PREFIXES = [
  'diário da república',
  '# diário',
  'série i',
  'série ii',
  'emissor',
  'pesquisar',
  'menu',
  'navigation',
  'cookies',
  'diploma referenciado'
];

function isValidEntity(entity: string | null | undefined): boolean {
  if (!entity) return false;
  const lower = entity.toLowerCase().trim();
  if (lower.length < 3 || lower.length > 300) return false;
  if (INVALID_ENTITIES.some(inv => lower === inv || lower.startsWith(inv + ' '))) return false;
  if (entity.includes('http') || entity.includes('www.')) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(entity)) return false;
  return true;
}

function isValidTitle(title: string | null | undefined, currentNumber: string): boolean {
  if (!title) return false;
  const lower = title.toLowerCase().trim();
  if (lower.length < 15) return false;
  if (INVALID_TITLE_PREFIXES.some(prefix => lower.startsWith(prefix))) return false;
  if (title.includes('http') || title.includes('www.')) return false;
  if (title.trim() === currentNumber.trim()) return false;
  if (lower.includes('enviar por email') || lower.includes('copiar link')) return false;
  if (lower.includes('facebook') || lower.includes('linkedin') || lower.includes('twitter')) return false;
  return true;
}

function isValidSummary(summary: string | null | undefined): boolean {
  if (!summary) return false;
  const trimmed = summary.trim();
  if (trimmed.length < 20) return false;
  if (trimmed.toLowerCase().includes('lamentamos')) return false;
  if (trimmed.toLowerCase().includes('página não encontrada')) return false;
  if (/^(menu|nav|header|footer|cookies|aceitar|recusar)/i.test(trimmed)) return false;
  return true;
}

function extractMetadataFromDRE(markdown: string, currentNumber: string): LegislationUpdate {
  const update: LegislationUpdate = {};
  
  const cleanMarkdown = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n');
  
  // ========== EXTRACT SUMMARY ==========
  const summaryPatterns = [
    /Sum[áa]rio[:\s]*\n?\s*([^\n].+?)(?=\n\s*(?:Texto|Data\s+de|Publicação|Série|Emissor|Entidade|Diploma|Versão|PDF|$))/is,
    /Sum[áa]rio[:\s]+([^\n]{20,})/i,
  ];
  
  for (const pattern of summaryPatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match && match[1]) {
      let summary = match[1].trim().replace(/\s+/g, ' ');
      summary = summary.replace(/\s*(Texto|PDF|Partilhar|Versão).*$/i, '').trim();
      
      if (isValidSummary(summary)) {
        update.summary = summary.substring(0, 2000);
        break;
      }
    }
  }
  
  // ========== EXTRACT TITLE ==========
  if (update.summary && update.summary.length > 30) {
    const titleCandidate = `${currentNumber.split(' de ')[0]} - ${update.summary.substring(0, 150)}${update.summary.length > 150 ? '...' : ''}`;
    if (isValidTitle(titleCandidate, currentNumber)) {
      update.title = titleCandidate;
    }
  }
  
  // ========== EXTRACT ENTITY/EMISSOR ==========
  const entityPatterns = [
    /Emissor[:\s]*\n?\s*([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][^\n]{3,100})/i,
    /Entidade[:\s]*\n?\s*([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][^\n]{3,100})/i,
    /(Ministério\s+d[aoe]\s+[^\n]+)/i,
    /(Presidência\s+d[ao]\s+[^\n]+)/i,
  ];
  
  for (const pattern of entityPatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match && match[1]) {
      const entity = match[1].trim().replace(/\s+/g, ' ');
      if (isValidEntity(entity)) {
        update.entity = entity.substring(0, 200);
        break;
      }
    }
  }
  
  const effectiveDatePatterns = [
    /(?:entra(?:da)?\s+em\s+vigor|vigência|vigor\s+a\s+partir\s+de)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i,
    /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})(?:\s*[,.]\s*(?:entra|vigor|vigência))/i,
  ];
  
  for (const pattern of effectiveDatePatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match) {
      try {
        let dateStr: string;
        if (match[2]) {
          const monthMap: Record<string, string> = {
            'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
            'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
            'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
          };
          dateStr = `${match[3]}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
        } else {
          const parts = match[1].split(/[-/]/);
          if (parts.length === 3) {
            dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else {
            continue;
          }
        }
        update.effective_date = dateStr;
        break;
      } catch {
        continue;
      }
    }
  }
  
  return update;
}

async function searchDREForLink(number: string, firecrawlKey: string): Promise<string | null> {
  try {
    const searchUrl = `https://diariodarepublica.pt/dr/pesquisa/-/search/basic?q=${encodeURIComponent(number)}`;
    
    console.log(`Searching DRE for: ${number}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['links'],
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.log(`Search scrape failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const links = data.data?.links || data.links || [];
    
    for (const link of links) {
      if (link.includes('/dr/detalhe/') && !link.includes('/pesquisa/')) {
        console.log(`Found DRE link: ${link}`);
        return link;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error searching DRE: ${error}`);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 20, dryRun = false, stream = false } = await req.json().catch(() => ({}));
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get legislation with generic titles (PT origin only - EU uses EUR-Lex)
    const { data: legislation, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, summary, entity, document_url, origin')
      .or('origin.eq.PT,origin.eq.dre')
      .limit(1000);
    
    if (fetchError) {
      throw fetchError;
    }
    
    const genericPattern = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Diretiva|Decisão|Declaração|Acórdão|Aviso|Parecer)/i;
    
    // Filter to PT legislation with generic titles and has document_url
    const toProcess = (legislation || [])
      .filter(leg => {
        // Skip if no origin or not PT
        if (!leg.origin || !['PT', 'dre'].includes(leg.origin)) return false;
        
        // Has generic title (title equals number or matches pattern without description)
        const titleEqualsNumber = leg.title === leg.number;
        const hasGenericPattern = genericPattern.test(leg.title) && 
          leg.title.length < 80 && 
          !leg.title.includes(' - ');
        
        // Must have a document_url to scrape from
        const hasUrl = leg.document_url && leg.document_url.includes('/dr/detalhe/');
        
        return (titleEqualsNumber || hasGenericPattern) && hasUrl;
      })
      .slice(0, limit);
    
    console.log(`Found ${toProcess.length} items with generic titles to process`);
    
    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No generic titles found', fixed: 0, failed: 0, details: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If streaming is requested, return SSE stream
    if (stream) {
      const readableStream = new ReadableStream({
        async start(controller) {
          let fixed = 0;
          let failed = 0;

          // Send start event
          sendSSE(controller, { 
            type: 'start', 
            total: toProcess.length 
          });

          for (let i = 0; i < toProcess.length; i++) {
            const leg = toProcess[i];
            
            try {
              let dreUrl = leg.document_url;
              
              if (!dreUrl || dreUrl.includes('/pesquisa/') || !dreUrl.includes('/dr/detalhe/')) {
                console.log(`Searching for direct DRE link for ${leg.number}...`);
                dreUrl = await searchDREForLink(leg.number, firecrawlKey);
                
                if (!dreUrl) {
                  console.log(`Could not find DRE link for ${leg.number}`);
                  failed++;
                  sendSSE(controller, {
                    type: 'progress',
                    current: i + 1,
                    total: toProcess.length,
                    item: { id: leg.id, number: leg.number, success: false, error: 'No DRE link found' }
                  });
                  continue;
                }
              }
              
              console.log(`Scraping ${leg.number} from ${dreUrl}...`);
              
              const scrapeResult = await scrapeWithFirecrawl(dreUrl, firecrawlKey);
              
              if (!scrapeResult.success || !scrapeResult.data?.markdown) {
                console.log(`Failed to scrape ${leg.number}`);
                failed++;
                sendSSE(controller, {
                  type: 'progress',
                  current: i + 1,
                  total: toProcess.length,
                  item: { id: leg.id, number: leg.number, success: false, error: 'Scrape failed' }
                });
                continue;
              }
              
              const updates = extractMetadataFromDRE(scrapeResult.data.markdown, leg.number);
              
              const finalUpdates: Record<string, any> = {};
              
              if (updates.title && updates.title !== leg.title) {
                finalUpdates.title = updates.title;
              }
              if (updates.summary && (!leg.summary || leg.summary.length < 20)) {
                finalUpdates.summary = updates.summary;
              }
              if (updates.entity && !leg.entity) {
                finalUpdates.entity = updates.entity;
              }
              if (dreUrl && dreUrl !== leg.document_url) {
                finalUpdates.document_url = dreUrl;
              }
              
              if (Object.keys(finalUpdates).length > 0) {
                if (dryRun) {
                  console.log(`[DRY RUN] Would update ${leg.number}:`, finalUpdates);
                  fixed++;
                  sendSSE(controller, {
                    type: 'progress',
                    current: i + 1,
                    total: toProcess.length,
                    item: { id: leg.id, number: leg.number, success: true, updates: finalUpdates as LegislationUpdate }
                  });
                } else {
                  finalUpdates.updated_at = new Date().toISOString();
                  
                  const { error: updateError } = await supabase
                    .from('legislation')
                    .update(finalUpdates)
                    .eq('id', leg.id);
                  
                  if (updateError) {
                    throw updateError;
                  }
                  
                  console.log(`Updated ${leg.number}:`, Object.keys(finalUpdates));
                  fixed++;
                  sendSSE(controller, {
                    type: 'progress',
                    current: i + 1,
                    total: toProcess.length,
                    item: { id: leg.id, number: leg.number, success: true, updates: finalUpdates as LegislationUpdate }
                  });
                }
              } else {
                console.log(`No useful updates found for ${leg.number}`);
                failed++;
                sendSSE(controller, {
                  type: 'progress',
                  current: i + 1,
                  total: toProcess.length,
                  item: { id: leg.id, number: leg.number, success: false, error: 'No updates extracted' }
                });
              }
              
              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, 1000));
              
            } catch (error) {
              console.error(`Error processing ${leg.number}:`, error);
              failed++;
              sendSSE(controller, {
                type: 'progress',
                current: i + 1,
                total: toProcess.length,
                item: { id: leg.id, number: leg.number, success: false, error: String(error) }
              });
            }
          }

          // Send complete event
          sendSSE(controller, {
            type: 'complete',
            summary: { fixed, failed, processed: toProcess.length }
          });

          controller.close();
        }
      });

      return new Response(readableStream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

    // Non-streaming mode (original behavior)
    const results: { id: string; number: string; success: boolean; updates?: LegislationUpdate; error?: string }[] = [];
    let fixed = 0;
    let failed = 0;
    
    for (const leg of toProcess) {
      try {
        let dreUrl = leg.document_url;
        
        if (!dreUrl || dreUrl.includes('/pesquisa/') || !dreUrl.includes('/dr/detalhe/')) {
          console.log(`Searching for direct DRE link for ${leg.number}...`);
          dreUrl = await searchDREForLink(leg.number, firecrawlKey);
          
          if (!dreUrl) {
            console.log(`Could not find DRE link for ${leg.number}`);
            results.push({ id: leg.id, number: leg.number, success: false, error: 'No DRE link found' });
            failed++;
            continue;
          }
        }
        
        console.log(`Scraping ${leg.number} from ${dreUrl}...`);
        
        const scrapeResult = await scrapeWithFirecrawl(dreUrl, firecrawlKey);
        
        if (!scrapeResult.success || !scrapeResult.data?.markdown) {
          console.log(`Failed to scrape ${leg.number}`);
          results.push({ id: leg.id, number: leg.number, success: false, error: 'Scrape failed' });
          failed++;
          continue;
        }
        
        const updates = extractMetadataFromDRE(scrapeResult.data.markdown, leg.number);
        
        const finalUpdates: Record<string, any> = {};
        
        if (updates.title && updates.title !== leg.title) {
          finalUpdates.title = updates.title;
        }
        if (updates.summary && (!leg.summary || leg.summary.length < 20)) {
          finalUpdates.summary = updates.summary;
        }
        if (updates.entity && !leg.entity) {
          finalUpdates.entity = updates.entity;
        }
        if (dreUrl && dreUrl !== leg.document_url) {
          finalUpdates.document_url = dreUrl;
        }
        
        if (Object.keys(finalUpdates).length > 0) {
          if (dryRun) {
            console.log(`[DRY RUN] Would update ${leg.number}:`, finalUpdates);
            results.push({ id: leg.id, number: leg.number, success: true, updates: finalUpdates as LegislationUpdate });
          } else {
            finalUpdates.updated_at = new Date().toISOString();
            
            const { error: updateError } = await supabase
              .from('legislation')
              .update(finalUpdates)
              .eq('id', leg.id);
            
            if (updateError) {
              throw updateError;
            }
            
            console.log(`Updated ${leg.number}:`, Object.keys(finalUpdates));
            results.push({ id: leg.id, number: leg.number, success: true, updates: finalUpdates as LegislationUpdate });
          }
          fixed++;
        } else {
          console.log(`No useful updates found for ${leg.number}`);
          results.push({ id: leg.id, number: leg.number, success: false, error: 'No updates extracted' });
          failed++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({ id: leg.id, number: leg.number, success: false, error: String(error) });
        failed++;
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: dryRun ? `Dry run: ${fixed} would be fixed` : `Fixed ${fixed} titles`,
        processed: toProcess.length,
        fixed,
        failed,
        details: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
