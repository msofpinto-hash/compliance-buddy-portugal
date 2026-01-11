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
    summary?: string;
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

async function fetchEurlexSummary(documentUrl: string, firecrawlKey: string): Promise<string | null> {
  try {
    if (!documentUrl || !documentUrl.includes('eur-lex.europa.eu')) {
      return null;
    }
    
    console.log(`Fetching summary from: ${documentUrl}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: documentUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });
    
    if (!response.ok) {
      console.log(`Scrape failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown) {
      console.log('No markdown content found');
      return null;
    }
    
    // Extract summary from EUR-Lex page
    // Look for patterns like "Síntese" or summary sections
    let summary: string | null = null;
    
    // Try to find the document title/summary section
    // EUR-Lex pages typically have a structure with the act title at the top
    
    // Pattern 1: Look for "O QUE FAZ" or similar headers
    const whatItDoesMatch = markdown.match(/O QUE FAZ[^\n]*\n+([^\n#]+)/i);
    if (whatItDoesMatch) {
      summary = whatItDoesMatch[1].trim();
    }
    
    // Pattern 2: Look for summary after title
    if (!summary) {
      const summaryMatch = markdown.match(/(?:Síntese|Resumo|Summary)[:\s]*\n*([^\n#]+)/i);
      if (summaryMatch) {
        summary = summaryMatch[1].trim();
      }
    }
    
    // Pattern 3: Extract first meaningful paragraph (not navigation)
    if (!summary) {
      const lines = markdown.split('\n').filter((line: string) => {
        const trimmed = line.trim();
        return trimmed.length > 50 && 
               !trimmed.startsWith('#') && 
               !trimmed.startsWith('[') &&
               !trimmed.includes('EUR-Lex') &&
               !trimmed.includes('Acesso ao direito') &&
               !trimmed.includes('página principal');
      });
      
      if (lines.length > 0) {
        // Get the first substantial paragraph
        summary = lines[0].trim();
        
        // If it's too long, truncate
        if (summary && summary.length > 500) {
          summary = summary.substring(0, 497) + '...';
        }
      }
    }
    
    // Pattern 4: Look for the regulation/directive description
    if (!summary) {
      const regMatch = markdown.match(/(?:estabelece|define|fixa|determina|regulamenta)[^.]+\./i);
      if (regMatch) {
        summary = regMatch[0].trim();
      }
    }
    
    if (summary) {
      // Clean up the summary
      summary = summary
        .replace(/\s+/g, ' ')
        .replace(/^\*+|\*+$/g, '')
        .trim();
      
      console.log(`Found summary: ${summary.substring(0, 100)}...`);
      return summary;
    }
    
    console.log('Could not extract summary from content');
    return null;
  } catch (error) {
    console.error(`Error fetching EUR-Lex: ${error}`);
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
    
    // Get EU legislation without summaries but with EUR-Lex URLs
    const { data: legislation, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, summary, document_url, origin')
      .eq('origin', 'EU')
      .not('document_url', 'is', null)
      .limit(500);
    
    if (fetchError) {
      throw fetchError;
    }
    
    // Filter to those without valid summaries and with EUR-Lex URLs
    const toProcess = (legislation || [])
      .filter(leg => {
        // Must have EUR-Lex URL
        if (!leg.document_url || !leg.document_url.includes('eur-lex.europa.eu')) {
          return false;
        }
        
        // Must NOT have a valid summary (null, empty, or same as title)
        const hasValidSummary = leg.summary && 
                                leg.summary.trim() !== '' && 
                                leg.summary !== leg.title;
        return !hasValidSummary;
      })
      .slice(0, limit);
    
    console.log(`Found ${toProcess.length} EU legislation without summaries`);
    
    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No legislation without summaries found', found: 0, failed: 0, details: [] }),
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
              console.log(`[${i+1}/${toProcess.length}] Fetching summary for ${leg.number}...`);
              
              const summary = await fetchEurlexSummary(leg.document_url, firecrawlKey);
              
              if (summary) {
                if (dryRun) {
                  console.log(`[DRY RUN] Would update ${leg.number} with summary`);
                  found++;
                  sendSSE(controller, {
                    type: 'progress',
                    current: i + 1,
                    total: toProcess.length,
                    item: { id: leg.id, number: leg.number, success: true, summary: summary.substring(0, 100) + '...' }
                  });
                } else {
                  const { error: updateError } = await supabase
                    .from('legislation')
                    .update({ 
                      summary,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', leg.id);
                  
                  if (updateError) {
                    throw updateError;
                  }
                  
                  console.log(`Updated ${leg.number} with summary`);
                  found++;
                  sendSSE(controller, {
                    type: 'progress',
                    current: i + 1,
                    total: toProcess.length,
                    item: { id: leg.id, number: leg.number, success: true, summary: summary.substring(0, 100) + '...' }
                  });
                }
              } else {
                console.log(`No summary found for ${leg.number}`);
                failed++;
                sendSSE(controller, {
                  type: 'progress',
                  current: i + 1,
                  total: toProcess.length,
                  item: { id: leg.id, number: leg.number, success: false, error: 'Sumário não encontrado no EUR-Lex' }
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
    const results: { id: string; number: string; success: boolean; summary?: string; error?: string }[] = [];
    let found = 0;
    let failed = 0;
    
    for (const leg of toProcess) {
      try {
        console.log(`Fetching summary for ${leg.number}...`);
        
        const summary = await fetchEurlexSummary(leg.document_url, firecrawlKey);
        
        if (summary) {
          if (dryRun) {
            console.log(`[DRY RUN] Would update ${leg.number} with summary`);
            results.push({ id: leg.id, number: leg.number, success: true, summary: summary.substring(0, 100) + '...' });
          } else {
            const { error: updateError } = await supabase
              .from('legislation')
              .update({ 
                summary,
                updated_at: new Date().toISOString()
              })
              .eq('id', leg.id);
            
            if (updateError) {
              throw updateError;
            }
            
            console.log(`Updated ${leg.number} with summary`);
            results.push({ id: leg.id, number: leg.number, success: true, summary: summary.substring(0, 100) + '...' });
          }
          found++;
        } else {
          console.log(`No summary found for ${leg.number}`);
          results.push({ id: leg.id, number: leg.number, success: false, error: 'Sumário não encontrado no EUR-Lex' });
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
