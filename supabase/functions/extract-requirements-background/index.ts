import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Requirement {
  article: string;
  requirement_text: string;
  notes?: string;
}

// Regex to detect malformed articles containing diploma type keywords
const MALFORMED_ARTICLE_PATTERNS = [
  /\bDespacho\b/i,
  /\bPortaria\b/i,
  /\bDecreto\b/i,
  /\bRegulamento\b/i,
  /\bLei\s+n/i,
  /\bDiretiva\b/i,
  /\bDecisão\b/i,
  /\bDeclaração\b/i,
];

// Function to validate and clean article field
function cleanArticle(article: string | undefined | null, legislationNumber: string): string {
  if (!article) return 'Geral';
  
  let trimmed = article.trim();
  
  // FIRST: Normalize subarticle references to just the main article
  // "Artigo 47.º, n.º 2" -> "Artigo 47.º"
  // "Artigo 49.º, n.º 3, alínea c)" -> "Artigo 49.º"
  // Also handle "Artigo 1" without º
  const mainArticleMatch = trimmed.match(/^Art(?:igo)?\.?\s*(\d+)([ºª]?(?:-[A-Z])?)?/i);
  if (mainArticleMatch) {
    const num = mainArticleMatch[1];
    const suffix = mainArticleMatch[2] || '.º';
    trimmed = `Artigo ${num}${suffix.startsWith('.') || suffix.startsWith('º') || suffix.startsWith('ª') ? suffix : '.º' + suffix}`;
  }
  
  // Handle Anexo variations
  const anexoMatch = trimmed.match(/^Anexo\s*([IVX\d]+)?/i);
  if (anexoMatch) {
    const num = anexoMatch[1] || '';
    return `Anexo${num ? ' ' + num.toUpperCase() : ''}`.substring(0, 50);
  }
  
  // Check if article contains diploma-type keywords (malformed)
  const isMalformed = MALFORMED_ARTICLE_PATTERNS.some(pattern => pattern.test(trimmed));
  
  if (isMalformed) {
    // Try to extract just the article part if it exists
    const artMatch = trimmed.match(/Art(?:igo)?\.?\s*(\d+)([ºª]?)/i);
    if (artMatch) {
      const num = artMatch[1];
      const suffix = artMatch[2] || '.º';
      return `Artigo ${num}${suffix || '.º'}`.substring(0, 50);
    }
    
    // Check for Anexo pattern
    const anMatch = trimmed.match(/\b(Anexo\s+[IVX\d]+)/i);
    if (anMatch) {
      return anMatch[1].substring(0, 50);
    }
    
    console.log(`Cleaned malformed article for ${legislationNumber}: "${article}" -> "Geral"`);
    return 'Geral';
  }
  
  return trimmed.substring(0, 50);
}

// Use Lovable AI gateway - no external API key required
const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Generate multiple EUR-Lex URL variants to try Portuguese content
function getEurlexPortugueseVariants(url: string): string[] {
  if (!url.includes('eur-lex.europa.eu')) return [url];
  
  const variants: string[] = [];
  
  // Extract CELEX from URL
  const celexMatch = url.match(/CELEX[:%]([0-9A-Z]+)/i) || url.match(/uri=([0-9]{5}[A-Z][0-9]+)/i);
  const celex = celexMatch ? celexMatch[1] : null;
  
  // Extract ELI parts if present
  const eliMatch = url.match(/\/eli\/([^?]+)/);
  
  if (celex) {
    // Primary: Direct PT TXT with CELEX
    variants.push(`https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`);
    // Alternative: PT ALL (includes all formats)
    variants.push(`https://eur-lex.europa.eu/legal-content/PT/ALL/?uri=CELEX:${celex}`);
    // Fallback: Direct HTML
    variants.push(`https://eur-lex.europa.eu/legal-content/PT/TXT/HTML/?uri=CELEX:${celex}`);
  }
  
  if (eliMatch) {
    const eliPath = eliMatch[1].replace(/\/(en|de|fr|bg|cs|da|el|es|et|fi|ga|hr|hu|it|lt|lv|mt|nl|pl|pt|ro|sk|sl|sv)\/?$/i, '');
    variants.push(`https://eur-lex.europa.eu/eli/${eliPath}/oj/por`);
    variants.push(`https://eur-lex.europa.eu/eli/${eliPath}/oj/PT`);
  }
  
  // Original URL as last fallback (already may have PT)
  if (!variants.includes(url)) {
    variants.push(url);
  }
  
  console.log(`🇵🇹 EUR-Lex variants for ${url}: ${variants.length} options`);
  return variants;
}

// Direct fetch for EUR-Lex with explicit language headers - bypasses Firecrawl caching issues
async function directFetchEurlex(url: string): Promise<string | null> {
  try {
    console.log('🔍 Direct fetch EUR-Lex with PT headers:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.5',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    
    if (!response.ok) {
      console.error('Direct fetch error:', response.status);
      return null;
    }
    
    const html = await response.text();
    
    // Check if content is too large (avoid memory issues)
    if (html.length > 2000000) {
      console.log(`⚠️ Content too large (${html.length} chars), truncating`);
      return html.substring(0, 2000000);
    }
    
    // Basic HTML to text conversion for legal content
    let text = html
      // Remove scripts and styles
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      // Remove navigation, headers, footers
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      // Keep article content
      .replace(/<article[^>]*>([\s\S]*?)<\/article>/gi, '$1')
      // Convert important tags to text with markers
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n## $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Remove all remaining tags
      .replace(/<[^>]+>/g, ' ')
      // Clean up whitespace
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
    
    console.log(`✅ Direct fetch: ${text.length} chars extracted`);
    return text;
  } catch (error) {
    console.error('Direct fetch error:', error);
    return null;
  }
}

// Detect if text is in Portuguese (not Bulgarian, English, etc.)
function isPortugueseText(text: string): { isPortuguese: boolean; detectedLanguage: string; confidence: number } {
  if (!text || text.length < 100) {
    return { isPortuguese: false, detectedLanguage: 'unknown', confidence: 0 };
  }
  
  // Sample first 5000 chars for language detection
  const sample = text.substring(0, 5000).toLowerCase();
  
  // Portuguese markers (unique to Portuguese)
  const ptMarkers = [
    /\bpresente\s+regulamento\b/,
    /\bos\s+estados[\-\s]membros\b/,
    /\bdeve[mr]?\s+ser\b/,
    /\bno\s+entanto\b/,
    /\balínea\b/,
    /\bpelo\s+presente\b/,
    /\bà\s+luz\s+de\b/,
    /\bno\s+âmbito\b/,
    /\bque\s+estabelece\b/,
    /\bdisposições\b/,
    /\bobjetivo\b/,
    /\bcondições\b/,
    /\bcompetências\b/,
    /\bautorização\b/,
    /\bnotificação\b/,
    /\bprocedimento\b/,
    /\bregulamentação\b/,
    /\bsegurança\b/,
    /\bsaúde\b/,
    /\bambiente\b/,
    /\btrabalho\b/,
    /\bempresa\b/,
    /\bconformidade\b/,
    /\bprazos\b/,
  ];
  
  // Bulgarian markers (Cyrillic)
  const hasCyrillic = /[\u0400-\u04FF]/.test(sample);
  if (hasCyrillic) {
    return { isPortuguese: false, detectedLanguage: 'bulgarian', confidence: 0.95 };
  }
  
  // English markers
  const enMarkers = [
    /\bshall\s+be\b/,
    /\bmember\s+states\s+shall\b/,
    /\bfor\s+the\s+purposes\s+of\s+this\b/,
    /\bin\s+accordance\s+with\b/,
    /\bprovided\s+for\s+in\b/,
    /\bwithout\s+prejudice\s+to\b/,
    /\bthe\s+commission\s+shall\b/,
  ];
  
  // Count matches
  const ptMatches = ptMarkers.filter(r => r.test(sample)).length;
  const enMatches = enMarkers.filter(r => r.test(sample)).length;
  
  // Common words check
  const ptCommon = (sample.match(/\b(que|para|com|dos|das|pela|pelo|ser|deve|pode|não|são|nos|nas|seu|sua|seus|suas|esta|este|essa|esse|pelo|pela)\b/g) || []).length;
  const enCommon = (sample.match(/\b(the|of|to|and|for|that|this|with|shall|may|which|from|such|any|all|have|been)\b/g) || []).length;
  
  // Calculate confidence
  const totalPt = ptMatches * 10 + ptCommon;
  const totalEn = enMatches * 10 + enCommon;
  const total = totalPt + totalEn + 1; // +1 to avoid division by zero
  
  const ptRatio = totalPt / total;
  
  if (totalPt > totalEn * 2 && ptMatches >= 3) {
    return { isPortuguese: true, detectedLanguage: 'portuguese', confidence: Math.min(0.95, ptRatio * 1.5) };
  }
  
  if (totalEn > totalPt * 2 || enMatches >= 3) {
    return { isPortuguese: false, detectedLanguage: 'english', confidence: Math.min(0.95, (totalEn / total) * 1.5) };
  }
  
  // Uncertain - check for Portuguese special chars
  const ptChars = (sample.match(/[ãõáéíóúâêôç]/g) || []).length;
  if (ptChars > 20 && ptMatches >= 2) {
    return { isPortuguese: true, detectedLanguage: 'portuguese', confidence: 0.7 };
  }
  
  return { isPortuguese: false, detectedLanguage: 'unknown', confidence: 0.3 };
}

// Scrape URL using Firecrawl with Portuguese language enforcement for EUR-Lex
// For EUR-Lex: tries direct fetch first (with PT headers) before Firecrawl
async function scrapeUrl(url: string, firecrawlApiKey: string): Promise<{ markdown: string; html: string; language?: string } | null> {
  try {
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }
    
    const isEurlex = formattedUrl.includes('eur-lex.europa.eu');
    const urlsToTry = isEurlex ? getEurlexPortugueseVariants(formattedUrl) : [formattedUrl];
    
    // For EUR-Lex, try direct fetch FIRST with explicit PT headers
    // This bypasses Firecrawl caching which may return wrong language
    if (isEurlex) {
      for (const tryUrl of urlsToTry) {
        const directContent = await directFetchEurlex(tryUrl);
        
        if (directContent && directContent.length > 1000) {
          const langCheck = isPortugueseText(directContent);
          console.log(`🌐 Direct fetch language: ${langCheck.detectedLanguage} (confidence: ${(langCheck.confidence * 100).toFixed(0)}%)`);
          
          if (langCheck.isPortuguese) {
            console.log(`✅ Portuguese content confirmed via direct fetch from ${tryUrl}`);
            return {
              markdown: directContent,
              html: '',
              language: 'portuguese',
            };
          }
          
          console.log(`⚠️ Direct fetch returned ${langCheck.detectedLanguage}, trying next variant...`);
        }
      }
      
      console.log(`⚠️ All direct fetch attempts failed to get PT content, falling back to Firecrawl...`);
    }
    
    // Fallback to Firecrawl for non-EUR-Lex or if direct fetch failed
    for (const tryUrl of urlsToTry) {
      console.log(`🔍 Firecrawl scraping (attempt ${urlsToTry.indexOf(tryUrl) + 1}/${urlsToTry.length}):`, tryUrl);

      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: tryUrl,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
          location: { country: 'PT', languages: ['pt', 'pt-PT'] },
        }),
      });

      if (!response.ok) {
        console.error(`Firecrawl error for ${tryUrl}:`, response.status);
        if (urlsToTry.indexOf(tryUrl) < urlsToTry.length - 1) continue;
        return null;
      }

      const data = await response.json();
      const markdown = data.data?.markdown || data.markdown || '';
      console.log(`✅ Firecrawl scraped ${markdown.length} chars from ${tryUrl}`);
      
      const langCheck = isPortugueseText(markdown);
      console.log(`🌐 Firecrawl language: ${langCheck.detectedLanguage} (confidence: ${(langCheck.confidence * 100).toFixed(0)}%)`);
      
      if (langCheck.isPortuguese) {
        console.log(`✅ Portuguese content confirmed from Firecrawl ${tryUrl}`);
        return {
          markdown,
          html: data.data?.html || data.html || '',
          language: 'portuguese',
        };
      }
      
      if (urlsToTry.indexOf(tryUrl) < urlsToTry.length - 1) {
        console.log(`⚠️ Firecrawl content not in Portuguese (${langCheck.detectedLanguage}), trying next...`);
        continue;
      }
      
      // Last resort - return with detected language
      console.log(`⚠️ All attempts exhausted, returning ${langCheck.detectedLanguage} content`);
      return {
        markdown,
        html: data.data?.html || data.html || '',
        language: langCheck.detectedLanguage,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Scrape error:', error);
    return null;
  }
}

// Check for error pages - be more careful to not false-positive on legal content
function isErrorPage(content: string): boolean {
  // Short content is definitely an error
  if (content.length < 500) return true;
  
  // For EUR-Lex, legal documents often mention "404" in references, so check more carefully
  const lowContent = content.toLowerCase();
  
  // These patterns are specific error messages, not general numbers
  const errorPatterns = [
    'the requested document does not exist',
    'access denied',
    'page not found',
    'página que acedeu não se encontra disponível',
    'document not available',
    'this document is not available',
    'erro 404',
    '404 not found',
    'http error',
    'server error',
  ];
  
  // Check for explicit error patterns
  const hasErrorPattern = errorPatterns.some(pattern => lowContent.includes(pattern));
  if (hasErrorPattern) return true;
  
  // A valid legal document should have article markers or legal structure
  const hasLegalContent = 
    /artigo\s+\d+/i.test(content) || 
    /article\s+\d+/i.test(content) ||
    /considerando/i.test(content) ||
    /whereas/i.test(content) ||
    /regulamento/i.test(content) ||
    /diretiva/i.test(content);
  
  // If it's a reasonably large document with legal markers, it's not an error page
  if (content.length > 5000 && hasLegalContent) return false;
  
  return false;
}

// Background extraction function
async function runBackgroundExtraction(
  supabase: any,
  lovableApiKey: string,
  userId: string | null,
  options: { 
    batchSize: number; 
    maxBatches: number; 
    origin?: string;
    useUrl?: boolean;
    firecrawlApiKey?: string;
    legislationIds?: string[]; // Optional: specific IDs to process
    forceReplace?: boolean; // Optional: delete existing requirements and re-extract
    randomOffset?: number; // Random offset for parallel jobs to avoid overlap
    strictUrlOnly?: boolean; // If true, skip legislation when URL scrape fails (no summary fallback)
  }
) {
  const { batchSize, maxBatches, origin, useUrl, firecrawlApiKey, legislationIds, forceReplace, randomOffset = 0, strictUrlOnly = false } = options;
  
  console.log(`🚀 Starting extraction with useUrl=${useUrl}, strictUrlOnly=${strictUrlOnly}, origin=${origin || 'all'}, specificIds=${legislationIds?.length || 0}, forceReplace=${forceReplace || false}, randomOffset=${randomOffset}`);
  
  // IMPORTANT: forceReplace now uses "deferred delete" - we collect new requirements first,
  // then only delete existing ones if extraction succeeds. This prevents data loss on failure.
  // Track which legislation IDs need their requirements replaced after successful extraction
  const pendingReplacement: Map<string, Requirement[]> = new Map();
  
  const isTargetedExtraction = legislationIds && legislationIds.length > 0;
  // Create a sync log entry to track progress
  const originLabel = isTargetedExtraction 
    ? `Pós-correção: ${legislationIds.length} diplomas`
    : (origin === 'PT' ? 'PT' : origin === 'EU' ? 'EU' : 'Todos');
  const { data: logEntry, error: logError } = await supabase
    .from('sync_logs')
    .insert({
      sync_type: isTargetedExtraction ? 'post-fix-requirements-extraction' : 'background-requirements-extraction',
      status: 'running',
      created_by: userId,
      items_processed: 0,
      items_added: 0,
      error_message: `Origem: ${originLabel}`,
    })
    .select()
    .single();

  if (logError) {
    console.error('Failed to create log entry:', logError);
    return;
  }

  const logId = logEntry.id;
  let totalProcessed = 0;
  let totalRequirements = 0;
  let batchesCompleted = 0;
  let urlScrapedCount = 0;
  let summaryFallbackCount = 0;

  try {
    while (batchesCompleted < maxBatches) {
      // Get ALL legislation IDs with requirements (paginated to avoid 1000 row limit)
      const idsWithReqs = new Set<string>();
      let page = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data: existingReqs, error: reqsError } = await supabase
          .from('legal_requirements')
          .select('legislation_id')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (reqsError) {
          console.error('Error fetching requirements:', reqsError);
          break;
        }
        
        if (!existingReqs || existingReqs.length === 0) break;
        
        existingReqs.forEach((r: any) => idsWithReqs.add(r.legislation_id));
        
        if (existingReqs.length < pageSize) break;
        page++;
      }
      
      console.log(`📊 Found ${idsWithReqs.size} legislation IDs with existing requirements`);
      
      let legislationWithoutReqs: any[];
      
      // If we have specific IDs, use them; otherwise query all legislation
      if (isTargetedExtraction) {
        // Process specific legislation IDs (from post-fix extraction)
        // If forceReplace is true, process all specified IDs regardless of existing requirements
        const idsToProcess = forceReplace 
          ? legislationIds 
          : legislationIds.filter(id => !idsWithReqs.has(id));
        
        if (idsToProcess.length === 0) {
          console.log('All specified legislation already has requirements');
          break;
        }
        
        // Fetch the specific legislation
        const { data: specificLegislation } = await supabase
          .from('legislation')
          .select('id, number, title, summary, document_url, origin')
          .in('id', idsToProcess.slice(0, batchSize));
        
        legislationWithoutReqs = specificLegislation || [];
        console.log(`📋 Targeted: ${legislationIds.length} specified, ${idsToProcess.length} to process (forceReplace=${forceReplace}), fetched ${legislationWithoutReqs.length}`);
      } else {
        // Build query with optional origin filter and random offset for parallel jobs
        let query = supabase
          .from('legislation')
          .select('id, number, title, summary, document_url, origin')
          .order('publication_date', { ascending: false });
        
        const originUpper = origin?.toUpperCase();
        if (originUpper === 'PT') {
          query = query.or('origin.eq.PT,origin.eq.dre,origin.is.null');
        } else if (originUpper === 'EU') {
          query = query.or('origin.eq.EU,origin.eq.eurlex');
        }
        
        // Apply random offset and limit for parallel job isolation
        const fetchLimit = batchSize * maxBatches + randomOffset;
        query = query.range(randomOffset, fetchLimit - 1);
        
        const { data: allLegislation } = await query;
        
        legislationWithoutReqs = allLegislation?.filter((l: any) => !idsWithReqs.has(l.id)) || [];
        console.log(`📋 ${origin || 'ALL'}: fetched ${allLegislation?.length || 0} (offset ${randomOffset}), ${legislationWithoutReqs.length} without reqs`);
      }
      
      const legislationToProcess = legislationWithoutReqs.slice(0, batchSize);

      if (legislationToProcess.length === 0) {
        console.log('All legislation processed, stopping background extraction');
        break;
      }

      console.log(`📦 Batch ${batchesCompleted + 1}: processing ${legislationToProcess.length} items in parallel`);

      // Process in parallel chunks of 5 for much faster throughput
      const PARALLEL_CHUNK_SIZE = 5;
      
      for (let i = 0; i < legislationToProcess.length; i += PARALLEL_CHUNK_SIZE) {
        const chunk = legislationToProcess.slice(i, i + PARALLEL_CHUNK_SIZE);
        
        const results = await Promise.allSettled(chunk.map(async (leg: { id: string; number: string; title: string; summary: string | null; document_url: string | null; origin: string | null }) => {
          try {
            let textContent = '';
            let usedUrl = false;
            
            // Try to scrape URL if enabled and available
            if (useUrl && firecrawlApiKey && leg.document_url) {
              const scraped = await scrapeUrl(leg.document_url, firecrawlApiKey);
              
              const isError = scraped ? isErrorPage(scraped.markdown) : true;
              console.log(`🔎 ${leg.number}: scraped=${!!scraped}, markdown=${scraped?.markdown?.length || 0} chars, isErrorPage=${isError}, lang=${scraped?.language}`);
              
              if (scraped && scraped.markdown && !isError) {
                // CRITICAL: Validate Portuguese language for EUR-Lex content
                const isEuSource = leg.origin === 'EU' || leg.origin === 'eurlex' || leg.document_url?.includes('eur-lex');
                
                if (isEuSource && scraped.language && scraped.language !== 'portuguese') {
                  console.log(`🚫 ${leg.number}: REJECTED - Text is in ${scraped.language}, not Portuguese. Marking as pending.`);
                  
                  // Record failure for tracking
                  await supabase
                    .from('legislation_processing_failures')
                    .upsert({
                      legislation_id: leg.id,
                      failure_type: 'wrong_language',
                      failure_reason: `Texto extraído em ${scraped.language}, não português. Necessita versão PT do EUR-Lex.`,
                      source: 'extract-requirements-background',
                      is_permanent: false,
                      retry_after: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                      error_details: JSON.stringify({ 
                        detectedLanguage: scraped.language, 
                        documentUrl: leg.document_url,
                        sampleText: scraped.markdown.substring(0, 200) 
                      }),
                    }, { onConflict: 'legislation_id' });
                  
                  return { processed: true, skipped: true, requirementsAdded: 0, reason: 'wrong_language' };
                }
                
                textContent = scraped.markdown;
                usedUrl = true;
                console.log(`📄 ${leg.number}: Using scraped content (${textContent.length} chars, lang=${scraped.language || 'validated'})`);
              } else {
                if (strictUrlOnly) {
                  console.log(`🚫 ${leg.number}: Scrape failed and strictUrlOnly=true, SKIPPING (no fallback)`);
                  return { processed: true, skipped: true, requirementsAdded: 0, reason: 'scrape_failed' };
                }
                console.log(`⚠️ ${leg.number}: Scrape failed or error page, falling back to summary`);
              }
            }
            
            // Build prompt based on available content AND origin
            let prompt: string;
            let useAdvancedModel = false;
            const isEU = leg.origin === 'EU' || leg.origin === 'eurlex' || 
                         leg.number?.toLowerCase().includes('regulamento') ||
                         leg.number?.toLowerCase().includes('diretiva') ||
                         leg.number?.toLowerCase().includes('decisão');
            
            if (textContent) {
              // Full text extraction - more comprehensive
              // For very large documents, we need to process in chunks
              const MAX_CHUNK_SIZE = 20000; // Reduced for more reliable AI parsing
              const textChunks: string[] = [];
              
              if (textContent.length > MAX_CHUNK_SIZE) {
                // Split by article markers to keep articles together
                // Support multiple article marker formats (PT, EU, EN)
                const articleMarker = /(?=(?:Artigo|Art\.|Article|ARTIGO)\s+\d+)/gi;
                const parts = textContent.split(articleMarker).filter(p => p.trim());
                
                // If article markers weren't found, split by paragraph/section breaks
                const effectiveParts = parts.length > 1 ? parts : textContent.split(/\n{2,}/).filter(p => p.trim());
                
                let currentChunk = '';
                for (const part of effectiveParts) {
                  // If a single part is larger than MAX_CHUNK_SIZE, we need to force-split it
                  if (part.length > MAX_CHUNK_SIZE) {
                    // Save current chunk if not empty
                    if (currentChunk.trim()) {
                      textChunks.push(currentChunk);
                      currentChunk = '';
                    }
                    // Force-split large part by size
                    for (let i = 0; i < part.length; i += MAX_CHUNK_SIZE) {
                      textChunks.push(part.substring(i, i + MAX_CHUNK_SIZE));
                    }
                  } else if ((currentChunk + part).length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
                    textChunks.push(currentChunk);
                    currentChunk = part;
                  } else {
                    currentChunk += (currentChunk ? '\n\n' : '') + part;
                  }
                }
                if (currentChunk.trim()) {
                  textChunks.push(currentChunk);
                }
                console.log(`📚 ${leg.number}: Large document (${textContent.length} chars) split into ${textChunks.length} chunks`);
              } else {
                textChunks.push(textContent);
              }
              
              useAdvancedModel = true;
              
              // Process all chunks and collect all requirements
              const allChunkRequirements: Requirement[] = [];
              
              for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
                const truncatedText = textChunks[chunkIndex];
                const chunkInfo = textChunks.length > 1 ? ` (parte ${chunkIndex + 1}/${textChunks.length})` : '';
                
                if (isEU) {
                  // EU LEGISLATION - artigos, anexos OU texto corrido
                  prompt = `Analisa o seguinte diploma EUROPEU${chunkInfo} e extrai TODOS os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
${leg.summary && chunkIndex === 0 ? `SUMÁRIO: ${leg.summary}` : ''}

TEXTO DO DIPLOMA${chunkInfo}:
${truncatedText}

INSTRUÇÕES CRÍTICAS:
1. IGNORA preâmbulos, considerandos, vistos - começa nos Artigos
2. Extrai CADA ARTIGO COMPLETO (Artigo 1.º, Artigo 2.º, etc.) com TODO o seu texto
3. NÃO extraias números/alíneas separadamente - inclui tudo no artigo principal
4. article deve ser APENAS "Artigo X.º" ou "Anexo X" - NUNCA "Artigo X.º, n.º Y"
5. NÃO LIMITES o número de artigos - extrai TODOS

FORMATO OBRIGATÓRIO:
- article: "Artigo 1.º", "Artigo 2.º", "Anexo I" (NUNCA incluir n.º ou alíneas)
- requirement_text: TEXTO INTEGRAL incluindo TODOS os números e alíneas (máx 3500 chars)
- notes: contexto breve (opcional)

Retorna APENAS um array JSON válido:
[{"article": "Artigo 1.º", "requirement_text": "1 - O presente regulamento estabelece...", "notes": "Objeto"}]`;
                } else {
                  // PT LEGISLATION - artigos, anexos OU texto corrido
                  prompt = `Analisa o seguinte diploma PORTUGUÊS${chunkInfo} e extrai TODOS os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
${leg.summary && chunkIndex === 0 ? `SUMÁRIO: ${leg.summary}` : ''}

TEXTO DO DIPLOMA${chunkInfo}:
${truncatedText}

INSTRUÇÕES CRÍTICAS:
1. IGNORA preâmbulos, vistos, considerandos - começa nos Artigos
2. Extrai CADA ARTIGO COMPLETO (Art. 1.º, Art. 2.º, etc.) com TODO o seu texto
3. NÃO extraias números/alíneas separadamente - inclui tudo no artigo principal
4. article deve ser APENAS "Artigo X.º" ou "Anexo X" - NUNCA "Artigo X.º, n.º Y"
5. NÃO LIMITES o número de artigos - extrai TODOS os que encontrares

FORMATO OBRIGATÓRIO:
- article: "Artigo 1.º", "Artigo 2.º", "Anexo I" (NUNCA incluir n.º ou alíneas no nome)
- requirement_text: TEXTO INTEGRAL do artigo incluindo TODOS os números e alíneas (máx 3500 chars)
- notes: contexto breve se necessário (opcional)

EXEMPLO CORRETO:
{"article": "Artigo 5.º", "requirement_text": "1 - O detentor deve... 2 - Sem prejuízo... a) Os resíduos... b) A separação..."}

EXEMPLO ERRADO (NÃO FAZER):
{"article": "Artigo 5.º, n.º 2, alínea a)", "requirement_text": "Os resíduos..."}

Retorna APENAS um array JSON válido:
[{"article": "Artigo 1.º", "requirement_text": "1 - O presente decreto-lei estabelece...", "notes": "Objeto"}]`;
                }
                
                // Make AI call for this chunk
                const chunkResponse = await fetch(AI_ENDPOINT, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${lovableApiKey}`,
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: [
                      { role: 'system', content: 'És um especialista em legislação. Extrai TODOS os artigos/requisitos legais do texto. NÃO LIMITES o número de artigos - extrai tudo. Responde APENAS com JSON válido.' },
                      { role: 'user', content: prompt }
                    ],
                    temperature: 0.2,
                    max_tokens: 16000, // Increased for diplomas with many articles
                  }),
                });
                
                if (!chunkResponse.ok) {
                  console.error(`AI error for ${leg.number} chunk ${chunkIndex}:`, chunkResponse.status);
                  continue;
                }
                
                const chunkAiData = await chunkResponse.json();
                const chunkContent = chunkAiData.choices?.[0]?.message?.content || '';
                
                try {
                  let jsonContent = chunkContent.trim();
                  if (jsonContent.startsWith('```json')) {
                    jsonContent = jsonContent.replace(/^```json\s*\n?/, '').replace(/\n?\s*```$/, '');
                  } else if (jsonContent.startsWith('```')) {
                    jsonContent = jsonContent.replace(/^```\s*\n?/, '').replace(/\n?\s*```$/, '');
                  }
                  
                  const arrayMatch = jsonContent.match(/\[[\s\S]*\]/);
                  if (arrayMatch) {
                    jsonContent = arrayMatch[0];
                  }
                  
                  const chunkReqs = JSON.parse(jsonContent);
                  if (Array.isArray(chunkReqs)) {
                    const cleanedReqs = chunkReqs
                      .filter((r: any) => r && typeof r === 'object' && r.requirement_text)
                      .map((r: any) => ({
                        article: cleanArticle(r.article, leg.number),
                        requirement_text: String(r.requirement_text).substring(0, 3500),
                        notes: r.notes ? String(r.notes).substring(0, 500) : undefined,
                      }));
                    
                    // INSERT IMMEDIATELY after each chunk to avoid data loss on shutdown
                    if (cleanedReqs.length > 0) {
                      // Check for duplicates before inserting - use ONLY article as key to avoid duplicate articles
                      const { data: existingReqsForChunk } = await supabase
                        .from('legal_requirements')
                        .select('article')
                        .eq('legislation_id', leg.id);
                      
                      const existingArticles = new Set(
                        (existingReqsForChunk || []).map((r: { article: string }) => r.article)
                      );
                      
                      const newReqs = cleanedReqs.filter(req => !existingArticles.has(req.article));
                      
                      if (newReqs.length > 0) {
                        const toInsert = newReqs.map(req => ({
                          legislation_id: leg.id,
                          article: req.article,
                          requirement_text: req.requirement_text,
                          notes: req.notes || null,
                        }));
                        
                        const { error: insertError } = await supabase
                          .from('legal_requirements')
                          .insert(toInsert);
                        
                        if (!insertError) {
                          console.log(`💾 ${leg.number} chunk ${chunkIndex + 1}: saved ${newReqs.length} requirements`);
                          allChunkRequirements.push(...newReqs);
                        } else {
                          console.error(`Insert error for ${leg.number} chunk ${chunkIndex + 1}:`, insertError);
                        }
                      } else {
                        console.log(`📄 ${leg.number} chunk ${chunkIndex + 1}: extracted ${cleanedReqs.length} (all duplicates)`);
                      }
                    }
                  }
                } catch (parseError) {
                  console.error(`Parse error for ${leg.number} chunk ${chunkIndex}:`, parseError);
                }
                
                // Small delay between chunks to avoid rate limiting
                if (textChunks.length > 1) {
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
              }
              
              // Log final summary
              if (allChunkRequirements.length > 0) {
                console.log(`✅ ${leg.number}: Total ${allChunkRequirements.length} requirements from ${textChunks.length} chunks (already saved)`);
                return { processed: true, usedUrl: true, requirementsAdded: allChunkRequirements.length };
              }
              return { processed: true, usedUrl: true, requirementsAdded: 0 };
            }
            
            // Summary-based extraction - fallback when no URL content available
            {
              // Summary-based extraction - USE ADVANCED MODEL to compensate for lack of full text
              useAdvancedModel = true;
              
              if (isEU) {
                // EU SUMMARY-BASED
                prompt = `És um especialista em legislação EUROPEIA. Com base no título e sumário deste diploma, infere os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
SUMÁRIO: ${leg.summary || 'Não disponível'}
${leg.document_url ? `URL: ${leg.document_url}` : ''}

INSTRUÇÕES:
1. SE O DIPLOMA TEM ARTIGOS (Regulamentos, Diretivas, Decisões com articulado):
   - Infere os artigos prováveis (Artigo 1.º, Artigo 2.º, etc.)
   - article: "Artigo 1.º", "Artigo 2.º", "Anexo I", etc.

2. SE O DIPLOMA NÃO TEM ARTIGOS (Comunicações, Avisos, Pareceres, Recomendações):
   - Infere o conteúdo principal do corpo do texto
   - article: "Corpo", "Parte 1", "Conclusões", etc.

FORMATO:
- article: identificador do bloco
- requirement_text: texto provável em PORTUGUÊS (máx 1000 caracteres)
- notes: contexto breve (opcional)

Extrai entre 3 e 8 blocos.

Retorna APENAS um array JSON válido:
[{"article": "Artigo 1.º", "requirement_text": "O presente regulamento estabelece...", "notes": "Objeto"}]`;
              } else {
                // PT SUMMARY-BASED
                prompt = `És um especialista em legislação PORTUGUESA. Com base no título e sumário deste diploma, infere os requisitos legais.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
SUMÁRIO: ${leg.summary || 'Não disponível'}
${leg.document_url ? `URL: ${leg.document_url}` : ''}

INSTRUÇÕES:
1. SE O DIPLOMA TEM ARTIGOS (Leis, Decretos-Lei, Portarias com articulado):
   - Infere os artigos prováveis (Art. 1.º, Art. 2.º, etc.)
   - article: "Art. 1.º", "Art. 2.º", "Anexo I", etc.

2. SE O DIPLOMA NÃO TEM ARTIGOS (Despachos, Avisos, Pareceres, Anúncios, Declarações):
   - Infere o conteúdo principal do corpo do texto
   - article: "Corpo", "Parte 1", "Conclusões", etc.

FORMATO:
- article: identificador do bloco
- requirement_text: texto provável em PORTUGUÊS (máx 1000 caracteres)
- notes: contexto breve (opcional)

Extrai entre 3 e 8 blocos.

Retorna APENAS um array JSON válido:
[{"article": "Art. 1.º", "requirement_text": "O presente decreto-lei estabelece...", "notes": "Objeto"}]`;
              }
            }

            const response = await fetch(AI_ENDPOINT, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lovableApiKey}`,
              },
              body: JSON.stringify({
                model: useAdvancedModel ? 'google/gemini-2.5-flash' : 'google/gemini-2.5-flash-lite',
                messages: [
                  { role: 'system', content: 'És um especialista em legislação portuguesa e europeia. Extrai requisitos legais de forma precisa e detalhada. Quando não tens o texto completo, infere requisitos prováveis com base no tipo de diploma e tema. Responde APENAS com JSON válido, sem markdown.' },
                  { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 4000,
              }),
            });

            if (!response.ok) {
              console.error(`AI API error for ${leg.number}:`, response.status);
              
              if (response.status === 429) {
                await new Promise(resolve => setTimeout(resolve, 5000));
              } else if (response.status === 402) {
                console.error('Credits exhausted, stopping');
                throw new Error('Credits exhausted');
              }
              return { processed: false, usedUrl: false };
            }

            const aiData = await response.json();
            const content = aiData.choices?.[0]?.message?.content || '';
            
            let requirements: Requirement[] = [];
            try {
              let jsonContent = content.trim();
              if (jsonContent.startsWith('```json')) {
                jsonContent = jsonContent.replace(/^```json\s*\n?/, '').replace(/\n?\s*```$/, '');
              } else if (jsonContent.startsWith('```')) {
                jsonContent = jsonContent.replace(/^```\s*\n?/, '').replace(/\n?\s*```$/, '');
              }
              
              const arrayMatch = jsonContent.match(/\[[\s\S]*\]/);
              if (arrayMatch) {
                jsonContent = arrayMatch[0];
              }
              
              requirements = JSON.parse(jsonContent);
              
              if (!Array.isArray(requirements)) {
                requirements = [];
              }
              
              requirements = requirements
                .filter(r => r && typeof r === 'object' && r.requirement_text)
                .map(r => ({
                  article: cleanArticle(r.article, leg.number),
                  requirement_text: String(r.requirement_text).substring(0, 3500),
                  notes: r.notes ? String(r.notes).substring(0, 500) : undefined,
                }));
                // No limit - extract all articles
                
            } catch (parseError) {
              console.error(`Parse error for ${leg.number}:`, parseError);
              return { processed: true, usedUrl, requirementsAdded: 0 };
            }

            let requirementsAdded = 0;
            if (requirements.length > 0) {
              // DEFERRED REPLACE: If forceReplace is active, do atomic delete+insert now that we have good data
              if (forceReplace && isTargetedExtraction) {
                // Delete existing requirements ONLY after successful extraction
                const { error: deleteError, count: deletedCount } = await supabase
                  .from('legal_requirements')
                  .delete({ count: 'exact' })
                  .eq('legislation_id', leg.id);
                
                if (deleteError) {
                  console.error(`Failed to delete existing requirements for ${leg.number}:`, deleteError);
                } else if (deletedCount && deletedCount > 0) {
                  console.log(`🗑️ Deferred delete: removed ${deletedCount} old requirements for ${leg.number}`);
                }
                
                // Insert all new requirements
                const toInsert = requirements.map(req => ({
                  legislation_id: leg.id,
                  article: req.article,
                  requirement_text: req.requirement_text,
                  notes: req.notes || null,
                }));

                const { error: insertError } = await supabase
                  .from('legal_requirements')
                  .insert(toInsert);

                if (!insertError) {
                  requirementsAdded = requirements.length;
                  console.log(`✅ ${leg.number}: Replaced with ${requirements.length} new requirements (URL: ${usedUrl})`);
                } else {
                  console.error(`Insert error for ${leg.number}:`, insertError);
                }
              } else {
                // Normal mode: check for existing requirements to avoid duplicates
                const { data: existingReqsForLeg } = await supabase
                  .from('legal_requirements')
                  .select('article, requirement_text')
                  .eq('legislation_id', leg.id);

                const existingSet = new Set(
                  (existingReqsForLeg || []).map((r: { article: string; requirement_text: string }) => `${r.article}::${r.requirement_text.substring(0, 100)}`)
                );

                // Filter out duplicates
                const newRequirements = requirements.filter(req => {
                  const key = `${req.article}::${req.requirement_text.substring(0, 100)}`;
                  return !existingSet.has(key);
                });

                if (newRequirements.length > 0) {
                  const toInsert = newRequirements.map(req => ({
                    legislation_id: leg.id,
                    article: req.article,
                    requirement_text: req.requirement_text,
                    notes: req.notes || null,
                  }));

                  const { error: insertError } = await supabase
                    .from('legal_requirements')
                    .insert(toInsert);

                  if (!insertError) {
                    requirementsAdded = newRequirements.length;
                    console.log(`✅ ${leg.number}: Inserted ${newRequirements.length} requirements (URL: ${usedUrl})`);
                  }
                }
              }
            }

            return { processed: true, usedUrl, requirementsAdded };

          } catch (error) {
            console.error(`Error processing ${leg.number}:`, error);
            if ((error as Error).message === 'Credits exhausted') {
              throw error;
            }
            return { processed: false, usedUrl: false };
          }
        }));

        // Aggregate results from parallel processing
        let skippedCount = 0;
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.processed) {
            totalProcessed++;
            totalRequirements += result.value.requirementsAdded || 0;
            if (result.value.skipped) {
              skippedCount++;
            } else if (result.value.usedUrl) {
              urlScrapedCount++;
            } else {
              summaryFallbackCount++;
            }
          }
        }
        
        // If strictUrlOnly and we're skipping due to credit exhaustion, stop early
        if (strictUrlOnly && skippedCount > 0 && skippedCount === chunk.length) {
          console.log(`🛑 All ${skippedCount} items skipped (likely credit exhaustion). Stopping extraction.`);
          throw new Error(`Créditos Firecrawl esgotados - ${skippedCount} diplomas saltados. Fallback desativado (strictUrlOnly).`);
        }
        
        // Check if any request was rate limited (429)
        const hasRateLimitError = results.some(
          r => r.status === 'rejected' && String(r.reason).includes('429')
        );
        
        // Reduced delay - 200ms between parallel chunks, 2s if rate limited
        const chunkDelay = hasRateLimitError ? 2000 : 200;
        await new Promise(resolve => setTimeout(resolve, chunkDelay));
      }

      batchesCompleted++;
      
      // Update progress in sync_logs
      await supabase
        .from('sync_logs')
        .update({
          items_processed: totalProcessed,
          items_added: totalRequirements,
          error_message: useUrl ? `URL: ${urlScrapedCount}, Sumário: ${summaryFallbackCount}` : null,
        })
        .eq('id', logId);

      console.log(`📊 Batch ${batchesCompleted}/${maxBatches} complete. Total: ${totalProcessed} processed, ${totalRequirements} reqs (URL: ${urlScrapedCount}, Summary: ${summaryFallbackCount})`);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Mark as completed
    await supabase
      .from('sync_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        items_processed: totalProcessed,
        items_added: totalRequirements,
        error_message: useUrl ? `✅ Concluído. URL: ${urlScrapedCount}, Sumário: ${summaryFallbackCount}` : null,
      })
      .eq('id', logId);

    console.log(`🎉 Background extraction completed: ${totalProcessed} processed, ${totalRequirements} requirements added (URL: ${urlScrapedCount}, Summary: ${summaryFallbackCount})`);

    // If this was a targeted extraction with forceReplace and it succeeded with URL scraping,
    // clear any priority extraction failure records for these IDs
    if (legislationIds && legislationIds.length > 0 && forceReplace && useUrl && totalRequirements > 0) {
      const { error: clearError } = await supabase
        .from('legislation_processing_failures')
        .delete()
        .in('legislation_id', legislationIds)
        .eq('failure_type', 'requirements_extraction_priority');
      
      if (!clearError) {
        console.log(`🗑️ Cleared priority failure records for ${legislationIds.length} successfully extracted legislation(s)`);
      }
    }

  } catch (error) {
    console.error('Background extraction error:', error);
    
    await supabase
      .from('sync_logs')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
        items_processed: totalProcessed,
        items_added: totalRequirements,
      })
      .eq('id', logId);
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

  const SYNC_TYPE = 'background-requirements-extraction';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    // Verify authentication - support JWT, internal header, or admin secret in body
    const authHeader = req.headers.get('Authorization');
    const internalKey = req.headers.get('x-internal-key');
    
    // Parse body first to check for admin secret
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    
    const adminSecret = body.adminSecret;
    
    // Check for internal service key (header or body secret)
    const isInternalCall = internalKey === supabaseServiceKey || adminSecret === supabaseServiceKey;
    
    if (isInternalCall) {
      console.log('🔐 Internal service call authenticated');
    }
    
    if (!isInternalCall && (!authHeader || !authHeader.startsWith('Bearer '))) {
      console.log('❌ No valid auth method found');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let userId: string | null = null;
    
    if (isInternalCall) {
      console.log('🔐 Internal service call via x-internal-key - bypassing user auth');
    } else {
      const token = authHeader!.replace('Bearer ', '');
      
      // Check if this is a service role key in bearer token
      const isServiceRoleCall = token === supabaseServiceKey;
      
      if (!isServiceRoleCall) {
        // Validate user JWT token
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader! } },
        });

        const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
        if (claimsError || !claimsData?.claims) {
          return new Response(
            JSON.stringify({ success: false, error: 'Unauthorized - invalid token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        userId = claimsData.claims.sub as string;

        // Only admins can extract requirements
        const { data: adminRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .maybeSingle();

        if (!adminRole) {
          return new Response(
            JSON.stringify({ success: false, error: 'Forbidden - admin access required' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.log('🔐 Service role bearer token - bypassing user auth');
      }
    }

    // Body was already parsed above for auth check
    // useUrl = true by default - always try to scrape from URL for better quality
    // strictUrlOnly = true prevents fallback to summary when scraping fails
    const { batchSize = 50, maxBatches = 20, origin, useUrl = true, strictUrlOnly = false, legislationIds, onlyWithoutRequirements = false, forceReplace = false } = body;

    // Validate useUrl - needs Firecrawl API key
    if (useUrl && !firecrawlApiKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'useUrl requer o conector Firecrawl. Por favor ative em Definições → Conectores.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For targeted extractions (post-fix), skip concurrency check
    const isTargetedExtraction = legislationIds && legislationIds.length > 0;
    
    // Allow up to 5 parallel jobs for requirements extraction
    const MAX_PARALLEL_JOBS = 5;
    const randomOffset = Math.floor(Math.random() * 500); // Random offset to avoid overlap
    
    if (!isTargetedExtraction) {
      // Check concurrency - allow up to MAX_PARALLEL_JOBS simultaneous runs
      const { data: runningJobs } = await supabase
        .from('sync_logs')
        .select('id, started_at')
        .eq('sync_type', SYNC_TYPE)
        .eq('status', 'running')
        .gte('started_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour
      
      const runningCount = runningJobs?.length || 0;
      
      if (runningCount >= MAX_PARALLEL_JOBS) {
        console.log(`⚠️ ${runningCount} jobs já em execução (max: ${MAX_PARALLEL_JOBS})`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Já existem ${runningCount} extrações em curso (máximo: ${MAX_PARALLEL_JOBS}). Aguarde a conclusão.`,
            runningCount,
            maxParallel: MAX_PARALLEL_JOBS,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`📊 Currently ${runningCount}/${MAX_PARALLEL_JOBS} jobs running, starting new job with offset ${randomOffset}`);
    }

    console.log(`🚀 Starting background extraction: batchSize=${batchSize}, maxBatches=${maxBatches}, origin=${origin || 'all'}, useUrl=${useUrl}, strictUrlOnly=${strictUrlOnly}, targetedIds=${legislationIds?.length || 0}, randomOffset=${randomOffset}`);

    // Start background task using Deno's EdgeRuntime
    // Use null for system calls since created_by expects UUID or null
    const createdBy = userId || null;
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      runBackgroundExtraction(supabase, lovableApiKey, createdBy, { 
        batchSize, 
        maxBatches, 
        origin,
        useUrl,
        firecrawlApiKey: useUrl ? firecrawlApiKey : undefined,
        legislationIds,
        forceReplace,
        randomOffset,
        strictUrlOnly,
      })
    ) || runBackgroundExtraction(supabase, lovableApiKey, createdBy, { 
      batchSize, 
      maxBatches, 
      origin,
      useUrl,
      firecrawlApiKey: useUrl ? firecrawlApiKey : undefined,
      legislationIds,
      forceReplace,
      randomOffset,
      strictUrlOnly,
    });

    // Return immediately
    const message = isTargetedExtraction
      ? `Extração de requisitos iniciada para ${legislationIds.length} diplomas corrigidos.`
      : (useUrl 
        ? 'Extração com scraping de URLs iniciada em segundo plano.' 
        : 'Extração em segundo plano iniciada. Pode fechar esta janela.');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message,
        trackingType: isTargetedExtraction ? 'post-fix-requirements-extraction' : 'background-requirements-extraction',
        useUrl,
        targetedCount: legislationIds?.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error starting background extraction:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
