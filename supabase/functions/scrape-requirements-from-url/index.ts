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

interface ScrapeResult {
  legislationId: string;
  legislationNumber: string;
  requirements: Requirement[];
  textLength: number;
  scrapeMethod?: string;
  error?: string;
}

const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Native fetch scraper (no external API credits needed)
async function nativeScrape(url: string): Promise<string | null> {
  try {
    console.log('Native scraping:', url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegalBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.5',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Native fetch failed: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
      console.log('Skipping binary content:', contentType);
      return null;
    }

    const html = await response.text();
    if (html.length > 500000) {
      return html.substring(0, 500000);
    }
    return html;
  } catch (error) {
    console.error('Native scrape error:', error);
    return null;
  }
}

// Strip HTML tags and extract meaningful text
function htmlToText(html: string): string {
  // Remove scripts, styles, nav, header, footer
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');
  
  // Convert block elements to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|td|th|article|section|blockquote)[^>]*>/gi, '\n');
  
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ');
  
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  
  return text;
}

// Scrape URL using Firecrawl (if available)
async function scrapeWithFirecrawl(url: string, firecrawlApiKey: string): Promise<string | null> {
  try {
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

    // 402 = credits exhausted, signal to use fallback
    if (response.status === 402) {
      console.log('Firecrawl credits exhausted (402), switching to native fetch');
      return null;
    }

    if (!response.ok) {
      console.error('Firecrawl error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.data?.markdown || data.markdown || '';
  } catch (error) {
    console.error('Firecrawl error:', error);
    return null;
  }
}

// Smart scrape: try Firecrawl first, fall back to native fetch
async function smartScrape(url: string, firecrawlApiKey: string | undefined, firecrawlExhausted: { value: boolean }): Promise<{ text: string; method: string } | null> {
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  // Skip PDFs and binary files
  if (formattedUrl.match(/\.(pdf|doc|docx|xls|xlsx)(\?|$)/i) || formattedUrl.includes('files.dre.pt')) {
    console.log('Skipping binary URL:', formattedUrl);
    return null;
  }

  // Try Firecrawl if available and not exhausted
  if (firecrawlApiKey && !firecrawlExhausted.value) {
    const markdown = await scrapeWithFirecrawl(formattedUrl, firecrawlApiKey);
    if (markdown === null && !firecrawlExhausted.value) {
      // Check if it was a 402 (the function sets this via the null return)
      // We'll mark exhausted and try native
      firecrawlExhausted.value = true;
    }
    if (markdown && markdown.length > 100) {
      return { text: markdown, method: 'firecrawl' };
    }
  }

  // Native fetch fallback
  const html = await nativeScrape(formattedUrl);
  if (html && html.length > 200) {
    const text = htmlToText(html);
    if (text.length > 100) {
      return { text, method: 'native' };
    }
  }

  return null;
}

// Extract requirements from legislation text using AI
async function extractRequirementsFromText(
  legislation: { number: string; title: string; summary: string },
  fullText: string,
  lovableApiKey: string
): Promise<Requirement[]> {
  try {
    console.log(`Extracting requirements with AI for: ${legislation.number} (text: ${fullText.length} chars)`);
    
    const textForAI = fullText.length > 15000 ? fullText.substring(0, 15000) + '...' : fullText;
    
    const prompt = `Analisa o seguinte diploma legal e extrai os REQUISITOS LEGAIS - obrigações, deveres, proibições e condições que as entidades devem cumprir.

DIPLOMA: ${legislation.number}
TÍTULO: ${legislation.title}
${legislation.summary ? `SUMÁRIO: ${legislation.summary}` : ''}

TEXTO COMPLETO DO DIPLOMA:
${textForAI}

INSTRUÇÕES:
1. Identifica os artigos que contêm obrigações legais concretas
2. Extrai apenas requisitos relevantes para compliance (não extrair definições, âmbito de aplicação genérico, disposições transitórias)
3. Para cada requisito, indica:
   - article: referência do artigo (ex: "Art. 5º", "Art. 12º, n.º 2", "Anexo I, ponto 3")
   - requirement_text: descrição clara do requisito/obrigação (máx 300 caracteres)
   - notes: contexto adicional ou condições de aplicação (opcional, máx 200 caracteres)

4. Extrai entre 5 e 15 requisitos principais
5. Prioriza requisitos com prazos, valores limite, obrigações de registo, formação, licenciamento

Retorna APENAS um array JSON válido. Exemplo:
[{"article": "Art. 5º", "requirement_text": "As instalações industriais devem dispor de sistema de tratamento de efluentes", "notes": "Aplicável a instalações com capacidade superior a 50m³/dia"}]`;

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
            content: 'És um especialista em legislação portuguesa e europeia. Extrai requisitos legais de forma precisa e estruturada. Responde APENAS com JSON válido, sem markdown nem explicações.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error(`AI API error: ${response.status}`);
      return [];
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
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
    
    if (!Array.isArray(parsed)) return [];
    
    return parsed
      .filter((r: any) => r && typeof r === 'object' && (r.requirement_text || r.text))
      .map((r: any) => ({
        article: String(r.article || 'Geral').substring(0, 50),
        requirement_text: String(r.requirement_text || r.text).substring(0, 500),
        notes: r.notes ? String(r.notes).substring(0, 300) : undefined,
      }))
      .slice(0, 20);
    
  } catch (error) {
    console.error(`AI extraction error:`, error);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { legislationIds, limit = 10, dryRun = false, replaceExisting = false, origin } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    // Firecrawl is optional now - native fetch works as fallback
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get legislation to process
    let legislationToProcess: any[] = [];

    if (legislationIds && legislationIds.length > 0) {
      const { data, error } = await supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin')
        .in('id', legislationIds)
        .not('document_url', 'is', null);
      
      if (error) throw error;
      legislationToProcess = data || [];
    } else {
      const { data: existingReqs } = await supabase
        .from('legal_requirements')
        .select('legislation_id');
      
      const idsWithReqs = new Set(existingReqs?.map(r => r.legislation_id) || []);
      
      let query = supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin')
        .not('document_url', 'is', null)
        .order('publication_date', { ascending: false });
      
      if (origin === 'PT') {
        query = query.or('origin.eq.PT,origin.eq.dre,origin.is.null');
      } else if (origin === 'EU') {
        query = query.or('origin.eq.EU,origin.eq.eurlex');
      }
      
      const { data: allLegislation } = await query;
      
      const toProcess = replaceExisting 
        ? allLegislation 
        : allLegislation?.filter(l => !idsWithReqs.has(l.id));
      
      legislationToProcess = (toProcess || []).slice(0, limit);
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

    console.log(`Processing ${legislationToProcess.length} legislation items (origin: ${origin || 'all'})`);

    const results: ScrapeResult[] = [];
    let totalRequirements = 0;
    const firecrawlExhausted = { value: false };

    for (const leg of legislationToProcess) {
      console.log(`\n=== Processing: ${leg.number} ===`);
      
      try {
        const scraped = await smartScrape(leg.document_url, firecrawlApiKey, firecrawlExhausted);
        
        if (!scraped) {
          results.push({ 
            legislationId: leg.id, 
            legislationNumber: leg.number, 
            requirements: [],
            textLength: 0,
            error: 'Não foi possível obter conteúdo da página' 
          });
          continue;
        }

        console.log(`Scraped ${scraped.text.length} chars via ${scraped.method} for ${leg.number}`);

        // Check for error pages
        const isErrorPage = scraped.text.includes('The requested document does not exist') ||
                            scraped.text.includes('Access denied') ||
                            scraped.text.includes('Page not found') ||
                            scraped.text.includes('página que acedeu não se encontra disponível') ||
                            (scraped.text.includes('Lamentamos') && scraped.text.length < 500);
        
        if (isErrorPage) {
          results.push({ 
            legislationId: leg.id, 
            legislationNumber: leg.number, 
            requirements: [],
            textLength: scraped.text.length,
            scrapeMethod: scraped.method,
            error: 'Página de erro detetada' 
          });
          continue;
        }

        // Extract requirements using AI
        const requirements = await extractRequirementsFromText(
          { number: leg.number, title: leg.title, summary: leg.summary || '' },
          scraped.text,
          lovableApiKey
        );

        if (requirements.length === 0) {
          results.push({ 
            legislationId: leg.id, 
            legislationNumber: leg.number, 
            requirements: [],
            textLength: scraped.text.length,
            scrapeMethod: scraped.method,
            error: 'Nenhum requisito identificado' 
          });
          continue;
        }

        if (!dryRun) {
          if (replaceExisting) {
            await supabase
              .from('legal_requirements')
              .delete()
              .eq('legislation_id', leg.id);
          }

          const toInsert = requirements.map(req => ({
            legislation_id: leg.id,
            article: req.article,
            requirement_text: req.requirement_text,
            notes: req.notes || null,
          }));

          const { error: insertError } = await supabase
            .from('legal_requirements')
            .insert(toInsert);

          if (insertError) {
            console.error(`Insert error for ${leg.number}:`, insertError);
            results.push({ 
              legislationId: leg.id, 
              legislationNumber: leg.number, 
              requirements,
              textLength: scraped.text.length,
              scrapeMethod: scraped.method,
              error: insertError.message 
            });
            continue;
          }
          
          console.log(`✓ Inserted ${requirements.length} requirements for ${leg.number}`);
        }

        totalRequirements += requirements.length;
        results.push({ 
          legislationId: leg.id, 
          legislationNumber: leg.number, 
          requirements,
          textLength: scraped.text.length,
          scrapeMethod: scraped.method
        });

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 800));

      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({ 
          legislationId: leg.id, 
          legislationNumber: leg.number,
          requirements: [], 
          textLength: 0,
          error: error instanceof Error ? error.message : 'Erro desconhecido' 
        });
      }
    }

    const successful = results.filter(r => !r.error && r.requirements.length > 0).length;
    const failed = results.filter(r => r.error).length;

    console.log(`\n=== COMPLETE === Successful: ${successful}, Failed: ${failed}, Total reqs: ${totalRequirements}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        dryRun,
        processed: results.length,
        successful,
        failed,
        totalRequirements,
        firecrawlExhausted: firecrawlExhausted.value,
        results: results.map(r => ({
          legislationId: r.legislationId,
          legislationNumber: r.legislationNumber,
          requirementsCount: r.requirements.length,
          textLength: r.textLength,
          scrapeMethod: r.scrapeMethod,
          requirements: r.requirements,
          error: r.error,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Scrape requirements error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
