import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedRelation {
  relation_type: 'revoga' | 'altera' | 'alterado_por' | 'regulamenta' | 'regulamentado_por' | 'transpoe' | 'transposto_por' | 'complementa';
  target_number: string;
  notes?: string;
}

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
Identifica relações dos seguintes tipos:
- "revoga": diplomas que ESTE diploma revoga
- "altera": diplomas que ESTE diploma altera/modifica
- "alterado_por": diplomas que alteram ESTE diploma (menos comum, só se explicitamente mencionado)
- "regulamenta": diplomas que ESTE diploma regulamenta
- "regulamentado_por": diplomas que regulamentam ESTE diploma
- "transpoe": diretivas europeias que ESTE diploma transpõe
- "transposto_por": leis nacionais que transpõem ESTA diretiva (só para legislação EU)
- "complementa": diplomas relacionados/complementares

Para cada relação encontrada, extrai:
- relation_type: um dos tipos acima
- target_number: número do diploma alvo (ex: "Decreto-Lei n.º 123/2020", "Diretiva 2010/75/UE", "Portaria n.º 456/2019")
- notes: contexto adicional se relevante (opcional)

IMPORTANTE:
- Extrai os números dos diplomas EXATAMENTE como aparecem
- Procura nas secções "Revoga", "Altera", "Regulamenta", "Transpõe" e no texto geral
- Não inventes relações - só as que estão explicitamente mencionadas

Retorna APENAS um array JSON válido. Exemplo:
[
  {"relation_type": "revoga", "target_number": "Decreto-Lei n.º 123/2020"},
  {"relation_type": "transpoe", "target_number": "Diretiva 2010/75/UE", "notes": "parcialmente"}
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
    
    // Validate relations
    const validTypes = ['revoga', 'altera', 'alterado_por', 'regulamenta', 'regulamentado_por', 'transpoe', 'transposto_por', 'complementa'];
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { legislationIds, limit = 10, dryRun = false, origin } = await req.json();
    
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
      // Get legislation with URLs, optionally filtered by origin
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
      
      const { data } = await query.limit(limit);
      legislationToProcess = data || [];
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

    console.log(`Processing ${legislationToProcess.length} legislation for relations (origin: ${origin || 'all'})`);

    const results: RelationResult[] = [];
    let totalRelationsFound = 0;
    let totalRelationsMatched = 0;
    let totalRelationsCreated = 0;

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
          const match = findMatchingLegislation(rel.target_number, allLegislation);
          
          relationDetails.push({
            type: rel.relation_type,
            targetNumber: rel.target_number,
            targetId: match?.id,
            matched: !!match
          });

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
          }
        } else if (dryRun && toInsert.length > 0) {
          relationsCreated = toInsert.length;
          totalRelationsCreated += relationsCreated;
        }

        results.push({ 
          legislationId: leg.id, 
          legislationNumber: leg.number, 
          relationsFound: extractedRelations.length,
          relationsMatched: relationDetails.filter(r => r.matched).length,
          relationsCreated,
          relations: relationDetails
        });

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
      }
    }

    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    console.log(`\n=== COMPLETE ===`);
    console.log(`Successful: ${successful}, Failed: ${failed}`);
    console.log(`Relations: ${totalRelationsFound} found, ${totalRelationsMatched} matched, ${totalRelationsCreated} created`);

    return new Response(
      JSON.stringify({ 
        success: true,
        dryRun,
        processed: results.length,
        successful,
        failed,
        totalRelationsFound,
        totalRelationsMatched,
        totalRelationsCreated,
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
