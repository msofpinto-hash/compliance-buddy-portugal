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

// Create missing legislation in database
async function createMissingLegislation(
  supabase: any,
  targetNumber: string,
  notes?: string
): Promise<{ id: string; number: string } | null> {
  try {
    const origin = determineOrigin(targetNumber);
    const year = extractYear(targetNumber);
    
    // Create minimal legislation record
    const { data, error } = await supabase
      .from('legislation')
      .insert({
        number: targetNumber,
        title: targetNumber, // Use number as title initially
        origin,
        publication_date: year ? `${year}-01-01` : null,
        summary: notes || `Diploma referenciado - a aguardar importação completa`,
      })
      .select('id, number')
      .single();
    
    if (error) {
      console.error(`Failed to create legislation "${targetNumber}":`, error);
      return null;
    }
    
    console.log(`✓ Created missing legislation: ${targetNumber} (id: ${data.id})`);
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
          const created = await createMissingLegislation(supabase, rel.target_number, rel.notes);
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
        const { error: insertError } = await supabase
          .from('legislation_relations')
          .insert(toInsert);

        if (insertError) {
          console.error(`Insert error for ${leg.number}:`, insertError);
        } else {
          relationsCreated = toInsert.length;
          totalRelationsCreated += relationsCreated;
          console.log(`✓ Created ${relationsCreated} relations for ${leg.number}`);
          
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

    // Get legislation IDs that already have outgoing relations (already processed)
    const processedLegislationIds = new Set(
      existingRelations?.map(r => r.source_legislation_id) || []
    );
    console.log(`Found ${processedLegislationIds.size} legislation already with relations (will skip)`);

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
            const created = await createMissingLegislation(supabase, rel.target_number, rel.notes);
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
