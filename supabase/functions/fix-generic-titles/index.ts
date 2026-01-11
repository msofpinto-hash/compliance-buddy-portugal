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

function extractMetadataFromDRE(markdown: string, currentNumber: string): LegislationUpdate {
  const update: LegislationUpdate = {};
  
  // Clean markdown from unwanted patterns first
  const cleanMarkdown = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links, keep text
    .replace(/\*\*/g, '')                     // Remove bold markers
    .replace(/\n+/g, '\n');                   // Normalize newlines
  
  // Try to extract the main title/summary from page title or meta
  // Common pattern: the first substantial paragraph after series info
  const lines = cleanMarkdown.split('\n').filter(l => l.trim().length > 0);
  
  // Look for summary after "Sumário:" label
  const summaryMatch = cleanMarkdown.match(/Sum[áa]rio[:\s]*\n?([^\n]+(?:\n[^\n]+)*?)(?=\n(?:Texto|Data|Publicação|Série|Emissor|$))/i);
  if (summaryMatch) {
    const summary = summaryMatch[1].trim();
    if (summary && summary.length > 20 && !summary.includes('Lamentamos')) {
      update.summary = summary.substring(0, 2000);
      // Use summary as title if it's descriptive enough
      if (summary.length > 30 && summary.length < 300) {
        update.title = `${currentNumber.split(' de ')[0]} - ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`;
      }
    }
  }
  
  // Alternative: look for descriptive content in the markdown
  if (!update.title) {
    for (const line of lines) {
      // Skip short lines, headers, navigation elements
      if (line.length < 40) continue;
      if (line.startsWith('#')) continue;
      if (line.includes('http')) continue;
      if (line.toLowerCase().includes('série')) continue;
      if (line.toLowerCase().includes('emissor')) continue;
      if (line.toLowerCase().includes('publicação')) continue;
      if (line.toLowerCase().match(/^\d+[º°]/)) continue; // Article numbers
      
      // Check if it looks like a descriptive title/summary
      const cleanLine = line.trim();
      if (cleanLine.length > 40 && cleanLine.length < 500) {
        // Extract just the first part as title
        const titlePart = cleanLine.split('.')[0];
        if (titlePart.length > 30) {
          update.title = `${currentNumber.split(' de ')[0]} - ${titlePart.substring(0, 120)}${titlePart.length > 120 ? '...' : ''}`;
          if (!update.summary) {
            update.summary = cleanLine.substring(0, 500);
          }
          break;
        }
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
  
  // Extract effective date
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

// Search DRE for a diploma and get the direct link
async function searchDREForLink(number: string, firecrawlKey: string): Promise<string | null> {
  try {
    // Use Firecrawl search to find the DRE page
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
    
    // Find a direct link to the diploma detail page
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
    const { limit = 20, dryRun = false } = await req.json().catch(() => ({}));
    
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
    
    // Get legislation with generic titles (title = number pattern)
    const { data: legislation, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, summary, entity, document_url, origin')
      .or('origin.eq.PT,origin.eq.dre,origin.is.null')
      .limit(1000);
    
    if (fetchError) {
      throw fetchError;
    }
    
    // Filter to find items with generic titles
    const genericPattern = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Diretiva|Decisão|Declaração|Acórdão|Aviso|Parecer)/i;
    
    const toProcess = (legislation || [])
      .filter(leg => {
        // Has generic title (title equals number or matches pattern without description)
        const titleEqualsNumber = leg.title === leg.number;
        const hasGenericPattern = genericPattern.test(leg.title) && 
          leg.title.length < 80 && 
          !leg.title.includes(' - ');
        return titleEqualsNumber || hasGenericPattern;
      })
      .slice(0, limit);
    
    console.log(`Found ${toProcess.length} items with generic titles to process`);
    
    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No generic titles found', fixed: 0, failed: 0, details: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const results: { id: string; number: string; success: boolean; updates?: LegislationUpdate; error?: string }[] = [];
    let fixed = 0;
    let failed = 0;
    
    for (const leg of toProcess) {
      try {
        let dreUrl = leg.document_url;
        
        // If no URL or URL is a search page, try to find the direct link
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
        
        // Also update the URL if we found a better one
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
        
        // Rate limiting
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