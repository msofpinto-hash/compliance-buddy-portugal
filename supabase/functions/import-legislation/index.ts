import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LegislationRow {
  descritor: string;
  diploma: string;
  sumario: string;
  alteradoPor: string;
  anoEntradaVigor: string;
  aplicabilidade: string;
  artigoPonto: string;
  titulo: string;
  requisito: string;
  condicao: string;
  observacao: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { themeName, data } = await req.json();

    if (!themeName || !data || !Array.isArray(data)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request. themeName and data array required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting import for theme: ${themeName}, rows: ${data.length}`);

    // 1. Get or create theme
    let themeId: string;
    const { data: existingTheme } = await supabase
      .from('themes')
      .select('id')
      .eq('name', themeName)
      .maybeSingle();

    if (existingTheme) {
      themeId = existingTheme.id;
      console.log(`Using existing theme: ${themeId}`);
    } else {
      const { data: newTheme, error: themeError } = await supabase
        .from('themes')
        .insert({ name: themeName })
        .select('id')
        .single();
      
      if (themeError) throw themeError;
      themeId = newTheme.id;
      console.log(`Created new theme: ${themeId}`);
    }

    // 2. Extract unique descriptors (categories) and diplomas (legislation)
    const uniqueDescritores = new Set<string>();
    const uniqueDiplomas = new Map<string, { sumario: string; anoVigor: string; alteradoPor: string }>();

    for (const row of data as LegislationRow[]) {
      if (row.descritor) {
        uniqueDescritores.add(row.descritor.trim());
      }
      if (row.diploma) {
        const diplomaKey = row.diploma.trim();
        if (!uniqueDiplomas.has(diplomaKey)) {
          uniqueDiplomas.set(diplomaKey, {
            sumario: row.sumario || '',
            anoVigor: row.anoEntradaVigor || '',
            alteradoPor: row.alteradoPor || ''
          });
        }
      }
    }

    console.log(`Unique categories: ${uniqueDescritores.size}, Unique legislation: ${uniqueDiplomas.size}`);

    // 3. Create or get categories
    const categoryMap = new Map<string, string>();
    
    for (const descritor of uniqueDescritores) {
      const { data: existingCat } = await supabase
        .from('theme_categories')
        .select('id')
        .eq('theme_id', themeId)
        .eq('name', descritor)
        .maybeSingle();

      if (existingCat) {
        categoryMap.set(descritor, existingCat.id);
      } else {
        const { data: newCat, error: catError } = await supabase
          .from('theme_categories')
          .insert({ name: descritor, theme_id: themeId })
          .select('id')
          .single();
        
        if (catError) {
          console.error(`Error creating category ${descritor}:`, catError);
          continue;
        }
        categoryMap.set(descritor, newCat.id);
      }
    }

    console.log(`Categories processed: ${categoryMap.size}`);

    // 4. Create legislation and requirements
    const legislationMap = new Map<string, string>();
    let legislationCreated = 0;
    let requirementsCreated = 0;

    for (const [diploma, info] of uniqueDiplomas) {
      // Check if legislation already exists
      const { data: existingLeg } = await supabase
        .from('legislation')
        .select('id')
        .eq('number', diploma)
        .eq('source', 'excel-import')
        .maybeSingle();

      if (existingLeg) {
        legislationMap.set(diploma, existingLeg.id);
        continue;
      }

      // Parse year from anoVigor
      let effectiveYear: string | null = null;
      if (info.anoVigor) {
        const yearMatch = info.anoVigor.match(/\d{4}/);
        if (yearMatch) {
          effectiveYear = `${yearMatch[0]}-01-01`;
        }
      }

      // Determine origin based on diploma text
      let origin = 'Nacional';
      if (diploma.toLowerCase().includes('regulamento (ue)') || 
          diploma.toLowerCase().includes('diretiva') ||
          diploma.toLowerCase().includes('decisão (ue)')) {
        origin = 'União Europeia';
      }

      const { data: newLeg, error: legError } = await supabase
        .from('legislation')
        .insert({
          number: diploma,
          title: diploma,
          summary: info.sumario,
          origin: origin,
          effective_date: effectiveYear,
          source: 'excel-import',
          category: info.alteradoPor ? `Alterado por: ${info.alteradoPor}` : null
        })
        .select('id')
        .single();

      if (legError) {
        console.error(`Error creating legislation ${diploma}:`, legError);
        continue;
      }

      legislationMap.set(diploma, newLeg.id);
      legislationCreated++;
    }

    console.log(`Legislation created: ${legislationCreated}`);

    // 5. Create legislation-category mappings
    const mappingsToCreate: { legislation_id: string; category_id: string }[] = [];
    const existingMappings = new Set<string>();

    for (const row of data as LegislationRow[]) {
      if (!row.diploma || !row.descritor) continue;

      const legislationId = legislationMap.get(row.diploma.trim());
      const categoryId = categoryMap.get(row.descritor.trim());

      if (legislationId && categoryId) {
        const mappingKey = `${legislationId}-${categoryId}`;
        if (!existingMappings.has(mappingKey)) {
          existingMappings.add(mappingKey);
          mappingsToCreate.push({
            legislation_id: legislationId,
            category_id: categoryId
          });
        }
      }
    }

    // Insert mappings in batches
    if (mappingsToCreate.length > 0) {
      // Check which mappings already exist
      const { data: existingDbMappings } = await supabase
        .from('legislation_category_mapping')
        .select('legislation_id, category_id');

      const existingDbSet = new Set(
        (existingDbMappings || []).map(m => `${m.legislation_id}-${m.category_id}`)
      );

      const newMappings = mappingsToCreate.filter(
        m => !existingDbSet.has(`${m.legislation_id}-${m.category_id}`)
      );

      if (newMappings.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < newMappings.length; i += batchSize) {
          const batch = newMappings.slice(i, i + batchSize);
          const { error: mapError } = await supabase
            .from('legislation_category_mapping')
            .insert(batch);
          
          if (mapError) {
            console.error(`Error creating mappings batch:`, mapError);
          }
        }
      }
      console.log(`Mappings created: ${newMappings.length}`);
    }

    // 6. Create legal requirements
    for (const row of data as LegislationRow[]) {
      if (!row.diploma || !row.requisito) continue;

      const legislationId = legislationMap.get(row.diploma.trim());
      if (!legislationId) continue;

      // Check if requirement already exists
      const articleKey = row.artigoPonto?.trim() || '';
      const requirementText = row.requisito.trim();
      
      const { data: existingReq } = await supabase
        .from('legal_requirements')
        .select('id')
        .eq('legislation_id', legislationId)
        .eq('article', articleKey)
        .maybeSingle();

      if (existingReq) continue;

      const notes = [
        row.titulo ? `Título: ${row.titulo}` : '',
        row.condicao ? `Condição: ${row.condicao}` : '',
        row.observacao ? `Observação: ${row.observacao}` : '',
        row.aplicabilidade ? `Aplicabilidade: ${row.aplicabilidade}` : ''
      ].filter(n => n).join('\n');

      const { error: reqError } = await supabase
        .from('legal_requirements')
        .insert({
          legislation_id: legislationId,
          article: articleKey,
          requirement_text: requirementText,
          notes: notes || null
        });

      if (reqError) {
        console.error(`Error creating requirement:`, reqError);
        continue;
      }

      requirementsCreated++;
    }

    console.log(`Requirements created: ${requirementsCreated}`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          categoriesCreated: categoryMap.size,
          legislationCreated,
          requirementsCreated,
          totalRowsProcessed: data.length
        }
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
