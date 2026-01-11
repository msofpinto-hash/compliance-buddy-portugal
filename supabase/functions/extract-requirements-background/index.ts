import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Requirement {
  article: string;
  requirement_text: string;
}

// Use Lovable AI gateway - no external API key required
const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Background extraction function
async function runBackgroundExtraction(
  supabase: any,
  lovableApiKey: string,
  userId: string,
  options: { batchSize: number; maxBatches: number; origin?: string }
) {
  const { batchSize, maxBatches, origin } = options;
  
  // Create a sync log entry to track progress
  const { data: logEntry, error: logError } = await supabase
    .from('sync_logs')
    .insert({
      sync_type: 'background-requirements-extraction',
      status: 'running',
      created_by: userId,
      items_processed: 0,
      items_added: 0,
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

  try {
    while (batchesCompleted < maxBatches) {
      // Get legislation without requirements
      const { data: existingReqs } = await supabase
        .from('legal_requirements')
        .select('legislation_id');
      
      const idsWithReqs = new Set(existingReqs?.map((r: any) => r.legislation_id) || []);
      
      // Build query with optional origin filter
      let query = supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin')
        .order('publication_date', { ascending: false });
      
      if (origin === 'PT') {
        query = query.or('origin.eq.PT,origin.eq.dre,origin.is.null');
      } else if (origin === 'EU') {
        query = query.or('origin.eq.EU,origin.eq.eurlex');
      }
      
      const { data: allLegislation } = await query;
      
      const legislationWithoutReqs = allLegislation?.filter((l: any) => !idsWithReqs.has(l.id)) || [];
      const legislationToProcess = legislationWithoutReqs.slice(0, batchSize);

      if (legislationToProcess.length === 0) {
        console.log('All legislation processed, stopping background extraction');
        break;
      }

      console.log(`Background batch ${batchesCompleted + 1}: processing ${legislationToProcess.length} items`);

      // Process this batch
      for (const leg of legislationToProcess) {
        try {
          const prompt = `Analisa o seguinte diploma legal português e extrai os requisitos legais mais importantes.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
SUMÁRIO: ${leg.summary || 'Não disponível'}

Extrai entre 3 a 8 requisitos legais principais. Para cada requisito, indica:
- article: número do artigo (ex: "Art. 5º", "Anexo I", "Art. 12º, n.º 2")
- requirement_text: descrição clara e concisa do requisito ou obrigação legal (máx 200 caracteres)

Retorna APENAS um array JSON válido, sem explicações. Exemplo:
[{"article": "Art. 5º", "requirement_text": "As instalações devem dispor de sistemas de tratamento"}]`;

          const response = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${lovableApiKey}`,
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
            console.error(`AI API error for ${leg.number}:`, response.status);
            
            if (response.status === 429) {
              await new Promise(resolve => setTimeout(resolve, 10000));
            } else if (response.status === 402) {
              console.error('Credits exhausted, stopping');
              throw new Error('Credits exhausted');
            }
            continue;
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
                article: String(r.article || 'Geral').substring(0, 50),
                requirement_text: String(r.requirement_text).substring(0, 500),
              }))
              .slice(0, 10);
              
          } catch (parseError) {
            console.error(`Parse error for ${leg.number}:`, parseError);
            continue;
          }

          if (requirements.length > 0) {
            const toInsert = requirements.map(req => ({
              legislation_id: leg.id,
              article: req.article,
              requirement_text: req.requirement_text,
            }));

            const { error: insertError } = await supabase
              .from('legal_requirements')
              .insert(toInsert);

            if (!insertError) {
              totalRequirements += requirements.length;
              console.log(`Inserted ${requirements.length} requirements for ${leg.number}`);
            }
          }

          totalProcessed++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          console.error(`Error processing ${leg.number}:`, error);
          if ((error as Error).message === 'Credits exhausted') {
            throw error;
          }
        }
      }

      batchesCompleted++;
      
      // Update progress in sync_logs
      await supabase
        .from('sync_logs')
        .update({
          items_processed: totalProcessed,
          items_added: totalRequirements,
        })
        .eq('id', logId);

      console.log(`Completed batch ${batchesCompleted}/${maxBatches}. Total: ${totalProcessed} processed, ${totalRequirements} requirements`);
      
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
      })
      .eq('id', logId);

    console.log(`Background extraction completed: ${totalProcessed} processed, ${totalRequirements} requirements added`);

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const { batchSize = 50, maxBatches = 20, origin } = await req.json();

    console.log(`Starting background extraction: batchSize=${batchSize}, maxBatches=${maxBatches}, origin=${origin || 'all'}`);

    // Start background task using Deno's EdgeRuntime
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      runBackgroundExtraction(supabase, lovableApiKey, userId, { batchSize, maxBatches, origin })
    ) || runBackgroundExtraction(supabase, lovableApiKey, userId, { batchSize, maxBatches, origin });

    // Return immediately
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Extração em segundo plano iniciada. Pode fechar esta janela.',
        trackingType: 'background-requirements-extraction',
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
