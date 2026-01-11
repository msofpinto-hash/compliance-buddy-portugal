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

async function searchDREForLink(number: string, firecrawlKey: string): Promise<string | null> {
  try {
    // Clean up the number for search
    const cleanNumber = number.trim();
    const searchUrl = `https://diariodarepublica.pt/dr/pesquisa/-/search/basic?q=${encodeURIComponent(cleanNumber)}`;
    
    console.log(`Searching DRE for: ${cleanNumber}`);
    
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
    
    // Find direct detail link
    for (const link of links) {
      if (link.includes('/dr/detalhe/') && !link.includes('/pesquisa/')) {
        console.log(`Found DRE link: ${link}`);
        return link;
      }
    }
    
    // Try alternative patterns
    for (const link of links) {
      if (link.includes('diariodarepublica.pt') && 
          !link.includes('/pesquisa/') && 
          !link.includes('/search/') &&
          link.includes('/dr/')) {
        console.log(`Found alternative DRE link: ${link}`);
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
        return !hasValidUrl;
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
              
              // Rate limiting - be nice to the DRE
              await new Promise(resolve => setTimeout(resolve, 1500));
              
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
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
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
