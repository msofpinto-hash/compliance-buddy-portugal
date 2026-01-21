import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedLegislation {
  number: string;
  title: string;
  summary: string | null;
  publicationDate: string | null;
  categoryPath: string;
  origin: 'PT' | 'EU';
}

// Validate and sanitize dates - reject invalid years (> current+1 or < 1900)
function sanitizeDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const currentYear = new Date().getFullYear();
    
    // Valid year range: 1900 to current year + 1
    if (year >= 1900 && year <= currentYear + 1) {
      return dateStr;
    }
    
    console.warn(`Invalid date year ${year} detected in "${dateStr}", setting date to null`);
    return null;
  } catch {
    return null;
  }
}

// Parse date from diploma number like "Portaria n.º 481/2025/1 de 31 de dezembro"
// or "Regulamento Delegado (UE) 2025/2003 de 8 de setembro de 2025"
function parseDateFromDiploma(diploma: string): string | null {
  const months: Record<string, string> = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
  };

  // Match patterns like "de 31 de dezembro de 2025" or "de 9 de maio"
  const dateMatchFull = diploma.match(/de\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (dateMatchFull) {
    const day = dateMatchFull[1].padStart(2, '0');
    const monthName = dateMatchFull[2].toLowerCase();
    const year = dateMatchFull[3];
    const month = months[monthName];
    if (month) {
      return sanitizeDate(`${year}-${month}-${day}`);
    }
  }

  // Match patterns like "de 31 de dezembro" and extract year from number
  const dateMatch = diploma.match(/de\s+(\d{1,2})\s+de\s+(\w+)$/i);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const monthName = dateMatch[2].toLowerCase();
    const month = months[monthName];
    
    // Try to extract year from the diploma number
    const yearMatch = diploma.match(/(\d{4})/);
    if (yearMatch && month) {
      const result = `${yearMatch[1]}-${month}-${day}`;
      return sanitizeDate(result);
    }
  }
  return null;
}

// Parse the SIAWISE PDF text content to extract legislation entries
// SIAWISE format has diplomas separated by multiple spaces, with format:
// "Portaria n.º 481/2025/1 de 31 de dezembro     Estabelece o regime de apoio..."
function parsePdfContent(content: string): ParsedLegislation[] {
  const legislation: ParsedLegislation[] = [];
  
  console.log('Content length:', content.length);
  console.log('Content sample (first 2000 chars):', content.substring(0, 2000));
  
  // Clean noise patterns from content
  let cleanedContent = content
    .replace(/©\s*SIAWISE[^]*?(?=Portaria|Lei|Decreto|Despacho|Regulamento|Aviso|Declaração|Diretiva|Decisão|Resolução|Acórdão|Deliberação|\d+\/\d+|$)/gi, ' ')
    .replace(/Mariana\s+Pinto[^]*?\d+\/\d+/gi, ' ')
    .replace(/RELATÓRIO\s+LEGISLAÇÃO/gi, ' ')
    .replace(/\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}/g, ' ')
    .replace(/\d+\/\d{4,}\s+/g, ' '); // Page numbers like "1/2435"
  
  // Theme markers to track current category
  const themeMarkers = ['Qualidade', 'Ambiente', 'Segurança', 'Energia', 'Alimentar', 'SST', 'Geral'];
  let currentCategory = 'Geral';
  
  // Check for theme at the start
  for (const theme of themeMarkers) {
    if (cleanedContent.toLowerCase().includes(theme.toLowerCase())) {
      currentCategory = theme;
      break;
    }
  }
  
  // PT Diploma types
  const ptTypes = [
    'Portaria', 'Lei', 'Decreto-Lei', 'Decreto', 'Despacho', 
    'Resolução', 'Declaração', 'Aviso', 'Acórdão', 'Deliberação',
    'Declaração de Retificação'
  ];
  
  // EU Diploma types  
  const euTypes = [
    'Regulamento Delegado \\(UE\\)',
    'Regulamento de Execução \\(UE\\)',
    'Regulamento \\(UE\\)',
    'Regulamento \\(CE\\)',
    'Retificação do Regulamento \\(UE\\)',
    'Retificação do Regulamento \\(CE\\)',
    'Diretiva \\(UE\\)',
    'Diretiva',
    'Decisão \\(UE\\)',
    'Decisão de Execução \\(UE\\)',
    'Recomendação \\(UE\\)'
  ];
  
  // Combined regex to find all diplomas
  const allTypes = [...euTypes, ...ptTypes.map(t => t.replace('-', '\\-'))];
  const diplomaRegex = new RegExp(
    `(${allTypes.join('|')})\\s+(?:n\\.?º?\\s*)?([\\w\\-\\.\\/]+(?:\\/\\d+)?)\\s+de\\s+(\\d{1,2})\\s+de\\s+(\\w+)(?:\\s+de\\s+(\\d{4}))?`,
    'gi'
  );
  
  console.log('Searching for diplomas with pattern...');
  
  let match;
  let count = 0;
  const seenNumbers = new Set<string>();
  
  while ((match = diplomaRegex.exec(cleanedContent)) !== null) {
    const type = match[1];
    const number = match[2];
    const day = match[3];
    const month = match[4];
    const yearFromDate = match[5];
    
    // Extract year from number if not in date
    const yearMatch = number.match(/(\d{4})/);
    const year = yearFromDate || (yearMatch ? yearMatch[1] : null);
    
    // Build diploma string
    const diplomaStr = `${type} n.º ${number} de ${day} de ${month}${yearFromDate ? ' de ' + yearFromDate : ''}`;
    
    // Skip duplicates
    const normalizedNum = diplomaStr.toLowerCase().replace(/\s+/g, ' ');
    if (seenNumbers.has(normalizedNum)) {
      continue;
    }
    seenNumbers.add(normalizedNum);
    
    // Determine origin
    const isEU = /regulamento|diretiva|decisão|recomendação/i.test(type) && /\(ue\)|\(ce\)/i.test(type);
    
    // Try to extract summary (text after the diploma until next diploma or end)
    const afterMatch = cleanedContent.substring(match.index + match[0].length);
    const nextDiplomaMatch = afterMatch.match(new RegExp(`(${allTypes.join('|')})\\s+(?:n\\.?º?\\s*)?`, 'i'));
    let summary = '';
    if (nextDiplomaMatch) {
      summary = afterMatch.substring(0, nextDiplomaMatch.index).trim();
    } else {
      summary = afterMatch.substring(0, 500).trim(); // Take up to 500 chars
    }
    
    // Clean summary
    summary = summary
      .replace(/\s+/g, ' ')
      .replace(/^[\s\.,;]+/, '')
      .trim();
    
    // Only use summary if it looks valid
    const validSummary = summary.length > 15 && 
      summary.length < 1000 &&
      /^[A-Za-zÀ-ÿ]/.test(summary);
    
    // Parse date
    const months: Record<string, string> = {
      'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
      'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
      'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
    };
    
    let publicationDate: string | null = null;
    if (year && months[month.toLowerCase()]) {
      publicationDate = `${year}-${months[month.toLowerCase()]}-${day.padStart(2, '0')}`;
    }
    
    legislation.push({
      number: diplomaStr,
      title: diplomaStr,
      summary: validSummary ? summary : null,
      publicationDate,
      categoryPath: currentCategory,
      origin: isEU ? 'EU' : 'PT'
    });
    
    count++;
    if (count <= 5) {
      console.log(`Found diploma ${count}: "${diplomaStr}" origin=${isEU ? 'EU' : 'PT'}`);
    }
  }
  
  console.log(`Total entries parsed: ${legislation.length}`);
  
  return legislation;
}

// Find the best matching category in the database
async function findMatchingCategory(
  supabase: any,
  categoryPath: string,
  categoriesCache: Map<string, { id: string; theme_id: string; name: string; parent_id: string | null }[]>
): Promise<string | null> {
  // Simple theme name mapping
  const themeName = categoryPath.split(/[\/\|]/)[0].trim();
  
  if (!themeName) return null;
  
  // Get all categories for this theme
  let themeCategories = categoriesCache.get(themeName);
  if (!themeCategories) {
    const { data: theme } = await supabase
      .from('themes')
      .select('id')
      .ilike('name', `%${themeName}%`)
      .maybeSingle();
    
    if (!theme) {
      // Try to find any theme with a similar name
      const { data: anyTheme } = await supabase
        .from('themes')
        .select('id, name')
        .limit(1)
        .single();
      
      if (!anyTheme) return null;
      
      const { data: categories } = await supabase
        .from('theme_categories')
        .select('id, name, parent_id, theme_id')
        .eq('theme_id', anyTheme.id)
        .is('parent_id', null) // Get root categories
        .limit(1);
      
      if (categories && categories.length > 0) {
        return categories[0].id;
      }
      return null;
    }
    
    const { data: categories } = await supabase
      .from('theme_categories')
      .select('id, name, parent_id, theme_id')
      .eq('theme_id', theme.id);
    
    themeCategories = categories || [];
    categoriesCache.set(themeName, themeCategories as { id: string; theme_id: string; name: string; parent_id: string | null }[]);
  }
  
  if (!themeCategories || themeCategories.length === 0) return null;
  
  // Return the first root category for this theme
  const rootCategory = themeCategories.find(c => !c.parent_id);
  return rootCategory?.id || themeCategories[0]?.id || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing Authorization header' }),
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
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Only admins can import legislation
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Authenticated admin user: ${userId}`);

    const { pdfContent, textContent } = await req.json();

    if (!pdfContent && !textContent) {
      return new Response(
        JSON.stringify({ error: 'pdfContent or textContent is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting PDF import...');

    let textToProcess: string;
    
    if (textContent) {
      // Direct text content provided - preferred method
      textToProcess = textContent;
      console.log(`Text content length: ${textToProcess.length} characters`);
    } else {
      return new Response(
        JSON.stringify({ 
          error: 'Por favor forneça o texto já extraído do PDF no campo textContent.',
          suggestion: 'A extração de PDF é feita no lado do cliente para melhor performance.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const parsedLegislation = parsePdfContent(textToProcess);
    console.log(`Parsed ${parsedLegislation.length} legislation entries`);

    if (parsedLegislation.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Não foram encontrados diplomas no texto. Verifique se o formato é compatível.',
          stats: {
            totalParsed: 0,
            created: 0,
            skipped: 0,
            mappingsCreated: 0,
            errors: []
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get existing legislation to avoid duplicates - fetch all for comparison
    const { data: existingLegislation, error: fetchError } = await supabase
      .from('legislation')
      .select('number, title');
    
    if (fetchError) {
      console.error('Error fetching existing legislation:', fetchError);
    }
    
    // Normalize function for consistent comparison
    const normalizeForComparison = (text: string): string => {
      return text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/n\.º\s*/g, 'n.º ')
        .replace(/nº\s*/g, 'n.º ')
        .replace(/\(\s*ue\s*\)/gi, '(UE)')
        .replace(/\(\s*ce\s*\)/gi, '(CE)');
    };
    
    const existingNumbers = new Set(
      (existingLegislation || []).map(l => normalizeForComparison(l.number))
    );
    
    // Also check by title for EU legislation that might have different number formats
    const existingTitles = new Set(
      (existingLegislation || [])
        .filter(l => l.title)
        .map(l => normalizeForComparison(l.title))
    );
    
    console.log(`Found ${existingNumbers.size} existing legislation entries for duplicate check`);

    // Cache for categories
    const categoriesCache = new Map<string, any[]>();
    
    let created = 0;
    let skipped = 0;
    let mappingsCreated = 0;
    const errors: string[] = [];
    const skippedDuplicates: string[] = [];

    for (const leg of parsedLegislation) {
      // Skip if already exists (check with normalization)
      const normalizedNumber = normalizeForComparison(leg.number);
      const normalizedTitle = normalizeForComparison(leg.title);
      
      if (existingNumbers.has(normalizedNumber) || existingTitles.has(normalizedTitle)) {
        skipped++;
        if (skippedDuplicates.length < 10) {
          skippedDuplicates.push(leg.number.substring(0, 60));
        }
        continue;
      }

      // Create legislation
      const { data: newLeg, error: legError } = await supabase
        .from('legislation')
        .insert({
          number: leg.number,
          title: leg.title,
          summary: leg.summary,
          publication_date: leg.publicationDate,
          origin: leg.origin,
          source: 'pdf-import'
        })
        .select('id')
        .single();

      if (legError) {
        errors.push(`Error creating ${leg.number}: ${legError.message}`);
        continue;
      }

      created++;
      existingNumbers.add(normalizedNumber);

      // Find and create category mapping
      const categoryId = await findMatchingCategory(supabase, leg.categoryPath, categoriesCache);
      
      if (categoryId) {
        const { error: mapError } = await supabase
          .from('legislation_category_mapping')
          .insert({
            legislation_id: newLeg.id,
            category_id: categoryId
          });
        
        if (!mapError) {
          mappingsCreated++;
        }
      }
    }

    console.log(`Import complete: ${created} created, ${skipped} skipped (duplicates), ${mappingsCreated} mappings, ${errors.length} errors`);
    if (skippedDuplicates.length > 0) {
      console.log(`Sample duplicates skipped: ${skippedDuplicates.join(', ')}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          totalParsed: parsedLegislation.length,
          created,
          skipped,
          mappingsCreated,
          errors: errors.slice(0, 10),
          skippedDuplicates: skippedDuplicates
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
