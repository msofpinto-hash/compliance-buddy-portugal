const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface LegislationParts {
  type: string;
  num: string;
  year: string;
}

// Parse legislation number to extract type, number, and year
function extractLegislationParts(number: string): LegislationParts | null {
  const normalized = number.toLowerCase()
    .replace(/n\.?[º°o]\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Common patterns
  const patterns = [
    // "Decreto-Lei n.º 123/2024" or "Portaria n.º 456/2023"
    /^(decreto[- ]?lei|portaria|lei|despacho|aviso|regulamento|declaração de retificação|resolução|decreto regulamentar)\s*(\d+[-a-z]*)[\/\-](\d{2,4})/i,
    // "DL 123/2024"
    /^(dl|p|l)\s*(\d+[-a-z]*)[\/\-](\d{2,4})/i,
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      let year = match[3];
      if (year.length === 2) {
        year = parseInt(year) > 30 ? `19${year}` : `20${year}`;
      }
      return {
        type: normalizeType(match[1]),
        num: match[2].toUpperCase(),
        year
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

// Build DRE search URL
function buildDRESearchUrl(number: string, parts: LegislationParts | null): string {
  // Use DRE's search page with query parameters
  const baseUrl = 'https://diariodarepublica.pt/dr/pesquisa-avancada';
  
  if (parts) {
    // Try to build a more specific search
    const searchTerm = `${parts.type} ${parts.num}/${parts.year}`;
    return `${baseUrl}?q=${encodeURIComponent(searchTerm)}`;
  }
  
  return `${baseUrl}?q=${encodeURIComponent(number)}`;
}

// Scrape DRE search results directly
async function scrapeDRESearch(number: string): Promise<string | null> {
  const parts = extractLegislationParts(number);
  
  // Build search queries
  const queries = [];
  
  if (parts) {
    // Clean number for URL matching
    const cleanNum = parts.num.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
    
    // Try direct URL patterns first (faster)
    queries.push(
      `https://diariodarepublica.pt/dr/detalhe/${parts.type}/${parts.num}-${parts.year}`,
      `https://diariodarepublica.pt/dr/detalhe/${parts.type}/${cleanNum}-${parts.year}`,
    );
  }
  
  // Try direct URL guesses first
  for (const directUrl of queries) {
    try {
      const response = await fetch(directUrl, { 
        method: 'HEAD',
        redirect: 'follow'
      });
      if (response.ok && response.url.includes('/dr/detalhe/')) {
        console.log(`✓ Direct URL works: ${response.url}`);
        return response.url;
      }
    } catch (e) {
      // URL doesn't work, continue
    }
  }
  
  // Fall back to search page scraping
  try {
    const searchUrl = buildDRESearchUrl(number, parts);
    console.log(`Searching: ${searchUrl}`);
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    
    if (!response.ok) {
      console.log(`Search failed: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Look for result links in the HTML
    // Pattern: /dr/detalhe/TYPE/NUM-YEAR-ID
    const linkPattern = /href="(\/dr\/detalhe\/[^"]+)"/g;
    const matches = [...html.matchAll(linkPattern)];
    
    for (const match of matches) {
      const path = match[1];
      const fullUrl = `https://diariodarepublica.pt${path}`;
      
      // Validate the link matches our legislation
      if (parts && validateMatch(path, parts)) {
        console.log(`✓ Found: ${fullUrl}`);
        return fullUrl;
      }
    }
    
    // If we found any detalhe link, return the first one
    if (matches.length > 0) {
      const firstUrl = `https://diariodarepublica.pt${matches[0][1]}`;
      console.log(`✓ Found (first result): ${firstUrl}`);
      return firstUrl;
    }
    
    console.log(`✗ No results for: ${number}`);
    return null;
  } catch (error) {
    console.error(`Error scraping DRE: ${error}`);
    return null;
  }
}

function validateMatch(path: string, parts: LegislationParts): boolean {
  const pathLower = path.toLowerCase();
  const numClean = parts.num.replace(/[^0-9]/g, '');
  
  // Check if path contains the type and number
  return pathLower.includes(parts.type) && 
         pathLower.includes(numClean) && 
         pathLower.includes(parts.year);
}

// Process a batch of legislation items
async function processBatch(
  supabase: any,
  items: { id: string; number: string }[],
  dryRun: boolean
): Promise<{ found: number; failed: number; results: any[] }> {
  let found = 0;
  let failed = 0;
  const results: any[] = [];
  
  for (const item of items) {
    try {
      const url = await scrapeDRESearch(item.number);
      
      if (url) {
        found++;
        results.push({ id: item.id, number: item.number, url, success: true });
        
        if (!dryRun) {
          await supabase
            .from('legislation')
            .update({ document_url: url })
            .eq('id', item.id);
        }
      } else {
        failed++;
        results.push({ id: item.id, number: item.number, url: null, success: false });
      }
      
      // Small delay to be polite to DRE servers
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      failed++;
      results.push({ id: item.id, number: item.number, error: String(error), success: false });
    }
  }
  
  return { found, failed, results };
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

// Background processing
async function processInBackground(
  supabase: any,
  legislation: { id: string; number: string }[],
  logId: string,
  dryRun: boolean,
  batchSize: number
): Promise<void> {
  let processed = 0;
  let totalFound = 0;
  let totalFailed = 0;
  
  const totalBatches = Math.ceil(legislation.length / batchSize);
  
  for (let i = 0; i < legislation.length; i += batchSize) {
    const batch = legislation.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    
    console.log(`[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} items...`);
    
    const { found, failed } = await processBatch(supabase, batch, dryRun);
    
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
    
    console.log(`[Batch ${batchNum}/${totalBatches}] Done. Total: ${totalFound} found, ${totalFailed} failed`);
    
    // Delay between batches
    if (i + batchSize < legislation.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
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
  
  console.log(`Background job completed: ${totalFound} found, ${totalFailed} failed out of ${legislation.length}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 100, dryRun = false, background = false, batchSize = 10 } = await req.json().catch(() => ({}));
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log(`Finding missing DRE URLs (direct scraping). Limit: ${limit}, DryRun: ${dryRun}, Background: ${background}`);
    
    // Fetch Portuguese legislation without URLs using raw SQL-like filter
    const { data: allLegislation, error } = await supabase
      .from('legislation')
      .select('id, number, title')
      .is('document_url', null)
      .order('created_at', { ascending: false })
      .limit(limit * 3); // Fetch extra to account for filtering
    
    console.log(`Fetched ${allLegislation?.length || 0} items from database`);
    
    // Filter to only Portuguese legislation patterns
    const legislation = (allLegislation || []).filter(item => {
      const num = item.number;
      // Must have n.º X/YYYY or similar pattern (Portuguese legislation)
      const hasPortuguesePattern = /n\.?\s*[º°o]\s*\d+/i.test(num) && /\/\d{2,4}/.test(num);
      // Exclude EU regulations, UN regulations, conventions
      const isExcluded = /regulamento.*\(ce\)|regulamento.*\(ue\)|nações unidas|convenção|código/i.test(num);
      return hasPortuguesePattern && !isExcluded;
    }).slice(0, limit);
    
    console.log(`After filtering: ${legislation.length} Portuguese legislation items`);
    
    if (error) {
      console.error('Error fetching legislation:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!legislation || legislation.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No legislation without URLs found', total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Found ${legislation.length} items without URLs`);
    
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
      
      // Start background processing
      EdgeRuntime.waitUntil(processInBackground(supabase, legislation, logEntry.id, dryRun, batchSize));
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Background job started (direct scraping)',
          jobId: logEntry.id,
          total: legislation.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Synchronous processing
    const { found, failed, results } = await processBatch(supabase, legislation, dryRun);
    
    return new Response(
      JSON.stringify({
        success: true,
        total: legislation.length,
        found,
        failed,
        dryRun,
        results: results.slice(0, 20) // Limit results in response
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
