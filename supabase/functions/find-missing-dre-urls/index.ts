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
function extractLegislationParts(number: string): { type: string; num: string; year: string; suffix?: string } | null {
  const cleanNumber = number.trim();
  
  // Month names for date parsing (Portuguese)
  const monthMap: Record<string, string> = {
    'janeiro': '01', 'jan': '01',
    'fevereiro': '02', 'fev': '02',
    'março': '03', 'marco': '03', 'mar': '03',
    'abril': '04', 'abr': '04',
    'maio': '05', 'mai': '05',
    'junho': '06', 'jun': '06',
    'julho': '07', 'jul': '07',
    'agosto': '08', 'ago': '08',
    'setembro': '09', 'set': '09',
    'outubro': '10', 'out': '10',
    'novembro': '11', 'nov': '11',
    'dezembro': '12', 'dez': '12'
  };
  
  // Helper to normalize year
  const normalizeYear = (year: string): string => {
    if (year.length === 2) {
      const yearNum = parseInt(year, 10);
      return yearNum <= 30 ? `20${year}` : `19${year}`;
    }
    return year;
  };
  
  // Helper to extract suffix (e.g., -A, -B, /A, /B from numbers like "165-A" or "165/A")
  // Also handles multi-letter suffixes like "-AA", "-AB", "-Z"
  const extractSuffix = (numStr: string): { baseNum: string; suffix?: string } => {
    // Pattern: number followed by dash/slash and 1-2 letters (not followed by more digits)
    const suffixMatch = numStr.match(/^(\d+)[-\/]([A-Za-z]{1,2})$/);
    if (suffixMatch) {
      return { baseNum: suffixMatch[1], suffix: suffixMatch[2].toUpperCase() };
    }
    // Also check for suffix at the end of a longer string (e.g., "1092-G" in "1092-G/95")
    const embeddedSuffixMatch = numStr.match(/^(\d+)-([A-Za-z]{1,2})$/);
    if (embeddedSuffixMatch) {
      return { baseNum: embeddedSuffixMatch[1], suffix: embeddedSuffixMatch[2].toUpperCase() };
    }
    return { baseNum: numStr.replace(/[^0-9]/g, '') };
  };
  
  // Type mappings
  const typeMap: Record<string, string> = {
    'decreto-lei': 'decreto-lei',
    'portaria': 'portaria',
    'lei constitucional': 'lei-constitucional',
    'lei': 'lei',
    'despacho': 'despacho',
    'despacho conjunto': 'despacho-conjunto',
    'despacho normativo': 'despacho-normativo',
    'resolução do conselho de ministros': 'resolucao-do-conselho-de-ministros',
    'rcm': 'resolucao-do-conselho-de-ministros',
    'resolução da assembleia da república': 'resolucao-da-assembleia-da-republica',
    'resolução': 'resolucao',
    'declaração de retificação': 'declaracao-de-retificacao',
    'declaração de rectificação': 'declaracao-de-retificacao',
    'deliberação': 'deliberacao',
    'aviso': 'aviso',
    'av': 'aviso',
    'regulamento': 'regulamento',
    'acórdão do tribunal constitucional': 'acordao-do-tribunal-constitucional',
    'decreto do presidente da república': 'decreto-do-presidente-da-republica',
    'decreto legislativo regional': 'decreto-legislativo-regional',
    'decreto regulamentar': 'decreto-regulamentar',
    'decreto regulamentar regional': 'decreto-regulamentar-regional',
    'decreto': 'decreto',
  };
  
  // PATTERN 0: Suffixed legislation (e.g., "Despacho n.º 4089-A/2025", "Portaria n.º 1092-G/95 de 6 de setembro")
  // Priority because suffixes are commonly missed by simpler patterns
  // Supports: NUMBER-SUFFIX/YEAR or NUMBER-SUFFIX/YEAR de DATE
  const suffixPatterns = [
    // Format: TYPE n.º NUMBER-SUFFIX/YEAR (with optional date)
    /^(Despacho\s+Conjunto)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Despacho\s+Normativo)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Despacho)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Portaria)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Decreto-Lei)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Lei)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Aviso|Av)\s+n?\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Resolução)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Declaração\s+de\s+Reti[fc]icação)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Declaração)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Decreto\s+Regulamentar\s+Regional)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Decreto\s+Regulamentar)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Decreto\s+Legislativo\s+Regional)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Decreto)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Regulamento)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Deliberação)\s+n\.?º?\s*(\d+)[-]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
  ];
  
  for (const regex of suffixPatterns) {
    const match = cleanNumber.match(regex);
    if (match) {
      const typeName = match[1].toLowerCase().replace(/\s+/g, ' ').trim();
      const type = typeMap[typeName] || typeName.replace(/\s+/g, '-');
      const suffix = match[3].toUpperCase();
      return { type, num: match[2], suffix, year: normalizeYear(match[4]) };
    }
  }
  
  // PATTERN 0b: Slash-based suffixes (e.g., "Portaria n.º 1467/C/2001" or "Aviso n.º 1804/Z/2007")
  const slashSuffixPatterns = [
    /^(Portaria)\s+n\.?º?\s*(\d+)[\/]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Aviso|Av)\s+n?\.?º?\s*(\d+)[\/]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Despacho)\s+n\.?º?\s*(\d+)[\/]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Decreto-Lei)\s+n\.?º?\s*(\d+)[\/]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
    /^(Lei)\s+n\.?º?\s*(\d+)[\/]([A-Za-z]{1,2})[\/](\d{2,4})(?:\s|$|,)/i,
  ];
  
  for (const regex of slashSuffixPatterns) {
    const match = cleanNumber.match(regex);
    if (match) {
      const typeName = match[1].toLowerCase().replace(/\s+/g, ' ').trim();
      const type = typeMap[typeName] || typeName.replace(/\s+/g, '-');
      const suffix = match[3].toUpperCase();
      return { type, num: match[2], suffix, year: normalizeYear(match[4]) };
    }
  }
  
  // PATTERN 1: NUMBER/YEAR/SERIES format (e.g., "Aviso n.º 5324/2025/2" or "Aviso n.º 1046/2026/2 de 20 de janeiro")
  const seriesPatterns = [
    /^(Aviso|Av)\s+n?\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Portaria)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Despacho\s+Conjunto)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Despacho\s+Normativo)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Despacho)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Decreto-Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Declaração\s+de\s+Reti[fc]icação)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Deliberação)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Regulamento)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Resolução)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Decreto\s+Regulamentar\s+Regional)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Decreto\s+Regulamentar)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Decreto\s+Legislativo\s+Regional)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
    /^(Decreto)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})[\/\-]\d+/i,
  ];
  
  for (const regex of seriesPatterns) {
    const match = cleanNumber.match(regex);
    if (match) {
      const typeName = match[1].toLowerCase().replace(/\s+/g, ' ').trim();
      const type = typeMap[typeName] || typeName.replace(/\s+/g, '-');
      const { baseNum, suffix } = extractSuffix(match[2]);
      return { type, num: baseNum, suffix, year: normalizeYear(match[3]) };
    }
  }
  
  // PATTERN 2: Standard NUMBER/YEAR format (e.g., "Decreto-Lei n.º 97/2008", "Decreto n.º 15/2020")
  const slashPatterns = [
    { regex: /^(Decreto-Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'decreto-lei' },
    { regex: /^(Portaria)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'portaria' },
    { regex: /^(Lei\s+Constitucional)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'lei-constitucional' },
    { regex: /^(Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'lei' },
    { regex: /^(Despacho\s+Conjunto)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'despacho-conjunto' },
    { regex: /^(Despacho\s+Normativo)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'despacho-normativo' },
    { regex: /^(Despacho)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'despacho' },
    { regex: /^(Resolução\s+do\s+Conselho\s+de\s+Ministros)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'resolucao-do-conselho-de-ministros' },
    { regex: /^(RCM)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'resolucao-do-conselho-de-ministros' },
    { regex: /^(Resolução\s+da\s+Assembleia\s+da\s+República)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'resolucao-da-assembleia-da-republica' },
    { regex: /^(Resolução)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'resolucao' },
    { regex: /^(Declaração\s+de\s+Reti[fc]icação)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'declaracao-de-retificacao' },
    { regex: /^(Deliberação)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'deliberacao' },
    { regex: /^(Aviso|Av)\s+n?\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'aviso' },
    { regex: /^(Regulamento)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'regulamento' },
    { regex: /^(Acórdão\s+do\s+Tribunal\s+Constitucional)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'acordao-do-tribunal-constitucional' },
    { regex: /^(Decreto\s+do\s+Presidente\s+da\s+República)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'decreto-do-presidente-da-republica' },
    { regex: /^(Decreto\s+Legislativo\s+Regional)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?:\/[A-Z])?(?!\/)(?:\s|$|,)/i, type: 'decreto-legislativo-regional' },
    { regex: /^(Decreto\s+Regulamentar\s+Regional)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?:\/[A-Z])?(?!\/)(?:\s|$|,)/i, type: 'decreto-regulamentar-regional' },
    { regex: /^(Decreto\s+Regulamentar)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'decreto-regulamentar' },
    { regex: /^(Decreto)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2,4})(?!\/)(?:\s|$|,)/i, type: 'decreto' },
  ];
  
  for (const { regex, type } of slashPatterns) {
    const match = cleanNumber.match(regex);
    if (match) {
      const { baseNum, suffix } = extractSuffix(match[2]);
      return { type, num: baseNum, suffix, year: normalizeYear(match[3]) };
    }
  }
  
  // PATTERN 3: Date-based format WITH full year (e.g., "Portaria n.º 1102-G de 22 de novembro de 2000")
  const fullDateRegex = /^(\w+(?:\s+\w+)*)\s+n\.?º?\s*(\d+[-A-Za-z]*)\s+de\s+\d+\s+de\s+\w+\s+de\s+(\d{4})/i;
  const fullDateMatch = cleanNumber.match(fullDateRegex);
  if (fullDateMatch) {
    const typeName = fullDateMatch[1].toLowerCase().replace(/\s+/g, ' ').trim();
    const type = typeMap[typeName];
    if (type) {
      const { baseNum, suffix } = extractSuffix(fullDateMatch[2]);
      return { type, num: baseNum, suffix, year: fullDateMatch[3] };
    }
  }
  
  // PATTERN 4: Date-based format WITHOUT full year (e.g., "Portaria n.º 165-A/2010 de 16 de mar")
  // The year is in the number part, date is incomplete
  const partialDateWithYearInNumberRegex = /^(\w+(?:\s+\w+)*)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{4})\s+de\s+\d+\s+de\s+\w+/i;
  const partialDateMatch = cleanNumber.match(partialDateWithYearInNumberRegex);
  if (partialDateMatch) {
    const typeName = partialDateMatch[1].toLowerCase().replace(/\s+/g, ' ').trim();
    const type = typeMap[typeName];
    if (type) {
      const { baseNum, suffix } = extractSuffix(partialDateMatch[2]);
      return { type, num: baseNum, suffix, year: partialDateMatch[3] };
    }
  }
  
  // PATTERN 5: Old format - 5-digit decree numbers (e.g., "Decreto n.º 45458 de 23 de Dezembro de 1963")
  const oldDecreeMatch = cleanNumber.match(/^(Decreto(?:-Lei)?)\s+n\.?º?\s*(\d{5,})/i);
  if (oldDecreeMatch) {
    const yearMatch = cleanNumber.match(/de\s+(\d{4})/);
    if (yearMatch) {
      const type = oldDecreeMatch[1].toLowerCase().includes('lei') ? 'decreto-lei' : 'decreto';
      return { type, num: oldDecreeMatch[2], year: yearMatch[1] };
    }
  }
  
  // PATTERN 6: Fallback - try to extract any NUMBER/YEAR pattern from the string
  const fallbackMatch = cleanNumber.match(/(\d+[-A-Za-z]*)[\/\-](\d{2,4})/);
  if (fallbackMatch) {
    // Try to determine type from the beginning of the string
    const lowerNumber = cleanNumber.toLowerCase();
    let type = 'portaria'; // default
    for (const [key, value] of Object.entries(typeMap)) {
      if (lowerNumber.startsWith(key)) {
        type = value;
        break;
      }
    }
    const { baseNum, suffix } = extractSuffix(fallbackMatch[1]);
    return { type, num: baseNum, suffix, year: normalizeYear(fallbackMatch[2]) };
  }
  
  return null;
}

// Build simpler search queries for better results - now with improved suffix support
function buildSearchQueries(number: string, parts: { type: string; num: string; year: string; suffix?: string } | null): string[] {
  const queries: string[] = [];
  
  if (parts) {
    const simpleType = parts.type.replace(/-/g, ' ');
    const numWithSuffixDash = parts.suffix ? `${parts.num}-${parts.suffix}` : parts.num;
    const numWithSuffixSlash = parts.suffix ? `${parts.num}/${parts.suffix}` : parts.num;
    
    // For suffixed legislation, try multiple format variations
    if (parts.suffix) {
      // Strategy 1: NUMBER-SUFFIX/YEAR format (most common)
      queries.push(`"${simpleType} n.º ${numWithSuffixDash}/${parts.year}" site:dre.pt`);
      
      // Strategy 2: NUMBER/SUFFIX/YEAR format (alternative)
      queries.push(`"${simpleType} n.º ${numWithSuffixSlash}/${parts.year}" site:dre.pt`);
      
      // Strategy 3: Simple search with dash suffix
      queries.push(`${simpleType} ${numWithSuffixDash} ${parts.year} site:dre.pt`);
      
      // Strategy 4: Simple search with slash suffix
      queries.push(`${simpleType} ${numWithSuffixSlash} ${parts.year} site:dre.pt`);
      
      // Strategy 5: Just the reference without type
      queries.push(`"${numWithSuffixDash}/${parts.year}" site:diariodarepublica.pt`);
    } else {
      // Non-suffixed legislation
      queries.push(`${simpleType} ${parts.num}/${parts.year} site:dre.pt`);
      queries.push(`"${simpleType} n.º ${parts.num}/${parts.year}" site:dre.pt`);
      queries.push(`${simpleType} ${parts.num} ${parts.year} diariodarepublica.pt`);
    }
    
    // Final fallback: core reference
    queries.push(`${numWithSuffixDash}/${parts.year} ${simpleType} site:diariodarepublica.pt`);
  }
  
  // Fallback: use cleaned number from original string
  const cleanNumber = number.split(',')[0].trim()
    .replace(/n\.º\s*/gi, '')
    .replace(/\s+de\s+\d+.*$/, ''); // Remove date suffix
  
  if (!queries.some(q => q.includes(cleanNumber))) {
    queries.push(`${cleanNumber} site:dre.pt`);
  }
  
  return queries;
}

// Validate that URL matches the legislation we're looking for - with suffix support
function validateUrlMatch(url: string, parts: { type: string; num: string; year: string; suffix?: string } | null): boolean {
  if (!url.includes('/dr/detalhe/') && !url.includes('dre.pt/')) {
    return false;
  }
  
  const urlLower = url.toLowerCase();
  
  if (parts) {
    // Check if the type appears in the URL
    const typeInUrl = urlLower.includes(parts.type.toLowerCase()) ||
                      urlLower.includes(parts.type.replace(/-/g, ''));
    
    // Check if the number appears in the URL (with or without suffix)
    const numInUrl = urlLower.includes(parts.num.toLowerCase());
    
    // Check if suffix appears when expected
    const suffixOk = !parts.suffix || 
                     urlLower.includes(parts.suffix.toLowerCase()) ||
                     urlLower.includes(`-${parts.suffix.toLowerCase()}`);
    
    // If type, number and suffix are in URL, it's a good match
    if (typeInUrl && numInUrl && suffixOk) {
      return true;
    }
    
    // At minimum, the URL should be from DRE
    if (urlLower.includes('diariodarepublica.pt') || urlLower.includes('dre.pt')) {
      return true;
    }
  }
  
  return urlLower.includes('diariodarepublica.pt') || urlLower.includes('dre.pt');
}

async function searchDREWithFirecrawlSearch(number: string, firecrawlKey: string, retryCount = 0): Promise<string | null> {
  const MAX_RETRIES = 3;
  
  try {
    const parts = extractLegislationParts(number);
    const queries = buildSearchQueries(number, parts);
    
    // Try each query strategy until we find a result
    for (let i = 0; i < queries.length; i++) {
      const searchQuery = queries[i];
      console.log(`[${i+1}/${queries.length}] Searching: ${searchQuery}`);
      
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
      
      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '30', 10);
        const waitTime = Math.min(retryAfter * 1000, 60000); // Max 60 seconds
        
        if (retryCount < MAX_RETRIES) {
          console.log(`Rate limited. Waiting ${waitTime/1000}s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return searchDREWithFirecrawlSearch(number, firecrawlKey, retryCount + 1);
        } else {
          console.log(`Rate limited. Max retries (${MAX_RETRIES}) reached for ${number}`);
          return null;
        }
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Search failed: ${response.status} - ${errorText.substring(0, 100)}`);
        continue; // Try next query
      }
      
      const data = await response.json();
      const results = data.data || [];
      
      console.log(`Got ${results.length} results`);
      
      // Find the best matching result
      for (const result of results) {
        const url = result.url || '';
        
        // Prefer /dr/detalhe/ URLs
        if (url.includes('/dr/detalhe/')) {
          if (validateUrlMatch(url, parts)) {
            console.log(`✓ Found: ${url}`);
            return url;
          }
        }
      }
      
      // Secondary pass: accept any DRE URL
      for (const result of results) {
        const url = result.url || '';
        if ((url.includes('diariodarepublica.pt') || url.includes('dre.pt')) && 
            validateUrlMatch(url, parts)) {
          console.log(`✓ Found (secondary): ${url}`);
          return url;
        }
      }
      
      // Delay between query attempts (2s to respect rate limits)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`✗ No URL for: ${number}`);
    return null;
  } catch (error) {
    console.error(`Error searching ${number}: ${error}`);
    return null;
  }
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

// Process a single item
async function processItem(
  supabase: any,
  leg: any,
  firecrawlKey: string
): Promise<{ success: boolean; url?: string }> {
  try {
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
        console.log(`✓ ${leg.number} -> ${dreUrl}`);
        return { success: true, url: dreUrl };
      } else {
        console.error(`✗ Update failed for ${leg.number}:`, updateError.message);
        return { success: false };
      }
    } else {
      console.log(`✗ No URL found for ${leg.number}`);
      return { success: false };
    }
  } catch (error) {
    console.error(`✗ Error for ${leg.number}:`, error);
    return { success: false };
  }
}

// Process items in parallel batches
async function processInBackground(
  supabase: any,
  legislation: any[],
  firecrawlKey: string,
  logId: string,
  concurrency: number = 5
) {
  let found = 0;
  let failed = 0;
  let processed = 0;
  
  console.log(`Starting parallel processing: ${legislation.length} items with concurrency ${concurrency}`);
  
  // Process in batches of 'concurrency' items
  for (let batchStart = 0; batchStart < legislation.length; batchStart += concurrency) {
    const batch = legislation.slice(batchStart, batchStart + concurrency);
    const batchNum = Math.floor(batchStart / concurrency) + 1;
    const totalBatches = Math.ceil(legislation.length / concurrency);
    
    console.log(`[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} items in parallel...`);
    
    // Process batch in parallel
    const results = await Promise.all(
      batch.map(leg => processItem(supabase, leg, firecrawlKey))
    );
    
    // Count results
    for (const result of results) {
      processed++;
      if (result.success) {
        found++;
      } else {
        failed++;
      }
    }
    
    // Update progress after each batch
    await supabase
      .from('sync_logs')
      .update({
        items_processed: processed,
        items_added: found,
        items_updated: failed,
        status: processed >= legislation.length ? 'completed' : 'running'
      })
      .eq('id', logId);
    
    console.log(`[Batch ${batchNum}/${totalBatches}] Done. Total: ${found} found, ${failed} failed`);
    
    // Delay between batches (5s to respect rate limits)
    if (batchStart + concurrency < legislation.length) {
      console.log(`Waiting 5s before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
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
  
  console.log(`Background job completed: ${found} found, ${failed} failed out of ${legislation.length}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 30, dryRun = false, stream = false, background = false, concurrency = 1 } = await req.json().catch(() => ({}));
    
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
    
    // Get PT legislation without valid DRE URLs (order by most recent first)
    const { data: legislation, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, document_url, origin, no_digital_version')
      .in('origin', ['PT', 'dre'])
      .or('document_url.is.null,document_url.eq.')
      .order('created_at', { ascending: false })
      .limit(2000);
    
    if (fetchError) {
      throw fetchError;
    }
    
    // Filter to those without valid DRE detail URL
    const toProcess = (legislation || [])
      .filter(leg => {
        // Must be PT origin
        if (!leg.origin || !['PT', 'dre'].includes(leg.origin)) return false;
        
        // Skip if already marked as no digital version
        if (leg.no_digital_version === true) return false;
        
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
      EdgeRuntime.waitUntil(processInBackground(supabase, toProcess, firecrawlKey, logId, concurrency));
      
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
