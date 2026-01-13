import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  // From URL
  if (url) {
    const match = url.match(/CELEX:(\d+[A-Z]\d+)/);
    if (match) return match[1];
  }
  
  // Try to build CELEX from number
  // Format: 32024R1955 = 3 + 2024 + R + 1955
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
    
    // Skip common unwanted patterns
    const skipPatterns = [
      /eur-lex/i,
      /cookies/i,
      /europa\.eu/i,
      /official.*website/i,
      /languages/i,
      /navigation/i,
      /menu/i,
      /search/i,
      /home/i,
      /^\s*pt\s*$/i,
      /login/i,
      /^\d+$/,
      /accept/i,
    ];
    
    // Extract title - look for regulation/directive/decision title pattern
    const lines = markdown.split('\n').filter((l: string) => l.trim().length > 20);
    
    // First, try to find a line that starts with the legislation type
    for (const line of lines) {
      const cleanLine = line.replace(/[#*[\]]/g, '').trim();
      if (cleanLine.match(/^(Regulamento|Diretiva|Decisão|Retificação)/i) && 
          cleanLine.length > 50 && cleanLine.length < 800) {
        // This looks like a proper EU legislation title
        update.title = cleanLine.substring(0, 500);
        break;
      }
    }
    
    // If no proper title found, try to find any substantial line that's not garbage
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
    
    // Extract summary - look for "Sumário" or first paragraph after title
    const summaryMatch = markdown.match(/Sum[áa]rio[:\s]*\n?([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\n#|$)/i);
    if (summaryMatch) {
      update.summary = summaryMatch[1].replace(/[*#]/g, '').trim().substring(0, 2000);
    } else {
      // Try to find a description-like paragraph
      const descMatch = markdown.match(/(?:objeto|objectivo|presente regulamento|presente diretiva|presente decisão)[^.]*\./i);
      if (descMatch) {
        update.summary = descMatch[0].trim();
      }
    }
    
    // Extract publication date
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
    
    // Extract entity
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

// Fix incorrect publication dates extracted from legislation number
function fixPublicationDate(leg: any): string | null {
  // Check if publication_date looks like it was wrongly extracted from the number
  // e.g., "1955-07-26" when the actual legislation is from 2024
  const currentYear = new Date().getFullYear();
  
  if (leg.publication_date) {
    const year = parseInt(leg.publication_date.substring(0, 4));
    
    // If year is before 1950 or in the future, it's likely wrong
    if (year < 1950 || year > currentYear + 1) {
      // Try to extract correct year from number
      const yearMatch = leg.number.match(/(\d{4})\//);
      if (yearMatch) {
        const correctYear = parseInt(yearMatch[1]);
        if (correctYear >= 1950 && correctYear <= currentYear + 1) {
          // Use January 1st of the correct year as placeholder
          return `${correctYear}-01-01`;
        }
      }
      return null; // Clear the date if we can't fix it
    }
  }
  
  return leg.publication_date;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 10, dryRun = false, includePT = true, includeEU = true, fixDates = true, jobId } = await req.json().catch(() => ({}));
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Create sync_log entry for progress tracking
    let syncLogId: string | null = null;
    if (!dryRun) {
      const { data: syncLog, error: syncLogError } = await supabase
        .from('sync_logs')
        .insert({
          sync_type: 'complete_auto_imported',
          status: 'running',
          items_processed: 0,
          items_added: 0,
          items_updated: 0,
        })
        .select('id')
        .single();
      
      if (!syncLogError && syncLog) {
        syncLogId = syncLog.id;
        console.log(`Created sync_log entry: ${syncLogId}`);
      }
    }

    // Helper to update progress in sync_logs
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
    
    // Find auto-imported legislation (incomplete data)
    // These have: title = number, summary contains "Diploma referenciado", or no document_url
    const { data: legislation, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, summary, entity, document_url, publication_date, origin')
      .or('document_url.is.null,summary.ilike.%Diploma referenciado%,summary.is.null')
      .order('created_at', { ascending: false })
      .limit(limit * 3); // Fetch more to account for filtering
    
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
          completed_at: new Date().toISOString() 
        }).eq('id', syncLogId);
      }
      return new Response(
        JSON.stringify({ success: true, message: 'Não há diplomas incompletos para processar', processed: 0, results: [], syncLogId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Filter based on origin preferences and check if truly incomplete
    const toProcess = legislation
      .filter(leg => {
        // Check if really incomplete
        const isIncomplete = !leg.document_url || 
                            (leg.summary && leg.summary.includes('Diploma referenciado')) ||
                            !leg.summary ||
                            leg.title === leg.number;
        if (!isIncomplete) return false;
        
        // Check origin filter
        const isEU = isEULegislation(leg.number);
        if (isEU && !includeEU) return false;
        if (!isEU && !includePT) return false;
        
        return true;
      })
      .slice(0, limit);
    
    console.log(`Found ${toProcess.length} incomplete legislation to complete`);
    
    // Update sync_log with total items
    if (syncLogId) {
      await supabase.from('sync_logs').update({ 
        items_added: toProcess.length // Using items_added to store total count
      }).eq('id', syncLogId);
    }
    
    if (toProcess.length === 0) {
      if (syncLogId) {
        await supabase.from('sync_logs').update({ 
          status: 'completed', 
          completed_at: new Date().toISOString() 
        }).eq('id', syncLogId);
      }
      return new Response(
        JSON.stringify({ success: true, message: 'Não há diplomas incompletos para processar', processed: 0, results: [], syncLogId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
        
        // Step 0: Fix incorrect publication dates
        if (fixDates && leg.publication_date) {
          const fixedDate = fixPublicationDate(leg);
          if (fixedDate !== leg.publication_date) {
            updates.publication_date = fixedDate || undefined;
            hasUpdates = true;
            console.log(`Fixed date: ${leg.publication_date} -> ${fixedDate}`);
          }
        }
        
        // Step 1: Handle EU legislation
        if (isEU) {
          // Generate or fix EUR-Lex URL
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
          
          // Scrape EUR-Lex for metadata
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
                
                // Only update if scraped date is valid and current is clearly wrong
                if (metaYear >= 1950 && metaYear <= currentYear + 1 && (legYear < 1950 || legYear > currentYear + 1)) {
                  updates.publication_date = metadata.publication_date;
                  hasUpdates = true;
                }
              }
              
              if (Object.keys(metadata).length > 0) {
                totalMetadataExtracted++;
                console.log(`Extracted EUR-Lex metadata:`, metadata);
              }
            }
            
            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } else {
          // Step 1: Find URL if missing (PT)
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
            
            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          // Step 2: Scrape and extract metadata if we have a URL
          const urlToScrape = updates.document_url || leg.document_url;
          if (urlToScrape) {
            const markdown = await scrapeUrl(urlToScrape, firecrawlKey);
            if (markdown && markdown.length > 100) {
              const metadata = extractMetadataFromDRE(markdown, leg.number);
              
              // Only update fields that are missing or bad
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
              
              if (Object.keys(metadata).length > 0) {
                totalMetadataExtracted++;
                console.log(`Extracted metadata:`, metadata);
              }
            }
            
            // Rate limit
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Step 3: Apply updates
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
        
        // Update progress after each item
        await updateProgress(results.length, totalUpdated, `Processando: ${leg.number}`);
        
      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({
          id: leg.id,
          number: leg.number,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Update progress even on error
        await updateProgress(results.length, totalUpdated, `Erro: ${leg.number}`);
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n=== COMPLETE ===`);
    console.log(`Processed: ${results.length}, Updated: ${totalUpdated}, URLs found: ${totalUrlsFound}, Metadata extracted: ${totalMetadataExtracted}`);
    
    // Mark sync_log as completed
    if (syncLogId) {
      await supabase.from('sync_logs').update({ 
        status: 'completed',
        items_processed: results.length,
        items_updated: totalUpdated,
        error_message: failed > 0 ? `${failed} erro(s)` : null,
        completed_at: new Date().toISOString() 
      }).eq('id', syncLogId);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        processed: results.length,
        successful,
        failed,
        totalUpdated,
        totalUrlsFound,
        totalMetadataExtracted,
        results,
        syncLogId
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
