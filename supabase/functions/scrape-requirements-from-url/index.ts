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
  error?: string;
}

const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Scrape URL using Firecrawl
async function scrapeUrl(url: string, firecrawlApiKey: string): Promise<{ markdown: string; html: string } | null> {
  try {
    console.log('Scraping URL:', url);
    
    // Format URL
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
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.error('Firecrawl error:', response.status);
      return null;
    }

    const data = await response.json();
    return {
      markdown: data.data?.markdown || data.markdown || '',
      html: data.data?.html || data.html || '',
    };
  } catch (error) {
    console.error('Scrape error:', error);
    return null;
  }
}

// Extract requirements from legislation text using AI
async function extractRequirementsFromText(
  legislation: { number: string; title: string; summary: string },
  fullText: string,
  lovableApiKey: string
): Promise<Requirement[]> {
  try {
    console.log(`Extracting requirements with AI for: ${legislation.number} (text: ${fullText.length} chars)`);
    
    // Truncate text to avoid token limits, but keep more than just summary
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
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return [];
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    // Parse JSON response
    let jsonContent = content.trim();
    // Remove markdown code blocks
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*\n?/, '').replace(/\n?\s*```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*\n?/, '').replace(/\n?\s*```$/, '');
    }
    
    // Find JSON array
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
      .filter((r: any) => r && typeof r === 'object' && (r.requirement_text || r.text))
      .map((r: any) => ({
        article: String(r.article || 'Geral').substring(0, 50),
        requirement_text: String(r.requirement_text || r.text).substring(0, 500),
        notes: r.notes ? String(r.notes).substring(0, 300) : undefined,
      }))
      .slice(0, 20);
    
    console.log(`AI extracted ${requirements.length} requirements for ${legislation.number}`);
    return requirements;
    
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

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY não configurada. Ative o conector Firecrawl.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      // Get legislation without requirements that have URLs
      const { data: existingReqs } = await supabase
        .from('legal_requirements')
        .select('legislation_id');
      
      const idsWithReqs = new Set(existingReqs?.map(r => r.legislation_id) || []);
      
      // Build query with optional origin filter
      let query = supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin')
        .not('document_url', 'is', null)
        .order('publication_date', { ascending: false });
      
      // Apply origin filter
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

    console.log(`Processing ${legislationToProcess.length} legislation items with URL scraping (origin filter: ${origin || 'all'})`);

    const results: ScrapeResult[] = [];
    let totalRequirements = 0;

    for (const leg of legislationToProcess) {
      console.log(`\n=== Processing: ${leg.number} ===`);
      console.log(`URL: ${leg.document_url}`);
      
      try {
        // Step 1: Scrape the URL
        const scraped = await scrapeUrl(leg.document_url, firecrawlApiKey);
        
        if (!scraped || (!scraped.markdown && !scraped.html)) {
          console.log(`No content scraped for ${leg.number}`);
          results.push({ 
            legislationId: leg.id, 
            legislationNumber: leg.number, 
            requirements: [],
            textLength: 0,
            error: 'Não foi possível obter conteúdo da página' 
          });
          continue;
        }

        const textContent = scraped.markdown || scraped.html;
        console.log(`Scraped ${textContent.length} characters for ${leg.number}`);

        // Check for error pages (DRE and EUR-Lex)
        const isEurlexError = textContent.includes('The requested document does not exist') ||
                              textContent.includes('Access denied') ||
                              textContent.includes('Page not found');
        const isDreError = textContent.includes('página que acedeu não se encontra disponível') ||
                           (textContent.includes('Lamentamos') && textContent.length < 500);
        
        if (isEurlexError || isDreError) {
          const errorSource = isEurlexError ? 'EUR-Lex' : 'DRE';
          console.log(`Error page detected for ${leg.number} (${errorSource})`);
          results.push({ 
            legislationId: leg.id, 
            legislationNumber: leg.number, 
            requirements: [],
            textLength: textContent.length,
            error: `Página de erro no ${errorSource}` 
          });
          continue;
        }

        // Step 2: Extract requirements using AI with full text
        const requirements = await extractRequirementsFromText(
          { number: leg.number, title: leg.title, summary: leg.summary || '' },
          textContent,
          lovableApiKey
        );

        if (requirements.length === 0) {
          console.log(`No requirements extracted for ${leg.number}`);
          results.push({ 
            legislationId: leg.id, 
            legislationNumber: leg.number, 
            requirements: [],
            textLength: textContent.length,
            error: 'Nenhum requisito identificado' 
          });
          continue;
        }

        // Step 3: Save to database (unless dry run)
        if (!dryRun) {
          // Delete existing requirements if replacing
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
              textLength: textContent.length,
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
          textLength: textContent.length
        });

        // Delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

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

    console.log(`\n=== COMPLETE ===`);
    console.log(`Successful: ${successful}, Failed: ${failed}, Total requirements: ${totalRequirements}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        dryRun,
        processed: results.length,
        successful,
        failed,
        totalRequirements,
        results: results.map(r => ({
          legislationId: r.legislationId,
          legislationNumber: r.legislationNumber,
          requirementsCount: r.requirements.length,
          textLength: r.textLength,
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
