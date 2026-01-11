import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  current?: number;
  total?: number;
  item?: {
    id: string;
    number: string;
    success: boolean;
    url?: string;
    error?: string;
  };
  summary?: {
    found: number;
    failed: number;
    processed: number;
  };
  error?: string;
}

function sendSSE(controller: ReadableStreamDefaultController<Uint8Array>, event: ProgressEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  controller.enqueue(new TextEncoder().encode(data));
}

// Extract a simplified search term from the legislation number
function extractSearchTerm(number: string): string {
  // Examples:
  // "Decreto-Lei n.º 97/2008, de 11 de junho" -> "Decreto-Lei 97/2008"
  // "Portaria n.º 98/2025/1 de 12 de março" -> "Portaria 98/2025"
  // "Despacho n.º 3495-C/2025 de 19 de março" -> "Despacho 3495-C/2025"
  
  const cleanNumber = number.trim();
  
  // Try to extract type and number
  const match = cleanNumber.match(/^([\w-]+)\s+n\.?º?\s*([\d\-A-Za-z\/]+)/i);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  
  // Fallback: just use the first part before comma
  const parts = cleanNumber.split(',');
  return parts[0].replace(/\s+de\s+\d+\s+de\s+\w+$/i, '').trim();
}

async function searchDREForLink(number: string, firecrawlKey: string): Promise<string | null> {
  try {
    // Extract a simplified search term
    const searchTerm = extractSearchTerm(number);
    
    // Use the DRE search with simpler query
    const searchUrl = `https://diariodarepublica.pt/dr/pesquisa/-/search/basic?q=${encodeURIComponent(searchTerm)}`;
    
    console.log(`Searching DRE for: "${searchTerm}" (original: ${number})`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['links', 'markdown'],
        waitFor: 5000, // Wait longer for JS to load
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Search scrape failed: ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    const links: string[] = data.data?.links || data.links || [];
    const markdown: string = data.data?.markdown || data.markdown || '';
    
    console.log(`Found ${links.length} links on page`);
    
    // Find direct detail link that matches the legislation
    for (const link of links) {
      if (link.includes('/dr/detalhe/') && !link.includes('/pesquisa/')) {
        // Verify this link matches our search term
        const linkLower = link.toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        
        // Extract number pattern from link (e.g., "decreto-lei/97-2008")
        const linkMatch = link.match(/\/dr\/detalhe\/([^\/]+)\/(\d+)-?(\d+)/i);
        if (linkMatch) {
          // Check if year matches
          const searchYearMatch = searchTerm.match(/\/(\d{4})/);
          const searchNumMatch = searchTerm.match(/(\d+)[-\/]/);
          
          if (searchYearMatch && linkMatch[3] && linkMatch[3].includes(searchYearMatch[1].slice(-2))) {
            console.log(`Found matching DRE link: ${link}`);
            return link;
          }
          
          if (searchNumMatch && linkMatch[2] === searchNumMatch[1]) {
            console.log(`Found matching DRE link by number: ${link}`);
            return link;
          }
        }
        
        // If it's the first detail link, use it as fallback
        console.log(`Found DRE link (first match): ${link}`);
        return link;
      }
    }
    
    // Try to find any relevant link in the markdown content
    const urlMatches = markdown.match(/https:\/\/diariodarepublica\.pt\/dr\/detalhe\/[^\s\)]+/g);
    if (urlMatches && urlMatches.length > 0) {
      console.log(`Found URL in markdown: ${urlMatches[0]}`);
      return urlMatches[0];
    }
    
    // If we have links, log them for debugging
    if (links.length > 0) {
      const dreLinks = links.filter(l => l.includes('diariodarepublica.pt'));
      console.log(`DRE links found: ${dreLinks.slice(0, 5).join(', ')}`);
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
    
    // Get PT legislation without valid DRE URLs
    const { data: legislation, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, document_url, origin')
      .or('origin.eq.PT,origin.eq.dre')
      .limit(1000);
    
    if (fetchError) {
      throw fetchError;
    }
    
    // Filter to those without valid DRE detail URL
    // Also filter out non-PT legislation types that might be misclassified
    const toProcess = (legislation || [])
      .filter(leg => {
        // Must be PT origin
        if (!leg.origin || !['PT', 'dre'].includes(leg.origin)) return false;
        
        // Must NOT have a valid DRE detail URL
        const hasValidUrl = leg.document_url && leg.document_url.includes('/dr/detalhe/');
        if (hasValidUrl) return false;
        
        // Skip EU legislation that might be misclassified
        const isEU = leg.number.includes('(UE)') || 
                     leg.number.includes('(CE)') || 
                     leg.number.includes('Regulamento de Execução') ||
                     leg.number.includes('Diretiva ') ||
                     leg.number.includes('UNECE');
        if (isEU) return false;
        
        return true;
      })
      .slice(0, limit);
    
    console.log(`Found ${toProcess.length} PT legislation without valid DRE URLs`);
    
    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No legislation without URLs found', found: 0, failed: 0, details: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Streaming mode
    if (stream) {
      const readableStream = new ReadableStream({
        async start(controller) {
          let found = 0;
          let failed = 0;

          sendSSE(controller, { type: 'start', total: toProcess.length });

          for (let i = 0; i < toProcess.length; i++) {
            const leg = toProcess[i];
            
            try {
              console.log(`Searching URL for ${leg.number}...`);
              
              const dreUrl = await searchDREForLink(leg.number, firecrawlKey);
              
              if (dreUrl) {
                if (dryRun) {
                  console.log(`[DRY RUN] Would update ${leg.number} with URL: ${dreUrl}`);
                  found++;
                  sendSSE(controller, {
                    type: 'progress',
                    current: i + 1,
                    total: toProcess.length,
                    item: { id: leg.id, number: leg.number, success: true, url: dreUrl }
                  });
                } else {
                  const { error: updateError } = await supabase
                    .from('legislation')
                    .update({ 
                      document_url: dreUrl,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', leg.id);
                  
                  if (updateError) {
                    throw updateError;
                  }
                  
                  console.log(`Updated ${leg.number} with URL: ${dreUrl}`);
                  found++;
                  sendSSE(controller, {
                    type: 'progress',
                    current: i + 1,
                    total: toProcess.length,
                    item: { id: leg.id, number: leg.number, success: true, url: dreUrl }
                  });
                }
              } else {
                console.log(`No URL found for ${leg.number}`);
                failed++;
                sendSSE(controller, {
                  type: 'progress',
                  current: i + 1,
                  total: toProcess.length,
                  item: { id: leg.id, number: leg.number, success: false, error: 'URL não encontrado no DRE' }
                });
              }
              
              // Rate limiting - be nice to the DRE (2 seconds between requests)
              await new Promise(resolve => setTimeout(resolve, 2000));
              
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

          sendSSE(controller, {
            type: 'complete',
            summary: { found, failed, processed: toProcess.length }
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

    // Non-streaming mode
    const results: { id: string; number: string; success: boolean; url?: string; error?: string }[] = [];
    let found = 0;
    let failed = 0;
    
    for (const leg of toProcess) {
      try {
        console.log(`Searching URL for ${leg.number}...`);
        
        const dreUrl = await searchDREForLink(leg.number, firecrawlKey);
        
        if (dreUrl) {
          if (dryRun) {
            console.log(`[DRY RUN] Would update ${leg.number} with URL: ${dreUrl}`);
            results.push({ id: leg.id, number: leg.number, success: true, url: dreUrl });
          } else {
            const { error: updateError } = await supabase
              .from('legislation')
              .update({ 
                document_url: dreUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', leg.id);
            
            if (updateError) {
              throw updateError;
            }
            
            console.log(`Updated ${leg.number} with URL: ${dreUrl}`);
            results.push({ id: leg.id, number: leg.number, success: true, url: dreUrl });
          }
          found++;
        } else {
          console.log(`No URL found for ${leg.number}`);
          results.push({ id: leg.id, number: leg.number, success: false, error: 'URL não encontrado no DRE' });
          failed++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({ id: leg.id, number: leg.number, success: false, error: String(error) });
        failed++;
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        found,
        failed,
        processed: toProcess.length,
        results,
        dryRun
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
