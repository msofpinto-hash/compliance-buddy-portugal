import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetadataUpdate {
  title?: string;
  summary?: string;
  publication_date?: string;
  effective_date?: string;
  origin?: string;
  document_url?: string;
}

interface ProcessResult {
  id: string;
  number: string;
  success: boolean;
  updates?: MetadataUpdate;
  error?: string;
}

const ITEM_TIMEOUT_MS = 12000;

// ============================================================================
// CELEX NUMBER EXTRACTION - Canonical EU identification
// ============================================================================

function extractCelexNumber(url: string | null, number: string): string | null {
  // Priority 1: Extract from URL
  if (url) {
    const celexFromUrl = url.match(/CELEX[:\s]*(\d{5}[A-Z]\d{4})/i);
    if (celexFromUrl) return celexFromUrl[1];
    
    const uriMatch = url.match(/uri=CELEX[:\s]*(\d{5}[A-Z]\d{4})/i);
    if (uriMatch) return uriMatch[1];
  }
  
  // Priority 2: Number is already CELEX format
  const directCelex = number.match(/^(\d{5}[A-Z]\d{4})$/);
  if (directCelex) return directCelex[1];
  
  // Priority 3: Parse structured EU number formats
  // Format: Regulamento (UE) 2024/1234 -> 32024R1234
  // Format: Diretiva (UE) 2020/2184 -> 32020L2184
  // Format: Decisão (UE) 2023/5678 -> 32023D5678
  
  const patterns = [
    // Regulamento (UE) YYYY/NNNN or Regulamento (CE) n.º NNNN/YYYY
    { regex: /Regulamento\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d{4})[\/\-](\d+)/i, type: 'R', yearFirst: true },
    { regex: /Regulamento\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d+)[\/\-](\d{4})/i, type: 'R', yearFirst: false },
    // Diretiva (UE) YYYY/NNNN
    { regex: /Diretiva\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d{4})[\/\-](\d+)/i, type: 'L', yearFirst: true },
    { regex: /Diretiva\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d+)[\/\-](\d{4})/i, type: 'L', yearFirst: false },
    // Decisão (UE) YYYY/NNNN
    { regex: /Decis[ãa]o\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d{4})[\/\-](\d+)/i, type: 'D', yearFirst: true },
    { regex: /Decis[ãa]o\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d+)[\/\-](\d{4})/i, type: 'D', yearFirst: false },
    // Recomendação -> H
    { regex: /Recomenda[çc][ãa]o\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d{4})[\/\-](\d+)/i, type: 'H', yearFirst: true },
    { regex: /Recomenda[çc][ãa]o\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d+)[\/\-](\d{4})/i, type: 'H', yearFirst: false },
  ];
  
  for (const { regex, type, yearFirst } of patterns) {
    const match = number.match(regex);
    if (match) {
      const year = yearFirst ? match[1] : match[2];
      const num = yearFirst ? match[2] : match[1];
      return `3${year}${type}${num.padStart(4, '0')}`;
    }
  }
  
  // Priority 4: Legacy formats (85/374/CEE -> 31985L0374)
  const legacyMatch = number.match(/(\d{2,4})[\/\-](\d+)[\/\-](CEE|CE|EEC|EU|EURATOM)/i);
  if (legacyMatch) {
    let year = legacyMatch[1];
    const num = legacyMatch[2];
    const suffix = legacyMatch[3].toUpperCase();
    
    // Expand 2-digit year
    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum > 50 ? `19${year}` : `20${year}`;
    }
    
    // Determine type from suffix context
    const type = suffix === 'CEE' || suffix === 'CE' || suffix === 'EU' ? 'L' : 'R';
    return `3${year}${type}${num.padStart(4, '0')}`;
  }
  
  return null;
}

// ============================================================================
// EU LEGISLATION DETECTION - Unambiguous identification
// ============================================================================

function isEULegislation(leg: { number: string; origin?: string; document_url?: string }): boolean {
  // Check origin field
  if (leg.origin === 'EU' || leg.origin === 'eurlex') return true;
  
  // Check URL
  if (leg.document_url?.includes('eur-lex.europa.eu')) return true;
  
  // Check CELEX pattern in number
  if (/^\d{5}[A-Z]\d{4}$/.test(leg.number)) return true;
  
  // Check EU document type keywords
  const euPatterns = [
    /^Regulamento\s*\([UEC]/i,
    /^Diretiva\s*\([UEC]/i,
    /^Decis[ãa]o\s*\([UEC]/i,
    /^Recomenda[çc][ãa]o\s*\([UEC]/i,
    /\/(CEE|CE|UE|EU|EURATOM)$/i,
  ];
  
  return euPatterns.some(p => p.test(leg.number));
}

// ============================================================================
// DATE PARSING AND NORMALIZATION
// ============================================================================

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // ISO format: YYYY-MM-DD
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  
  // European format: DD/MM/YYYY or DD-MM-YYYY
  const euMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (euMatch) {
    const day = euMatch[1].padStart(2, '0');
    const month = euMatch[2].padStart(2, '0');
    return `${euMatch[3]}-${month}-${day}`;
  }
  
  // Text format: "de DD de MMMM de YYYY"
  const ptMonths: Record<string, string> = {
    janeiro: '01', fevereiro: '02', março: '03', marco: '03', abril: '04',
    maio: '05', junho: '06', julho: '07', agosto: '08',
    setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
  };
  
  const textMatch = dateStr.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (textMatch) {
    const month = ptMonths[textMatch[2].toLowerCase()];
    if (month) {
      return `${textMatch[3]}-${month}-${textMatch[1].padStart(2, '0')}`;
    }
  }
  
  return null;
}

// Calculate effective date for EU legislation
// Default: publication_date + 20 days (standard EU rule)
function calculateEUEffectiveDate(publicationDate: string): string {
  const date = new Date(publicationDate);
  date.setDate(date.getDate() + 20);
  return date.toISOString().split('T')[0];
}

// ============================================================================
// METADATA EXTRACTION FROM EUR-LEX
// ============================================================================

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = ITEM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeEurLexMetadata(url: string): Promise<MetadataUpdate | null> {
  try {
    console.log(`[EUR-Lex] Scraping: ${url}`);
    
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
    }, 10000);
    
    if (!response.ok) {
      console.log(`[EUR-Lex] HTTP ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      console.log(`[EUR-Lex] Non-HTML content: ${contentType}`);
      return null;
    }
    
    const html = await response.text();
    const safeHtml = html.slice(0, 500000);
    
    const update: MetadataUpdate = {};
    
    // Extract OG title
    const ogTitle = safeHtml.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                    safeHtml.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
    if (ogTitle?.[1]) {
      let title = ogTitle[1].trim()
        .replace(/\s*-\s*EUR-Lex$/i, '')
        .replace(/\s*\|\s*EUR-Lex$/i, '')
        .trim();
      if (title.length > 20) {
        update.title = title;
      }
    }
    
    // Extract OG description for summary
    const ogDesc = safeHtml.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                   safeHtml.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
    if (ogDesc?.[1]) {
      const desc = ogDesc[1].trim();
      if (desc.length > 30 && !desc.toLowerCase().includes('eur-lex') && !desc.toLowerCase().includes('cookies')) {
        update.summary = desc;
      }
    }
    
    // Fallback: meta description
    if (!update.summary) {
      const metaDesc = safeHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                       safeHtml.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
      if (metaDesc?.[1]) {
        const desc = metaDesc[1].trim();
        if (desc.length > 30 && !desc.toLowerCase().includes('eur-lex')) {
          update.summary = desc;
        }
      }
    }
    
    // Extract dates from content
    // Pattern: "de DD de MMMM de YYYY"
    const datePatterns = [
      /entrada\s+em\s+vigor[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
      /entrada\s+em\s+vigor[:\s]+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i,
      /vigor[:\s]+a\s+partir\s+de[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = safeHtml.match(pattern);
      if (match) {
        const parsed = parseDate(match[1]);
        if (parsed) {
          update.effective_date = parsed;
          break;
        }
      }
    }
    
    console.log(`[EUR-Lex] Extracted: title=${!!update.title}, summary=${!!update.summary}, eff_date=${update.effective_date || 'none'}`);
    
    // FALLBACK: Extract summary from descriptive title
    if (!update.summary && update.title && update.title.length > 80) {
      const summaryPatterns = [
        /,?\s*que\s+([a-záéíóúàèìòùâêîôûãõ][^,]{30,})/i,
        /\s+(relativ[oa]s?\s+[aào]s?\s+[^,]{30,})/i,
        /de\s+\d{1,2}\s+de\s+\w+\s+de\s+\d{4}\s*,?\s+(.{30,})/i,
      ];
      
      for (const pattern of summaryPatterns) {
        const match = update.title.match(pattern);
        if (match?.[1]) {
          let extracted = match[1].trim();
          extracted = extracted.charAt(0).toUpperCase() + extracted.slice(1);
          extracted = extracted.replace(/\s*\([^)]*$/, '').trim();
          if (extracted.length >= 30) {
            update.summary = extracted;
            console.log(`[EUR-Lex] Extracted summary from title: ${extracted.substring(0, 60)}...`);
            break;
          }
        }
      }
    }
    
    return Object.keys(update).length > 0 ? update : null;
  } catch (error) {
    console.error(`[EUR-Lex] Scrape error:`, error);
    return null;
  }
}

// ============================================================================
// TITLE VALIDATION
// ============================================================================

function isGenericTitle(title: string | null, number: string): boolean {
  if (!title) return true;
  
  const clean = title.trim();
  if (clean.length < 15) return true;
  if (clean === number) return true;
  if (clean.toLowerCase().startsWith('documento ')) return true;
  
  // CELEX-only titles are generic
  if (/^\d{5}[A-Z]\d{4}$/.test(clean)) return true;
  
  return false;
}

function isValidSummary(summary: string | null): boolean {
  if (!summary) return false;
  const trimmed = summary.trim();
  if (trimmed.length < 20) return false;
  if (trimmed.toLowerCase().includes('cookies')) return false;
  if (trimmed.toLowerCase().includes('eur-lex')) return false;
  return true;
}

// ============================================================================
// MAIN PROCESSING LOGIC
// ============================================================================

async function runEUMetadataFix(options: {
  limit: number;
  mode: 'all' | 'missing_dates' | 'generic_titles' | 'short_summary';
  dryRun: boolean;
}): Promise<void> {
  const { limit, mode, dryRun } = options;
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log(`\n=== EU METADATA FIX ===`);
  console.log(`Mode: ${mode}, Limit: ${limit}, DryRun: ${dryRun}`);
  
  // FAIL-FAST: Check EUR-Lex source status
  const { data: sourceStatus } = await supabase
    .from('external_source_status')
    .select('status, blocked_until')
    .eq('source_name', 'eurlex')
    .maybeSingle();
  
  if (sourceStatus?.status === 'offline') {
    const blockedUntil = sourceStatus.blocked_until ? new Date(sourceStatus.blocked_until) : null;
    if (blockedUntil && blockedUntil > new Date()) {
      console.log(`⏸️ EUR-Lex is OFFLINE until ${blockedUntil.toISOString()}, aborting`);
      return;
    }
  }
  
  // Create sync log
  const { data: syncLog } = await supabase.from('sync_logs').insert({
    sync_type: `fix_eu_metadata_${mode}`,
    status: 'running',
    items_processed: 0,
    items_added: 0,
    items_updated: 0,
  }).select('id').single();
  
  const syncLogId = syncLog?.id;
  
  try {
    // Build query based on mode - ONLY fetch EU legislation with actual problems
    let query = supabase
      .from('legislation')
      .select('id, number, title, summary, document_url, publication_date, effective_date, origin')
      .is('revocation_date', null)
      // EU legislation detection: origin=EU OR eurlex URL OR CELEX number pattern
      .or('origin.eq.EU,origin.eq.eurlex,document_url.ilike.%eur-lex%,number.like.3_____%');
    
    // Mode-specific filters - CRITICAL: only process records that actually need fixing
    if (mode === 'missing_dates') {
      query = query.or('publication_date.is.null,effective_date.is.null');
    } else if (mode === 'generic_titles') {
      // Generic titles: CELEX-only (e.g., 32019R0123), "Documento ...", or very short
      query = query.or('title.ilike.Documento %,title.like.3%');
    } else if (mode === 'short_summary') {
      query = query.or('summary.is.null,summary.eq.');
    } else if (mode === 'all') {
      // ALL mode: only records that have at least ONE problem (dates, titles, or summaries)
      query = query.or(
        'publication_date.is.null,effective_date.is.null,' +
        'title.ilike.Documento %,title.like.3%,' +
        'summary.is.null,summary.eq.'
      );
    }
    
    const { data: legislation, error: queryError } = await query
      .order('created_at', { ascending: false })
      .limit(limit * 2); // Fetch more to filter
    
    if (queryError) throw queryError;
    
    if (!legislation || legislation.length === 0) {
      console.log('No EU legislation to process');
      if (syncLogId) {
        await supabase.from('sync_logs').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: 'Não há legislação EU para processar'
        }).eq('id', syncLogId);
      }
      return;
    }
    
    // Filter to actual EU legislation that NEEDS fixing
    const toProcess = legislation
      .filter(leg => {
        if (!isEULegislation(leg)) return false;
        
        // Check if this record actually has problems to fix
        const hasMissingDates = !leg.publication_date || !leg.effective_date;
        const hasGenericTitle = isGenericTitle(leg.title, leg.number);
        const hasShortSummary = !isValidSummary(leg.summary);
        
        if (mode === 'missing_dates') {
          return hasMissingDates;
        } else if (mode === 'generic_titles') {
          return hasGenericTitle;
        } else if (mode === 'short_summary') {
          return hasShortSummary;
        } else if (mode === 'all') {
          // ALL mode: only process if at least ONE problem exists
          return hasMissingDates || hasGenericTitle || hasShortSummary;
        }
        return false;
      })
      .slice(0, limit);
    
    console.log(`Found ${toProcess.length} EU legislation items to process`);
    
    if (syncLogId) {
      await supabase.from('sync_logs').update({ items_added: toProcess.length }).eq('id', syncLogId);
    }
    
    const results: ProcessResult[] = [];
    let totalUpdated = 0;
    
    for (const leg of toProcess) {
      try {
        console.log(`\n--- Processing: ${leg.number} ---`);
        
        const updates: MetadataUpdate = {};
        let hasUpdates = false;
        
        // Step 1: Ensure canonical origin
        if (leg.origin !== 'EU') {
          updates.origin = 'EU';
          hasUpdates = true;
        }
        
        // Step 2: Generate/validate URL from CELEX
        if (!leg.document_url || !leg.document_url.includes('eur-lex')) {
          const celex = extractCelexNumber(leg.document_url, leg.number);
          if (celex) {
            updates.document_url = `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;
            hasUpdates = true;
            console.log(`Generated URL from CELEX: ${celex}`);
          }
        }
        
        // Step 3: Scrape metadata if needed
        const urlToScrape = updates.document_url || leg.document_url;
        const needsTitle = isGenericTitle(leg.title, leg.number);
        const needsSummary = !isValidSummary(leg.summary);
        const needsDates = !leg.publication_date || !leg.effective_date;
        
        if (urlToScrape && (needsTitle || needsSummary || needsDates)) {
          const scraped = await scrapeEurLexMetadata(urlToScrape);
          
          if (scraped) {
            if (needsTitle && scraped.title && !isGenericTitle(scraped.title, leg.number)) {
              updates.title = scraped.title;
              hasUpdates = true;
              console.log(`New title: ${scraped.title.substring(0, 60)}...`);
            }
            
            if (needsSummary && scraped.summary && isValidSummary(scraped.summary)) {
              updates.summary = scraped.summary;
              hasUpdates = true;
              console.log(`New summary: ${scraped.summary!.substring(0, 60)}...`);
            }
            
            if (scraped.effective_date && !leg.effective_date) {
              updates.effective_date = scraped.effective_date;
              hasUpdates = true;
              console.log(`New effective_date: ${scraped.effective_date}`);
            }
          }
        }
        
        // Step 4: Calculate fallback effective date if still missing
        if (!leg.effective_date && !updates.effective_date && leg.publication_date) {
          updates.effective_date = calculateEUEffectiveDate(leg.publication_date);
          hasUpdates = true;
          console.log(`Fallback effective_date (pub+20): ${updates.effective_date}`);
        }
        
        // Step 5: Apply updates
        if (hasUpdates && !dryRun) {
          const { error: updateError } = await supabase
            .from('legislation')
            .update(updates)
            .eq('id', leg.id);
          
          if (updateError) {
            console.error(`Update failed for ${leg.number}:`, updateError);
            results.push({ id: leg.id, number: leg.number, success: false, error: updateError.message });
          } else {
            totalUpdated++;
            results.push({ id: leg.id, number: leg.number, success: true, updates });
          }
        } else if (hasUpdates) {
          console.log(`[DRY RUN] Would update:`, updates);
          results.push({ id: leg.id, number: leg.number, success: true, updates });
        } else {
          results.push({ id: leg.id, number: leg.number, success: true });
        }
        
      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({
          id: leg.id,
          number: leg.number,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // Finalize
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n=== COMPLETE ===`);
    console.log(`Processed: ${results.length}, Updated: ${totalUpdated}, Failed: ${failed}`);
    
    if (syncLogId) {
      await supabase.from('sync_logs').update({
        status: 'completed',
        items_processed: results.length,
        items_updated: totalUpdated,
        error_message: failed > 0 ? `${failed} erro(s)` : `✓ ${totalUpdated} metadados atualizados`,
        completed_at: new Date().toISOString()
      }).eq('id', syncLogId);
    }
    
  } catch (error) {
    console.error('EU Metadata Fix error:', error);
    
    if (syncLogId) {
      await supabase.from('sync_logs').update({
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString()
      }).eq('id', syncLogId);
    }
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const {
      limit = 30,
      mode = 'all',
      dryRun = false,
      background = true,
    } = await req.json().catch(() => ({}));
    
    const validModes = ['all', 'missing_dates', 'generic_titles', 'short_summary'];
    if (!validModes.includes(mode)) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid mode. Use: ${validModes.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Quick count check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    let pendingQuery = supabase
      .from('legislation')
      .select('id', { count: 'exact', head: true })
      .is('revocation_date', null)
      .or('origin.eq.EU,origin.eq.eurlex,document_url.ilike.%eur-lex%,number.like.3_____%');
    
    if (mode === 'missing_dates') {
      pendingQuery = pendingQuery.or('publication_date.is.null,effective_date.is.null');
    } else if (mode === 'generic_titles') {
      pendingQuery = pendingQuery.or('title.ilike.Documento %,title.like.3_____%');
    } else if (mode === 'short_summary') {
      pendingQuery = pendingQuery.or('summary.is.null,summary.eq.');
    }
    
    const { count: pendingCount } = await pendingQuery;
    
    if (!pendingCount || pendingCount === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Não há legislação EU pendente para o modo selecionado',
          pendingCount: 0,
          mode
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (background) {
      EdgeRuntime.waitUntil(runEUMetadataFix({ limit, mode, dryRun }));
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Correção de metadados EU iniciada em segundo plano',
          pendingCount,
          limit,
          mode,
          background: true,
          trackingType: `fix_eu_metadata_${mode}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    await runEUMetadataFix({ limit, mode, dryRun });
    
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
