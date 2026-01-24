const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface LegislationParts {
  type: string;
  num: string;
  suffix: string;
  year: string;
  series: string;
}

// Parse legislation number to extract type, number, suffix, year, series
function extractLegislationParts(number: string): LegislationParts | null {
  const normalized = number.toLowerCase()
    .replace(/n\.?[º°o]\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Patterns for Portuguese legislation with suffixes like -A, -B, /1, /2
  const patterns = [
    // "Decreto-Lei n.º 123-A/2024" or "Portaria n.º 456-B/2023/1"
    /^(decreto[- ]?lei|portaria|lei|despacho|aviso|regulamento|declaração de retificação|resolução|decreto regulamentar)\s*(\d+)[-]?([a-z])?[\/](\d{2,4})(?:[\/](\d))?/i,
    // DL 123/2024
    /^(dl|p|l)\s*(\d+)[-]?([a-z])?[\/](\d{2,4})(?:[\/](\d))?/i,
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      let year = match[4];
      if (year.length === 2) {
        year = parseInt(year) > 30 ? `19${year}` : `20${year}`;
      }
      return {
        type: normalizeType(match[1]),
        num: match[2],
        suffix: (match[3] || '').toUpperCase(),
        year,
        series: match[5] || ''
      };
    }
  }
  
  return null;
}

function normalizeType(type: string): string {
  const normalized = type.toLowerCase().replace(/[- ]/g, '');
  const typeMap: Record<string, string> = {
    'decretoregulamentar': 'decreto-regulamentar',
    'decretolei': 'decreto-lei',
    'dl': 'decreto-lei',
    'portaria': 'portaria',
    'p': 'portaria',
    'lei': 'lei',
    'l': 'lei',
    'despacho': 'despacho',
    'aviso': 'aviso',
    'regulamento': 'regulamento',
    'declaraçãoderetificação': 'declaracao-retificacao',
    'resolução': 'resolucao',
  };
  return typeMap[normalized] || type.toLowerCase();
}

// Scrape DRE search results with optimized parallel requests
async function scrapeDRESearch(number: string, timeoutMs: number = 5000): Promise<string | null> {
  const parts = extractLegislationParts(number);
  if (!parts) return null;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    // Build search query
    const searchTerm = parts.suffix 
      ? `${parts.type} ${parts.num}-${parts.suffix}/${parts.year}${parts.series ? '/' + parts.series : ''}`
      : `${parts.type} ${parts.num}/${parts.year}${parts.series ? '/' + parts.series : ''}`;
    
    const searchUrl = `https://diariodarepublica.pt/dr/pesquisa-avancada?q=${encodeURIComponent(searchTerm)}`;
    
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Look for result links in the HTML
    const linkPattern = /href="(\/dr\/detalhe\/[^"]+)"/g;
    const matches = [...html.matchAll(linkPattern)];
    
    // Find best match
    for (const match of matches) {
      const path = match[1].toLowerCase();
      const numClean = parts.num;
      
      // Check if path contains the type and number
      if (path.includes(parts.type) && path.includes(numClean) && path.includes(parts.year)) {
        // Check suffix if present
        if (parts.suffix && !path.includes(`${numClean}-${parts.suffix.toLowerCase()}`)) {
          continue;
        }
        return `https://diariodarepublica.pt${match[1]}`;
      }
    }
    
    // Return first result if no exact match
    if (matches.length > 0) {
      return `https://diariodarepublica.pt${matches[0][1]}`;
    }
    
    return null;
  } catch (error) {
    clearTimeout(timeout);
    return null;
  }
}

// Process items in parallel with concurrency control
async function processParallel(
  items: { id: string; number: string }[],
  supabase: any,
  dryRun: boolean,
  concurrency: number,
  timeoutMs: number,
  delayMs: number
): Promise<{ found: number; failed: number; results: any[] }> {
  let found = 0;
  let failed = 0;
  const results: any[] = [];
  
  // Process in concurrent batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (item) => {
      const url = await scrapeDRESearch(item.number, timeoutMs);
      
      if (url) {
        if (!dryRun) {
          await supabase
            .from('legislation')
            .update({ document_url: url })
            .eq('id', item.id);
        }
        return { id: item.id, number: item.number, url, success: true };
      }
      return { id: item.id, number: item.number, url: null, success: false };
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const result of batchResults) {
      results.push(result);
      if (result.success) found++;
      else failed++;
    }
    
    // Delay between batches to avoid rate limiting
    if (delayMs > 0 && i + concurrency < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return { found, failed, results };
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

// Background processing with parallel execution
async function processInBackground(
  supabase: any,
  legislation: { id: string; number: string }[],
  logId: string,
  dryRun: boolean,
  concurrency: number,
  timeoutMs: number,
  batchDelayMs: number
): Promise<void> {
  let processed = 0;
  let totalFound = 0;
  let totalFailed = 0;
  
  const batchSize = concurrency * 5; // Process 5 waves of concurrent requests per update
  const totalBatches = Math.ceil(legislation.length / batchSize);
  
  console.log(`🚀 Starting parallel processing: ${legislation.length} items, concurrency: ${concurrency}, timeout: ${timeoutMs}ms`);
  
  for (let i = 0; i < legislation.length; i += batchSize) {
    const batch = legislation.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    
    console.log(`[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} items (${concurrency} parallel)...`);
    
    const { found, failed } = await processParallel(batch, supabase, dryRun, concurrency, timeoutMs, batchDelayMs);
    
    processed += batch.length;
    totalFound += found;
    totalFailed += failed;
    
    // Update progress
    await supabase
      .from('sync_logs')
      .update({
        items_processed: processed,
        items_added: totalFound,
        items_updated: totalFailed,
        status: processed >= legislation.length ? 'completed' : 'running'
      })
      .eq('id', logId);
    
    console.log(`[Batch ${batchNum}/${totalBatches}] Done. Running: ${totalFound} found, ${totalFailed} failed (${Math.round(100 * totalFound / processed)}% success)`);
  }
  
  // Final update
  await supabase
    .from('sync_logs')
    .update({
      items_processed: legislation.length,
      items_added: totalFound,
      items_updated: totalFailed,
      status: 'completed',
      completed_at: new Date().toISOString()
    })
    .eq('id', logId);
  
  console.log(`✅ Background job completed: ${totalFound} found, ${totalFailed} failed out of ${legislation.length} (${Math.round(100 * totalFound / legislation.length)}% success)`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      limit = 200, 
      dryRun = false, 
      background = true,
      // Performance tuning
      concurrency = 40,      // Parallel requests
      timeoutMs = 5000,      // Request timeout
      batchDelayMs = 100,    // Delay between concurrent batches
      // Speed presets
      speed = 'rapido'       // conservador, rapido, maximo
    } = await req.json().catch(() => ({}));
    
    // Apply speed presets
    let effectiveConcurrency = concurrency;
    let effectiveTimeout = timeoutMs;
    let effectiveDelay = batchDelayMs;
    
    if (speed === 'conservador') {
      effectiveConcurrency = 20;
      effectiveTimeout = 8000;
      effectiveDelay = 300;
    } else if (speed === 'maximo') {
      effectiveConcurrency = 80;
      effectiveTimeout = 3500;
      effectiveDelay = 0;
    } else if (speed === 'rapido') {
      effectiveConcurrency = 40;
      effectiveTimeout = 5000;
      effectiveDelay = 100;
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log(`🔍 Finding missing DRE URLs - Limit: ${limit}, Speed: ${speed}, Concurrency: ${effectiveConcurrency}`);
    
    // Fetch legislation without URLs
    const { data: allLegislation, error } = await supabase
      .from('legislation')
      .select('id, number, title')
      .or('document_url.is.null,document_url.eq.')
      .or('no_digital_version.is.null,no_digital_version.eq.false')
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    
    if (error) {
      console.error('Error fetching legislation:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Filter to only Portuguese legislation patterns
    const legislation = (allLegislation || []).filter(item => {
      const num = item.number;
      // Must have n.º X/YYYY pattern (Portuguese legislation)
      const hasPortuguesePattern = /n\.?\s*[º°o]\s*\d+/i.test(num) && /\/\d{2,4}/.test(num);
      // Exclude EU regulations, UN regulations, conventions
      const isExcluded = /regulamento.*\(ce\)|regulamento.*\(ue\)|nações unidas|convenção|código|tratado/i.test(num);
      // Exclude items that likely have no digital version
      const isHistorical = /\/[0-6]\d$/.test(num) && !/\/(19|20)\d{2}/.test(num); // Old 2-digit years like /54
      
      return hasPortuguesePattern && !isExcluded && !isHistorical;
    }).slice(0, limit);
    
    console.log(`📋 Found ${legislation.length} Portuguese legislation items without URLs`);
    
    if (!legislation || legislation.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No legislation without URLs found', total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (background) {
      // Create sync log entry
      const { data: logEntry, error: logError } = await supabase
        .from('sync_logs')
        .insert({
          sync_type: 'find_dre_urls_direct',
          status: 'running',
          items_processed: 0,
          items_added: 0
        })
        .select()
        .single();
      
      if (logError) {
        console.error('Error creating log:', logError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create sync log' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Start background processing with parallel execution
      EdgeRuntime.waitUntil(processInBackground(
        supabase, 
        legislation, 
        logEntry.id, 
        dryRun, 
        effectiveConcurrency, 
        effectiveTimeout, 
        effectiveDelay
      ));
      
      return new Response(
        JSON.stringify({
          success: true,
          message: `Background job started (${speed} mode, ${effectiveConcurrency} parallel)`,
          jobId: logEntry.id,
          total: legislation.length,
          settings: {
            speed,
            concurrency: effectiveConcurrency,
            timeoutMs: effectiveTimeout,
            batchDelayMs: effectiveDelay
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Synchronous processing with parallel execution
    const { found, failed, results } = await processParallel(
      legislation, 
      supabase, 
      dryRun, 
      effectiveConcurrency, 
      effectiveTimeout, 
      effectiveDelay
    );
    
    return new Response(
      JSON.stringify({
        success: true,
        total: legislation.length,
        found,
        failed,
        successRate: Math.round(100 * found / legislation.length),
        dryRun,
        results: results.slice(0, 20)
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
