import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

interface Category {
  id: string;
  name: string;
  theme_id: string;
  theme_name: string;
  keywords: string[];
}

interface Legislation {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  category: string | null;
}

// Additional keyword mappings for common legislation types
const additionalKeywords: Record<string, string[]> = {
  // Ambiente - Resíduos
  'resíduos': ['resíduo', 'resíduos', 'aterro', 'lixo', 'TGR', 'gestão de resíduos', 'fluxos específicos'],
  // Ambiente - Ar
  'ar': ['emissões atmosféricas', 'qualidade do ar', 'COV', 'poluição atmosférica'],
  // Ambiente - Água  
  'água': ['água', 'hídrico', 'efluentes', 'saneamento', 'ETAR'],
  // Ambiente - Clima
  'clima': ['clima', 'alterações climáticas', 'carbono', 'GEE', 'efeito estufa', 'neutralidade carbónica'],
  // Ambiente - Ruído
  'ruído': ['ruído', 'acústica', 'insonorização', 'sonómetro'],
  // Ambiente - Energia
  'energia': ['energia', 'energético', 'renováveis', 'eficiência energética', 'eletricidade', 'gás natural'],
  // Segurança
  'segurança': ['segurança', 'acidentes', 'prevenção', 'equipamentos de proteção', 'EPI'],
  // SST
  'sst': ['saúde no trabalho', 'segurança no trabalho', 'medicina do trabalho', 'acidentes de trabalho'],
  // Qualidade
  'qualidade': ['qualidade', 'certificação', 'normalização', 'metrologia', 'acreditação'],
  // ESG
  'esg': ['ESG', 'sustentabilidade', 'responsabilidade social', 'governança', 'rótulo ecológico'],
  // Euratom
  'euratom': ['radiação', 'radioativo', 'Euratom', 'nuclear', 'ionizante'],
  // Florestas
  'florestas': ['floresta', 'florestal', 'silvicultura', 'incêndio florestal', 'arborização'],
};

function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove accents
}

function matchesKeyword(text: string, keyword: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  return normalizedText.includes(normalizedKeyword);
}

function findMatchingCategories(
  leg: Legislation,
  categories: Category[]
): string[] {
  const searchText = `${leg.title} ${leg.summary || ''} ${leg.category || ''} ${leg.number}`;
  const matchedCategoryIds = new Set<string>();

  // First, try to match against category keywords from DB
  for (const cat of categories) {
    if (!cat.keywords || cat.keywords.length === 0) continue;
    
    for (const keyword of cat.keywords) {
      if (matchesKeyword(searchText, keyword)) {
        matchedCategoryIds.add(cat.id);
        break;
      }
    }
  }

  // If no matches from DB keywords, try additional keyword mappings
  if (matchedCategoryIds.size === 0) {
    for (const [topic, keywords] of Object.entries(additionalKeywords)) {
      for (const keyword of keywords) {
        if (matchesKeyword(searchText, keyword)) {
          // Find a category that matches this topic
          const matchingCat = categories.find(c => 
            normalizeText(c.name).includes(normalizeText(topic)) ||
            normalizeText(c.theme_name).includes(normalizeText(topic))
          );
          if (matchingCat) {
            matchedCategoryIds.add(matchingCat.id);
          }
          break;
        }
      }
    }
  }

  return Array.from(matchedCategoryIds);
}

async function processInBackground(
  supabase: any,
  legislation: Legislation[],
  categories: Category[],
  logId: string
) {
  let categorized = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < legislation.length; i++) {
    const leg = legislation[i];

    try {
      const matchedIds = findMatchingCategories(leg, categories);

      if (matchedIds.length > 0) {
        // Insert mappings
        const mappings = matchedIds.map(categoryId => ({
          legislation_id: leg.id,
          category_id: categoryId
        }));

        const { error: insertError } = await supabase
          .from('legislation_category_mapping')
          .upsert(mappings, { 
            onConflict: 'legislation_id,category_id',
            ignoreDuplicates: true 
          });

        if (insertError) {
          console.error(`Failed to insert mappings for ${leg.number}:`, insertError);
          failed++;
        } else {
          console.log(`Categorized ${leg.number} -> ${matchedIds.length} categories`);
          categorized++;
        }
      } else {
        console.log(`No category match for ${leg.number}`);
        skipped++;
      }

      // Update progress every 10 items
      if ((i + 1) % 10 === 0 || i === legislation.length - 1) {
        await supabase
          .from('sync_logs')
          .update({
            items_processed: i + 1,
            items_added: categorized,
            items_updated: skipped,
            status: i === legislation.length - 1 ? 'completed' : 'running'
          })
          .eq('id', logId);
      }

    } catch (error) {
      console.error(`Error processing ${leg.number}:`, error);
      failed++;
    }
  }

  // Final update
  await supabase
    .from('sync_logs')
    .update({
      items_processed: legislation.length,
      items_added: categorized,
      items_updated: skipped,
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: failed > 0 ? `${failed} errors during processing` : null
    })
    .eq('id', logId);

  console.log(`Auto-categorization completed: ${categorized} categorized, ${skipped} skipped, ${failed} failed`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 500, background = false, dryRun = false } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get categories with keywords
    const { data: categoriesRaw, error: catError } = await supabase
      .from('theme_categories')
      .select(`
        id,
        name,
        theme_id,
        keywords,
        themes (name)
      `);

    if (catError) throw catError;

    const categories: Category[] = (categoriesRaw || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      theme_id: c.theme_id,
      theme_name: c.themes?.name || '',
      keywords: c.keywords || []
    }));

    console.log(`Loaded ${categories.length} categories`);

    // Get legislation without categories - use LEFT JOIN approach
    // First get all mappings to filter locally (subquery doesn't work in Supabase JS)
    // Get all existing mappings (use high limit to get all)
    const { data: existingMappings } = await supabase
      .from('legislation_category_mapping')
      .select('legislation_id')
      .limit(10000);
    
    const mappedIds = new Set((existingMappings || []).map((m: any) => m.legislation_id));
    
    const { data: allLegislation, error: legError } = await supabase
      .from('legislation')
      .select('id, number, title, summary, category')
      .limit(2000);
    
    if (legError) throw legError;

    const uncategorized = (allLegislation || []).filter((l: any) => !mappedIds.has(l.id)).slice(0, limit);
    console.log(`Found ${uncategorized.length} uncategorized legislation`);

    if (uncategorized.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No uncategorized legislation found', total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Background mode
    if (background) {
      const { data: logData, error: logError } = await supabase
        .from('sync_logs')
        .insert({
          sync_type: 'auto_categorize',
          status: 'running',
          items_processed: 0,
          items_added: 0,
          items_updated: 0
        })
        .select('id')
        .single();

      if (logError) throw logError;

      EdgeRuntime.waitUntil(processInBackground(supabase, uncategorized, categories, logData.id));

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Background job started',
          jobId: logData.id,
          total: uncategorized.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sync mode
    const results: { number: string; categories: string[] }[] = [];
    let categorized = 0;

    for (const leg of uncategorized) {
      const matchedIds = findMatchingCategories(leg, categories);
      if (matchedIds.length > 0 && !dryRun) {
        const mappings = matchedIds.map(categoryId => ({
          legislation_id: leg.id,
          category_id: categoryId
        }));
        await supabase.from('legislation_category_mapping').upsert(mappings, { 
          onConflict: 'legislation_id,category_id',
          ignoreDuplicates: true 
        });
        categorized++;
      }
      if (matchedIds.length > 0) {
        const matchedNames = categories.filter(c => matchedIds.includes(c.id)).map(c => c.name);
        results.push({ number: leg.number, categories: matchedNames });
      }
    }

    return new Response(
      JSON.stringify({ success: true, categorized, total: uncategorized.length, results, dryRun }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
