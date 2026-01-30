import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

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

// Timeout wrapper for fetch operations - CRITICAL to prevent blocking
// Keep individual external calls <= 15s to avoid long-running jobs and timeouts.
const ITEM_TIMEOUT_MS = 15000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireRateLimitSlot(
  supabase: any,
  opts: { identifier: string; functionName: string; maxRequests?: number; windowSeconds?: number; maxWaitMs?: number }
): Promise<boolean> {
  const { identifier, functionName } = opts;
  const maxRequests = opts.maxRequests ?? 25;
  const windowSeconds = opts.windowSeconds ?? 60;
  const maxWaitMs = opts.maxWaitMs ?? 12000;

  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const { data, error } = await supabase.rpc('check_rate_limit', {
        p_identifier: identifier,
        p_function_name: functionName,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      });
      if (error) {
        console.log('[RateLimit] RPC error, skipping limiter:', error);
        return true; // fail-open to avoid blocking jobs entirely
      }
      if (data?.allowed) return true;

      const resetAt = data?.reset_at ? new Date(data.reset_at).getTime() : Date.now() + 1000;
      const waitMs = Math.max(250, Math.min(1500, resetAt - Date.now()));
      await sleep(waitMs);
    } catch (e) {
      console.log('[RateLimit] Unexpected error, skipping limiter:', e);
      return true;
    }
  }
  return false;
}

function extractDreIdCandidates(dreUrl: string): { slug: string; numeric?: string } | null {
  const dreIdMatch = dreUrl.match(/\/detalhe\/[^\/]+\/([^\/?]+)/);
  if (!dreIdMatch?.[1]) return null;
  const slug = dreIdMatch[1];

  // Many DRE URLs embed a numeric internal ID at the end: {number}-{year}-{id}
  // Example: 165-1983-311467 -> numeric id = 311467
  const parts = slug.split("-").filter(Boolean);
  const last = parts[parts.length - 1];
  const numeric = last && /^\d{5,}$/.test(last) ? last : undefined;
  return { slug, numeric };
}

async function safeJsonFromResponse(res: Response): Promise<any | null> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text(); // Always consume body
  if (!res.ok) return null;
  if (!contentType.includes("application/json") && !contentType.includes("json")) {
    console.log(`[DRE OpenData] Non-JSON response (content-type=${contentType}). Snippet: ${text.slice(0, 120)}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.log(`[DRE OpenData] JSON parse error. Snippet: ${text.slice(0, 120)}`);
    console.log(e);
    return null;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = ITEM_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
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

// Interface for DRE OpenData API response
interface DREOpenDataResult {
  title?: string;
  summary?: string;
  entity?: string;
  publicationDate?: string;
  effectiveDate?: string;
  documentUrl?: string;
}

// Try to fetch metadata from DRE OpenData API (free, no rate limits, structured data)
// This is the preferred method for Portuguese legislation as it doesn't require JS rendering
async function fetchDREOpenData(dreUrl: string): Promise<DREOpenDataResult | null> {
  try {
    const ids = extractDreIdCandidates(dreUrl);
    if (!ids) {
      console.log('[DRE OpenData] Could not extract ID from URL:', dreUrl);
      return null;
    }

    // Prefer numeric id if present; OpenData commonly expects the internal numeric identifier.
    const primaryId = ids.numeric || ids.slug;
    const candidates = [primaryId, ids.slug].filter((v, i, arr) => v && arr.indexOf(v) === i) as string[];

    for (const cand of candidates) {
      const apiUrl = `https://data.dre.pt/opendata/diploma/${cand}`;
      console.log('[DRE OpenData] Fetching:', apiUrl);

      const response = await fetchWithTimeout(
        apiUrl,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; LegislationBot/1.0)',
          },
        },
        10000
      );

      const data = await safeJsonFromResponse(response);
      const parsed = data ? parseDREApiResponse(data) : null;
      if (parsed) return parsed;
    }

    // Try alternative search endpoint (sometimes more forgiving)
    for (const cand of candidates) {
      const altApiUrl = `https://data.dre.pt/opendata/document?q=${encodeURIComponent(cand)}`;
      console.log('[DRE OpenData] Primary failed, trying:', altApiUrl);
      const altResponse = await fetchWithTimeout(
        altApiUrl,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; LegislationBot/1.0)',
          },
        },
        10000
      );
      const altData = await safeJsonFromResponse(altResponse);
      const parsed = altData ? parseDREApiResponse(altData) : null;
      if (parsed) return parsed;
    }

    return null;
  } catch (error) {
    console.log('[DRE OpenData] Error:', error);
    return null;
  }
}

// Parse DRE API response into our format
function parseDREApiResponse(data: any): DREOpenDataResult | null {
  if (!data) return null;
  
  // Handle array responses
  const doc = Array.isArray(data) ? data[0] : (data.results?.[0] || data);
  if (!doc) return null;
  
  const result: DREOpenDataResult = {};
  
  // Extract title (various field names used by DRE API)
  const title = doc.titulo || doc.title || doc.descricao || doc.sumario || doc.summary;
  if (title && typeof title === 'string' && title.length > 15) {
    result.title = title.trim();
  }
  
  // Extract summary
  const summary = doc.sumario || doc.summary || doc.descricao || doc.resumo || doc.objeto;
  if (summary && typeof summary === 'string' && summary.length > 20 && summary !== title) {
    result.summary = summary.trim();
  }
  
  // Extract entity
  const entity = doc.emissor || doc.entidade || doc.entity || doc.fonte || doc.organismo;
  if (entity && typeof entity === 'string' && entity.length > 3) {
    result.entity = entity.trim();
  }
  
  // Extract dates
  const pubDate = doc.dataPublicacao || doc.publicationDate || doc.data || doc.dataEmissao;
  if (pubDate) {
    const dateStr = typeof pubDate === 'string' ? pubDate : pubDate.toString();
    // Try to parse various date formats
    const parsedDate = parseDate(dateStr);
    if (parsedDate) result.publicationDate = parsedDate;
  }
  
  const effDate = doc.dataEntradaVigor || doc.effectiveDate || doc.dataVigor || doc.vigencia;
  if (effDate) {
    const dateStr = typeof effDate === 'string' ? effDate : effDate.toString();
    const parsedDate = parseDate(dateStr);
    if (parsedDate) result.effectiveDate = parsedDate;
  }
  
  // Extract document URL
  const url = doc.url || doc.link || doc.ligacao || doc.urlPdf || doc.urlTexto;
  if (url && typeof url === 'string') {
    result.documentUrl = url;
  }
  
  console.log('[DRE OpenData] Parsed:', result);
  return Object.keys(result).length > 0 ? result : null;
}

// Helper to parse date strings into YYYY-MM-DD format
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Try ISO format first
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const euMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (euMatch) {
    const day = euMatch[1].padStart(2, '0');
    const month = euMatch[2].padStart(2, '0');
    return `${euMatch[3]}-${month}-${day}`;
  }
  
  // Try YYYY/MM/DD
  const usMatch = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (usMatch) {
    const month = usMatch[2].padStart(2, '0');
    const day = usMatch[3].padStart(2, '0');
    return `${usMatch[1]}-${month}-${day}`;
  }
  
  return null;
}

// Search DRE for a legislation URL using Firecrawl
async function searchDREUrl(number: string, firecrawlKey: string, supabase: any): Promise<string | null> {
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
    
    const allowed = await acquireRateLimitSlot(supabase, {
      identifier: 'firecrawl',
      functionName: 'firecrawl_search',
      maxRequests: 25,
      windowSeconds: 60,
      maxWaitMs: 12000,
    });
    if (!allowed) {
      console.log('[RateLimit] Firecrawl search throttled - skipping for now');
      return null;
    }

    const response = await fetchWithTimeout('https://api.firecrawl.dev/v1/search', {
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
    console.error(`Search error (timeout?): ${error}`);
    return null;
  }
}

// Check if URL is a PDF or other binary file that can't be scraped
function isNonScrapableUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.pdf') || 
         lowerUrl.endsWith('.doc') || 
         lowerUrl.endsWith('.docx') ||
         lowerUrl.endsWith('.xls') ||
         lowerUrl.endsWith('.xlsx') ||
         lowerUrl.includes('/gratuitos/') || // DRE PDF downloads
         lowerUrl.includes('files.dre.pt') ||
         lowerUrl.includes('/application/file/'); // DRE file downloads
}

// Check if URL is from a domain that supports direct scraping (static HTML, no JS rendering)
// NOTE: DRE uses a SPA/React app BUT meta tags are available in initial HTML without JS!
// This allows us to extract title, description, and other metadata without Firecrawl
// EUR-Lex serves static HTML so direct scraping works well
function isDirectScrapableDomain(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  // BOTH DRE and EUR-Lex support direct meta-tag scraping
  // DRE's main content requires JS, but meta tags don't!
  return lowerUrl.includes('eur-lex.europa.eu') || 
         lowerUrl.includes('dre.pt') || 
         lowerUrl.includes('diariodarepublica.pt');
}

// Extract content using semantic selectors for DRE pages
function extractDREContent(html: string): string {
  const parts: string[] = [];
  
  // Priority 1: Meta description (always reliable for summary)
  const metaDesc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                   html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  if (metaDesc?.[1]) {
    parts.push(`META_DESCRIPTION: ${metaDesc[1].trim()}`);
  }
  
  // Priority 2: OG description
  const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
                 html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
  if (ogDesc?.[1] && ogDesc[1] !== metaDesc?.[1]) {
    parts.push(`OG_DESCRIPTION: ${ogDesc[1].trim()}`);
  }
  
  // Priority 3: OG title (often contains the full title)
  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                  html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
  if (ogTitle?.[1]) {
    parts.push(`OG_TITLE: ${ogTitle[1].trim()}`);
  }
  
  // Priority 4: Page title
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag?.[1]) {
    parts.push(`TITLE: ${titleTag[1].trim()}`);
  }
  
  // Priority 5: Specific DRE content areas (using regex to simulate CSS selectors)
  // Look for .documento-sumario, .sumario, #sumario sections
  const sumarioPatterns = [
    /<(?:div|section|p)[^>]*class=["'][^"']*(?:documento-sumario|sumario|summary)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|p)>/gi,
    /<(?:div|section)[^>]*id=["']sumario["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi,
  ];
  
  for (const pattern of sumarioPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const content = stripHtmlTags(match[1]).trim();
      if (content.length > 30) {
        parts.push(`SUMARIO: ${content}`);
      }
    }
  }
  
  // Priority 6: Emissor/Entity section
  const emissorPatterns = [
    /<(?:div|span|p)[^>]*class=["'][^"']*(?:emissor|entidade|entity)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p)>/gi,
    /Emissor[:\s]*<[^>]*>([^<]+)</gi,
  ];
  
  for (const pattern of emissorPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const content = stripHtmlTags(match[1]).trim();
      if (content.length > 3 && content.length < 200) {
        parts.push(`EMISSOR: ${content}`);
      }
    }
  }
  
  // Priority 7: Main content area (.documento-body, .main-content, article, main)
  const mainContentPatterns = [
    /<(?:div|section)[^>]*class=["'][^"']*(?:documento-body|documento-texto|main-content|content-body)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi,
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
    /<main[^>]*>([\s\S]*?)<\/main>/gi,
  ];
  
  for (const pattern of mainContentPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const content = stripHtmlTags(match[1]).trim();
      if (content.length > 100) {
        // Limit main content to avoid noise
        parts.push(`CONTENT: ${content.substring(0, 3000)}`);
        break; // Only take first main content block
      }
    }
  }
  
  // Priority 8: Nota de rodapé / footer notes (often contains publication info)
  const notaPattern = /<(?:div|p)[^>]*class=["'][^"']*(?:nota-rodape|footnote|notas)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p)>/gi;
  let notaMatch;
  while ((notaMatch = notaPattern.exec(html)) !== null) {
    const content = stripHtmlTags(notaMatch[1]).trim();
    if (content.length > 20 && content.length < 500) {
      parts.push(`NOTA: ${content}`);
    }
  }
  
  // Priority 9: Structured data (JSON-LD)
  const jsonLdPattern = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      if (jsonData.description) parts.push(`LD_DESCRIPTION: ${jsonData.description}`);
      if (jsonData.name) parts.push(`LD_NAME: ${jsonData.name}`);
      if (jsonData.headline) parts.push(`LD_HEADLINE: ${jsonData.headline}`);
    } catch {
      // Ignore invalid JSON
    }
  }
  
  return parts.join('\n\n');
}

// Extract content using semantic selectors for EUR-Lex pages
function extractEurLexContent(html: string): string {
  const parts: string[] = [];
  
  // Priority 1: Meta description (often contains good summary)
  const metaDesc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  const metaDescAlt = html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  const description = metaDesc?.[1] || metaDescAlt?.[1];
  if (description && description.length > 30) {
    parts.push(`Sumário: ${description.trim()}`);
  }
  
  // Priority 2: OG description (backup for summary)
  const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);
  const ogDescAlt = html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i);
  const ogDescription = ogDesc?.[1] || ogDescAlt?.[1];
  if (ogDescription && ogDescription.length > 30 && ogDescription !== description) {
    parts.push(`Sumário: ${ogDescription.trim()}`);
  }
  
  // Priority 3: EUR-Lex specific: Summary section (id="summary" or class contains "summary")
  const summaryPatterns = [
    /<(?:div|section)[^>]*id=["']summary["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi,
    /<(?:div|section)[^>]*class=["'][^"']*summary[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi,
    /<(?:div)[^>]*class=["'][^"']*eli-main-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  ];
  
  for (const pattern of summaryPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const content = stripHtmlTags(match[1]).trim();
      if (content.length > 50 && content.length < 3000) {
        parts.push(`Sumário: ${content}`);
        break;
      }
    }
    if (parts.some(p => p.startsWith('Sumário:'))) break;
  }
  
  // Priority 4: EUR-Lex DocumentTitle
  const docTitlePattern = /<(?:div|p)[^>]*class=["'][^"']*(?:DocumentTitle|title-document|eli-title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p)>/gi;
  let titleMatch;
  while ((titleMatch = docTitlePattern.exec(html)) !== null) {
    const content = stripHtmlTags(titleMatch[1]).trim();
    if (content.length > 20) {
      parts.push(`DOC_TITLE: ${content}`);
      break;
    }
  }
  
  // Priority 5: OG title
  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  const ogTitleAlt = html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
  const title = ogTitle?.[1] || ogTitleAlt?.[1];
  if (title && title.length > 20) parts.push(`OG_TITLE: ${title.trim()}`);
  
  // Priority 6: Title tag
  const titleTag = html.match(/<title>([^<]+)<\/title>/i);
  if (titleTag?.[1] && titleTag[1].length > 20) {
    parts.push(`TITLE: ${titleTag[1].trim()}`);
  }
  
  // Priority 7: Preamble/recitals (backup for context)
  const preamblePattern = /<(?:div)[^>]*id=["']preamble["'][^>]*>([\s\S]*?)<\/div>/gi;
  let preambleMatch;
  while ((preambleMatch = preamblePattern.exec(html)) !== null) {
    const content = stripHtmlTags(preambleMatch[1]).trim();
    if (content.length > 100) {
      // Extract first paragraph as potential summary
      const firstPara = content.split('\n').find(p => p.trim().length > 50);
      if (firstPara && !parts.some(p => p.includes(firstPara.substring(0, 50)))) {
        parts.push(`PREAMBLE_SUMMARY: ${firstPara.trim().substring(0, 500)}`);
      }
      break;
    }
  }
  
  return parts.join('\n\n');
}

// Extract structured metadata from EUR-Lex content
function extractMetadataFromEurLex(content: string, currentNumber: string, existingTitle?: string): LegislationUpdate {
  const update: LegislationUpdate = {};
  
  console.log(`[extractMetadataFromEurLex] Processing content for: ${currentNumber}, length: ${content.length}`);
  
  // Extract summary - look for "Sumário:" prefix or META_DESCRIPTION
  const summaryPatterns = [
    /Sumário:\s*([^\n]{30,})/i,
    /META_DESCRIPTION:\s*([^\n]{30,})/i,
    /PREAMBLE_SUMMARY:\s*([^\n]{30,})/i,
  ];
  
  for (const pattern of summaryPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      let summary = match[1].trim();
      // Clean up EUR-Lex specific noise
      summary = summary
        .replace(/\s*\|\s*/g, ' ')
        .replace(/EUR-Lex[^\n]*/gi, '')
        .replace(/Official Journal[^\n]*/gi, '')
        .replace(/CELEX[^\n]*/gi, '')
        .trim();
      
      if (summary.length >= 20 && !summary.toLowerCase().includes('eur-lex') && !summary.toLowerCase().includes('cookies')) {
        update.summary = summary.substring(0, 2000);
        console.log(`[extractMetadataFromEurLex] Found summary (${summary.length} chars): ${summary.substring(0, 80)}...`);
        break;
      }
    }
  }
  
  // Extract title
  const titlePatterns = [
    /DOC_TITLE:\s*([^\n]{30,})/i,
    /OG_TITLE:\s*([^\n]{30,})/i,
    /TITLE:\s*([^\n]{30,})/i,
  ];
  
  for (const pattern of titlePatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      let title = match[1].trim();
      // Clean EUR-Lex noise from title
      title = title
        .replace(/\s*-\s*EUR-Lex$/i, '')
        .replace(/\s*\|\s*EUR-Lex$/i, '')
        .trim();
      
      if (title.length > 20 && !title.toLowerCase().includes('cookies') && !title.toLowerCase().includes('europa.eu')) {
        update.title = title.substring(0, 500);
        console.log(`[extractMetadataFromEurLex] Found title: ${title.substring(0, 80)}...`);
        break;
      }
    }
  }
  
  // FALLBACK: If no summary found but we have a descriptive title, extract summary from title
  // EU legislation titles often contain the full description after "que" or ", relativ"
  if (!update.summary) {
    const titleToUse = update.title || existingTitle;
    if (titleToUse && titleToUse.length > 80) {
      const summaryExtractPatterns = [
        // Pattern 1: "que estabelece...", "que altera...", "que revoga...", etc.
        /,?\s*que\s+([a-záéíóúàèìòùâêîôûãõ][^,]{30,})/i,
        // Pattern 2: "relativo a...", "relativa a...", "relativas aos..."
        /\s+(relativ[oa]s?\s+[aào]s?\s+[^,]{30,})/i,
        // Pattern 3: After the date, get the descriptive part
        /de\s+\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s*,?\s+(.{30,})/i,
      ];
      
      for (const pattern of summaryExtractPatterns) {
        const match = titleToUse.match(pattern);
        if (match && match[1]) {
          let extractedSummary = match[1].trim();
          // Capitalize first letter
          extractedSummary = extractedSummary.charAt(0).toUpperCase() + extractedSummary.slice(1);
          // Remove trailing incomplete sentences
          extractedSummary = extractedSummary.replace(/\s*\([^)]*$/, '').trim();
          
          if (extractedSummary.length >= 30) {
            update.summary = extractedSummary.substring(0, 2000);
            console.log(`[extractMetadataFromEurLex] Extracted summary from title (${extractedSummary.length} chars): ${extractedSummary.substring(0, 80)}...`);
            break;
          }
        }
      }
    }
  }
  
  return update;
}

// Helper: Strip HTML tags and decode entities
function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(div|p|h[1-6]|br|li|tr|td|th)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Direct HTML scrape (no Firecrawl) - faster and more reliable for DRE/EUR-Lex
async function scrapeUrlDirect(url: string, timeoutMs: number = 10000): Promise<string | null> {
  // Skip PDFs and binary files - they can't be parsed as HTML
  if (isNonScrapableUrl(url)) {
    console.log('[DirectScrape] Skipping non-scrapable URL:', url);
    return null;
  }

  try {
    console.log('[DirectScrape] Fetching:', url);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`[DirectScrape] HTTP ${response.status}`);
      return null;
    }
    
    // Check content-type to avoid parsing binary files
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/xml') && !contentType.includes('application/xhtml')) {
      console.log(`[DirectScrape] Skipping non-HTML content-type: ${contentType}`);
      return null;
    }
    
    const html = await response.text();
    
    // Limit HTML size to prevent memory issues (max 500KB)
    if (html.length > 500000) {
      console.log(`[DirectScrape] HTML too large (${html.length} chars), truncating`);
    }
    const safeHtml = html.slice(0, 500000);

    // Meta-tags first: for SPAs (ex: DRE) the initial HTML is often minimal, but og:title/og:description
    // usually exists and is enough to fix titles/summaries without JS rendering.
    const extractMeta = (input: string) => {
      const pick = (...regexes: RegExp[]) => {
        for (const r of regexes) {
          const m = input.match(r);
          const v = m?.[1]?.trim();
          if (v) return v;
        }
        return null;
      };

      const title = pick(
        /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']\s*\/?>/i,
        /<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']\s*\/?>/i,
        /<title>([^<]+)<\/title>/i,
      );

      const description = pick(
        /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']\s*\/?>/i,
        /<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']\s*\/?>/i,
        /<meta\s+name=["']description["']\s+content=["']([^"']+)["']\s*\/?>/i,
        /<meta\s+content=["']([^"']+)["']\s+name=["']description["']\s*\/?>/i,
      );

      const parts: string[] = [];
      if (title) parts.push(title.replace(/\s+/g, ' ').trim());
      // IMPORTANT: use Portuguese label so extractMetadataFromDRE patterns match.
      if (description) parts.push(`Sumário: ${description.replace(/\s+/g, ' ').trim()}`);

      const metaText = parts.join('\n');
      return metaText.length >= 60 ? metaText : null;
    };

    const metaFirst = extractMeta(safeHtml);
    if (metaFirst) {
      console.log(`[DirectScrape] Meta-tags extraction SUCCESS (${metaFirst.length} chars)`);
      return metaFirst;
    }
    
    // Use domain-specific extractors
    const lowerUrl = url.toLowerCase();
    let extractedContent: string;
    
    if (lowerUrl.includes('eur-lex.europa.eu')) {
      console.log('[DirectScrape] Using EUR-Lex extractor');
      extractedContent = extractEurLexContent(safeHtml);
    } else if (lowerUrl.includes('dre.pt') || lowerUrl.includes('diariodarepublica.pt')) {
      console.log('[DirectScrape] Using DRE extractor');
      extractedContent = extractDREContent(safeHtml);
    } else {
      // Fallback: generic extraction
      extractedContent = stripHtmlTags(safeHtml);
    }
    
    // If semantic extraction failed, fallback to full page extraction
    if (extractedContent.length < 100) {
      console.log('[DirectScrape] Semantic extraction weak, using full page');
      extractedContent = stripHtmlTags(safeHtml);
    }
    
    console.log(`[DirectScrape] Extracted ${extractedContent.length} chars`);
    return extractedContent.length > 100 ? extractedContent : null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('[DirectScrape] Timeout');
    } else {
      console.error('[DirectScrape] Error:', error);
    }
    return null;
  }
}

// Check if URL requires JavaScript rendering for FULL content (SPAs like DRE)
// Note: Even SPAs often have meta tags in initial HTML that we can extract!
function requiresJavaScript(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  // DRE is a React SPA - but meta tags work without JS!
  // Only return true when we need the FULL page content (not just metadata)
  return false; // We now try native-first for ALL sites
}

// Scrape URL content - DIRECT FIRST for static sites, Firecrawl for SPAs
// DRE requires Firecrawl (SPA), EUR-Lex works with direct fetch (static HTML)
async function scrapeUrl(url: string, firecrawlKey: string, supabase: any): Promise<string | null> {
  // Skip PDFs and binary files entirely - immediate return
  if (isNonScrapableUrl(url)) {
    console.log('[Scrape] SKIP: Non-scrapable URL (PDF/binary):', url);
    return null;
  }

  // STRATEGY: ALWAYS try native-first (meta tags, direct fetch)
  // Firecrawl is ONLY used as last resort when native extraction fails
  console.log('[Scrape] NATIVE-FIRST strategy for:', url);
  
  // Step 1: Try direct fetch with meta-tag extraction (works for ALL sites!)
  const directResult = await scrapeUrlDirect(url, 8000);
  
  // If we got sufficient content from meta tags, use it immediately
  if (directResult && directResult.length > 150) {
    console.log(`[Scrape] Native extraction SUCCESS (${directResult.length} chars)`);
    return directResult;
  }
  
  // Step 2: Check if this is a DRE URL - try OpenData API as alternative
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('dre.pt') || lowerUrl.includes('diariodarepublica.pt')) {
    console.log('[Scrape] DRE detected - trying OpenData API...');
    const openDataResult = await fetchDREOpenData(url);
    if (openDataResult) {
      // Convert OpenData result to text format for parsing
      const parts: string[] = [];
      if (openDataResult.title) parts.push(`TITLE: ${openDataResult.title}`);
      if (openDataResult.summary) parts.push(`SUMMARY: ${openDataResult.summary}`);
      if (openDataResult.entity) parts.push(`ENTITY: ${openDataResult.entity}`);
      if (openDataResult.publicationDate) parts.push(`PUB_DATE: ${openDataResult.publicationDate}`);
      if (openDataResult.effectiveDate) parts.push(`EFF_DATE: ${openDataResult.effectiveDate}`);
      
      const apiContent = parts.join('\n');
      if (apiContent.length > 50) {
        console.log(`[Scrape] DRE OpenData API SUCCESS (${apiContent.length} chars)`);
        return apiContent;
      }
    }
  }
  
  // Step 3: If native extraction got some content (even if weak), prefer it over Firecrawl
  if (directResult && directResult.length > 50) {
    console.log(`[Scrape] Using weak native result (${directResult.length} chars) to avoid Firecrawl`);
    return directResult;
  }
  
  // Step 4: LAST RESORT - Use Firecrawl only when native methods completely failed
  console.log('[Scrape] Native methods failed - trying Firecrawl as LAST RESORT...');
  try {
    const allowed = await acquireRateLimitSlot(supabase, {
      identifier: 'firecrawl',
      functionName: 'firecrawl_scrape',
      maxRequests: 25,
      windowSeconds: 60,
      maxWaitMs: 8000, // Reduced wait time
    });
    if (!allowed) {
      console.log('[RateLimit] Firecrawl throttled - returning weak native result');
      return directResult; // Return whatever we got from native
    }

    const response = await fetchWithTimeout('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 1500,
      }),
    }, 12000); // Reduced timeout
    
    if (response.ok) {
      const data = await response.json();
      const markdown = data.data?.markdown || data.markdown || null;
      if (markdown && markdown.length > 100) {
        console.log('[Scrape] Firecrawl fallback SUCCESS');
        return markdown;
      }
    } else if (response.status === 429 || response.status === 402) {
      console.log(`[Scrape] Firecrawl rate limited (${response.status}) - using native result`);
      return directResult;
    } else {
      console.log(`[Scrape] Firecrawl failed (${response.status})`);
    }
  } catch (error) {
    console.log(`[Scrape] Firecrawl error: ${error}`);
  }
  
  // Return whatever native extraction got (may be null)
  return directResult;
}

// List of invalid entity values to filter out
const INVALID_ENTITIES = [
  'pesquisar', 'search', 'buscar', 'procurar', 
  'menu', 'nav', 'navigation', 'header', 'footer',
  'login', 'entrar', 'registar', 'cookies',
  'aceitar', 'recusar', 'fechar', 'close',
  'undefined', 'null', ''
];

// List of invalid title prefixes to filter out
const INVALID_TITLE_PREFIXES = [
  'diário da república',
  '# diário',
  'série i',
  'série ii',
  'emissor',
  'pesquisar',
  'menu',
  'navigation',
  'cookies',
  'diploma referenciado',
  'publicação:',
  'publicação diário',
  'texto integral',
  'versão pdf',
  'partilhar',
  'enviar por',
];

// Invalid substrings that should not appear anywhere in titles
const INVALID_TITLE_CONTAINS = [
  'publicação: diário',
  'diário da república n.',
  'diário da república n.º',
  'enviar por email',
  'copiar link',
  'facebook',
  'linkedin', 
  'twitter',
  'whatsapp',
  'partilhar',
  'versão pdf',
  'texto integral',
];

// Validate extracted entity
function isValidEntity(entity: string | null | undefined): boolean {
  if (!entity) return false;
  const lower = entity.toLowerCase().trim();
  if (lower.length < 3 || lower.length > 300) return false;
  if (INVALID_ENTITIES.some(inv => lower === inv || lower.startsWith(inv + ' '))) return false;
  if (entity.includes('http') || entity.includes('www.')) return false;
  // Must contain at least one letter
  if (!/[a-zA-ZÀ-ÿ]/.test(entity)) return false;
  return true;
}

// Validate extracted title
function isValidTitle(title: string | null | undefined, currentNumber: string): boolean {
  if (!title) return false;
  const lower = title.toLowerCase().trim();
  if (lower.length < 15) return false;
  // Check prefixes
  if (INVALID_TITLE_PREFIXES.some(prefix => lower.startsWith(prefix))) return false;
  // Check for invalid substrings anywhere in title
  if (INVALID_TITLE_CONTAINS.some(inv => lower.includes(inv))) return false;
  if (title.includes('http') || title.includes('www.')) return false;
  // If title is just the number, it's not valid
  if (title.trim() === currentNumber.trim()) return false;
  return true;
}

// Validate extracted summary
function isValidSummary(summary: string | null | undefined): boolean {
  if (!summary) return false;
  const trimmed = summary.trim();
  if (trimmed.length < 20) return false;
  if (trimmed.toLowerCase().includes('lamentamos')) return false;
  if (trimmed.toLowerCase().includes('página não encontrada')) return false;
  if (trimmed.toLowerCase().includes('erro')) return false;
  // Must contain actual content, not just UI elements
  if (/^(menu|nav|header|footer|cookies|aceitar|recusar)/i.test(trimmed)) return false;
  return true;
}

function pickBetterSummary(a: string | null | undefined, b: string | null | undefined): string | undefined {
  const aOk = isValidSummary(a);
  const bOk = isValidSummary(b);
  if (aOk && bOk) return (b!.trim().length > a!.trim().length ? b!.trim() : a!.trim());
  if (bOk) return b!.trim();
  if (aOk) return a!.trim();
  return undefined;
}

// Extract metadata from DRE page content
function extractMetadataFromDRE(markdown: string, currentNumber: string): LegislationUpdate {
  const update: LegislationUpdate = {};
  
  // Clean markdown: remove links but keep text, remove bold markers
  const cleanMarkdown = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n');
  
  console.log(`[extractMetadataFromDRE] Processing content for: ${currentNumber}, length: ${cleanMarkdown.length}`);
  
  // ========== EXTRACT ENTITY/EMISSOR ==========
  // Try multiple patterns for entity extraction
  const entityPatterns = [
    // Pattern 1: "Emissor:" followed by content
    /Emissor[:\s]*\n?\s*([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][^\n]{3,100})/i,
    // Pattern 2: "Entidade:" followed by content
    /Entidade[:\s]*\n?\s*([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][^\n]{3,100})/i,
    // Pattern 3: After "Diário da República" line, look for ministry/entity
    /(?:Série\s+[I]+[^\n]*\n)([A-Z][A-Za-zÀ-ÿ\s]+(?:Ministério|Secretaria|Presidência|Assembleia|Governo|Autoridade)[^\n]*)/i,
    // Pattern 4: Standalone ministry/entity names
    /(Ministério\s+d[aoe]\s+[^\n]+)/i,
    /(Presidência\s+d[ao]\s+[^\n]+)/i,
    /(Assembleia\s+da\s+República)/i,
  ];
  
  for (const pattern of entityPatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match && match[1]) {
      const entity = match[1].trim().replace(/\s+/g, ' ');
      if (isValidEntity(entity)) {
        update.entity = entity.substring(0, 200);
        console.log(`[extractMetadataFromDRE] Found entity: ${update.entity}`);
        break;
      }
    }
  }
  
  // ========== EXTRACT SUMMARY ==========
  // Try multiple patterns for summary extraction
  const summaryPatterns = [
    // Pattern 1: "Sumário" followed by content until next section
    /Sum[áa]rio[:\s]*\n?\s*([^\n].+?)(?=\n\s*(?:Texto|Data\s+de|Publicação|Série|Emissor|Entidade|Diploma|Versão|PDF|Partilhar|$))/is,
    // Pattern 2: "Sumário:" on same line
    /Sum[áa]rio[:\s]+([^\n]{20,})/i,
    // Pattern 3: Content after title/number pattern
    /(?:n\.?º?\s*\d+[A-Za-z]?[-\/]\d{4})\s*[-–]\s*([^\n]{30,})/i,
    // Pattern 4: Look for descriptive text after "Série I" or "Série II"
    /Série\s+[I]+[^\n]*\n\s*\n?\s*([A-Z][^\n]{30,})/,
  ];
  
  for (const pattern of summaryPatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match && match[1]) {
      // Clean up the summary
      let summary = match[1]
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^\s*[-–]\s*/, ''); // Remove leading dash
      
      // Remove trailing navigation/UI elements
      summary = summary.replace(/\s*(Texto|PDF|Partilhar|Versão|Diploma referenciado).*$/i, '').trim();
      
      if (isValidSummary(summary)) {
        update.summary = summary.substring(0, 2000);
        console.log(`[extractMetadataFromDRE] Found summary (${summary.length} chars): ${summary.substring(0, 100)}...`);
        break;
      }
    }
  }
  
  // ========== EXTRACT TITLE ==========
  // For title, try multiple patterns then fall back to constructing from number + summary
  const titlePatterns = [
    // Pattern 1: Look for the diploma type + number + description (full format)
    /((?:Decreto-Lei|Portaria|Lei|Despacho|Resolução|Declaração|Aviso|Regulamento|Acórdão|Decreto)\s+n\.?º?\s*\d+[A-Za-z]?[-\/]\d{4}\s*[-–]\s*[^\n]{20,})/i,
    // Pattern 2: After "Sumário" label, get the first substantive line
    /Sum[áa]rio[:\s]*\n?\s*([A-Z][^\n]{25,})/i,
    // Pattern 3: Content between the legislation number and "Emissor"
    /(?:n\.?º?\s*\d+[A-Za-z]?[-\/]\d{4})[^\n]*\n+([A-Z][^\n]{30,})(?=\n)/,
    // Pattern 4: Long sentence starting with uppercase (likely descriptive)
    /(?:^|\n)([A-Z][A-Za-zÀ-ÿ\s,]{40,}(?:\.|\n))/m,
    // Pattern 5: After "Série" line, get substantial content
    /Série\s+[I]+[^\n]*\n\s*\n?\s*([A-Z][A-Za-zÀ-ÿ\s,]{30,})/,
  ];
  
  for (const pattern of titlePatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match && match[1]) {
      let title = match[1].trim().replace(/\s+/g, ' ');
      // Clean trailing garbage
      title = title.replace(/\s*(Texto|PDF|Partilhar|Versão|Diploma referenciado|Emissor).*$/i, '').trim();
      
      if (isValidTitle(title, currentNumber)) {
        update.title = title.substring(0, 500);
        console.log(`[extractMetadataFromDRE] Found title via pattern: ${update.title.substring(0, 80)}...`);
        break;
      }
    }
  }
  
  // If no title found but we have a valid summary, construct title from number + summary
  if (!update.title && update.summary && update.summary.length > 20) {
    // Extract just the base number without date (e.g., "Aviso n.º 16734/2024" from "Aviso n.º 16734/2024/2 de 7 de agosto")
    const baseNumberMatch = currentNumber.match(/^([A-Za-zÀ-ÿ\-\s]+n\.?º?\s*\d+[A-Za-z]?[-\/]\d{4})/i);
    const baseNumber = baseNumberMatch ? baseNumberMatch[1] : currentNumber.split(' de ')[0];
    
    // Create a descriptive title combining number and summary
    const summaryPreview = update.summary.length > 200 
      ? update.summary.substring(0, 200) + '...'
      : update.summary;
    
    const constructedTitle = `${baseNumber} - ${summaryPreview}`;
    
    if (isValidTitle(constructedTitle, currentNumber)) {
      update.title = constructedTitle.substring(0, 500);
      console.log(`[extractMetadataFromDRE] Constructed title from summary: ${update.title.substring(0, 80)}...`);
    } else {
      // Last resort: use summary directly if it's valid
      update.title = update.summary.substring(0, 500);
      console.log(`[extractMetadataFromDRE] Using raw summary as title`);
    }
  }
  
  // ========== EXTRACT PUBLICATION DATE ==========
  const monthMap: Record<string, string> = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
  };
  
  const pubDatePatterns = [
    // Pattern 1: ISO format YYYY-MM-DD
    /Data\s+de\s+Publicação[:\s]*(\d{4}-\d{2}-\d{2})/i,
    // Pattern 2: DD/MM/YYYY or DD-MM-YYYY
    /(?:Data\s+de\s+)?Publicação[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    // Pattern 3: "DD de Mês de YYYY"
    /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
    // Pattern 4: In metadata block
    /Publicado[:\s]*em[:\s]*(\d{4}-\d{2}-\d{2})/i,
  ];
  
  for (const pattern of pubDatePatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match) {
      try {
        if (match[0].match(/\d{4}-\d{2}-\d{2}/)) {
          // ISO format
          const isoMatch = match[0].match(/(\d{4}-\d{2}-\d{2})/);
          if (isoMatch) {
            const year = parseInt(isoMatch[1].split('-')[0]);
            if (year >= 1900 && year <= 2100) {
              update.publication_date = isoMatch[1];
              console.log(`[extractMetadataFromDRE] Found pub date (ISO): ${update.publication_date}`);
              break;
            }
          }
        } else if (match[2] && !isNaN(parseInt(match[2])) && match[3]) {
          // DD/MM/YYYY format
          const year = parseInt(match[3]);
          if (year >= 1900 && year <= 2100) {
            update.publication_date = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
            console.log(`[extractMetadataFromDRE] Found pub date (DD/MM/YYYY): ${update.publication_date}`);
            break;
          }
        } else if (match[2] && monthMap[match[2].toLowerCase()]) {
          // DD de Mês de YYYY format
          const year = parseInt(match[3]);
          if (year >= 1900 && year <= 2100) {
            update.publication_date = `${match[3]}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
            console.log(`[extractMetadataFromDRE] Found pub date (text): ${update.publication_date}`);
            break;
          }
        }
      } catch (e) {
        console.log(`[extractMetadataFromDRE] Date parse error: ${e}`);
        continue;
      }
    }
  }
  
  // ========== EXTRACT EFFECTIVE DATE ==========
  const effectiveDatePatterns = [
    /Data\s+de\s+Entrada\s+em\s+Vigor[:\s]*(\d{4}-\d{2}-\d{2})/i,
    /Entra(?:da)?\s+em\s+vigor[:\s]*(?:a|em)?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    /Entra(?:da)?\s+em\s+vigor[:\s]*(?:a|em)?\s*(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
  ];
  
  for (const pattern of effectiveDatePatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match) {
      try {
        if (match[0].match(/\d{4}-\d{2}-\d{2}/)) {
          const isoMatch = match[0].match(/(\d{4}-\d{2}-\d{2})/);
          if (isoMatch) {
            update.effective_date = isoMatch[1];
            console.log(`[extractMetadataFromDRE] Found effective date: ${update.effective_date}`);
            break;
          }
        } else if (match[2] && !isNaN(parseInt(match[2])) && match[3]) {
          update.effective_date = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
          break;
        } else if (match[2] && monthMap[match[2].toLowerCase()]) {
          update.effective_date = `${match[3]}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
          break;
        }
      } catch {
        continue;
      }
    }
  }
  
  console.log(`[extractMetadataFromDRE] Extracted: entity=${!!update.entity}, summary=${!!update.summary}, title=${!!update.title}, pubDate=${!!update.publication_date}`);
  
  return update;
}

// Determine if legislation is EU based on number
function isEULegislation(number: string): boolean {
  const n = (number || '').trim();
  const euPatterns = [
    // Portuguese
    /\(UE\)/i,
    /\(CE\)/i,
    /\(PESC\)/i,
    /Regulamento(?:\s+de\s+Execução|\s+Delegado)?/i,
    /Diretiva/i,
    /Decisão/i,
    /Recomendação/i,

    // English (some imports come with EN titles)
    /Directive/i,
    /Decision/i,
    /Regulation/i,
    /Recommendation/i,

    // Other sources
    /UNECE/i,

    // CELEX-like numbers stored directly in number field
    /^3\d{4}[RLD]\d{4}$/i, // e.g. 32019R0942, 32016L2284
    /^32\d{2}[RLD]\d{4}$/i, // fallback for some variants
  ];

  return euPatterns.some((p) => p.test(n));
}

function isEULegislationRecord(leg: { number: string; origin?: string | null; document_url?: string | null }): boolean {
  // IMPORTANT: If explicitly marked as PT/DRE, treat as PT even if the number matches generic EU keywords
  // (prevents false positives like "Regulamentos das Nações Unidas..." being handled as EU)
  if (leg?.origin === 'PT' || leg?.origin === 'dre') return false;
  if (leg?.origin === 'EU') return true;
  if (leg?.document_url && leg.document_url.includes('eur-lex')) return true;
  return isEULegislation(leg?.number);
}

function isGenericPTTitle(title: string | null | undefined, number: string): boolean {
  // Keep this aligned with the SQL function public.count_generic_titles()
  // (used by the Admin counters), so the job actually processes what the UI reports.
  const t = (title || '').trim();
  const n = (number || '').trim();
  if (!t) return true;
  
  // Markdown remnants
  if (t.startsWith('#')) return true;

  const lower = t.toLowerCase();
  if (lower.includes('diploma referenciado')) return true;
  // Only treat Documento... as generic when it starts the title
  if (/^documento\b/i.test(t)) return true;

  // Very short titles are generic
  if (t.length < 15) return true;
  
  // Helper: Check if title contains a date pattern like ", de 29 de Setembro"
  const hasDatePattern = /, de \d/i.test(t);
  
  // Title equals number - only generic if short AND no date description
  // "Portaria n.º 1084/2003, de 29 de Setembro" is NOT generic
  if (t === n) {
    return t.length < 30 && !hasDatePattern;
  }

  // Titles that are just the document type without description
  // Only generic if short (< 30 chars) AND no date pattern
  const typePattern = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Diretiva|Decisão|Declaração|Acórdão|Aviso|Parecer|Deliberação)\s*(n\.?[ºo°]?\s*\d|$)/i;
  if (typePattern.test(t) && t.length < 30 && !hasDatePattern) return true;

  return false;
}


// Extract CELEX number from EUR-Lex URL or legislation number
function extractCelexNumber(url: string | null, number: string): string | null {
  if (url) {
    const match = url.match(/CELEX:(\d+[A-Z]\d+)/);
    if (match) return match[1];
  }
  
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

// Scrape EUR-Lex metadata with timeout
async function scrapeEurLexMetadata(url: string, firecrawlKey: string): Promise<LegislationUpdate | null> {
  try {
    console.log('Scraping EUR-Lex:', url);
    
    const response = await fetchWithTimeout('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000, // Reduced from 3000
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
    
    const skipPatterns = [
      /eur-lex/i, /cookies/i, /europa\.eu/i, /official.*website/i,
      /languages/i, /navigation/i, /menu/i, /search/i, /home/i,
      /^\s*pt\s*$/i, /login/i, /^\d+$/, /accept/i,
    ];
    
    const lines = markdown.split('\n').filter((l: string) => l.trim().length > 20);
    
    for (const line of lines) {
      const cleanLine = line.replace(/[#*[\]]/g, '').trim();
      if (cleanLine.match(/^(Regulamento|Diretiva|Decisão|Retificação)/i) && 
          cleanLine.length > 50 && cleanLine.length < 800) {
        update.title = cleanLine.substring(0, 500);
        break;
      }
    }
    
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
    
    const summaryMatch = markdown.match(/Sum[áa]rio[:\s]*\n?([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\n#|$)/i);
    if (summaryMatch) {
      update.summary = summaryMatch[1].replace(/[*#]/g, '').trim().substring(0, 2000);
    } else {
      const descMatch = markdown.match(/(?:objeto|objectivo|presente regulamento|presente diretiva|presente decisão)[^.]*\./i);
      if (descMatch) {
        update.summary = descMatch[0].trim();
      }
    }
    
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

// Extract the CORRECT year from a diploma number
// Format examples: "Aviso n.º 9890/2025/2" -> year is 2025 (after first /)
//                  "Decreto-Lei n.º 55/2024" -> year is 2024
//                  "Portaria n.º 987/93" -> year is 1993
function extractYearFromNumber(number: string): number | null {
  const currentYear = new Date().getFullYear();
  
  // Pattern 1: Look for /YYYY format (most reliable for PT legislation)
  // This handles "n.º XXXX/2025" where XXXX can be any number
  const slashYearMatch = number.match(/\/(\d{4})(?:\/|\s|$)/);
  if (slashYearMatch) {
    const year = parseInt(slashYearMatch[1]);
    if (year >= 1950 && year <= currentYear + 1) {
      return year;
    }
  }
  
  // Pattern 2: Look for /YY format (2 digit year)
  const shortYearMatch = number.match(/\/(\d{2})(?:\/|\s|$)/);
  if (shortYearMatch) {
    const shortYear = parseInt(shortYearMatch[1]);
    // Convert 2-digit to 4-digit year: 00-30 -> 2000-2030, 31-99 -> 1931-1999
    const year = shortYear <= 30 ? 2000 + shortYear : 1900 + shortYear;
    if (year >= 1950 && year <= currentYear + 1) {
      return year;
    }
  }
  
  // Pattern 3: Look for "de YYYY" in title
  const deYearMatch = number.match(/de\s+(\d{4})/i);
  if (deYearMatch) {
    const year = parseInt(deYearMatch[1]);
    if (year >= 1950 && year <= currentYear + 1) {
      return year;
    }
  }
  
  return null;
}

function fixPublicationDate(leg: { publication_date?: string | null; number: string; title?: string }): string | null {
  const currentYear = new Date().getFullYear();
  
  if (leg.publication_date) {
    const year = parseInt(leg.publication_date.substring(0, 4));
    
    if (year < 1950 || year > currentYear + 1) {
      // Invalid year - try to extract correct year from number or title
      const correctYear = extractYearFromNumber(leg.number) || extractYearFromNumber(leg.title || '');
      if (correctYear) {
        // Keep original month and day, just fix year
        const origMonth = leg.publication_date.substring(5, 7);
        const origDay = leg.publication_date.substring(8, 10);
        return `${correctYear}-${origMonth}-${origDay}`;
      }
      return null;
    }
  }
  
  return leg.publication_date || null;
}

// Background processing function
async function runBackgroundCompletion(params: {
  limit: number;
  dryRun: boolean;
  includePT: boolean;
  includeEU: boolean;
  fixDates: boolean;
  mode: string;
  extractRequirements: boolean;
  requireUrl: boolean;
  randomOffset?: boolean;
}) {
  const { limit, dryRun, includePT, includeEU, fixDates, mode, extractRequirements, requireUrl, randomOffset } = params;
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  let syncLogId: string | null = null;
  if (!dryRun) {
    const syncType = mode === 'pdf_import_fix' ? 'fix_pdf_import' 
                   : mode === 'missing_dates' ? 'fix_missing_dates'
                   : mode === 'missing_summary' ? 'fix_missing_summary'
                   : mode === 'short_summary' ? 'fix_short_summary'
                   : mode === 'generic_titles' ? 'fix_generic_titles'
                   : 'complete_auto_imported';
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: syncType,
        status: 'running',
        items_processed: 0,
        items_added: 0,
        items_updated: 0,
      })
      .select('id')
      .single();
    
    if (syncLog) {
      syncLogId = syncLog.id;
      console.log(`Created sync_log entry: ${syncLogId}`);
    }
  }

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
  
  try {
    let query = supabase
      .from('legislation')
      .select('id, number, title, summary, entity, document_url, publication_date, effective_date, origin, source');
    
    // If requireUrl is true, only process records that already have a URL
    if (requireUrl) {
      query = query.not('document_url', 'is', null);
    }
    
    if (mode === 'pdf_import_fix') {
      // Fix PDF imports: invalid dates, missing URLs, missing summaries
      query = query.eq('source', 'pdf-import');
    } else if (mode === 'missing_dates') {
      // CRITICAL: For missing_dates, we MUST require URL since we need to scrape metadata
      // Always filter by document_url here, regardless of requireUrl parameter
      query = query
        .not('document_url', 'is', null)
        .or('no_digital_version.is.null,no_digital_version.eq.false')
        .or('publication_date.is.null,effective_date.is.null');
    } else if (mode === 'generic_titles') {
      // Fetch PT legislation with URLs for title correction
      // Must have URL (for scraping), be PT origin, and not marked as no_digital_version
      query = query
        .not('document_url', 'is', null)
        .in('origin', ['PT', 'dre'])
        .or('no_digital_version.is.null,no_digital_version.eq.false');
    } else if (mode === 'short_summary') {
      // Fetch records with URLs that have NULL or empty summaries
      // We use SQL filters here to pre-filter, then JS will verify length < 20
      query = query
        .not('document_url', 'is', null)
        .or('summary.is.null,summary.eq.'); // SQL can't easily check length, so we filter NULL/empty here
    } else if (mode === 'missing_summary') {
      // Only records missing summary
      query = query.or('summary.is.null,summary.eq.');
    } else {
      query = query.or('document_url.is.null,summary.ilike.%Diploma referenciado%,summary.is.null');
    }
    
    // Generate random offset when parallel jobs are running to avoid processing same records.
    // CRITICAL: For modes with small pending counts (like missing_dates), we must NOT use large
    // random offsets, otherwise we skip all valid records.
    let queryOffset = 0;
    if (randomOffset) {
      // For generic_titles mode, use smaller offset since the dataset is already filtered
      let maxOffset = mode === 'generic_titles' ? 200 : 2000;

      // For backlog modes, compute maxOffset based on the FILTERED result set, not total DB.
      // This prevents offsets that skip all matching records when the pending count is small.
      if (mode === 'short_summary' || mode === 'missing_summary' || mode === 'missing_dates' || mode === 'generic_titles') {
        try {
          let filteredTotal = 0;
          
          if (mode === 'missing_dates') {
            const { count } = await supabase
              .from('legislation')
              .select('id', { count: 'exact', head: true })
              .not('document_url', 'is', null)
              .or('no_digital_version.is.null,no_digital_version.eq.false')
              .or('publication_date.is.null,effective_date.is.null');
            filteredTotal = count || 0;
          } else if (mode === 'short_summary') {
            // Use RPC for accurate count
            const { data } = await supabase.rpc('count_short_summaries');
            filteredTotal = data || 0;
          } else if (mode === 'generic_titles') {
            const { data } = await supabase.rpc('count_generic_titles');
            filteredTotal = data || 0;
          }
          
          // For small datasets (< 200), don't use offset at all to ensure processing
          if (filteredTotal < 200) {
            maxOffset = 0;
            console.log(`[Offset] Small dataset (${filteredTotal} records), using offset 0`);
          } else {
            // For larger sets, use a small random offset (max 10% of dataset)
            maxOffset = Math.floor(filteredTotal * 0.1);
          }
        } catch (e) {
          // fail-open with small offset
          maxOffset = 50;
        }
      }

      queryOffset = Math.floor(Math.random() * (maxOffset + 1));
      console.log(`Using random offset: ${queryOffset} (maxOffset=${maxOffset}) to avoid parallel job overlap`);
    }
    
    // For generic_titles and short_summary modes, use dedicated RPCs for efficient filtering
    let legislation: any[] = [];
    let fetchError: any = null;
    
    if (mode === 'generic_titles') {
      console.log(`Fetching generic titles via RPC (limit=${limit}, offset=${queryOffset})`);
      const { data, error } = await supabase.rpc('get_generic_title_ids', {
        p_limit: limit,
        p_offset: queryOffset
      });
      if (error) {
        fetchError = error;
      } else {
        // RPC returns { id, number, title, document_url } - add default values for other fields
        legislation = (data || []).map((row: any) => ({
          id: row.id,
          number: row.number,
          title: row.title,
          document_url: row.document_url,
          summary: null,
          entity: null,
          publication_date: null,
          effective_date: null,
          origin: 'PT',
          source: null
        }));
        console.log(`RPC returned ${legislation.length} records`);
      }
    } else if (mode === 'short_summary') {
      // Use dedicated RPC for short summaries (< 20 chars) - much more efficient
      console.log(`Fetching short summaries via RPC (limit=${limit}, offset=${queryOffset})`);
      const { data, error } = await supabase.rpc('get_short_summary_ids', {
        p_limit: limit,
        p_offset: queryOffset
      });
      if (error) {
        fetchError = error;
      } else {
        legislation = (data || []).map((row: any) => ({
          id: row.id,
          number: row.number,
          title: row.title,
          summary: row.summary,
          document_url: row.document_url,
          entity: null,
          publication_date: row.publication_date,
          effective_date: row.effective_date,
          origin: row.origin || 'PT',
          source: null
        }));
        console.log(`RPC returned ${legislation.length} records with short summaries`);
      }
    } else {
      // For other modes, use the regular query approach
      const candidateMultiplier = mode === 'missing_summary' ? 50 : 5;
      const candidateCount = Math.min(1000, Math.max(limit * candidateMultiplier, limit));

      const backlogMode = mode === 'missing_summary' || mode === 'missing_dates';
      const result = await query
        // For backlog modes, process older items first (better for making counters drop quickly)
        .order('created_at', { ascending: backlogMode })
        .range(queryOffset, queryOffset + candidateCount - 1);
      
      legislation = result.data || [];
      fetchError = result.error;
    }
    
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
          completed_at: new Date().toISOString(),
          error_message: 'Não há diplomas incompletos'
        }).eq('id', syncLogId);
      }
      console.log('No incomplete legislation to process');
      return;
    }
    
    const currentYear = new Date().getFullYear();
    
    // For generic_titles mode, RPC already filters, so skip JS filter
    const toProcess = mode === 'generic_titles' 
      ? legislation.slice(0, limit)
      : legislation
        .filter(leg => {
          if (mode === 'pdf_import_fix') {
            // Process PDF imports that need fixing:
            // 1. Invalid dates (year < 1950 or > current+1)
            // 2. Missing URLs
            // 3. Missing or very short summaries
            const hasInvalidDate = leg.publication_date && (() => {
              const year = parseInt(leg.publication_date.substring(0, 4));
              return year < 1950 || year > currentYear + 1;
            })();
            const missingUrl = !leg.document_url;
            const missingSummary = !leg.summary || leg.summary.length < 30;
            
            if (!hasInvalidDate && !missingUrl && !missingSummary) return false;
          } else if (mode === 'missing_dates') {
            if (leg.publication_date && leg.effective_date) return false;
          } else if (mode === 'short_summary') {
            // Process diplomas with NULL, empty, or very short summaries (< 20 chars)
            const summaryLength = leg.summary?.length || 0;
            if (summaryLength >= 20) return false;
          } else {
            const isIncomplete = !leg.document_url || 
                                (leg.summary && leg.summary.includes('Diploma referenciado')) ||
                                !leg.summary ||
                                leg.title === leg.number;
            if (!isIncomplete) return false;
          }
          
          const isEU = isEULegislationRecord(leg);
          if (isEU && !includeEU) return false;
          if (!isEU && !includePT) return false;
          
          return true;
        })
        .slice(0, limit);
    
    console.log(`Found ${toProcess.length} incomplete legislation to complete`);
    
    if (syncLogId) {
      await supabase.from('sync_logs').update({ 
        items_added: toProcess.length
      }).eq('id', syncLogId);
    }
    
    if (toProcess.length === 0) {
      if (syncLogId) {
        await supabase.from('sync_logs').update({ 
          status: 'completed', 
          completed_at: new Date().toISOString(),
          error_message: 'Não há diplomas incompletos'
        }).eq('id', syncLogId);
      }
      return;
    }
    
    const results: ProcessResult[] = [];
    let totalUpdated = 0;
    let totalUrlsFound = 0;
    let totalMetadataExtracted = 0;
    
    for (const leg of toProcess) {
      try {
        console.log(`\n=== Processing: ${leg.number} ===`);
        
        const isEU = isEULegislationRecord(leg);
        const updates: LegislationUpdate = {};
        let hasUpdates = false;
        
        // For PDF imports or when fixDates is enabled, always check and fix invalid dates
        if ((fixDates || mode === 'pdf_import_fix') && leg.publication_date) {
          const year = parseInt(leg.publication_date.substring(0, 4));
          const currentYear = new Date().getFullYear();
          
          if (year < 1950 || year > currentYear + 1) {
            // Try to extract correct year from number or title using smart parser
            const correctYear = extractYearFromNumber(leg.number) || extractYearFromNumber(leg.title || '');
            if (correctYear) {
              // Extract day and month from original date
              const origMonth = leg.publication_date.substring(5, 7);
              const origDay = leg.publication_date.substring(8, 10);
              updates.publication_date = `${correctYear}-${origMonth}-${origDay}`;
              hasUpdates = true;
              console.log(`Fixed invalid date: ${leg.publication_date} -> ${updates.publication_date} (year from number: ${correctYear})`);
            } else {
              // Set to null if we can't determine correct year
              updates.publication_date = undefined;
              hasUpdates = true;
              console.log(`Cleared invalid date: ${leg.publication_date} (couldn't extract year from: ${leg.number})`);
            }
          }
        } else if (fixDates && leg.publication_date) {
          const fixedDate = fixPublicationDate(leg);
          if (fixedDate !== leg.publication_date) {
            updates.publication_date = fixedDate || undefined;
            hasUpdates = true;
            console.log(`Fixed date: ${leg.publication_date} -> ${fixedDate}`);
          }
        }
        
        if (isEU) {
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
          
          const urlToScrape = updates.document_url || leg.document_url;
          if (urlToScrape && urlToScrape.includes('eur-lex')) {
            let metadata: LegislationUpdate | null = null;
            
            // STRATEGY 1: Try native scraping first (no rate limits!)
            const nativeContent = await scrapeUrlDirect(urlToScrape, 10000);
            if (nativeContent && nativeContent.length > 50) {
              console.log(`[EUR-Lex] Native scrape got ${nativeContent.length} chars`);
              metadata = extractMetadataFromEurLex(nativeContent, leg.number, leg.title);
            }
            
            // STRATEGY 2: Only use Firecrawl as backup if native failed
            const needsTitle = !leg.title || leg.title === leg.number || 
                             (mode === 'generic_titles' && isGenericPTTitle(leg.title, leg.number));
            const needsSummary = !leg.summary || leg.summary.includes('Diploma referenciado') ||
                               (mode === 'short_summary' && (leg.summary?.length || 0) < 20);
            
            const hasGoodTitle = metadata?.title && metadata.title.length > 20;
            const hasGoodSummary = metadata?.summary && isValidSummary(metadata?.summary);
            
            if ((!hasGoodTitle && needsTitle) || (!hasGoodSummary && needsSummary)) {
              console.log('[EUR-Lex] Native insufficient, trying Firecrawl...');
              const firecrawlMeta = await scrapeEurLexMetadata(urlToScrape, firecrawlKey);
              if (firecrawlMeta) {
                // Merge with native results - Firecrawl fills gaps
                if (!hasGoodTitle && firecrawlMeta.title) {
                  metadata = metadata || {};
                  metadata.title = firecrawlMeta.title;
                }
                if (!hasGoodSummary && firecrawlMeta.summary && isValidSummary(firecrawlMeta.summary)) {
                  metadata = metadata || {};
                  metadata.summary = firecrawlMeta.summary;
                }
                if (firecrawlMeta.entity && !metadata?.entity) {
                  metadata = metadata || {};
                  metadata.entity = firecrawlMeta.entity;
                }
                if (firecrawlMeta.publication_date && !metadata?.publication_date) {
                  metadata = metadata || {};
                  metadata.publication_date = firecrawlMeta.publication_date;
                }
              }
            }
            
            if (metadata) {
              const shouldUpdateTitle =
                !leg.title ||
                leg.title === leg.number ||
                (mode === 'generic_titles' && isGenericPTTitle(leg.title, leg.number));

              if (metadata.title && shouldUpdateTitle) {
                updates.title = metadata.title;
                hasUpdates = true;
              }
              // In short_summary mode, always overwrite malformed summaries
              const shouldUpdateSummary = !leg.summary || 
                                          leg.summary.includes('Diploma referenciado') ||
                                          (mode === 'short_summary' && (leg.summary?.length || 0) < 20);
              if (metadata.summary && isValidSummary(metadata.summary) && shouldUpdateSummary) {
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
                
                if (metaYear >= 1950 && metaYear <= currentYear + 1 && (legYear < 1950 || legYear > currentYear + 1)) {
                  updates.publication_date = metadata.publication_date;
                  hasUpdates = true;
                }
              }
              
              totalMetadataExtracted++;
              console.log(`Extracted EUR-Lex metadata:`, metadata);
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        } else {
          if (!leg.document_url) {
            const dreUrl = await searchDREUrl(leg.number, firecrawlKey, supabase);
            if (dreUrl) {
              updates.document_url = dreUrl;
              updates.origin = 'PT';
              totalUrlsFound++;
              hasUpdates = true;
              console.log(`Found URL: ${dreUrl}`);
            } else {
              console.log(`No URL found for ${leg.number}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          // If we already have a URL but it's a PDF/binary or not a /dr/detalhe/ page,
          // try to recover a proper detail URL first so titles/summaries can be extracted.
          let urlToScrape = updates.document_url || leg.document_url;
          if (urlToScrape && (isNonScrapableUrl(urlToScrape) || !urlToScrape.includes('/dr/detalhe/'))) {
            console.log('[URL] Current URL not suitable for metadata, trying to recover /dr/detalhe/...');
            const recovered = await searchDREUrl(leg.number, firecrawlKey, supabase);
            if (recovered) {
              updates.document_url = recovered;
              urlToScrape = recovered;
              totalUrlsFound++;
              hasUpdates = true;
              console.log(`[URL] Recovered detail URL: ${recovered}`);
            }
          }

          if (urlToScrape) {
            let metadata: LegislationUpdate | null = null;
            
            // STRATEGY 1: Try DRE OpenData API first (no rate limits, structured data)
            const dreOpenData = await fetchDREOpenData(urlToScrape);
            if (dreOpenData) {
              console.log('[Processing] Got data from DRE OpenData API');
              metadata = {
                title: dreOpenData.title,
                summary: dreOpenData.summary,
                entity: dreOpenData.entity,
                publication_date: dreOpenData.publicationDate,
                effective_date: dreOpenData.effectiveDate,
              };
            }
            
            // STRATEGY 2: If API failed or insufficient, try scraping
            const needsTitle = !leg.title || leg.title === leg.number || 
                             (mode === 'generic_titles' && isGenericPTTitle(leg.title, leg.number));
            const needsSummary = !leg.summary || leg.summary.includes('Diploma referenciado') ||
                               (mode === 'short_summary' && (leg.summary?.length || 0) < 20);
            
            // IMPORTANT: Use the same validation gates used later when applying updates.
            // Otherwise, we may skip the scraping fallback due to a long-but-invalid title/summary.
            // For generic_titles mode, also treat "still generic" titles as insufficient so the
            // fallback can try to build a richer title from summary.
            const hasGoodTitle = Boolean(
              metadata?.title &&
                isValidTitle(metadata.title, leg.number) &&
                (mode !== 'generic_titles' || !isGenericPTTitle(metadata.title, leg.number))
            );
            const hasGoodSummary = Boolean(metadata?.summary && isValidSummary(metadata.summary));
            
            if ((!hasGoodTitle && needsTitle) || (!hasGoodSummary && needsSummary)) {
              console.log('[Processing] API data insufficient, trying scraping fallback...');
              const markdown = await scrapeUrl(urlToScrape, firecrawlKey, supabase);
              if (markdown && markdown.length > 100) {
                const scrapedMetadata = extractMetadataFromDRE(markdown, leg.number);
                // Merge scraped data with API data (API takes precedence)
                metadata = {
                  title: metadata?.title || scrapedMetadata.title,
                  // Prefer a valid + longer summary (fixes cases where API returns very short/empty)
                  summary: pickBetterSummary(metadata?.summary, scrapedMetadata.summary),
                  entity: metadata?.entity || scrapedMetadata.entity,
                  publication_date: metadata?.publication_date || scrapedMetadata.publication_date,
                  effective_date: metadata?.effective_date || scrapedMetadata.effective_date,
                };
              }
            }
            
            // Apply metadata updates
            if (metadata) {
              const shouldUpdateTitle = needsTitle;
              if (
                metadata.title &&
                shouldUpdateTitle &&
                isValidTitle(metadata.title, leg.number) &&
                (mode !== 'generic_titles' || !isGenericPTTitle(metadata.title, leg.number))
              ) {
                updates.title = metadata.title;
                hasUpdates = true;
              }
              
              const shouldUpdateSummary = needsSummary;
              if (metadata.summary && isValidSummary(metadata.summary) && shouldUpdateSummary) {
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
              
              // Handle effective_date
              if (metadata.effective_date && !leg.effective_date) {
                updates.effective_date = metadata.effective_date;
                hasUpdates = true;
                console.log(`Found effective date: ${metadata.effective_date}`);
              }
              
              totalMetadataExtracted++;
              console.log(`Extracted metadata:`, metadata);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500)); // Shorter delay for API calls
          }
        }
        
        // FALLBACK: If we have publication_date but no effective_date, calculate it
        // For PT legislation: effective_date = day after publication (standard rule)
        // For EU legislation: effective_date = 20 days after publication (common rule) or same day
        const pubDate = updates.publication_date || leg.publication_date;
        const effDate = updates.effective_date || leg.effective_date;
        
        if (pubDate && !effDate && mode === 'missing_dates') {
          try {
            const pubDateObj = new Date(pubDate);
            const isEU = isEULegislationRecord(leg);
            
            // PT: next day, EU: 20 days later (common default)
            const daysToAdd = isEU ? 20 : 1;
            const effectiveDate = new Date(pubDateObj);
            effectiveDate.setDate(effectiveDate.getDate() + daysToAdd);
            
            updates.effective_date = effectiveDate.toISOString().split('T')[0];
            hasUpdates = true;
            console.log(`Calculated effective date (${isEU ? 'EU +20d' : 'PT +1d'}): ${pubDate} -> ${updates.effective_date}`);
          } catch (e) {
            console.log(`Could not calculate effective date from ${pubDate}:`, e);
          }
        }
        
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
        
        await updateProgress(results.length, totalUpdated, `Processando: ${leg.number}`);
        
      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({
          id: leg.id,
          number: leg.number,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        
        await updateProgress(results.length, totalUpdated, `Erro: ${leg.number}`);
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n=== COMPLETE ===`);
    console.log(`Processed: ${results.length}, Updated: ${totalUpdated}, URLs: ${totalUrlsFound}, Metadata: ${totalMetadataExtracted}`);
    
    let requirementsExtractionStarted = false;
    const successfulIds = results.filter(r => r.success).map(r => r.id);
    
    if (extractRequirements && successfulIds.length > 0 && !dryRun) {
      console.log(`\n=== Starting requirements extraction for ${successfulIds.length} legislation ===`);
      
      try {
        const extractionResponse = await fetch(
          `${supabaseUrl}/functions/v1/extract-requirements-background`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              batchSize: 10,
              maxBatches: Math.ceil(successfulIds.length / 10),
              useUrl: true,
              legislationIds: successfulIds,
            }),
          }
        );
        
        if (extractionResponse.ok) {
          requirementsExtractionStarted = true;
          console.log('Requirements extraction job started');
        } else {
          console.error('Failed to start requirements extraction:', await extractionResponse.text());
        }
      } catch (extractionError) {
        console.error('Error starting requirements extraction:', extractionError);
      }
    }
    
    if (syncLogId) {
      const completionMessage = requirementsExtractionStarted 
        ? `Extração de requisitos iniciada para ${successfulIds.length} diplomas`
        : (failed > 0 ? `${failed} erro(s)` : `✓ ${totalUpdated} atualizados, ${totalUrlsFound} URLs, ${totalMetadataExtracted} metadados`);
      
      // Use RPC to increment counters instead of SET to handle parallel job updates correctly
      // Each parallel job adds its contribution to the total
      const { data: currentLog } = await supabase
        .from('sync_logs')
        .select('items_processed, items_updated')
        .eq('id', syncLogId)
        .single();
      
      const newProcessed = (currentLog?.items_processed || 0) + results.length;
      const newUpdated = (currentLog?.items_updated || 0) + totalUpdated;
      
      await supabase.from('sync_logs').update({ 
        status: 'completed',
        items_processed: newProcessed,
        items_updated: newUpdated,
        error_message: completionMessage,
        completed_at: new Date().toISOString() 
      }).eq('id', syncLogId);
      
      console.log(`Sync log updated: processed=${newProcessed}, updated=${newUpdated}`);
    }
    
    console.log('Background completion finished');
    
  } catch (error) {
    console.error('Background completion error:', error);
    if (syncLogId) {
      await supabase.from('sync_logs').update({ 
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString() 
      }).eq('id', syncLogId);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      limit = 50, 
      dryRun = false, 
      includePT = true, 
      includeEU = true, 
      fixDates = true, 
      mode = 'incomplete',
      extractRequirements = false,
      background = true,
      requireUrl = false,
      randomOffset = true, // Enable by default to avoid parallel job overlap
    } = await req.json().catch(() => ({}));
    
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Quick check for pending items
    // IMPORTANT: keep this aligned with the Admin counters and the actual selection logic.
    let pendingCount = 0;
    if (mode === 'generic_titles') {
      const { data } = await supabase.rpc('count_generic_titles');
      pendingCount = (data as number) || 0;
    } else if (mode === 'short_summary') {
      const { data } = await supabase.rpc('count_short_summaries');
      pendingCount = (data as number) || 0;
    } else if (mode === 'missing_summary') {
      const { count } = await supabase
        .from('legislation')
        .select('id', { count: 'exact', head: true })
        .not('document_url', 'is', null)
        .or('summary.is.null,summary.eq.');
      pendingCount = count || 0;
    } else if (mode === 'missing_dates') {
      const { count } = await supabase
        .from('legislation')
        .select('id', { count: 'exact', head: true })
        .not('document_url', 'is', null)
        .or('publication_date.is.null,effective_date.is.null');
      pendingCount = count || 0;
    } else if (mode === 'pdf_import_fix') {
      const { count } = await supabase
        .from('legislation')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'pdf-import');
      pendingCount = count || 0;
    } else {
      const { count } = await supabase
        .from('legislation')
        .select('id', { count: 'exact', head: true })
        .or('document_url.is.null,summary.ilike.%Diploma referenciado%,summary.is.null');
      pendingCount = count || 0;
    }
    
    if (!pendingCount || pendingCount === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Não há diplomas incompletos para processar',
          pendingCount: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (background) {
      EdgeRuntime.waitUntil(runBackgroundCompletion({
        limit,
        dryRun,
        includePT,
        includeEU,
        fixDates,
        mode,
        extractRequirements,
        requireUrl,
        randomOffset,
      }));
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Completar diplomas iniciado em segundo plano',
          pendingCount,
          limit,
          mode,
          background: true,
          randomOffset,
          trackingType: 'complete_auto_imported'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    await runBackgroundCompletion({
      limit,
      dryRun,
      includePT,
      includeEU,
      fixDates,
      mode,
      extractRequirements,
      requireUrl,
      randomOffset,
    });
    
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
