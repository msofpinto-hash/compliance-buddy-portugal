import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedRelation {
  relation_type: 'revogado' | 'revogacao_parcial' | 'alteracao' | 'transposicao' | 'regulamentacao';
  target_number: string;
  notes?: string;
}

// Map of relation types to their inverse types
const INVERSE_RELATION_MAP: Record<string, string> = {
  'revogado': 'revogado_por',
  'revogacao_parcial': 'revogado_parcialmente_por',
  'alteracao': 'alterado_por',
  'transposicao': 'transposto_por',
  'regulamentacao': 'regulamentado_por',
};

interface RelationResult {
  legislationId: string;
  legislationNumber: string;
  relationsFound: number;
  relationsMatched: number;
  relationsCreated: number;
  relations: Array<{
    type: string;
    targetNumber: string;
    targetId?: string;
    matched: boolean;
  }>;
  error?: string;
}

const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Scrape URL using Firecrawl
async function scrapeUrl(url: string, firecrawlApiKey: string): Promise<string | null> {
  try {
    console.log('Scraping URL:', url);
    
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.error('Firecrawl error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.data?.markdown || data.markdown || '';
  } catch (error) {
    console.error('Scrape error:', error);
    return null;
  }
}

// Search DRE for a legislation URL using Firecrawl
async function searchDREUrl(number: string, firecrawlApiKey: string): Promise<string | null> {
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
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
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
    console.error(`DRE search error: ${error}`);
    return null;
  }
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
  
  // Also try short year patterns
  const shortYearPatterns = [
    /^(Decreto-Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2})(?!\d)/i,
    /^(Portaria)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2})(?!\d)/i,
    /^(Lei)\s+n\.?º?\s*(\d+[-A-Za-z]*)[\/\-](\d{2})(?!\d)/i,
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
  
  for (const pattern of shortYearPatterns) {
    const match = cleanNumber.match(pattern);
    if (match) {
      const shortYear = parseInt(match[3]);
      const fullYear = shortYear > 50 ? `19${match[3]}` : `20${match[3]}`;
      return {
        type: match[1].toLowerCase().replace(/\s+/g, '-'),
        num: match[2],
        year: fullYear
      };
    }
  }
  
  return null;
}

// Extract metadata from DRE page content
function extractMetadataFromDRE(markdown: string): { title?: string; summary?: string; entity?: string; publicationDate?: string; effectiveDate?: string } {
  const update: { title?: string; summary?: string; entity?: string; publicationDate?: string; effectiveDate?: string } = {};
  
  const cleanMarkdown = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\n+/g, '\n');
  
  // Extract entity/emissor
  const entityMatch = cleanMarkdown.match(/Emissor[:\s]+([^\n]+)/i);
  if (entityMatch) {
    const entity = entityMatch[1].trim();
    if (entity && !entity.includes('http') && entity.length < 200) {
      update.entity = entity;
    }
  }
  
  // Extract summary
  const summaryMatch = cleanMarkdown.match(/Sum[áa]rio[:\s]*\n?([^\n]+(?:\n[^\n]+)*?)(?=\n(?:Texto|Data|Publicação|Série|$))/i);
  if (summaryMatch) {
    const summary = summaryMatch[1].trim();
    if (summary && summary.length > 10 && !summary.includes('Lamentamos')) {
      update.summary = summary.substring(0, 2000);
    }
  }
  
  // Extract publication date
  const pubDatePatterns = [
    /Data de Publicação[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /Publicação[:\s]+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/i,
  ];
  
  for (const pattern of pubDatePatterns) {
    const match = cleanMarkdown.match(pattern);
    if (match) {
      try {
        if (match[0].includes('-') && match[0].match(/\d{4}-\d{2}-\d{2}/)) {
          update.publicationDate = match[1];
          break;
        } else if (match[2] && !isNaN(parseInt(match[2]))) {
          update.publicationDate = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
          break;
        } else if (match[2]) {
          const monthMap: Record<string, string> = {
            'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
            'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
            'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
          };
          if (monthMap[match[2].toLowerCase()]) {
            update.publicationDate = `${match[3]}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
            break;
          }
        }
      } catch {
        continue;
      }
    }
  }
  
  return update;
}

// Build EUR-Lex URL from legislation number
function buildEurLexUrl(number: string): string | null {
  // Extract CELEX from typical EU formats
  
  // Regulamento (UE) n.º YYYY/NNNN or Regulamento (UE) YYYY/NNNN
  const regMatch = number.match(/Regulamento.*?(\d{4})\/(\d+)/i);
  if (regMatch) {
    const celex = `3${regMatch[1]}R${regMatch[2].padStart(4, '0')}`;
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;
  }
  
  // Diretiva YYYY/NN/XX or Diretiva (UE) YYYY/NNNN
  const dirMatch = number.match(/Diretiva.*?(\d{4})\/(\d+)/i);
  if (dirMatch) {
    const celex = `3${dirMatch[1]}L${dirMatch[2].padStart(4, '0')}`;
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;
  }
  
  // Decisão YYYY/NNN
  const decMatch = number.match(/Decis[ãa]o.*?(\d{4})\/(\d+)/i);
  if (decMatch) {
    const celex = `3${decMatch[1]}D${decMatch[2].padStart(4, '0')}`;
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;
  }
  
  // Old format: Diretiva NN/NNN/EEC or NN/NNN/CE
  const oldDirMatch = number.match(/Diretiva\s+(\d{2})\/(\d+)/i);
  if (oldDirMatch) {
    const shortYear = parseInt(oldDirMatch[1]);
    const fullYear = shortYear > 50 ? `19${oldDirMatch[1]}` : `20${oldDirMatch[1]}`;
    const celex = `3${fullYear}L${oldDirMatch[2].padStart(4, '0')}`;
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;
  }
  
  // Old format: Regulamento (CEE) n.º NNNN/YY
  const oldRegMatch = number.match(/Regulamento.*?(\d+)\/(\d{2})(?!\d)/i);
  if (oldRegMatch) {
    const shortYear = parseInt(oldRegMatch[2]);
    const fullYear = shortYear > 50 ? `19${oldRegMatch[2]}` : `20${oldRegMatch[2]}`;
    const celex = `3${fullYear}R${oldRegMatch[1].padStart(4, '0')}`;
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;
  }
  
  return null;
}

// Extract metadata from EUR-Lex page content
function extractMetadataFromEurLex(markdown: string): { title?: string; summary?: string; entity?: string; publicationDate?: string } {
  const update: { title?: string; summary?: string; entity?: string; publicationDate?: string } = {};
  
  const skipPatterns = [
    /eur-lex/i,
    /cookies/i,
    /europa\.eu/i,
    /official.*website/i,
    /languages/i,
    /navigation/i,
    /menu/i,
    /search/i,
    /home/i,
    /^\s*pt\s*$/i,
    /login/i,
    /^\d+$/,
    /accept/i,
  ];
  
  // Extract title
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
  
  // Extract summary
  const summaryMatch = markdown.match(/Sum[áa]rio[:\s]*\n?([^\n]+(?:\n[^\n]+)*?)(?=\n\n|\n#|$)/i);
  if (summaryMatch) {
    update.summary = summaryMatch[1].replace(/[*#]/g, '').trim().substring(0, 2000);
  } else {
    const descMatch = markdown.match(/(?:objeto|objectivo|presente regulamento|presente diretiva|presente decisão)[^.]*\./i);
    if (descMatch) {
      update.summary = descMatch[0].trim();
    }
  }
  
  // Extract publication date
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
          update.publicationDate = `${year}-${month}-${day}`;
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
            update.publicationDate = `${year}-${monthMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
            break;
          }
        }
      }
    }
  }
  
  // Extract entity
  const entityMatch = markdown.match(/(?:Autor|Emissor|Instituição)[:\s]+([^\n]+)/i);
  if (entityMatch) {
    update.entity = entityMatch[1].replace(/[*#]/g, '').trim().substring(0, 200);
  }
  
  return update;
}

// Extract relations using AI
async function extractRelationsWithAI(
  legislation: { number: string; title: string; summary: string },
  fullText: string,
  lovableApiKey: string
): Promise<ExtractedRelation[]> {
  try {
    console.log(`Extracting relations with AI for: ${legislation.number}`);
    
    // Use first 12000 chars to focus on metadata sections
    const textForAI = fullText.length > 12000 ? fullText.substring(0, 12000) : fullText;
    
    const prompt = `Analisa o seguinte diploma legal e identifica TODAS as relações com outros diplomas mencionadas.

DIPLOMA EM ANÁLISE: ${legislation.number}
TÍTULO: ${legislation.title}

TEXTO DO DIPLOMA:
${textForAI}

INSTRUÇÕES:
Identifica relações dos seguintes tipos (USA EXATAMENTE ESTES VALORES):
- "revogado": diplomas que ESTE diploma revoga totalmente
- "revogacao_parcial": diplomas que ESTE diploma revoga parcialmente
- "alteracao": diplomas que ESTE diploma altera/modifica
- "transposicao": diretivas europeias que ESTE diploma transpõe
- "regulamentacao": diplomas que ESTE diploma regulamenta ou é regulamentado

Para cada relação encontrada, extrai:
- relation_type: um dos tipos EXATOS acima (revogado, revogacao_parcial, alteracao, transposicao, regulamentacao)
- target_number: número do diploma alvo (ex: "Decreto-Lei n.º 123/2020", "Diretiva 2010/75/UE", "Portaria n.º 456/2019")
- notes: contexto adicional se relevante (opcional)

IMPORTANTE:
- Usa APENAS os tipos: revogado, revogacao_parcial, alteracao, transposicao, regulamentacao
- Extrai os números dos diplomas EXATAMENTE como aparecem
- Procura nas secções "Revoga", "Altera", "Regulamenta", "Transpõe" e no texto geral
- Não inventes relações - só as que estão explicitamente mencionadas

Retorna APENAS um array JSON válido. Exemplo:
[
  {"relation_type": "revogado", "target_number": "Decreto-Lei n.º 123/2020"},
  {"relation_type": "transposicao", "target_number": "Diretiva 2010/75/UE", "notes": "parcialmente"}
]

Se não encontrares relações, retorna um array vazio: []`;

    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'És um especialista em legislação portuguesa e europeia. Identifica relações entre diplomas de forma precisa. Responde APENAS com JSON válido, sem markdown nem explicações.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      console.error(`AI API error: ${response.status}`);
      return [];
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    // Parse JSON response
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
    
    const parsed = JSON.parse(jsonContent);
    
    if (!Array.isArray(parsed)) {
      return [];
    }
    
    // Validate relations - only allow DB constraint values
    const validTypes = ['revogado', 'revogacao_parcial', 'alteracao', 'transposicao', 'regulamentacao'];
    const relations = parsed
      .filter((r: any) => r && typeof r === 'object' && r.relation_type && r.target_number)
      .filter((r: any) => validTypes.includes(r.relation_type))
      .map((r: any) => ({
        relation_type: r.relation_type,
        target_number: String(r.target_number).trim(),
        notes: r.notes ? String(r.notes).substring(0, 200) : undefined,
      }));
    
    console.log(`AI found ${relations.length} relations for ${legislation.number}`);
    return relations;
    
  } catch (error) {
    console.error(`AI extraction error:`, error);
    return [];
  }
}

// Normalize legislation number for matching
function normalizeNumber(num: string): string {
  return num
    .toLowerCase()
    .replace(/n\.º\s*/gi, '')
    .replace(/n\.o\s*/gi, '')
    .replace(/nº\s*/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\d\/\-]/g, '')
    .trim();
}

// Determine origin from legislation number
function determineOrigin(number: string): string {
  const lowerNum = number.toLowerCase();
  if (lowerNum.includes('diretiva') || lowerNum.includes('regulamento') && lowerNum.includes('/ue')) {
    return 'EU';
  }
  return 'PT';
}

// Extract year from legislation number
function extractYear(number: string): number | null {
  const yearMatch = number.match(/\/(\d{4})/);
  if (yearMatch) {
    return parseInt(yearMatch[1]);
  }
  const shortYearMatch = number.match(/\/(\d{2})(?!\d)/);
  if (shortYearMatch) {
    const shortYear = parseInt(shortYearMatch[1]);
    return shortYear > 50 ? 1900 + shortYear : 2000 + shortYear;
  }
  return null;
}

// Validate and sanitize dates - reject invalid years (> current+1 or < 1900)
function sanitizeDate(year: number | null): string | null {
  if (year === null) return null;
  
  const currentYear = new Date().getFullYear();
  
  // Valid year range: 1900 to current year + 1
  if (year >= 1900 && year <= currentYear + 1) {
    return `${year}-01-01`;
  }
  
  console.warn(`Invalid year ${year} detected, setting date to null`);
  return null;
}

// Create missing legislation in database with full metadata scraping
async function createMissingLegislation(
  supabase: any,
  targetNumber: string,
  firecrawlApiKey: string,
  notes?: string
): Promise<{ id: string; number: string } | null> {
  try {
    const origin = determineOrigin(targetNumber);
    const year = extractYear(targetNumber);
    
    console.log(`Creating legislation: ${targetNumber} (origin: ${origin})`);
    
    // Initialize with basic data
    let title = targetNumber;
    let summary = notes || `Diploma referenciado - a aguardar importação completa`;
    let entity: string | undefined;
    let documentUrl: string | undefined;
    let publicationDate = sanitizeDate(year);
    let effectiveDate: string | null = null;
    
    // Try to fetch full metadata based on origin
    if (origin === 'PT') {
      // Search for DRE URL
      const dreUrl = await searchDREUrl(targetNumber, firecrawlApiKey);
      
      if (dreUrl) {
        documentUrl = dreUrl;
        console.log(`Found DRE URL for ${targetNumber}: ${dreUrl}`);
        
        // Scrape metadata from DRE
        const content = await scrapeUrl(dreUrl, firecrawlApiKey);
        if (content && content.length > 100) {
          const metadata = extractMetadataFromDRE(content);
          
          if (metadata.entity) entity = metadata.entity;
          if (metadata.summary) summary = metadata.summary;
          if (metadata.publicationDate) publicationDate = metadata.publicationDate;
          if (metadata.effectiveDate) effectiveDate = metadata.effectiveDate;
          
          console.log(`Extracted DRE metadata for ${targetNumber}: entity=${metadata.entity}, summary=${metadata.summary?.substring(0, 50)}...`);
        }
      }
    } else {
      // EU legislation - build EUR-Lex URL
      const eurLexUrl = buildEurLexUrl(targetNumber);
      
      if (eurLexUrl) {
        documentUrl = eurLexUrl;
        console.log(`Built EUR-Lex URL for ${targetNumber}: ${eurLexUrl}`);
        
        // Scrape metadata from EUR-Lex
        const content = await scrapeUrl(eurLexUrl, firecrawlApiKey);
        if (content && content.length > 100) {
          const metadata = extractMetadataFromEurLex(content);
          
          if (metadata.title && metadata.title.length > targetNumber.length) {
            title = metadata.title;
          }
          if (metadata.entity) entity = metadata.entity;
          if (metadata.summary) summary = metadata.summary;
          if (metadata.publicationDate) publicationDate = metadata.publicationDate;
          
          console.log(`Extracted EUR-Lex metadata for ${targetNumber}: title=${title.substring(0, 50)}...`);
        }
      }
    }
    
    // Create legislation record with enriched data
    const insertData: Record<string, any> = {
      number: targetNumber,
      title,
      origin,
      summary,
    };
    
    if (documentUrl) insertData.document_url = documentUrl;
    if (entity) insertData.entity = entity;
    if (publicationDate) insertData.publication_date = publicationDate;
    if (effectiveDate) insertData.effective_date = effectiveDate;
    
    const { data, error } = await supabase
      .from('legislation')
      .insert(insertData)
      .select('id, number')
      .single();
    
    if (error) {
      console.error(`Failed to create legislation "${targetNumber}":`, error);
      return null;
    }
    
    console.log(`✓ Created legislation: ${targetNumber} (id: ${data.id}) with ${documentUrl ? 'URL' : 'no URL'}`);
    return { id: data.id, number: data.number };
  } catch (error) {
    console.error(`Error creating legislation "${targetNumber}":`, error);
    return null;
  }
}

// Try to match extracted number with existing legislation
function findMatchingLegislation(
  targetNumber: string,
  allLegislation: Array<{ id: string; number: string; title: string }>
): { id: string; number: string } | null {
  const normalizedTarget = normalizeNumber(targetNumber);
  
  // Try exact match first
  for (const leg of allLegislation) {
    const normalizedLeg = normalizeNumber(leg.number);
    if (normalizedLeg === normalizedTarget) {
      return { id: leg.id, number: leg.number };
    }
  }
  
  // Try partial match (number and year)
  const yearMatch = targetNumber.match(/(\d+)\/(\d{4})/);
  if (yearMatch) {
    const [, num, year] = yearMatch;
    for (const leg of allLegislation) {
      if (leg.number.includes(`${num}/${year}`) || leg.number.includes(`${num}/${year.slice(-2)}`)) {
        return { id: leg.id, number: leg.number };
      }
    }
  }
  
  // Try matching by type + number
  const typeMatch = targetNumber.match(/(decreto-lei|lei|portaria|despacho|regulamento|diretiva|resolução)/i);
  if (typeMatch && yearMatch) {
    const type = typeMatch[1].toLowerCase();
    const [, num, year] = yearMatch;
    
    for (const leg of allLegislation) {
      const legLower = leg.number.toLowerCase();
      if (legLower.includes(type) && (legLower.includes(`${num}/${year}`) || legLower.includes(`${num}/${year.slice(-2)}`))) {
        return { id: leg.id, number: leg.number };
      }
    }
  }
  
  return null;
}

// Background processing function
async function processRelationsInBackground(
  supabase: any,
  legislationToProcess: any[],
  allLegislation: any[],
  existingRelationSet: Set<string>,
  firecrawlApiKey: string,
  lovableApiKey: string,
  dryRun: boolean,
  autoImport: boolean,
  jobId: string
) {
  const results: RelationResult[] = [];
  let totalRelationsFound = 0;
  let totalRelationsMatched = 0;
  let totalRelationsCreated = 0;
  let totalLegislationCreated = 0;
  
  const newlyCreatedLegislation: Array<{ id: string; number: string; title: string }> = [];

  for (let i = 0; i < legislationToProcess.length; i++) {
    const leg = legislationToProcess[i];
    console.log(`\n=== [BG Job ${jobId}] Processing ${i + 1}/${legislationToProcess.length}: ${leg.number} ===`);
    
    // Update progress in sync_logs
    await supabase
      .from('sync_logs')
      .update({
        items_processed: i + 1,
        items_added: totalRelationsCreated,
      })
      .eq('id', jobId);
    
    try {
      const textContent = await scrapeUrl(leg.document_url, firecrawlApiKey);
      
      if (!textContent || textContent.length < 100) {
        console.log(`No content for ${leg.number}`);
        results.push({ 
          legislationId: leg.id, 
          legislationNumber: leg.number, 
          relationsFound: 0,
          relationsMatched: 0,
          relationsCreated: 0,
          relations: [],
          error: 'Não foi possível obter conteúdo da página' 
        });
        continue;
      }

      const extractedRelations = await extractRelationsWithAI(
        { number: leg.number, title: leg.title, summary: leg.summary || '' },
        textContent,
        lovableApiKey
      );

      if (extractedRelations.length === 0) {
        console.log(`No relations found for ${leg.number}`);
        results.push({ 
          legislationId: leg.id, 
          legislationNumber: leg.number, 
          relationsFound: 0,
          relationsMatched: 0,
          relationsCreated: 0,
          relations: []
        });
        continue;
      }

      totalRelationsFound += extractedRelations.length;

      const relationDetails: RelationResult['relations'] = [];
      const toInsert: Array<{
        source_legislation_id: string;
        target_legislation_id: string;
        relation_type: string;
        notes: string | null;
      }> = [];

      for (const rel of extractedRelations) {
        const combinedLegislation = [...allLegislation, ...newlyCreatedLegislation];
        let match = findMatchingLegislation(rel.target_number, combinedLegislation);
        
        let wasCreated = false;
        if (!match && autoImport && !dryRun) {
          const created = await createMissingLegislation(supabase, rel.target_number, firecrawlApiKey, rel.notes);
          if (created) {
            match = created;
            wasCreated = true;
            totalLegislationCreated++;
            newlyCreatedLegislation.push({ id: created.id, number: created.number, title: created.number });
            allLegislation.push({ id: created.id, number: created.number, title: created.number });
          }
        }
        
        relationDetails.push({
          type: rel.relation_type,
          targetNumber: rel.target_number,
          targetId: match?.id,
          matched: !!match,
          created: wasCreated,
        } as any);

        if (match) {
          totalRelationsMatched++;
          
          const relationKey = `${leg.id}-${match.id}-${rel.relation_type}`;
          if (!existingRelationSet.has(relationKey)) {
            toInsert.push({
              source_legislation_id: leg.id,
              target_legislation_id: match.id,
              relation_type: rel.relation_type,
              notes: rel.notes || null,
            });
            existingRelationSet.add(relationKey);
          }
        }
      }

      let relationsCreated = 0;
      if (!dryRun && toInsert.length > 0) {
        // Insert direct relations
        const { error: insertError } = await supabase
          .from('legislation_relations')
          .insert(toInsert);

        if (insertError) {
          console.error(`Insert error for ${leg.number}:`, insertError);
        } else {
          relationsCreated = toInsert.length;
          totalRelationsCreated += relationsCreated;
          console.log(`✓ Created ${relationsCreated} direct relations for ${leg.number}`);
          
          // Create inverse relations
          const inverseRelations: typeof toInsert = [];
          for (const rel of toInsert) {
            const inverseType = INVERSE_RELATION_MAP[rel.relation_type];
            if (inverseType) {
              const inverseKey = `${rel.target_legislation_id}-${rel.source_legislation_id}-${inverseType}`;
              if (!existingRelationSet.has(inverseKey)) {
                inverseRelations.push({
                  source_legislation_id: rel.target_legislation_id,
                  target_legislation_id: rel.source_legislation_id,
                  relation_type: inverseType,
                  notes: rel.notes ? `(inverso) ${rel.notes}` : '(relação inversa automática)',
                });
                existingRelationSet.add(inverseKey);
              }
            }
          }
          
          if (inverseRelations.length > 0) {
            const { error: inverseError } = await supabase
              .from('legislation_relations')
              .insert(inverseRelations);
            
            if (!inverseError) {
              totalRelationsCreated += inverseRelations.length;
              console.log(`✓ Created ${inverseRelations.length} inverse relations`);
            } else {
              console.error('Inverse relations insert error:', inverseError);
            }
          }
          
          // Update revocation dates for revoked legislation
          const revokedRelations = toInsert.filter(r => r.relation_type === 'revogado' || r.relation_type === 'revogacao_parcial');
          for (const revokedRel of revokedRelations) {
            const { error: updateError } = await supabase
              .from('legislation')
              .update({ 
                revocation_date: leg.publication_date || new Date().toISOString().split('T')[0]
              })
              .eq('id', revokedRel.target_legislation_id)
              .is('revocation_date', null);
            
            if (!updateError) {
              console.log(`✓ Set revocation_date for target legislation ${revokedRel.target_legislation_id}`);
            }
          }
        }
      } else if (dryRun && toInsert.length > 0) {
        relationsCreated = toInsert.length;
        totalRelationsCreated += relationsCreated;
      }

      const relationsMatchedCount = relationDetails.filter(r => r.matched).length;
      
      results.push({ 
        legislationId: leg.id, 
        legislationNumber: leg.number, 
        relationsFound: extractedRelations.length,
        relationsMatched: relationsMatchedCount,
        relationsCreated,
        relations: relationDetails
      });

      // CRITICAL: Mark this legislation as processed in the tracking table
      // This ensures we don't reprocess this legislation in future runs
      if (!dryRun) {
        const { error: trackError } = await supabase
          .from('legislation_relations_processed')
          .upsert({
            legislation_id: leg.id,
            relations_found: extractedRelations.length,
            relations_matched: relationsMatchedCount,
            processed_at: new Date().toISOString(),
          }, {
            onConflict: 'legislation_id'
          });
        
        if (trackError) {
          console.error(`Failed to track processed legislation ${leg.number}:`, trackError);
        } else {
          console.log(`✓ Marked ${leg.number} as processed in tracking table`);
        }
      }

      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`Error processing ${leg.number}:`, error);
      results.push({ 
        legislationId: leg.id, 
        legislationNumber: leg.number,
        relationsFound: 0,
        relationsMatched: 0,
        relationsCreated: 0,
        relations: [],
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      });
      
      // Even on error, mark as processed to avoid infinite retries
      // (can be manually reset if needed)
      if (!dryRun) {
        await supabase
          .from('legislation_relations_processed')
          .upsert({
            legislation_id: leg.id,
            relations_found: 0,
            relations_matched: 0,
            processed_at: new Date().toISOString(),
          }, {
            onConflict: 'legislation_id'
          });
      }
    }
  }

  const successful = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  console.log(`\n=== [BG Job ${jobId}] COMPLETE ===`);
  console.log(`Successful: ${successful}, Failed: ${failed}`);
  console.log(`Relations: ${totalRelationsFound} found, ${totalRelationsMatched} matched, ${totalRelationsCreated} created`);

  // Update final status
  await supabase
    .from('sync_logs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      items_processed: legislationToProcess.length,
      items_added: totalRelationsCreated,
      items_updated: totalRelationsMatched,
    })
    .eq('id', jobId);
}

// Handle shutdown for background tasks
addEventListener('beforeunload', (ev: any) => {
  console.log('Function shutdown due to:', ev.detail?.reason);
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { legislationIds, limit = 10, dryRun = false, origin, autoImport = true, background = false } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY não configurada. Ative o conector Firecrawl.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all legislation for matching
    const { data: allLegislation } = await supabase
      .from('legislation')
      .select('id, number, title');
    
    if (!allLegislation) {
      throw new Error('Não foi possível carregar legislação');
    }

    // Get existing relations to avoid duplicates
    const { data: existingRelations } = await supabase
      .from('legislation_relations')
      .select('source_legislation_id, target_legislation_id, relation_type');
    
    const existingRelationSet = new Set(
      existingRelations?.map(r => `${r.source_legislation_id}-${r.target_legislation_id}-${r.relation_type}`) || []
    );

    // Get legislation that has already been processed (from the tracking table)
    const { data: processedLegislation } = await supabase
      .from('legislation_relations_processed')
      .select('legislation_id');
    
    const processedLegislationIds = new Set(
      processedLegislation?.map(r => r.legislation_id) || []
    );
    console.log(`Found ${processedLegislationIds.size} legislation already processed (from tracking table)`);

    // Get legislation to process
    let legislationToProcess: any[] = [];

    if (legislationIds && legislationIds.length > 0) {
      const { data, error } = await supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin, publication_date')
        .in('id', legislationIds)
        .not('document_url', 'is', null);
      
      if (error) throw error;
      legislationToProcess = data || [];
    } else {
      // Get legislation with URLs, optionally filtered by origin
      // We fetch more than limit to account for skipped ones
      let query = supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin, publication_date')
        .not('document_url', 'is', null)
        .order('publication_date', { ascending: false });
      
      if (origin === 'PT') {
        query = query.or('origin.eq.PT,origin.eq.dre,origin.is.null');
      } else if (origin === 'EU') {
        query = query.or('origin.eq.EU,origin.eq.eurlex');
      }
      
      // Fetch more to account for already-processed ones
      const { data } = await query.limit(limit * 5);
      
      // Filter out already processed legislation and apply limit
      legislationToProcess = (data || [])
        .filter(leg => !processedLegislationIds.has(leg.id))
        .slice(0, limit);
      
      console.log(`After filtering processed: ${legislationToProcess.length} legislation to process`);
    }

    if (legislationToProcess.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Nenhum diploma com URL para processar',
          processed: 0,
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Background mode: create a job and process in background
    if (background && !dryRun) {
      const jobId = crypto.randomUUID();
      
      // Create sync_log entry for tracking progress
      const { error: logError } = await supabase
        .from('sync_logs')
        .insert({
          id: jobId,
          sync_type: 'extract_relations',
          status: 'running',
          items_processed: 0,
          items_added: 0,
        });
      
      if (logError) {
        console.error('Failed to create sync log:', logError);
        throw new Error('Não foi possível iniciar processamento em background');
      }
      
      console.log(`Starting background job ${jobId} for ${legislationToProcess.length} legislation`);
      
      // Start background processing
      EdgeRuntime.waitUntil(
        processRelationsInBackground(
          supabase,
          legislationToProcess,
          allLegislation,
          existingRelationSet,
          firecrawlApiKey,
          lovableApiKey,
          dryRun,
          autoImport,
          jobId
        )
      );
      
      return new Response(
        JSON.stringify({
          success: true,
          background: true,
          jobId,
          toProcess: legislationToProcess.length,
          message: `Processamento iniciado em background. A processar ${legislationToProcess.length} diplomas.`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${legislationToProcess.length} legislation for relations (origin: ${origin || 'all'})`);

    const results: RelationResult[] = [];
    let totalRelationsFound = 0;
    let totalRelationsMatched = 0;
    let totalRelationsCreated = 0;
    let totalLegislationCreated = 0;
    
    // Keep track of newly created legislation for matching
    const newlyCreatedLegislation: Array<{ id: string; number: string; title: string }> = [];

    for (const leg of legislationToProcess) {
      console.log(`\n=== Processing relations: ${leg.number} ===`);
      
      try {
        // Step 1: Scrape the URL
        const textContent = await scrapeUrl(leg.document_url, firecrawlApiKey);
        
        if (!textContent || textContent.length < 100) {
          console.log(`No content for ${leg.number}`);
          results.push({ 
            legislationId: leg.id, 
            legislationNumber: leg.number, 
            relationsFound: 0,
            relationsMatched: 0,
            relationsCreated: 0,
            relations: [],
            error: 'Não foi possível obter conteúdo da página' 
          });
          continue;
        }

        // Step 2: Extract relations using AI
        const extractedRelations = await extractRelationsWithAI(
          { number: leg.number, title: leg.title, summary: leg.summary || '' },
          textContent,
          lovableApiKey
        );

        if (extractedRelations.length === 0) {
          console.log(`No relations found for ${leg.number}`);
          results.push({ 
            legislationId: leg.id, 
            legislationNumber: leg.number, 
            relationsFound: 0,
            relationsMatched: 0,
            relationsCreated: 0,
            relations: []
          });
          continue;
        }

        totalRelationsFound += extractedRelations.length;

        // Step 3: Match with existing legislation
        const relationDetails: RelationResult['relations'] = [];
        const toInsert: Array<{
          source_legislation_id: string;
          target_legislation_id: string;
          relation_type: string;
          notes: string | null;
        }> = [];

        for (const rel of extractedRelations) {
          // First try to match in existing + newly created legislation
          const combinedLegislation = [...allLegislation, ...newlyCreatedLegislation];
          let match = findMatchingLegislation(rel.target_number, combinedLegislation);
          
          // If no match and autoImport is enabled, create the missing legislation
          let wasCreated = false;
          if (!match && autoImport && !dryRun) {
            const created = await createMissingLegislation(supabase, rel.target_number, firecrawlApiKey, rel.notes);
            if (created) {
              match = created;
              wasCreated = true;
              totalLegislationCreated++;
              // Add to our tracking arrays for future matching in this run
              newlyCreatedLegislation.push({ id: created.id, number: created.number, title: created.number });
              allLegislation.push({ id: created.id, number: created.number, title: created.number });
            }
          }
          
          relationDetails.push({
            type: rel.relation_type,
            targetNumber: rel.target_number,
            targetId: match?.id,
            matched: !!match,
            created: wasCreated,
          } as any);

          if (match) {
            totalRelationsMatched++;
            
            // Check if relation already exists
            const relationKey = `${leg.id}-${match.id}-${rel.relation_type}`;
            if (!existingRelationSet.has(relationKey)) {
              toInsert.push({
                source_legislation_id: leg.id,
                target_legislation_id: match.id,
                relation_type: rel.relation_type,
                notes: rel.notes || null,
              });
              existingRelationSet.add(relationKey); // Prevent duplicates within this run
            }
          }
        }

        // Step 4: Insert new relations
        let relationsCreated = 0;
        let revokedLegislationUpdated = 0;
        if (!dryRun && toInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('legislation_relations')
            .insert(toInsert);

          if (insertError) {
            console.error(`Insert error for ${leg.number}:`, insertError);
          } else {
            relationsCreated = toInsert.length;
            totalRelationsCreated += relationsCreated;
            console.log(`✓ Created ${relationsCreated} relations for ${leg.number}`);
            
            // Step 5: Update revocation_date for revoked legislation
            const revokedRelations = toInsert.filter(r => r.relation_type === 'revogado' || r.relation_type === 'revogacao_parcial');
            for (const revokedRel of revokedRelations) {
              // Use the source legislation's publication_date as the revocation date
              const { error: updateError } = await supabase
                .from('legislation')
                .update({ 
                  revocation_date: leg.publication_date || new Date().toISOString().split('T')[0]
                })
                .eq('id', revokedRel.target_legislation_id)
                .is('revocation_date', null); // Only update if not already set
              
              if (!updateError) {
                revokedLegislationUpdated++;
                console.log(`✓ Set revocation_date for target legislation ${revokedRel.target_legislation_id}`);
              }
            }
          }
        } else if (dryRun && toInsert.length > 0) {
          relationsCreated = toInsert.length;
          totalRelationsCreated += relationsCreated;
        }

        const relationsMatchedCount = relationDetails.filter(r => r.matched).length;
        
        results.push({ 
          legislationId: leg.id, 
          legislationNumber: leg.number, 
          relationsFound: extractedRelations.length,
          relationsMatched: relationsMatchedCount,
          relationsCreated,
          relations: relationDetails
        });

        // CRITICAL: Mark this legislation as processed in the tracking table
        if (!dryRun) {
          const { error: trackError } = await supabase
            .from('legislation_relations_processed')
            .upsert({
              legislation_id: leg.id,
              relations_found: extractedRelations.length,
              relations_matched: relationsMatchedCount,
              processed_at: new Date().toISOString(),
            }, {
              onConflict: 'legislation_id'
            });
          
          if (trackError) {
            console.error(`Failed to track processed legislation ${leg.number}:`, trackError);
          } else {
            console.log(`✓ Marked ${leg.number} as processed`);
          }
        }

        // Delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({ 
          legislationId: leg.id, 
          legislationNumber: leg.number,
          relationsFound: 0,
          relationsMatched: 0,
          relationsCreated: 0,
          relations: [],
          error: error instanceof Error ? error.message : 'Erro desconhecido' 
        });
        
        // Even on error, mark as processed to avoid infinite retries
        if (!dryRun) {
          await supabase
            .from('legislation_relations_processed')
            .upsert({
              legislation_id: leg.id,
              relations_found: 0,
              relations_matched: 0,
              processed_at: new Date().toISOString(),
            }, {
              onConflict: 'legislation_id'
            });
        }
      }
    }

    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    console.log(`\n=== COMPLETE ===`);
    console.log(`Successful: ${successful}, Failed: ${failed}`);
    console.log(`Relations: ${totalRelationsFound} found, ${totalRelationsMatched} matched, ${totalRelationsCreated} created`);
    console.log(`Missing legislation auto-imported: ${totalLegislationCreated}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        dryRun,
        autoImport,
        processed: results.length,
        successful,
        failed,
        totalRelationsFound,
        totalRelationsMatched,
        totalRelationsCreated,
        totalLegislationCreated,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Extract relations error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
