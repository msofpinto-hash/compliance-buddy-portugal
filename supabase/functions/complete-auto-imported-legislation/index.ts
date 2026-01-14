import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LegislationUpdate {
  title?: string;
  summary?: string;
  entity?: string;
  document_url?: string;
  publication_date?: string;
  effective_date?: string;
  origin?: string;
}

interface ProcessResult {
  id: string;
  number: string;
  success: boolean;
  updates?: LegislationUpdate;
  error?: string;
}

// Extract type and number for DRE URL construction
function extractLegislationParts(number: string): { type: string; num: string; year: string } | null {
  const cleanNumber = number.trim();
  
  const patterns = [
    /^(Decreto-Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Portaria)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Despacho)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Resolução\s+do\s+Conselho\s+de\s+Ministros)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Resolução)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Declaração\s+de\s+Retificação)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Aviso)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Regulamento)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Acórdão\s+do\s+Tribunal\s+Constitucional)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Decreto\s+Regulamentar)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    /^(Decreto)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
  ];
  
  for (const pattern of patterns) {
    const match = cleanNumber.match(pattern);
    if (match) {
      return {
        type: match[1].toLowerCase().replace(/\s+/g, '-'),
        num: match[2],
        year: match[3]
      };
    }
  }
  
  return null;
}

// Search DRE for a legislation URL using Firecrawl
async function searchDREUrl(number: string, firecrawlKey: string): Promise<string | null> {
  try {
    const parts = extractLegislationParts(number);
    let searchQuery: string;
    
    if (parts) {
      searchQuery = `site:diariodarepublica.pt/dr/detalhe ${parts.type} ${parts.num}/${parts.year}`;
    } else {
      const cleanNumber = number.split(',')[0].trim();
      searchQuery = `site:diariodarepublica.pt/dr/detalhe "${cleanNumber}"`;
    }
    
    console.log(`Searching DRE: ${searchQuery}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 5,
      }),
    });
    
    if (!response.ok) {
      console.log(`Search failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const results = data.data || [];
    
    for (const result of results) {
      const url = result.url || '';
      if (url.includes('/dr/detalhe/') && url.includes('diariodarepublica.pt')) {
        console.log(`Found DRE URL: ${url}`);
        return url;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Search error: ${error}`);
    return null;
  }
}

// Scrape URL content using Firecrawl
async function scrapeUrl(url: string, firecrawlKey: string): Promise<string | null> {
  try {
    console.log('Scraping URL:', url);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.error('Scrape error:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.data?.markdown || data.markdown || null;
  } catch (error) {
    console.error('Scrape error:', error);
    return null;
  }
}

// Extract metadata from DRE page content
function extractMetadataFromDRE(markdown: string, currentNumber: string): LegislationUpdate {
  const update: LegislationUpdate = {};
  
  const cleanMarkdown = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, '\n');
  
  // Extract title
  const titlePatterns = [
    /Série [I]+.*?\n(.+?)(?:\n|Emissor)/s,
    /^(.+?)(?=\nEmissor:)/m,
  ];
  
  for (const pattern of titlePatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match && match[1]) {
      const potentialTitle = match[1].trim();
      if (potentialTitle.length > 20 && 
          !potentialTitle.includes('http') &&
          !potentialTitle.toLowerCase().startsWith('emissor') &&
          !potentialTitle.toLowerCase().startsWith('série') &&
          !potentialTitle.includes('Diploma referenciado')) {
        update.title = potentialTitle.substring(0, 500);
        break;
      }
    }
  }
  
  // Extract entity/emissor
  const entityMatch = cleanMarkdown.match(/Emissor[:\s]+([^\n]+)/i);
  if (entityMatch) {
    const entity = entityMatch[1].trim();
    if (entity && !entity.includes('http') && entity.length < 200) {
      update.entity = entity;
    }
  }
  
  // Extract summary
  const summaryMatch = cleanMarkdown.match(/Sum[áa]rio[:\s]*\n?([^\n]+(?:\n[^\n]+)*?)(?=\n(?:Texto|Data|Publicação|Série|$))/i);
  if (summaryMatch) {
    const summary = summaryMatch[1].trim();
    if (summary && summary.length > 10 && !summary.includes('Lamentamos')) {
      update.summary = summary.substring(0, 2000);
    }
  }
  
  // Extract publication date
  const pubDatePatterns = [
    /Data de Publicação[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /Publicação[:\s]+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
  ];
  
  for (const pattern of pubDatePatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match) {
      try {
        if (match[0].includes('-') && match[0].match(/\d{4}-\d{2}-\d{2}/)) {
          update.publication_date = match[1];
          break;
        } else if (match[2] && !isNaN(parseInt(match[2]))) {
          update.publication_date = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
          break;
        } else if (match[2]) {
          const monthMap: Record<string, string> = {
            'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
            'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
            'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
          };
          if (monthMap[match[2].toLowerCase()]) {
            update.publication_date = `${match[3]}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
            break;
          }
        }
      } catch {
        continue;
      }
    }
  }
  
  return update;
}

// Determine if legislation is EU based on number
function isEULegislation(number: string): boolean {
  const euPatterns = [
    /\(UE\)/i,
    /\(CE\)/i,
    /\(PESC\)/i,
    /Regulamento de Execução/i,
    /Diretiva \d+/i,
    /Decisão \d+/i,
    /UNECE/i,
    /^Regulamento.*\/UE/i,
    /^32\d{7}/,  // CELEX numbers
  ];
  return euPatterns.some(p => p.test(number));
}

// Extract CELEX number from EUR-Lex URL or legislation number
function extractCelexNumber(url: string | null, number: string): string | null {
  if (url) {
    const match = url.match(/CELEX:(\d+[A-Z]\d+)/);
    if (match) return match[1];
  }
  
  const regMatch = number.match(/Regulamento.*?(\d{4})\/(\d+)/i);
  if (regMatch) {
    return `3${regMatch[1]}R${regMatch[2].padStart(4, '0')}`;
  }
  
  const dirMatch = number.match(/Diretiva.*?(\d{4})\/(\d+)/i);
  if (dirMatch) {
    return `3${dirMatch[1]}L${dirMatch[2].padStart(4, '0')}`;
  }
  
  const decMatch = number.match(/Decisão.*?(\d{4})\/(\d+)/i);
  if (decMatch) {
    return `3${decMatch[1]}D${decMatch[2].padStart(4, '0')}`;
  }
  
  return null;
}

// Scrape EUR-Lex metadata
async function scrapeEurLexMetadata(url: string, firecrawlKey: string): Promise<LegislationUpdate | null> {
  try {
    console.log('Scraping EUR-Lex:', url);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.error('EUR-Lex scrape error:', response.status);
      return null;
    }
    
    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown || markdown.length < 100) {
      return null;
    }
    
    const update: LegislationUpdate = {};
    
    const skipPatterns = [
      /eur-lex/i, /cookies/i, /europa\.eu/i, /official.*website/i,
      /languages/i, /navigation/i, /menu/i, /search/i, /home/i,
      /^\s*pt\s*$/i, /login/i, /^\d+$/, /accept/i,
    ];
    
    const lines = markdown.split('\n').filter((l: string) => l.trim().length > 20);
    
    for (const line of lines) {
      const cleanLine = line.replace(/[#*[\]]/g, '').trim();
      if (cleanLine.match(/^(Regulamento|Diretiva|Decisão|Retificação)/i) && 
          cleanLine.length > 50 && cleanLine.length < 800) {
        update.title = cleanLine.substring(0, 500);
        break;
      }
    }
    
    if (!update.title) {
      for (const line of lines.slice(0, 15)) {
        const cleanLine = line.replace(/[#*[\]]/g, '').trim();
        const isSkip = skipPatterns.some(p => p.test(cleanLine));
        
        if (!isSkip && cleanLine.length > 40 && cleanLine.length < 500) {
          update.title = cleanLine;
          break;
        }
      }
    }
    
    const summaryMatch = markdown.match(/Sum[áa]rio[:\s]*\n?([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\n#|$)/i);
    if (summaryMatch) {
      update.summary = summaryMatch[1].replace(/[*#]/g, '').trim().substring(0, 2000);
    } else {
      const descMatch = markdown.match(/(?:objeto|objectivo|presente regulamento|presente diretiva|presente decisão)[^.]*\./i);
      if (descMatch) {
        update.summary = descMatch[0].trim();
      }
    }
    
    const datePatterns = [
      /Data de publicação[:\s]+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
      /Publicado em[:\s]+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
      /JO [LCS] \d+.*?,\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/,
      /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = markdown.match(pattern);
      if (match) {
        if (match[2] && !isNaN(parseInt(match[2]))) {
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          const year = match[3];
          if (parseInt(year) >= 1950 && parseInt(year) <= 2030) {
            update.publication_date = `${year}-${month}-${day}`;
            break;
          }
        } else if (match[2]) {
          const monthMap: Record<string, string> = {
            'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
            'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
            'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
          };
          if (monthMap[match[2].toLowerCase()]) {
            const year = match[3];
            if (parseInt(year) >= 1950 && parseInt(year) <= 2030) {
              update.publication_date = `${year}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
              break;
            }
          }
        }
      }
    }
    
    const entityMatch = markdown.match(/(?:Autor|Emissor|Instituição)[:\s]+([^\n]+)/i);
    if (entityMatch) {
      update.entity = entityMatch[1].replace(/[*#]/g, '').trim().substring(0, 200);
    }
    
    return update;
  } catch (error) {
    console.error('EUR-Lex scrape error:', error);
    return null;
  }
}

function fixPublicationDate(leg: { publication_date?: string | null; number: string }): string | null {
  const currentYear = new Date().getFullYear();
  
  if (leg.publication_date) {
    const year = parseInt(leg.publication_date.substring(0, 4));
    
    if (year < 1950 || year > currentYear + 1) {
      const yearMatch = leg.number.match(/(\d{4})\//);
      if (yearMatch) {
        const correctYear = parseInt(yearMatch[1]);
        if (correctYear >= 1950 && correctYear <= currentYear + 1) {
          return `${correctYear}-01-01`;
        }
      }
      return null;
    }
  }
  
  return leg.publication_date || null;
}

// Background processing function
async function runBackgroundCompletion(params: {
  limit: number;
  dryRun: boolean;
  includePT: boolean;
  includeEU: boolean;
  fixDates: boolean;
  mode: string;
  extractRequirements: boolean;
}) {
  const { limit, dryRun, includePT, includeEU, fixDates, mode, extractRequirements } = params;
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  let syncLogId: string | null = null;
  if (!dryRun) {
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: mode === 'missing_dates' ? 'fix_missing_dates' : 'complete_auto_imported',
        status: 'running',
        items_processed: 0,
        items_added: 0,
        items_updated: 0,
      })
      .select('id')
      .single();
    
    if (syncLog) {
      syncLogId = syncLog.id;
      console.log(`Created sync_log entry: ${syncLogId}`);
    }
  }

  const updateProgress = async (processed: number, updated: number, message?: string) => {
    if (!syncLogId) return;
    try {
      await supabase
        .from('sync_logs')
        .update({
          items_processed: processed,
          items_updated: updated,
          error_message: message || null,
        })
        .eq('id', syncLogId);
    } catch (e) {
      console.error('Failed to update progress:', e);
    }
  };
  
  try {
    let query = supabase
      .from('legislation')
      .select('id, number, title, summary, entity, document_url, publication_date, effective_date, origin');
    
    if (mode === 'missing_dates') {
      query = query.or('publication_date.is.null,effective_date.is.null');
    } else if (mode === 'generic_titles') {
      query = query.or('title.ilike.%Diploma referenciado%,title.ilike.%Documento %,summary.ilike.%Diploma referenciado%');
    } else {
      query = query.or('document_url.is.null,summary.ilike.%Diploma referenciado%,summary.is.null');
    }
    
    const { data: legislation, error: fetchError } = await query
      .order('created_at', { ascending: false })
      .limit(limit * 3);
    
    if (fetchError) {
      if (syncLogId) {
        await supabase.from('sync_logs').update({ 
          status: 'error', 
          error_message: fetchError.message,
          completed_at: new Date().toISOString() 
        }).eq('id', syncLogId);
      }
      throw fetchError;
    }
    
    if (!legislation || legislation.length === 0) {
      if (syncLogId) {
        await supabase.from('sync_logs').update({ 
          status: 'completed', 
          completed_at: new Date().toISOString(),
          error_message: 'Não há diplomas incompletos'
        }).eq('id', syncLogId);
      }
      console.log('No incomplete legislation to process');
      return;
    }
    
    const toProcess = legislation
      .filter(leg => {
        if (mode === 'missing_dates') {
          if (leg.publication_date && leg.effective_date) return false;
        } else if (mode === 'generic_titles') {
          const hasGenericTitle = leg.title?.toLowerCase().includes('diploma referenciado') ||
                                  leg.title?.toLowerCase().includes('documento ') ||
                                  (leg.title && leg.title.length < 10);
          if (!hasGenericTitle) return false;
        } else {
          const isIncomplete = !leg.document_url || 
                              (leg.summary && leg.summary.includes('Diploma referenciado')) ||
                              !leg.summary ||
                              leg.title === leg.number;
          if (!isIncomplete) return false;
        }
        
        const isEU = isEULegislation(leg.number);
        if (isEU && !includeEU) return false;
        if (!isEU && !includePT) return false;
        
        return true;
      })
      .slice(0, limit);
    
    console.log(`Found ${toProcess.length} incomplete legislation to complete`);
    
    if (syncLogId) {
      await supabase.from('sync_logs').update({ 
        items_added: toProcess.length
      }).eq('id', syncLogId);
    }
    
    if (toProcess.length === 0) {
      if (syncLogId) {
        await supabase.from('sync_logs').update({ 
          status: 'completed', 
          completed_at: new Date().toISOString(),
          error_message: 'Não há diplomas incompletos'
        }).eq('id', syncLogId);
      }
      return;
    }
    
    const results: ProcessResult[] = [];
    let totalUpdated = 0;
    let totalUrlsFound = 0;
    let totalMetadataExtracted = 0;
    
    for (const leg of toProcess) {
      try {
        console.log(`\n=== Processing: ${leg.number} ===`);
        
        const isEU = isEULegislation(leg.number);
        const updates: LegislationUpdate = {};
        let hasUpdates = false;
        
        if (fixDates && leg.publication_date) {
          const fixedDate = fixPublicationDate(leg);
          if (fixedDate !== leg.publication_date) {
            updates.publication_date = fixedDate || undefined;
            hasUpdates = true;
            console.log(`Fixed date: ${leg.publication_date} -> ${fixedDate}`);
          }
        }
        
        if (isEU) {
          if (!leg.document_url) {
            const celex = extractCelexNumber(null, leg.number);
            if (celex) {
              updates.document_url = `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;
              updates.origin = 'EU';
              totalUrlsFound++;
              hasUpdates = true;
              console.log(`Generated EUR-Lex URL from CELEX: ${celex}`);
            }
          }
          
          const urlToScrape = updates.document_url || leg.document_url;
          if (urlToScrape && urlToScrape.includes('eur-lex')) {
            const metadata = await scrapeEurLexMetadata(urlToScrape, firecrawlKey);
            
            if (metadata) {
              if (metadata.title && (!leg.title || leg.title === leg.number)) {
                updates.title = metadata.title;
                hasUpdates = true;
              }
              if (metadata.summary && (!leg.summary || leg.summary.includes('Diploma referenciado'))) {
                updates.summary = metadata.summary;
                hasUpdates = true;
              }
              if (metadata.entity && !leg.entity) {
                updates.entity = metadata.entity;
                hasUpdates = true;
              }
              if (metadata.publication_date) {
                const currentYear = new Date().getFullYear();
                const metaYear = parseInt(metadata.publication_date.substring(0, 4));
                const legYear = leg.publication_date ? parseInt(leg.publication_date.substring(0, 4)) : 0;
                
                if (metaYear >= 1950 && metaYear <= currentYear + 1 && (legYear < 1950 || legYear > currentYear + 1)) {
                  updates.publication_date = metadata.publication_date;
                  hasUpdates = true;
                }
              }
              
              totalMetadataExtracted++;
              console.log(`Extracted EUR-Lex metadata:`, metadata);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } else {
          if (!leg.document_url) {
            const dreUrl = await searchDREUrl(leg.number, firecrawlKey);
            if (dreUrl) {
              updates.document_url = dreUrl;
              updates.origin = 'PT';
              totalUrlsFound++;
              hasUpdates = true;
              console.log(`Found URL: ${dreUrl}`);
            } else {
              console.log(`No URL found for ${leg.number}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          const urlToScrape = updates.document_url || leg.document_url;
          if (urlToScrape) {
            const markdown = await scrapeUrl(urlToScrape, firecrawlKey);
            if (markdown && markdown.length > 100) {
              const metadata = extractMetadataFromDRE(markdown, leg.number);
              
              if (metadata.title && (!leg.title || leg.title === leg.number)) {
                updates.title = metadata.title;
                hasUpdates = true;
              }
              if (metadata.summary && (!leg.summary || leg.summary.includes('Diploma referenciado'))) {
                updates.summary = metadata.summary;
                hasUpdates = true;
              }
              if (metadata.entity && !leg.entity) {
                updates.entity = metadata.entity;
                hasUpdates = true;
              }
              if (metadata.publication_date && (!leg.publication_date || leg.publication_date.startsWith('1970'))) {
                updates.publication_date = metadata.publication_date;
                hasUpdates = true;
              }
              
              totalMetadataExtracted++;
              console.log(`Extracted metadata:`, metadata);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        if (hasUpdates && !dryRun) {
          const { error: updateError } = await supabase
            .from('legislation')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', leg.id);
          
          if (updateError) {
            throw updateError;
          }
          
          totalUpdated++;
          console.log(`✓ Updated ${leg.number}`);
        }
        
        results.push({
          id: leg.id,
          number: leg.number,
          success: true,
          updates: hasUpdates ? updates : undefined
        });
        
        await updateProgress(results.length, totalUpdated, `Processando: ${leg.number}`);
        
      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({
          id: leg.id,
          number: leg.number,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        
        await updateProgress(results.length, totalUpdated, `Erro: ${leg.number}`);
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n=== COMPLETE ===`);
    console.log(`Processed: ${results.length}, Updated: ${totalUpdated}, URLs: ${totalUrlsFound}, Metadata: ${totalMetadataExtracted}`);
    
    let requirementsExtractionStarted = false;
    const successfulIds = results.filter(r => r.success).map(r => r.id);
    
    if (extractRequirements && successfulIds.length > 0 && !dryRun) {
      console.log(`\n=== Starting requirements extraction for ${successfulIds.length} legislation ===`);
      
      try {
        const extractionResponse = await fetch(
          `${supabaseUrl}/functions/v1/extract-requirements-background`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              batchSize: 10,
              maxBatches: Math.ceil(successfulIds.length / 10),
              useUrl: true,
              legislationIds: successfulIds,
            }),
          }
        );
        
        if (extractionResponse.ok) {
          requirementsExtractionStarted = true;
          console.log('Requirements extraction job started');
        } else {
          console.error('Failed to start requirements extraction:', await extractionResponse.text());
        }
      } catch (extractionError) {
        console.error('Error starting requirements extraction:', extractionError);
      }
    }
    
    if (syncLogId) {
      const completionMessage = requirementsExtractionStarted 
        ? `Extração de requisitos iniciada para ${successfulIds.length} diplomas`
        : (failed > 0 ? `${failed} erro(s)` : `✓ ${totalUpdated} atualizados, ${totalUrlsFound} URLs, ${totalMetadataExtracted} metadados`);
      
      await supabase.from('sync_logs').update({ 
        status: 'completed',
        items_processed: results.length,
        items_updated: totalUpdated,
        error_message: completionMessage,
        completed_at: new Date().toISOString() 
      }).eq('id', syncLogId);
    }
    
    console.log('Background completion finished');
    
  } catch (error) {
    console.error('Background completion error:', error);
    if (syncLogId) {
      await supabase.from('sync_logs').update({ 
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString() 
      }).eq('id', syncLogId);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      limit = 50, 
      dryRun = false, 
      includePT = true, 
      includeEU = true, 
      fixDates = true, 
      mode = 'incomplete',
      extractRequirements = false,
      background = true,
    } = await req.json().catch(() => ({}));
    
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Quick check for pending items
    let countQuery = supabase.from('legislation').select('id', { count: 'exact', head: true });
    
    if (mode === 'missing_dates') {
      countQuery = countQuery.or('publication_date.is.null,effective_date.is.null');
    } else if (mode === 'generic_titles') {
      countQuery = countQuery.or('title.ilike.%Diploma referenciado%,title.ilike.%Documento %,summary.ilike.%Diploma referenciado%');
    } else {
      countQuery = countQuery.or('document_url.is.null,summary.ilike.%Diploma referenciado%,summary.is.null');
    }
    
    const { count: pendingCount } = await countQuery;
    
    if (!pendingCount || pendingCount === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Não há diplomas incompletos para processar',
          pendingCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (background) {
      EdgeRuntime.waitUntil(runBackgroundCompletion({
        limit,
        dryRun,
        includePT,
        includeEU,
        fixDates,
        mode,
        extractRequirements,
      }));
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Completar diplomas iniciado em segundo plano',
          pendingCount,
          limit,
          mode,
          background: true,
          trackingType: 'complete_auto_imported'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    await runBackgroundCompletion({
      limit,
      dryRun,
      includePT,
      includeEU,
      fixDates,
      mode,
      extractRequirements,
    });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Processo concluído',
        pendingCount,
        limit,
        mode
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
