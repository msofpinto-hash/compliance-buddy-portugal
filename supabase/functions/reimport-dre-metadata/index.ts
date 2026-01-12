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
  
  // Extract title - look for the diploma title pattern
  // Usually appears after the diploma type and number
  const titlePatterns = [
    // Pattern: Look for content after "Série" line
    /Série [I]+.*?\n(.+?)(?:\n|Emissor)/s,
    // Pattern: Title is the first substantial line after number
    new RegExp(`${currentNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n+(.+?)(?:\\n|$)`),
    // Pattern: Look for text before "Emissor:"
    /^(.+?)(?=\nEmissor:)/m,
  ];
  
  for (const pattern of titlePatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match && match[1]) {
      const potentialTitle = match[1].trim();
      // Validate it's a good title (not too short, not just the number)
      if (potentialTitle.length > 20 && 
          !potentialTitle.includes('http') &&
          !potentialTitle.toLowerCase().startsWith('emissor') &&
          !potentialTitle.toLowerCase().startsWith('série')) {
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
  
  // Extract summary - look for "Sumário:" section
  const summaryMatch = cleanMarkdown.match(/Sum[áa]rio[:\s]*\n?([^\n]+(?:\n[^\n]+)*?)(?=\n(?:Texto|Data|Publicação|Série|$))/i);
  if (summaryMatch) {
    const summary = summaryMatch[1].trim();
    if (summary && summary.length > 10 && !summary.includes('Lamentamos')) {
      update.summary = summary.substring(0, 2000);
    }
  }
  
  // Extract effective date (data de entrada em vigor)
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
          // Month name format
          const monthMap: Record<string, string> = {
            'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
            'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
            'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
          };
          dateStr = `${match[3]}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
        } else {
          // Numeric format
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

// Background processing function
async function processLegislationBatch(
  supabase: any,
  legislation: any[],
  firecrawlKey: string,
  syncLogId: string | null
) {
  const results: { id: string; number: string; success: boolean; updates?: LegislationUpdate; error?: string }[] = [];
  
  try {
    for (const leg of legislation) {
      try {
        // Skip if already has good data
        const hasGoodTitle = leg.title && leg.title.length > 30 && leg.title !== leg.number && !leg.title.includes('http');
        const hasGoodSummary = leg.summary && leg.summary.length > 20 && !leg.summary.includes('Lamentamos');
        
        if (hasGoodTitle && hasGoodSummary && leg.entity) {
          console.log(`Skipping ${leg.number} - already has good data`);
          results.push({ id: leg.id, number: leg.number, success: true, updates: {} });
          continue;
        }
        
        console.log(`Processing ${leg.number}...`);
        
        const scrapeResult = await scrapeWithFirecrawl(leg.document_url, firecrawlKey);
        
        if (!scrapeResult.success || !scrapeResult.data?.markdown) {
          console.log(`Failed to scrape ${leg.number}`);
          results.push({ id: leg.id, number: leg.number, success: false, error: 'Scrape failed' });
          continue;
        }
        
        const updates = extractMetadataFromDRE(scrapeResult.data.markdown, leg.number);
        
        // Only update fields that are currently empty/bad
        const finalUpdates: LegislationUpdate = {};
        
        if (updates.title && !hasGoodTitle) {
          finalUpdates.title = updates.title;
        }
        if (updates.summary && !hasGoodSummary) {
          finalUpdates.summary = updates.summary;
        }
        if (updates.entity && !leg.entity) {
          finalUpdates.entity = updates.entity;
        }
        if (updates.effective_date && !leg.effective_date) {
          finalUpdates.effective_date = updates.effective_date;
        }
        
        if (Object.keys(finalUpdates).length > 0) {
          const { error: updateError } = await supabase
            .from('legislation')
            .update(finalUpdates)
            .eq('id', leg.id);
          
          if (updateError) {
            throw updateError;
          }
          
          console.log(`Updated ${leg.number}:`, finalUpdates);
          results.push({ id: leg.id, number: leg.number, success: true, updates: finalUpdates });
        } else {
          console.log(`No updates needed for ${leg.number}`);
          results.push({ id: leg.id, number: leg.number, success: true, updates: {} });
        }
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({ id: leg.id, number: leg.number, success: false, error: String(error) });
      }
    }
    
    const updated = results.filter(r => r.success && r.updates && Object.keys(r.updates).length > 0).length;
    const failed = results.filter(r => !r.success).length;
    
    // Update sync log - this is the critical part that was failing
    if (syncLogId) {
      console.log(`Updating sync log ${syncLogId}: ${updated} updated, ${failed} failed out of ${legislation.length}`);
      const { error: syncLogError } = await supabase
        .from('sync_logs')
        .update({
          status: failed > 0 ? 'completed_with_errors' : 'completed',
          items_processed: legislation.length,
          items_updated: updated,
          error_message: failed > 0 ? `${failed} items failed` : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId);
      
      if (syncLogError) {
        console.error('Failed to update sync log:', syncLogError);
      } else {
        console.log('Sync log updated successfully');
      }
    }
    
    console.log(`Reimport completed: ${updated} updated, ${failed} failed out of ${legislation.length} processed`);
    
    return { updated, failed, results };
  } catch (error) {
    console.error('Error in background processing:', error);
    
    // Make sure to update sync log even on error
    if (syncLogId) {
      try {
        await supabase
          .from('sync_logs')
          .update({
            status: 'error',
            error_message: String(error),
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLogId);
      } catch (syncError) {
        console.error('Failed to update sync log on error:', syncError);
      }
    }
    
    throw error;
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

  const SYNC_TYPE = 'reimport-dre-metadata';

  try {
    const { legislationIds, all2026, scheduled, batchSize = 50 } = await req.json().catch(() => ({}));
    
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

    // Check concurrency for scheduled runs
    if (scheduled) {
      const { canProceed, runningJob } = await checkConcurrency(supabase, SYNC_TYPE);
      if (!canProceed) {
        console.log(`⚠️ Job já em execução desde ${runningJob?.started_at}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Job já em execução",
            runningJobId: runningJob?.id,
            runningJobStartedAt: runningJob?.started_at,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Create sync log for scheduled runs
    let syncLogId: string | null = null;
    if (scheduled) {
      const { data: syncLog, error: syncLogCreateError } = await supabase
        .from('sync_logs')
        .insert({
          sync_type: 'reimport-dre-metadata',
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      
      if (syncLogCreateError) {
        console.error('Failed to create sync log:', syncLogCreateError);
      } else {
        syncLogId = syncLog?.id || null;
        console.log('Created sync log:', syncLogId);
      }
    }
    
    // Determine which legislation to process
    let query = supabase
      .from('legislation')
      .select('id, number, title, summary, entity, document_url, publication_date, effective_date')
      .or('origin.eq.PT,origin.eq.dre,source.ilike.dre%')
      .not('document_url', 'is', null)
      .like('document_url', '%diariodarepublica.pt%');
    
    if (all2026) {
      // Get all 2026+ DRE legislation with missing data
      query = query.gte('publication_date', '2026-01-01');
    } else if (legislationIds && legislationIds.length > 0) {
      query = query.in('id', legislationIds);
    } else if (scheduled) {
      // Scheduled mode: get ALL legislation with missing data, limited by batchSize
      // No date filter - process oldest first
      query = query.order('publication_date', { ascending: true });
    } else {
      // Default: get recent legislation (last 60 days) with missing metadata
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      query = query.gte('publication_date', sixtyDaysAgo.toISOString().split('T')[0]);
    }
    
    // Filter to only get items with missing/bad data
    query = query.or('summary.is.null,summary.eq.,summary.ilike.%Diploma referenciado%,entity.is.null,entity.eq.');
    
    // Apply batch size limit for scheduled runs
    if (scheduled) {
      query = query.limit(batchSize);
    }
    
    const { data: legislation, error: fetchError } = await query;
    
    if (fetchError) {
      console.error('Failed to fetch legislation:', fetchError);
      if (syncLogId) {
        await supabase
          .from('sync_logs')
          .update({ status: 'error', error_message: fetchError.message, completed_at: new Date().toISOString() })
          .eq('id', syncLogId);
      }
      throw fetchError;
    }
    
    if (!legislation || legislation.length === 0) {
      console.log('No legislation to process');
      if (syncLogId) {
        await supabase
          .from('sync_logs')
          .update({ status: 'completed', items_processed: 0, items_updated: 0, completed_at: new Date().toISOString() })
          .eq('id', syncLogId);
      }
      return new Response(
        JSON.stringify({ success: true, message: 'No legislation to process', updated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Found ${legislation.length} legislation items to process`);
    
    // For scheduled runs, use background task to ensure completion
    if (scheduled) {
      // Use EdgeRuntime.waitUntil to process in background
      const backgroundTask = processLegislationBatch(supabase, legislation, firecrawlKey, syncLogId);
      
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(backgroundTask);
        console.log('Background task scheduled for', legislation.length, 'items');
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Processing ${legislation.length} items in background`,
            syncLogId,
            itemsToProcess: legislation.length
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Fallback: process synchronously if EdgeRuntime.waitUntil is not available
        console.log('EdgeRuntime.waitUntil not available, processing synchronously');
        const result = await backgroundTask;
        return new Response(
          JSON.stringify({
            success: true,
            processed: legislation.length,
            updated: result.updated,
            failed: result.failed,
            results: result.results
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Non-scheduled runs: process synchronously
    const result = await processLegislationBatch(supabase, legislation, firecrawlKey, syncLogId);
    
    return new Response(
      JSON.stringify({
        success: true,
        processed: legislation.length,
        updated: result.updated,
        failed: result.failed,
        results: result.results
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

// Handle shutdown to log incomplete tasks
addEventListener('beforeunload', (ev: any) => {
  console.log('Function shutting down:', ev.detail?.reason || 'unknown reason');
});
