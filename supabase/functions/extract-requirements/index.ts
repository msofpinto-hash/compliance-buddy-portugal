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
  requirements: Requirement[];
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { legislationIds, limit, dryRun } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get legislation to process
    let query = supabase
      .from('legislation')
      .select('id, number, title, summary, document_url')
      .order('publication_date', { ascending: false });

    if (legislationIds && legislationIds.length > 0) {
      query = query.in('id', legislationIds);
    } else {
      // Get legislation without requirements
      const { data: existingReqs } = await supabase
        .from('legal_requirements')
        .select('legislation_id');
      
      const idsWithReqs = new Set(existingReqs?.map(r => r.legislation_id) || []);
      
      const { data: allLegislation } = await supabase
        .from('legislation')
        .select('id, number, title, summary, document_url')
        .order('publication_date', { ascending: false });
      
      const legislationWithoutReqs = allLegislation?.filter(l => !idsWithReqs.has(l.id)) || [];
      
      const toProcess = legislationWithoutReqs.slice(0, limit || 10);
      
      if (toProcess.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Todos os diplomas já têm requisitos',
            processed: 0,
            results: []
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      query = supabase
        .from('legislation')
        .select('id, number, title, summary, document_url')
        .in('id', toProcess.map(l => l.id));
    }

    const { data: legislation, error: legError } = await query;

    if (legError) {
      console.error('Error fetching legislation:', legError);
      return new Response(
        JSON.stringify({ success: false, error: legError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${legislation?.length || 0} legislation items`);

    const results: ExtractionResult[] = [];
    let totalRequirements = 0;

    for (const leg of legislation || []) {
      console.log(`Extracting requirements from: ${leg.number}`);
      
      try {
        const prompt = `Analisa o seguinte diploma legal português e extrai os requisitos legais mais importantes.
Para cada requisito, indica o artigo ou secção e o texto do requisito de forma clara e concisa.

DIPLOMA: ${leg.number}
TÍTULO: ${leg.title}
SUMÁRIO: ${leg.summary || 'Não disponível'}

Extrai entre 3 a 10 requisitos legais principais. Para cada requisito:
- article: número do artigo (ex: "Art. 5º", "Anexo I", "Art. 12º, n.º 2")
- requirement_text: descrição clara do requisito ou obrigação legal

Retorna APENAS um array JSON válido com os requisitos, sem explicações adicionais.
Exemplo de formato:
[
  {"article": "Art. 5º", "requirement_text": "As instalações devem dispor de sistemas de tratamento de águas residuais"},
  {"article": "Art. 12º", "requirement_text": "É obrigatória a monitorização mensal das emissões atmosféricas"}
]`;

        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'És um especialista em legislação portuguesa. Extrai requisitos legais de forma precisa e estruturada. Responde apenas com JSON válido.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`AI API error for ${leg.number}:`, response.status, errorText);
          
          if (response.status === 429) {
            results.push({ legislationId: leg.id, requirements: [], error: 'Rate limit - aguardar' });
            // Wait before continuing
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          
          results.push({ legislationId: leg.id, requirements: [], error: `API error: ${response.status}` });
          continue;
        }

        const aiData = await response.json();
        const content = aiData.choices?.[0]?.message?.content || '';
        
        console.log(`AI response for ${leg.number}:`, content.substring(0, 200));

        // Parse the JSON response
        let requirements: Requirement[] = [];
        try {
          // Clean up the response - remove markdown code blocks if present
          let jsonContent = content.trim();
          if (jsonContent.startsWith('```json')) {
            jsonContent = jsonContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
          } else if (jsonContent.startsWith('```')) {
            jsonContent = jsonContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
          }
          
          requirements = JSON.parse(jsonContent);
          
          if (!Array.isArray(requirements)) {
            requirements = [];
          }
        } catch (parseError) {
          console.error(`Parse error for ${leg.number}:`, parseError);
          results.push({ legislationId: leg.id, requirements: [], error: 'Failed to parse AI response' });
          continue;
        }

        // Insert requirements if not dry run
        if (!dryRun && requirements.length > 0) {
          const toInsert = requirements.map(req => ({
            legislation_id: leg.id,
            article: req.article || 'Geral',
            requirement_text: req.requirement_text,
          }));

          const { error: insertError } = await supabase
            .from('legal_requirements')
            .insert(toInsert);

          if (insertError) {
            console.error(`Insert error for ${leg.number}:`, insertError);
            results.push({ legislationId: leg.id, requirements, error: insertError.message });
            continue;
          }
        }

        totalRequirements += requirements.length;
        results.push({ legislationId: leg.id, requirements });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error processing ${leg.number}:`, error);
        results.push({ 
          legislationId: leg.id, 
          requirements: [], 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    console.log(`Extraction complete: ${successful} successful, ${failed} failed, ${totalRequirements} requirements total`);

    return new Response(
      JSON.stringify({ 
        success: true,
        dryRun: !!dryRun,
        processed: results.length,
        successful,
        failed,
        totalRequirements,
        results: results.map(r => ({
          legislationId: r.legislationId,
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
