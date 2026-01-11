import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedRelation {
  type: 'revoga' | 'altera' | 'regulamenta' | 'transpoe';
  targetNumber: string;
  targetUrl?: string;
}

interface ParsedRequirement {
  article: string;
  text: string;
}

interface ParsedLegislation {
  number: string;
  title: string;
  summary: string;
  entity: string;
  publicationDate: string | null;
  effectiveDate: string | null;
  documentUrl: string;
  externalId: string;
  relations: ParsedRelation[];
  requirements: ParsedRequirement[];
}

// AI endpoint for extracting requirements when parsing fails
const AI_ENDPOINT = 'https://ai.lovable.dev/v1/chat/completions';

// Extract requirements using AI when HTML/markdown parsing fails or returns no results
async function extractRequirementsWithAI(
  legislation: { number: string; title: string; summary: string },
  supabaseAnonKey: string
): Promise<ParsedRequirement[]> {
  try {
    console.log(`Extracting requirements with AI for: ${legislation.number}`);
    
    const prompt = `Analisa o seguinte diploma legal português e extrai os requisitos legais mais importantes.

DIPLOMA: ${legislation.number}
TÍTULO: ${legislation.title}
SUMÁRIO: ${legislation.summary || 'Não disponível'}

Extrai entre 3 a 8 requisitos legais principais. Para cada requisito, indica:
- article: número do artigo (ex: "Art. 5º", "Anexo I", "Art. 12º, n.º 2")
- text: descrição clara e concisa do requisito ou obrigação legal (máx 200 caracteres)

Retorna APENAS um array JSON válido, sem explicações. Exemplo:
[{"article": "Art. 5º", "text": "As instalações devem dispor de sistemas de tratamento"}]`;

    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-supabase-anon-key': supabaseAnonKey,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: 'És um especialista em legislação portuguesa. Extrai requisitos legais de forma precisa. Responde APENAS com JSON válido, sem markdown.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      console.error(`AI API error: ${response.status}`);
      return [];
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    // Parse the JSON response
    let jsonContent = content.trim();
    // Remove markdown code blocks if present
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*\n?/, '').replace(/\n?\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*\n?/, '').replace(/\n?\s*```$/, '');
    }
    
    // Try to find JSON array in the response
    const arrayMatch = jsonContent.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonContent = arrayMatch[0];
    }
    
    const parsed = JSON.parse(jsonContent);
    
    if (!Array.isArray(parsed)) {
      return [];
    }
    
    // Validate and clean requirements
    const requirements = parsed
      .filter((r: any) => r && typeof r === 'object' && (r.text || r.requirement_text))
      .map((r: any) => ({
        article: String(r.article || 'Geral').substring(0, 50),
        text: String(r.text || r.requirement_text).substring(0, 500),
      }))
      .slice(0, 10);
    
    console.log(`AI extracted ${requirements.length} requirements for ${legislation.number}`);
    return requirements;
    
  } catch (error) {
    console.error(`AI extraction error for ${legislation.number}:`, error);
    return [];
  }
}

const months: Record<string, string> = {
  janeiro: '01', fevereiro: '02', março: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08',
  setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
};

function parseDate(dateStr: string): string | null {
  // Try YYYY-MM-DD format
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`;
  }
  
  // Try "DD de Mês de YYYY"
  const ptMatch = dateStr.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (ptMatch) {
    const month = months[ptMatch[2].toLowerCase()];
    if (month) {
      return `${ptMatch[3]}-${month}-${ptMatch[1].padStart(2, '0')}`;
    }
  }
  
  return null;
}

// Parse legislation data from Firecrawl markdown response
function parseMarkdownContent(markdown: string, url: string): ParsedLegislation | null {
  try {
    console.log('Parsing markdown content, length:', markdown.length);
    
    // Check for error page
    if (markdown.includes('página que acedeu não se encontra disponível') || 
        markdown.includes('Lamentamos') && markdown.length < 500) {
      console.log('Error page detected, skipping');
      return null;
    }
    
    // Extract number from URL pattern: detalhe/tipo/numero-ano-id
    let number = '';
    let title = '';
    const urlNumberMatch = url.match(/detalhe\/([^\/]+)\/([^\/]+)/);
    if (urlNumberMatch) {
      const type = urlNumberMatch[1].charAt(0).toUpperCase() + urlNumberMatch[1].slice(1).replace(/-/g, ' ');
      const numParts = urlNumberMatch[2].split('-');
      if (numParts.length >= 2) {
        number = `${type} n.º ${numParts[0]}/${numParts[1]}`;
        title = number;
      }
    }
    
    // Try to extract title from markdown - look for legislation number pattern
    const legislationTitleMatch = markdown.match(/(?:Portaria|Decreto-Lei|Despacho|Lei|Regulamento|Resolução|Declaração)[^\n]*n\.º[^\n]+/i);
    if (legislationTitleMatch) {
      title = legislationTitleMatch[0].trim().replace(/\*+/g, '').replace(/\[|\]/g, '').replace(/\(.*?\)/g, '').trim();
    }
    
    // Extract summary
    let summary = '';
    const sumarioPatterns = [
      /SUMÁRIO\s*[:\-]?\s*([\s\S]+?)(?=\n\s*(?:TEXTO|Emissor|Entidade|\n#|\*\*Emissor|\*\*Data))/i,
      /Sumário[:\s]*([\s\S]+?)(?=\n\s*(?:Texto|Emissor|Entidade|\*\*))/i,
    ];
    
    for (const pattern of sumarioPatterns) {
      const match = markdown.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].trim()
          .replace(/\s+/g, ' ')
          .replace(/\[.*?\]\([^)]*\)/g, '')
          .replace(/\*+/g, '')
          .substring(0, 1000);
        if (extracted.length > 20 && !extracted.includes('Página de entrada')) {
          summary = extracted;
          break;
        }
      }
    }
    
    // Extract entity/emissor
    let entity = '';
    const entityMatch = markdown.match(/(?:Emissor|Entidade)[:\s]*\**([^\n*]+)/i);
    if (entityMatch) {
      entity = entityMatch[1].trim().replace(/\*+/g, '').substring(0, 200);
    }
    
    // Extract publication date
    let publicationDate: string | null = null;
    const pubDatePatterns = [
      /Data de Publicação[:\s]*\**([^\n*]+)/i,
      /Publicação[:\s]*\**([^\n*]+)/i,
      /DR[:\s]*[^\n]*(\d{4}-\d{2}-\d{2})/i,
    ];
    for (const pattern of pubDatePatterns) {
      const match = markdown.match(pattern);
      if (match) {
        publicationDate = parseDate(match[1]);
        if (publicationDate) break;
      }
    }
    
    // Fallback: extract from Diário da República reference
    if (!publicationDate) {
      const drMatch = markdown.match(/Diário da República[^\n]*(\d{4}-\d{2}-\d{2})/i);
      if (drMatch) {
        publicationDate = drMatch[1];
      }
    }
    
    // Fallback: extract year from URL
    if (!publicationDate && urlNumberMatch) {
      const numParts = urlNumberMatch[2].split('-');
      if (numParts.length >= 2 && numParts[1].length === 4) {
        publicationDate = `${numParts[1]}-01-01`;
      }
    }
    
    // Extract effective date (data de entrada em vigor)
    let effectiveDate: string | null = null;
    const effectiveDatePatterns = [
      /(?:entra(?:r)?|entra(?:da)?)\s+em\s+vigor[:\s]*(?:a|em|no dia)?\s*(\d{1,2}\s+de\s+\w+\s+de\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
      /Data de Entrada em Vigor[:\s]*\**([^\n*]+)/i,
      /Vigência[:\s]*\**([^\n*]+)/i,
      /produz(?:ir)?\s+efeitos[:\s]*(?:a partir de|desde|em)?\s*(\d{1,2}\s+de\s+\w+\s+de\s+\d{4}|\d{4}-\d{2}-\d{2})/i,
    ];
    for (const pattern of effectiveDatePatterns) {
      const match = markdown.match(pattern);
      if (match) {
        effectiveDate = parseDate(match[1]);
        if (effectiveDate) {
          console.log(`Found effective date: ${effectiveDate}`);
          break;
        }
      }
    }
    
    // If no specific effective date, check for "dia seguinte" or use publication date
    if (!effectiveDate && publicationDate) {
      const nextDayMatch = markdown.match(/entra(?:r)?\s+em\s+vigor[^\n]*dia\s+seguinte/i);
      if (nextDayMatch) {
        const pubDate = new Date(publicationDate);
        pubDate.setDate(pubDate.getDate() + 1);
        effectiveDate = pubDate.toISOString().split('T')[0];
      }
    }
    
    // Extract relations (revoga, altera, regulamenta, transpõe)
    const relations: ParsedRelation[] = [];
    
    // Look for "Revoga" section
    const revogaPatterns = [
      /(?:Revoga|revogad[oa])[:\s]*([^]*?)(?=\n\s*(?:Altera|Regulamenta|Transpõe|TEXTO|\*\*|$))/gi,
      /diplomas?\s+revogados?[:\s]*([^]*?)(?=\n\n|\n#|$)/gi,
    ];
    for (const pattern of revogaPatterns) {
      const matches = markdown.matchAll(pattern);
      for (const match of matches) {
        const section = match[1] || match[0];
        // Extract legislation references
        const refs = section.matchAll(/(?:Decreto-Lei|Portaria|Lei|Despacho|Regulamento)[^\n,;]*n\.º\s*[\d\w\-\/]+/gi);
        for (const ref of refs) {
          relations.push({
            type: 'revoga',
            targetNumber: ref[0].trim().replace(/\*+/g, '').replace(/\[|\]/g, '')
          });
        }
      }
    }
    
    // Look for "Altera" section
    const alteraPatterns = [
      /(?:Altera|alterad[oa])[:\s]*([^]*?)(?=\n\s*(?:Revoga|Regulamenta|Transpõe|TEXTO|\*\*|$))/gi,
      /diplomas?\s+alterados?[:\s]*([^]*?)(?=\n\n|\n#|$)/gi,
    ];
    for (const pattern of alteraPatterns) {
      const matches = markdown.matchAll(pattern);
      for (const match of matches) {
        const section = match[1] || match[0];
        const refs = section.matchAll(/(?:Decreto-Lei|Portaria|Lei|Despacho|Regulamento)[^\n,;]*n\.º\s*[\d\w\-\/]+/gi);
        for (const ref of refs) {
          relations.push({
            type: 'altera',
            targetNumber: ref[0].trim().replace(/\*+/g, '').replace(/\[|\]/g, '')
          });
        }
      }
    }
    
    // Look for "Regulamenta" section
    const regulamentaMatch = markdown.match(/(?:Regulamenta)[:\s]*([^]*?)(?=\n\s*(?:Revoga|Altera|Transpõe|TEXTO|\*\*|$))/i);
    if (regulamentaMatch) {
      const refs = regulamentaMatch[1].matchAll(/(?:Decreto-Lei|Portaria|Lei|Despacho|Regulamento)[^\n,;]*n\.º\s*[\d\w\-\/]+/gi);
      for (const ref of refs) {
        relations.push({
          type: 'regulamenta',
          targetNumber: ref[0].trim().replace(/\*+/g, '').replace(/\[|\]/g, '')
        });
      }
    }
    
    // Look for "Transpõe" section
    const transpoeMatch = markdown.match(/(?:Transpõe|Transposição)[:\s]*([^]*?)(?=\n\s*(?:Revoga|Altera|Regulamenta|TEXTO|\*\*|$))/i);
    if (transpoeMatch) {
      const refs = transpoeMatch[1].matchAll(/(?:Diretiva|Regulamento\s+\(UE\))[^\n,;]*(?:n\.º\s*)?[\d\w\-\/]+/gi);
      for (const ref of refs) {
        relations.push({
          type: 'transpoe',
          targetNumber: ref[0].trim().replace(/\*+/g, '').replace(/\[|\]/g, '')
        });
      }
    }
    
    console.log(`Found ${relations.length} relations`);
    
    // Extract requirements (artigos)
    const requirements: ParsedRequirement[] = [];
    
    // Look for TEXTO section and extract articles
    const textoMatch = markdown.match(/TEXTO\s*([\s\S]+?)(?=$|\n##)/i);
    if (textoMatch) {
      const texto = textoMatch[1];
      
      // Extract articles with their content
      const articlePattern = /(?:^|\n)\s*(?:Artigo|Art\.)\s*(\d+\.?º?)[^\n]*\n([\s\S]*?)(?=(?:\n\s*(?:Artigo|Art\.)\s*\d+|$))/gi;
      const articles = texto.matchAll(articlePattern);
      
      for (const article of articles) {
        const articleNum = `Artigo ${article[1].replace(/\.?º?$/, '')}º`;
        const content = article[2].trim()
          .replace(/\s+/g, ' ')
          .replace(/\*+/g, '')
          .substring(0, 2000);
        
        if (content.length > 10) {
          requirements.push({
            article: articleNum,
            text: content
          });
        }
      }
    }
    
    // If no articles found, try to extract numbered items
    if (requirements.length === 0) {
      const numberedItems = markdown.matchAll(/(?:^|\n)\s*(\d+)[.\-\)]\s+([^\n]+)/gm);
      let itemCount = 0;
      for (const item of numberedItems) {
        if (itemCount >= 20) break; // Limit to avoid noise
        const text = item[2].trim();
        if (text.length > 20 && !text.includes('Diário') && !text.includes('Série')) {
          requirements.push({
            article: `Item ${item[1]}`,
            text: text.substring(0, 2000)
          });
          itemCount++;
        }
      }
    }
    
    console.log(`Found ${requirements.length} requirements`);
    
    // Extract external ID from URL
    const idMatch = url.match(/(\d+)(?:\?|$)/);
    const externalId = idMatch ? `dre-${idMatch[1]}` : `dre-${Date.now()}`;
    
    if (!number && !title) {
      console.log('Could not extract number or title from markdown');
      return null;
    }
    
    console.log(`Parsed: ${number}, Entity: ${entity}, PubDate: ${publicationDate}, EffDate: ${effectiveDate}, Summary: ${summary.length} chars`);
    
    return {
      number: number || title,
      title: title || number,
      summary,
      entity,
      publicationDate,
      effectiveDate,
      documentUrl: url,
      externalId,
      relations,
      requirements
    };
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return null;
  }
}

// Parse HTML content directly (fallback when Firecrawl fails)
function parseHtmlContent(html: string, url: string): ParsedLegislation | null {
  try {
    console.log('Parsing HTML content, length:', html.length);
    
    // Check for error page
    if (html.includes('página que acedeu não se encontra disponível') || 
        html.includes('Lamentamos') && html.length < 1000) {
      console.log('Error page detected in HTML');
      return null;
    }
    
    // Extract number from URL
    let number = '';
    let title = '';
    const urlNumberMatch = url.match(/detalhe\/([^\/]+)\/([^\/]+)/);
    if (urlNumberMatch) {
      const type = urlNumberMatch[1].charAt(0).toUpperCase() + urlNumberMatch[1].slice(1).replace(/-/g, ' ');
      const numParts = urlNumberMatch[2].split('-');
      if (numParts.length >= 2) {
        number = `${type} n.º ${numParts[0]}/${numParts[1]}`;
        title = number;
      }
    }
    
    // Extract title from HTML
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                       html.match(/headline["\s]*[:=]["\s]*["']([^"']+)["']/i);
    if (titleMatch) {
      const extractedTitle = titleMatch[1].trim();
      if (extractedTitle.length > 5 && !extractedTitle.includes('Diário da República')) {
        title = extractedTitle;
      }
    }
    
    // Extract summary from SUMÁRIO section
    let summary = '';
    const sumarioMatch = html.match(/SUMÁRIO[\s\S]*?<[^>]*>([^<]+(?:<[^>]*>[^<]*)*)<[^>]*>[\s\S]*?(?:TEXTO|Emissor)/i);
    if (sumarioMatch) {
      summary = sumarioMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 1000);
    }
    
    // Alternative: look for meta description
    if (!summary) {
      const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      if (metaMatch) {
        summary = metaMatch[1].trim().substring(0, 1000);
      }
    }
    
    // Extract entity/emissor
    let entity = '';
    const emissorMatch = html.match(/Emissor[:\s]*(?:<[^>]*>)*\s*([^<]+)/i);
    if (emissorMatch) {
      entity = emissorMatch[1].trim().substring(0, 200);
    }
    
    // Extract publication date
    let publicationDate: string | null = null;
    const datePatterns = [
      /datepublished["\s]*[:=]["\s]*["'](\d{4}-\d{2}-\d{2})["']/i,
      /Data de Publicação[:\s]*(\d{4}-\d{2}-\d{2})/i,
      /(\d{4}-\d{2}-\d{2})/,
    ];
    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match) {
        publicationDate = match[1];
        break;
      }
    }
    
    // Fallback: extract from Diário reference
    if (!publicationDate) {
      const drMatch = html.match(/Diário da República[^,]*,\s*[^,]*de\s*(\d{4}-\d{2}-\d{2})/i);
      if (drMatch) {
        publicationDate = drMatch[1];
      }
    }
    
    // Fallback: extract year from URL
    if (!publicationDate && urlNumberMatch) {
      const numParts = urlNumberMatch[2].split('-');
      if (numParts.length >= 2 && numParts[1].length === 4) {
        publicationDate = `${numParts[1]}-01-01`;
      }
    }
    
    // Extract effective date
    let effectiveDate: string | null = null;
    const effectiveMatch = html.match(/entra(?:r)?\s+em\s+vigor[^<]*(\d{4}-\d{2}-\d{2})/i);
    if (effectiveMatch) {
      effectiveDate = effectiveMatch[1];
    }
    
    // Extract relations
    const relations: ParsedRelation[] = [];
    
    // Look for "Revoga" mentions
    const revogaMatches = html.matchAll(/revoga[^<]*(?:Decreto-Lei|Portaria|Lei|Despacho)[^<]*n\.º\s*[\d\w\-\/]+/gi);
    for (const match of revogaMatches) {
      const refMatch = match[0].match(/(?:Decreto-Lei|Portaria|Lei|Despacho)[^\n,;]*n\.º\s*[\d\w\-\/]+/i);
      if (refMatch) {
        relations.push({ type: 'revoga', targetNumber: refMatch[0].trim() });
      }
    }
    
    // Look for "Altera" mentions
    const alteraMatches = html.matchAll(/altera[^<]*(?:Decreto-Lei|Portaria|Lei|Despacho)[^<]*n\.º\s*[\d\w\-\/]+/gi);
    for (const match of alteraMatches) {
      const refMatch = match[0].match(/(?:Decreto-Lei|Portaria|Lei|Despacho)[^\n,;]*n\.º\s*[\d\w\-\/]+/i);
      if (refMatch) {
        relations.push({ type: 'altera', targetNumber: refMatch[0].trim() });
      }
    }
    
    // Extract requirements from TEXTO section
    const requirements: ParsedRequirement[] = [];
    const textoMatch = html.match(/TEXTO[\s\S]*?<div[^>]*>([\s\S]+?)<\/div>\s*(?:<div|$)/i);
    if (textoMatch) {
      const texto = textoMatch[1];
      const articlePattern = /Artigo\s*(\d+)\.?º?[^<]*<[^>]*>([\s\S]*?)(?=Artigo\s*\d+|$)/gi;
      const articles = texto.matchAll(articlePattern);
      
      for (const article of articles) {
        const articleNum = `Artigo ${article[1]}º`;
        const content = article[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 2000);
        
        if (content.length > 10) {
          requirements.push({ article: articleNum, text: content });
        }
      }
    }
    
    console.log(`HTML Parsed: ${number}, Entity: ${entity}, PubDate: ${publicationDate}, Summary: ${summary.length} chars, Relations: ${relations.length}`);
    
    // Extract external ID from URL
    const idMatch = url.match(/(\d+)(?:\?|$)/);
    const externalId = idMatch ? `dre-${idMatch[1]}` : `dre-${Date.now()}`;
    
    if (!number && !title) {
      console.log('Could not extract number or title from HTML');
      return null;
    }
    
    return {
      number: number || title,
      title: title || number,
      summary,
      entity,
      publicationDate,
      effectiveDate,
      documentUrl: url,
      externalId,
      relations,
      requirements
    };
  } catch (error) {
    console.error('Error parsing HTML:', error);
    return null;
  }
}

// Fallback: extract from URL only
function parseFromUrl(url: string): ParsedLegislation | null {
  try {
    const urlNumberMatch = url.match(/detalhe\/([^\/]+)\/([^\/]+)/);
    if (!urlNumberMatch) return null;
    
    const type = urlNumberMatch[1].charAt(0).toUpperCase() + urlNumberMatch[1].slice(1).replace(/-/g, ' ');
    const numParts = urlNumberMatch[2].split('-');
    if (numParts.length < 2) return null;
    
    const number = `${type} n.º ${numParts[0]}/${numParts[1]}`;
    const idMatch = url.match(/(\d+)(?:\?|$)/);
    const externalId = idMatch ? `dre-${idMatch[1]}` : `dre-${Date.now()}`;
    
    return {
      number,
      title: number,
      summary: '',
      entity: '',
      publicationDate: numParts[1].length === 4 ? `${numParts[1]}-01-01` : null,
      effectiveDate: null,
      documentUrl: url,
      externalId,
      relations: [],
      requirements: []
    };
  } catch {
    return null;
  }
}

// Fetch HTML directly from URL
async function fetchHtmlDirect(url: string): Promise<string | null> {
  try {
    console.log('Fetching HTML directly...');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      }
    });
    
    if (!response.ok) {
      console.log(`Direct fetch failed: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    console.log(`Direct fetch successful, HTML length: ${html.length}`);
    return html;
  } catch (error) {
    console.error('Direct fetch error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const { links, updateExisting = false, extractRequirementsAI = true, stream = false } = await req.json();

    // If streaming is requested, use SSE - but for now just run normally
    // Streaming will be handled client-side with polling
    
    if (!links || !Array.isArray(links) || links.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Links array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting import of ${links.length} DRE links... (updateExisting: ${updateExisting})`);
    console.log(`Firecrawl API key available: ${!!firecrawlApiKey}`);

    // Get existing legislation
    const { data: existingLegislation } = await supabase
      .from('legislation')
      .select('id, external_id, document_url, number, summary, title, entity, publication_date, effective_date');
    
    const existingByUrl = new Map((existingLegislation || []).map(l => [l.document_url, l]));
    const existingIds = new Set((existingLegislation || []).map(l => l.external_id));
    const legislationByNumber = new Map((existingLegislation || []).map(l => [l.number?.toLowerCase(), l.id]));
    
    // Build a normalized number index for duplicate detection
    const normalizeNumber = (num: string): string => {
      return num
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/,\s*/g, ' ')
        .replace(/n\.º\s*/g, 'n.º ')
        .replace(/de\s+(\d)/g, '$1')
        .replace(/\s+de\s+\d{1,2}\s+de\s+\w+$/i, '') // Remove "de DD de Mês"
        .trim();
    };
    
    const existingByNormalizedNumber = new Map<string, any>();
    for (const leg of existingLegislation || []) {
      const normalized = normalizeNumber(leg.number || '');
      if (normalized && !existingByNormalizedNumber.has(normalized)) {
        existingByNormalizedNumber.set(normalized, leg);
      }
    }
    
    // Smart merge function - keeps the best data from both records
    const smartMerge = (existing: any, newData: any): Record<string, unknown> => {
      const merged: Record<string, unknown> = {};
      
      // Title: prefer longer, more descriptive title (not just the number)
      if (newData.title && newData.title !== newData.number) {
        if (!existing.title || existing.title === existing.number || 
            (newData.title.length > existing.title.length && !newData.title.includes('http'))) {
          merged.title = newData.title;
        }
      }
      
      // Summary: prefer longer, non-error summary
      if (newData.summary && newData.summary.length > 20 && !newData.summary.includes('Lamentamos')) {
        if (!existing.summary || existing.summary.length < newData.summary.length || 
            existing.summary.includes('Lamentamos')) {
          merged.summary = newData.summary;
        }
      }
      
      // Entity: prefer non-empty, clean entity (no markdown links)
      if (newData.entity && !newData.entity.includes('[') && !newData.entity.includes('http')) {
        if (!existing.entity || existing.entity.includes('[') || existing.entity.includes('http')) {
          merged.entity = newData.entity;
        }
      }
      
      // Publication date: prefer existing if both have it, otherwise use new
      if (newData.publicationDate && !existing.publication_date) {
        merged.publication_date = newData.publicationDate;
      }
      
      // Effective date: prefer new if existing is empty
      if (newData.effectiveDate && !existing.effective_date) {
        merged.effective_date = newData.effectiveDate;
      }
      
      // Document URL: prefer DRE URL
      if (newData.documentUrl && !existing.document_url) {
        merged.document_url = newData.documentUrl;
      }
      
      return merged;
    };

    let created = 0;
    let updated = 0;
    let merged = 0;
    let skipped = 0;
    let failed = 0;
    let requirementsCreated = 0;
    let relationsCreated = 0;
    const errors: string[] = [];
    const results: { url: string; status: string; number?: string; method?: string; requirements?: number; relations?: number }[] = [];

    for (const link of links) {
      const url = link.trim();
      if (!url) continue;
      
      // Check if already exists by URL
      let existingLeg = existingByUrl.get(url);
      
      if (existingLeg && !updateExisting) {
        skipped++;
        results.push({ url, status: 'skipped', number: 'Já existe' });
        continue;
      }

      try {
        console.log(`Processing: ${url}`);
        let parsed: ParsedLegislation | null = null;
        let method = 'url';
        let rawMarkdown = '';

        // Try Firecrawl first if available
        if (firecrawlApiKey) {
          try {
            console.log('Fetching with Firecrawl...');
            const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${firecrawlApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: url,
                formats: ['markdown'],
                onlyMainContent: false, // Get full content for requirements
                waitFor: 3000, // Wait for JS rendering
              }),
            });

            if (firecrawlResponse.ok) {
              const firecrawlData = await firecrawlResponse.json();
              rawMarkdown = firecrawlData.data?.markdown || firecrawlData.markdown || '';
              
              if (rawMarkdown) {
                console.log('Firecrawl returned markdown, parsing...');
                parsed = parseMarkdownContent(rawMarkdown, url);
                if (parsed) {
                  method = 'firecrawl';
                }
              }
            } else {
              console.log(`Firecrawl error: ${firecrawlResponse.status}`);
            }
          } catch (fcError) {
            console.log('Firecrawl fetch failed:', fcError);
          }
        }

        // Fallback #1: Try direct HTML fetch
        if (!parsed) {
          console.log('Firecrawl failed, trying direct HTML fetch...');
          const html = await fetchHtmlDirect(url);
          if (html) {
            parsed = parseHtmlContent(html, url);
            if (parsed) {
              method = 'html';
            }
          }
        }

        // Fallback #2: URL parsing only
        if (!parsed) {
          console.log('HTML parsing failed, falling back to URL parsing...');
          parsed = parseFromUrl(url);
          method = 'url';
        }

        if (!parsed) {
          throw new Error('Could not parse legislation data (page may not exist)');
        }

        // Check if external_id already exists (for new imports)
        if (!existingLeg && existingIds.has(parsed.externalId)) {
          skipped++;
          results.push({ url, status: 'skipped', number: parsed.number });
          continue;
        }
        
        // DUPLICATE DETECTION: Check if similar number already exists
        const normalizedNewNumber = normalizeNumber(parsed.number);
        const duplicateByNumber = existingByNormalizedNumber.get(normalizedNewNumber);
        
        if (duplicateByNumber && duplicateByNumber.id && !existingLeg) {
          // Found a potential duplicate - merge instead of creating new
          console.log(`Duplicate detected: "${parsed.number}" matches existing "${duplicateByNumber.number}"`);
          
          const mergedData = smartMerge(duplicateByNumber, parsed);
          
          if (Object.keys(mergedData).length > 0) {
            mergedData.updated_at = new Date().toISOString();
            
            const { error: mergeError } = await supabase
              .from('legislation')
              .update(mergedData)
              .eq('id', duplicateByNumber.id);
            
            if (mergeError) {
              console.error(`Merge error for ${parsed.number}:`, mergeError.message);
            } else {
              merged++;
              console.log(`Merged data into existing: ${duplicateByNumber.number} with ${Object.keys(mergedData).length} fields`);
              results.push({ url, status: 'merged', number: parsed.number, method });
            }
          } else {
            skipped++;
            results.push({ url, status: 'skipped', number: 'Duplicado sem novos dados' });
          }
          continue;
        }

        let legislationId: string;
        let isUpdate = false;

        if (existingLeg && updateExisting) {
          // Update existing legislation
          const updateData: Record<string, unknown> = {};
          
          // Only update fields that have new data
          if (parsed.summary && parsed.summary.length > (existingLeg.summary?.length || 0)) {
            updateData.summary = parsed.summary;
          }
          if (parsed.entity) updateData.entity = parsed.entity;
          if (parsed.publicationDate) updateData.publication_date = parsed.publicationDate;
          if (parsed.effectiveDate) updateData.effective_date = parsed.effectiveDate;
          if (parsed.title && parsed.title !== parsed.number) updateData.title = parsed.title;
          
          if (Object.keys(updateData).length > 0) {
            updateData.updated_at = new Date().toISOString();
            
            const { error: updateError } = await supabase
              .from('legislation')
              .update(updateData)
              .eq('id', existingLeg.id);

            if (updateError) {
              throw new Error(updateError.message);
            }
            
            legislationId = existingLeg.id;
            isUpdate = true;
            updated++;
            console.log(`Updated: ${parsed.number} with ${Object.keys(updateData).length} fields`);
          } else {
            skipped++;
            results.push({ url, status: 'skipped', number: 'Sem novos dados' });
            continue;
          }
        } else {
          // Insert new legislation
          const { data: insertedLeg, error: insertError } = await supabase
            .from('legislation')
            .insert({
              external_id: parsed.externalId,
              source: 'dre-link',
              number: parsed.number,
              title: parsed.title,
              summary: parsed.summary,
              entity: parsed.entity,
              origin: 'PT',
              publication_date: parsed.publicationDate,
              effective_date: parsed.effectiveDate,
              document_url: parsed.documentUrl
            })
            .select('id')
            .single();

          if (insertError) {
            throw new Error(insertError.message);
          }
          
          legislationId = insertedLeg.id;
          created++;
        }

        let reqCount = 0;
        let relCount = 0;

        // Insert requirements (only for new records or if updating)
        let requirementsToInsert = parsed.requirements;
        
        // If no requirements from parsing and AI extraction is enabled, use AI
        if (requirementsToInsert.length === 0 && extractRequirementsAI && parsed.summary) {
          console.log(`No requirements from parsing, using AI extraction for ${parsed.number}...`);
          requirementsToInsert = await extractRequirementsWithAI(
            { number: parsed.number, title: parsed.title, summary: parsed.summary },
            supabaseAnonKey
          );
          // Small delay to avoid rate limiting
          if (requirementsToInsert.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        if (requirementsToInsert.length > 0 && !isUpdate) {
          const reqData = requirementsToInsert.map(req => ({
            legislation_id: legislationId,
            article: req.article,
            requirement_text: req.text
          }));

          const { error: reqError } = await supabase
            .from('legal_requirements')
            .insert(reqData);

          if (reqError) {
            console.error('Error inserting requirements:', reqError.message);
          } else {
            reqCount = reqData.length;
            requirementsCreated += reqCount;
          }
        }

        // Insert relations (only for new records or if updating)
        if (parsed.relations.length > 0 && !isUpdate) {
          for (const relation of parsed.relations) {
            // Try to find the target legislation by number
            const targetNumber = relation.targetNumber.toLowerCase();
            let targetId = legislationByNumber.get(targetNumber);

            // If not found, try partial match
            if (!targetId) {
              for (const [num, id] of legislationByNumber) {
                if (num && targetNumber.includes(num.split(' ').pop() || '')) {
                  targetId = id;
                  break;
                }
              }
            }

            if (targetId) {
              const relationTypeMap: Record<string, string> = {
                'revoga': 'revogado_por',
                'altera': 'alteracao',
                'regulamenta': 'regulamentacao',
                'transpoe': 'transposicao'
              };

              const { error: relError } = await supabase
                .from('legislation_relations')
                .insert({
                  source_legislation_id: legislationId,
                  target_legislation_id: targetId,
                  relation_type: relationTypeMap[relation.type] || relation.type,
                  notes: `Extraído automaticamente: ${relation.targetNumber}`
                });

              if (!relError) {
                relCount++;
                relationsCreated++;
              }
            } else {
              console.log(`Target legislation not found: ${relation.targetNumber}`);
            }
          }
        }

        if (!isUpdate) {
          existingByUrl.set(url, { id: legislationId, external_id: parsed.externalId, document_url: url, number: parsed.number, summary: parsed.summary, title: parsed.title, entity: parsed.entity, publication_date: parsed.publicationDate, effective_date: parsed.effectiveDate });
          existingIds.add(parsed.externalId);
          legislationByNumber.set(parsed.number.toLowerCase(), legislationId);
          existingByNormalizedNumber.set(normalizeNumber(parsed.number), { id: legislationId, number: parsed.number });
        }
        
        results.push({ 
          url, 
          status: isUpdate ? 'updated' : 'created', 
          number: parsed.number, 
          method,
          requirements: reqCount,
          relations: relCount
        });
        console.log(`${isUpdate ? 'Updated' : 'Created'}: ${parsed.number} (via ${method}) with ${reqCount} requirements, ${relCount} relations`);

      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${url}: ${errorMsg}`);
        results.push({ url, status: 'failed' });
        console.error(`Failed ${url}:`, errorMsg);
      }
    }

    console.log(`Import complete: ${created} created, ${updated} updated, ${merged} merged, ${skipped} skipped, ${failed} failed, ${requirementsCreated} requirements, ${relationsCreated} relations`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total: links.length,
          created,
          updated,
          merged,
          skipped,
          failed,
          requirementsCreated,
          relationsCreated,
          errors: errors.slice(0, 10)
        },
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Import error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
