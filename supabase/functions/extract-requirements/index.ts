import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Requirement {
  article: string;
  requirement_text: string;
}

interface ExtractionResult {
  legislationId: string;
  legislationNumber: string;
  requirements: Requirement[];
  error?: string;
}

// Use Lovable AI gateway - no external API key required
const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

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
        JSON.stringify({ success: false, error: 'Unauthorized - missing Authorization header' }),
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

    console.log(`Authenticated admin user: ${userId}`);

    const { legislationIds, limit, dryRun, origin } = await req.json();

    // Get legislation to process
    let legislationToProcess: any[] = [];

    if (legislationIds && legislationIds.length > 0) {
      const { data, error } = await supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin')
        .in('id', legislationIds);
      
      if (error) throw error;
      legislationToProcess = data || [];
    } else {
      // Get legislation without requirements
      const { data: existingReqs } = await supabase
        .from('legal_requirements')
        .select('legislation_id');
      
      const idsWithReqs = new Set(existingReqs?.map(r => r.legislation_id) || []);
      
      // Build query with optional origin filter
      let query = supabase
        .from('legislation')
        .select('id, number, title, summary, document_url, origin')
        .order('publication_date', { ascending: false });
      
      // Apply origin filter if specified
      if (origin === 'PT') {
        query = query.or('origin.eq.PT,origin.eq.dre,origin.is.null');
      } else if (origin === 'EU') {
        query = query.or('origin.eq.EU,origin.eq.eurlex');
      }
      
      const { data: allLegislation } = await query;
      
      const legislationWithoutReqs = allLegislation?.filter(l => !idsWithReqs.has(l.id)) || [];
      legislationToProcess = legislationWithoutReqs.slice(0, limit || 10);
    }

    if (legislationToProcess.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Todos os diplomas já têm requisitos',
          processed: 0,
          successful: 0,
          failed: 0,
          totalRequirements: 0,
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${legislationToProcess.length} legislation items`);

    const results: ExtractionResult[] = [];
    let totalRequirements = 0;
    let consecutiveErrors = 0;

    for (const leg of legislationToProcess) {
      console.log(`Extracting requirements from: ${leg.number}`);
      
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
          const errorText = await response.text();
          console.error(`AI API error for ${leg.number}:`, response.status, errorText);
          
          consecutiveErrors++;
          
          if (response.status === 429) {
            results.push({ legislationId: leg.id, legislationNumber: leg.number, requirements: [], error: 'Rate limit - aguardar' });
            await new Promise(resolve => setTimeout(resolve, 10000));
            continue;
          }
          
          if (response.status === 402) {
            results.push({ legislationId: leg.id, legislationNumber: leg.number, requirements: [], error: 'Créditos insuficientes' });
            // Stop processing if we hit payment issues
            if (consecutiveErrors > 3) {
              console.error('Too many consecutive payment errors, stopping');
              break;
            }
            continue;
          }
          
          results.push({ legislationId: leg.id, legislationNumber: leg.number, requirements: [], error: `API error: ${response.status}` });
          continue;
        }

        // Reset consecutive errors on success
        consecutiveErrors = 0;

        const aiData = await response.json();
        const content = aiData.choices?.[0]?.message?.content || '';
        
        console.log(`AI response for ${leg.number}:`, content.substring(0, 150));

        // Parse the JSON response
        let requirements: Requirement[] = [];
        try {
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
          
          requirements = JSON.parse(jsonContent);
          
          if (!Array.isArray(requirements)) {
            requirements = [];
          }
          
          // Validate and clean requirements
          requirements = requirements
            .filter(r => r && typeof r === 'object' && r.requirement_text)
            .map(r => ({
              article: String(r.article || 'Geral').substring(0, 50),
              requirement_text: String(r.requirement_text).substring(0, 500),
            }))
            .slice(0, 10); // Max 10 requirements per legislation
            
        } catch (parseError) {
          console.error(`Parse error for ${leg.number}:`, parseError, 'Content:', content.substring(0, 200));
          results.push({ legislationId: leg.id, legislationNumber: leg.number, requirements: [], error: 'Erro ao processar resposta IA' });
          continue;
        }

        // Insert requirements if not dry run
        if (!dryRun && requirements.length > 0) {
          const toInsert = requirements.map(req => ({
            legislation_id: leg.id,
            article: req.article,
            requirement_text: req.requirement_text,
          }));

          const { error: insertError } = await supabase
            .from('legal_requirements')
            .insert(toInsert);

          if (insertError) {
            console.error(`Insert error for ${leg.number}:`, insertError);
            results.push({ legislationId: leg.id, legislationNumber: leg.number, requirements, error: insertError.message });
            continue;
          }
          
          console.log(`Inserted ${requirements.length} requirements for ${leg.number}`);
        }

        totalRequirements += requirements.length;
        results.push({ legislationId: leg.id, legislationNumber: leg.number, requirements });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({ 
          legislationId: leg.id, 
          legislationNumber: leg.number,
          requirements: [], 
          error: error instanceof Error ? error.message : 'Erro desconhecido' 
        });
      }
    }

    const successful = results.filter(r => !r.error && r.requirements.length > 0).length;
    const failed = results.filter(r => r.error).length;
    const noRequirements = results.filter(r => !r.error && r.requirements.length === 0).length;

    console.log(`Extraction complete: ${successful} successful, ${failed} failed, ${noRequirements} no requirements, ${totalRequirements} total requirements`);

    return new Response(
      JSON.stringify({ 
        success: true,
        dryRun: !!dryRun,
        processed: results.length,
        successful,
        failed,
        noRequirements,
        totalRequirements,
        results: results.map(r => ({
          legislationId: r.legislationId,
          legislationNumber: r.legislationNumber,
          requirementsCount: r.requirements.length,
          error: r.error,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Extract requirements error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
