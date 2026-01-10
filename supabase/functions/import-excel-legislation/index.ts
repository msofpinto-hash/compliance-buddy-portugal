import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExcelRow {
  temas: string;
  descritor: string;
  diploma: string;
  sumario: string;
  alteradoPor: string;
  aplicabilidade: string;
  condicao: string;
}

// Parse date from diploma string like "Lei n.º 1/2005, de 12 de agosto"
function parseDateFromDiploma(diploma: string): string | null {
  const months: { [key: string]: string } = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
  };
  
  const dateMatch = diploma.match(/de\s+(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const monthName = dateMatch[2].toLowerCase();
    const month = months[monthName];
    let year = dateMatch[3];
    
    if (!year) {
      const yearMatch = diploma.match(/\/(\d{4})/);
      if (yearMatch) year = yearMatch[1];
    }
    
    if (month && year) {
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

// Parse markdown table rows into structured data
function parseMarkdownTable(content: string): ExcelRow[] {
  const rows: ExcelRow[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Skip header rows and separator rows
    if (!line.startsWith('|') || line.includes('|-') || line.includes('Temas|Descritor')) continue;
    
    // Parse table row
    const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
    
    if (cells.length >= 4) {
      // Find the diploma cell (contains patterns like "Lei", "Decreto", "Portaria", etc.)
      let temas = '';
      let descritor = '';
      let diploma = '';
      let sumario = '';
      let alteradoPor = '';
      let aplicabilidade = '';
      let condicao = '';
      
      // The structure is: Temas | Descritor | Diploma | Sumário | Alterado por | Aplicabilidade | Condição
      if (cells.length >= 7) {
        temas = cells[0] || '';
        descritor = cells[1] || '';
        diploma = cells[2] || '';
        sumario = cells[3] || '';
        alteradoPor = cells[4] || '';
        aplicabilidade = cells[5] || '';
        condicao = cells[6] || '';
      } else if (cells.length >= 4) {
        temas = cells[0] || '';
        descritor = cells[1] || '';
        diploma = cells[2] || '';
        sumario = cells[3] || '';
        if (cells.length > 4) alteradoPor = cells[4] || '';
        if (cells.length > 5) aplicabilidade = cells[5] || '';
        if (cells.length > 6) condicao = cells[6] || '';
      }
      
      // Validate that diploma looks like legislation
      const diplomaPatterns = ['lei', 'decreto', 'portaria', 'regulamento', 'despacho', 'resolução', 'diretiva', 'decisão'];
      const isValidDiploma = diplomaPatterns.some(p => diploma.toLowerCase().includes(p));
      
      if (diploma && isValidDiploma) {
        rows.push({
          temas,
          descritor,
          diploma,
          sumario: sumario.replace(/<br\/>/g, '\n'),
          alteradoPor: alteradoPor.replace(/<br\/>/g, '\n'),
          aplicabilidade,
          condicao
        });
      }
    }
  }
  
  return rows;
}

// Build category hierarchy from descritor (e.g., "Licenciamento - Licenciamento municipal - A - Diplomas")
async function getOrCreateCategoryHierarchy(
  supabase: any, 
  themeId: string, 
  descritor: string,
  categoryCache: Map<string, string>
): Promise<string | null> {
  if (!descritor) return null;
  
  const cacheKey = `${themeId}:${descritor}`;
  if (categoryCache.has(cacheKey)) {
    return categoryCache.get(cacheKey)!;
  }
  
  // Split by " - " to get hierarchy parts
  const parts = descritor.split(' - ').map(p => p.trim()).filter(p => p);
  
  let parentId: string | null = null;
  let lastCategoryId: string | null = null;
  
  for (const part of parts) {
    const partCacheKey: string = `${themeId}:${parentId}:${part}`;
    
    if (categoryCache.has(partCacheKey)) {
      lastCategoryId = categoryCache.get(partCacheKey)!;
      parentId = lastCategoryId;
      continue;
    }
    
    // Check if category exists
    let query = supabase
      .from('theme_categories')
      .select('id')
      .eq('theme_id', themeId)
      .eq('name', part);
    
    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null);
    }
    
    const { data: existing } = await query.maybeSingle();
    
    if (existing) {
      lastCategoryId = existing.id;
      categoryCache.set(partCacheKey, existing.id);
    } else {
      // Create new category
      const { data: newCat, error } = await supabase
        .from('theme_categories')
        .insert({
          theme_id: themeId,
          name: part,
          parent_id: parentId
        })
        .select('id')
        .single();
      
      if (error) {
        console.error(`Error creating category ${part}:`, error);
        continue;
      }
      
      lastCategoryId = newCat.id;
      categoryCache.set(partCacheKey, newCat.id);
    }
    
    parentId = lastCategoryId;
  }
  
  if (lastCategoryId) {
    categoryCache.set(cacheKey, lastCategoryId);
  }
  
  return lastCategoryId;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { textContent, themeName } = await req.json();

    if (!textContent) {
      return new Response(
        JSON.stringify({ error: 'textContent is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting Excel import...');
    console.log(`Content length: ${textContent.length} characters`);

    // Parse the markdown table
    const rows = parseMarkdownTable(textContent);
    console.log(`Parsed ${rows.length} legislation entries`);

    // Theme mapping (códigos para nomes)
    const themeMap: { [key: string]: string } = {
      'A': 'Ambiente',
      'Q': 'Qualidade',
      'S': 'Segurança',
      'SA': 'Segurança Alimentar',
      'E': 'Energia',
      'F': 'FINVERDE',
      'S2': 'Segurança 2',
      'CF': 'Conciliação Familiar'
    };

    // Get or create themes
    const themeIdMap = new Map<string, string>();
    
    for (const [code, name] of Object.entries(themeMap)) {
      const { data: existing } = await supabase
        .from('themes')
        .select('id')
        .eq('name', name)
        .maybeSingle();
      
      if (existing) {
        themeIdMap.set(code, existing.id);
      } else {
        const { data: newTheme, error } = await supabase
          .from('themes')
          .insert({ name })
          .select('id')
          .single();
        
        if (!error && newTheme) {
          themeIdMap.set(code, newTheme.id);
        }
      }
    }

    // If specific theme provided, use that
    let defaultThemeId: string | null = null;
    if (themeName) {
      const { data: theme } = await supabase
        .from('themes')
        .select('id')
        .eq('name', themeName)
        .maybeSingle();
      
      if (theme) {
        defaultThemeId = theme.id;
      }
    }

    // Category cache for performance
    const categoryCache = new Map<string, string>();

    let created = 0;
    let skipped = 0;
    let mappingsCreated = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        // Check if legislation already exists
        const { data: existing } = await supabase
          .from('legislation')
          .select('id')
          .eq('number', row.diploma)
          .maybeSingle();

        let legislationId: string;

        if (existing) {
          legislationId = existing.id;
          skipped++;
        } else {
          // Parse publication date from diploma
          const publicationDate = parseDateFromDiploma(row.diploma);
          
          // Determine origin
          let origin = 'PT';
          if (row.diploma.toLowerCase().includes('regulamento (ue)') || 
              row.diploma.toLowerCase().includes('diretiva') ||
              row.diploma.toLowerCase().includes('decisão (ue)')) {
            origin = 'EU';
          }

          const { data: newLeg, error: legError } = await supabase
            .from('legislation')
            .insert({
              number: row.diploma,
              title: row.diploma,
              summary: row.sumario || null,
              origin: origin,
              publication_date: publicationDate,
              source: 'excel-import',
              category: row.aplicabilidade || null
            })
            .select('id')
            .single();

          if (legError) {
            console.error(`Error creating legislation: ${legError.message}`);
            errors++;
            continue;
          }

          legislationId = newLeg.id;
          created++;
        }

        // Parse theme codes and create category mappings
        const themeCodes = row.temas.split('/').map(t => t.trim()).filter(t => t);
        
        for (const code of themeCodes) {
          const themeId = themeIdMap.get(code) || defaultThemeId;
          if (!themeId) continue;

          // Get or create category hierarchy
          const categoryId = await getOrCreateCategoryHierarchy(
            supabase,
            themeId,
            row.descritor,
            categoryCache
          );

          if (categoryId) {
            // Check if mapping exists
            const { data: existingMapping } = await supabase
              .from('legislation_category_mapping')
              .select('id')
              .eq('legislation_id', legislationId)
              .eq('category_id', categoryId)
              .maybeSingle();

            if (!existingMapping) {
              const { error: mapError } = await supabase
                .from('legislation_category_mapping')
                .insert({
                  legislation_id: legislationId,
                  category_id: categoryId
                });

              if (!mapError) {
                mappingsCreated++;
              }
            }
          }
        }
      } catch (rowError) {
        console.error(`Error processing row:`, rowError);
        errors++;
      }
    }

    console.log(`Import complete: ${created} created, ${skipped} skipped, ${mappingsCreated} mappings, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          totalParsed: rows.length,
          created,
          skipped,
          mappingsCreated,
          errors
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
