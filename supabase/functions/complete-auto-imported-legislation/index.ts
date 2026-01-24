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
const ITEM_TIMEOUT_MS = 25000; // 25 seconds max per external call

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

// Search DRE for a legislation URL using Firecrawl
async function searchDREUrl(number: string, firecrawlKey: string): Promise<string | null> {
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

// Scrape URL content using Firecrawl with timeout
async function scrapeUrl(url: string, firecrawlKey: string): Promise<string | null> {
  try {
    console.log('Scraping URL:', url);
    
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
      console.error('Scrape error:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.data?.markdown || data.markdown || null;
  } catch (error) {
    console.error('Scrape error (timeout?):', error);
    return null;
  }
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
  if (leg?.origin === 'EU') return true;
  if (leg?.document_url && leg.document_url.includes('eur-lex')) return true;
  return isEULegislation(leg?.number);
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
}) {
  const { limit, dryRun, includePT, includeEU, fixDates, mode, extractRequirements, requireUrl } = params;
  
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
      query = query.or('publication_date.is.null,effective_date.is.null');
    } else if (mode === 'generic_titles') {
      query = query.or('title.ilike.%Diploma referenciado%,title.ilike.%Documento %,summary.ilike.%Diploma referenciado%');
    } else if (mode === 'short_summary') {
      // Diplomas with malformed/very short summaries (< 20 chars)
      // This is done via raw SQL filter since Supabase doesn't support length() in .or()
      query = query.not('summary', 'is', null);
    } else if (mode === 'missing_summary') {
      // Only records missing summary
      query = query.or('summary.is.null,summary.eq.');
    } else {
      query = query.or('document_url.is.null,summary.ilike.%Diploma referenciado%,summary.is.null');
    }
    
    const { data: legislation, error: fetchError } = await query
      .order('created_at', { ascending: false })
      .limit(limit * 3);
    
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
    
    const toProcess = legislation
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
        } else if (mode === 'generic_titles') {
          const hasGenericTitle = leg.title?.toLowerCase().includes('diploma referenciado') ||
                                  leg.title?.toLowerCase().includes('documento ') ||
                                  (leg.title && leg.title.length < 10);
          if (!hasGenericTitle) return false;
        } else if (mode === 'short_summary') {
          // Only process diplomas with very short/malformed summaries
          const summaryLength = leg.summary?.length || 0;
          if (summaryLength === 0 || summaryLength >= 20) return false;
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
            const metadata = await scrapeEurLexMetadata(urlToScrape, firecrawlKey);
            
            if (metadata) {
              if (metadata.title && (!leg.title || leg.title === leg.number)) {
                updates.title = metadata.title;
                hasUpdates = true;
              }
              // In short_summary mode, always overwrite malformed summaries
              const shouldUpdateSummary = !leg.summary || 
                                          leg.summary.includes('Diploma referenciado') ||
                                          (mode === 'short_summary' && (leg.summary?.length || 0) < 20);
              if (metadata.summary && shouldUpdateSummary) {
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
            
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } else {
          if (!leg.document_url) {
            const dreUrl = await searchDREUrl(leg.number, firecrawlKey);
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
          
          const urlToScrape = updates.document_url || leg.document_url;
          if (urlToScrape) {
            const markdown = await scrapeUrl(urlToScrape, firecrawlKey);
            if (markdown && markdown.length > 100) {
              const metadata = extractMetadataFromDRE(markdown, leg.number);
              
              if (metadata.title && (!leg.title || leg.title === leg.number)) {
                updates.title = metadata.title;
                hasUpdates = true;
              }
              // In short_summary mode, always overwrite malformed summaries
              const shouldUpdateSummary = !leg.summary || 
                                          leg.summary.includes('Diploma referenciado') ||
                                          (mode === 'short_summary' && (leg.summary?.length || 0) < 20);
              if (metadata.summary && shouldUpdateSummary) {
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
              
              totalMetadataExtracted++;
              console.log(`Extracted metadata:`, metadata);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
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
      
      await supabase.from('sync_logs').update({ 
        status: 'completed',
        items_processed: results.length,
        items_updated: totalUpdated,
        error_message: completionMessage,
        completed_at: new Date().toISOString() 
      }).eq('id', syncLogId);
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
    let countQuery = supabase.from('legislation').select('id', { count: 'exact', head: true });
    
    if (mode === 'pdf_import_fix') {
      countQuery = countQuery.eq('source', 'pdf-import');
    } else if (mode === 'missing_dates') {
      countQuery = countQuery.or('publication_date.is.null,effective_date.is.null');
    } else if (mode === 'generic_titles') {
      countQuery = countQuery.or('title.ilike.%Diploma referenciado%,title.ilike.%Documento %,summary.ilike.%Diploma referenciado%');
    } else if (mode === 'short_summary') {
      // Count all with non-null summary - will filter in processing
      countQuery = countQuery.not('summary', 'is', null);
    } else {
      countQuery = countQuery.or('document_url.is.null,summary.ilike.%Diploma referenciado%,summary.is.null');
    }
    
    const { count: pendingCount } = await countQuery;
    
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
      }));
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Completar diplomas iniciado em segundo plano',
          pendingCount,
          limit,
          mode,
          background: true,
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
