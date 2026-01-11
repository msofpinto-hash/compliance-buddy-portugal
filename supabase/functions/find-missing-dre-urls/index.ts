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

// Extract type and number for DRE URL construction
function extractLegislationParts(number: string): { type: string; num: string; year: string } | null {
  const cleanNumber = number.trim();
  
  // Pattern: "Decreto-Lei n.º 97/2008, de 11 de junho"
  // Pattern: "Portaria n.º 98/2025/1 de 12 de março"
  // Pattern: "Despacho n.º 3495-C/2025 de 19 de março"
  
  const patterns = [
    // Decreto-Lei n.º 97/2008
    /^(Decreto-Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Portaria n.º 98/2025/1
    /^(Portaria)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Lei n.º 13/2025
    /^(Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Despacho n.º 3495-C/2025
    /^(Despacho)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Resolução do Conselho de Ministros n.º 10/2025
    /^(Resolução\s+do\s+Conselho\s+de\s+Ministros)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Resolução n.º 2/2025
    /^(Resolução)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Declaração de Retificação n.º X/YYYY
    /^(Declaração\s+de\s+Retificação)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Aviso n.º X/YYYY
    /^(Aviso)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Regulamento n.º X/YYYY
    /^(Regulamento)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Acórdão do Tribunal Constitucional n.º X/YYYY
    /^(Acórdão\s+do\s+Tribunal\s+Constitucional)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Decreto Regulamentar n.º X/YYYY
    /^(Decreto\s+Regulamentar)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})/i,
    // Decreto n.º X/YYYY
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

async function searchDREWithFirecrawlSearch(number: string, firecrawlKey: string): Promise<string | null> {
  try {
    // Use Firecrawl's search API to find the legislation on DRE
    const parts = extractLegislationParts(number);
    let searchQuery: string;
    
    if (parts) {
      searchQuery = `site:diariodarepublica.pt/dr/detalhe ${parts.type} ${parts.num}/${parts.year}`;
    } else {
      // Fallback to simple search
      const cleanNumber = number.split(',')[0].trim();
      searchQuery = `site:diariodarepublica.pt/dr/detalhe "${cleanNumber}"`;
    }
    
    console.log(`Searching with Firecrawl: ${searchQuery}`);
    
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
      const errorText = await response.text();
      console.log(`Search failed: ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    const results = data.data || [];
    
    console.log(`Found ${results.length} search results`);
    
    // Find the best matching result
    for (const result of results) {
      const url = result.url || '';
      if (url.includes('/dr/detalhe/') && url.includes('diariodarepublica.pt')) {
        console.log(`Found DRE link: ${url}`);
        return url;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error in search: ${error}`);
    return null;
  }
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

async function processInBackground(
  supabase: any,
  legislation: any[],
  firecrawlKey: string,
  logId: string
) {
  let found = 0;
  let failed = 0;
  
  for (let i = 0; i < legislation.length; i++) {
    const leg = legislation[i];
    
    try {
      console.log(`[${i+1}/${legislation.length}] Searching URL for ${leg.number}...`);
      
      const dreUrl = await searchDREWithFirecrawlSearch(leg.number, firecrawlKey);
      
      if (dreUrl) {
        const { error: updateError } = await supabase
          .from('legislation')
          .update({ 
            document_url: dreUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', leg.id);
        
        if (!updateError) {
          console.log(`Updated ${leg.number} with URL: ${dreUrl}`);
          found++;
        } else {
          console.error(`Failed to update ${leg.number}:`, updateError);
          failed++;
        }
      } else {
        console.log(`No URL found for ${leg.number}`);
        failed++;
      }
      
      // Update progress every 5 items
      if ((i + 1) % 5 === 0 || i === legislation.length - 1) {
        await supabase
          .from('sync_logs')
          .update({
            items_processed: i + 1,
            items_added: found,
            items_updated: failed,
            status: i === legislation.length - 1 ? 'completed' : 'running'
          })
          .eq('id', logId);
      }
      
      // Rate limiting - 2 seconds between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`Error processing ${leg.number}:`, error);
      failed++;
    }
  }
  
  // Final update
  await supabase
    .from('sync_logs')
    .update({
      items_processed: legislation.length,
      items_added: found,
      items_updated: failed,
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', logId);
  
  console.log(`Background job completed: ${found} found, ${failed} failed`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 20, dryRun = false, stream = false, background = false } = await req.json().catch(() => ({}));
    
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
        
        // Must be parseable as PT legislation
        const parts = extractLegislationParts(leg.number);
        if (!parts) {
          console.log(`Skipping unparseable: ${leg.number}`);
          return false;
        }
        
        return true;
      })
      .slice(0, limit);
    
    console.log(`Found ${toProcess.length} PT legislation without valid DRE URLs`);
    
    // Background mode
    if (background) {
      // Create sync log
      const { data: logData, error: logError } = await supabase
        .from('sync_logs')
        .insert({
          sync_type: 'find_dre_urls',
          status: 'running',
          items_processed: 0,
          items_added: 0,
          items_updated: 0
        })
        .select('id')
        .single();
      
      if (logError) {
        throw logError;
      }
      
      const logId = logData.id;
      
      // Start background processing
      EdgeRuntime.waitUntil(processInBackground(supabase, toProcess, firecrawlKey, logId));
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Background job started',
          jobId: logId,
          total: toProcess.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
              console.log(`[${i+1}/${toProcess.length}] Searching URL for ${leg.number}...`);
              
              const dreUrl = await searchDREWithFirecrawlSearch(leg.number, firecrawlKey);
              
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
              
              // Rate limiting - 2 seconds between requests
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
        
        const dreUrl = await searchDREWithFirecrawlSearch(leg.number, firecrawlKey);
        
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
