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
}

// Parse date from diploma number like "Portaria n.º 481/2025/1 de 31 de dezembro"
function parseDateFromDiploma(diploma: string): string | null {
  const months: Record<string, string> = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
  };

  // Match patterns like "de 31 de dezembro" or "de 9 de maio"
  const dateMatch = diploma.match(/de\s+(\d{1,2})\s+de\s+(\w+)$/i);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const monthName = dateMatch[2].toLowerCase();
    const month = months[monthName];
    
    // Try to extract year from the diploma number
    const yearMatch = diploma.match(/\/(\d{4})/);
    if (yearMatch && month) {
      return `${yearMatch[1]}-${month}-${day}`;
    }
  }
  return null;
}

// Parse the PDF text content to extract legislation entries
function parsePdfContent(content: string): ParsedLegislation[] {
  const legislation: ParsedLegislation[] = [];
  const lines = content.split('\n');
  
  let currentCategory = '';
  let currentDiploma = '';
  let currentSummary = '';
  
  // Patterns to identify different elements
  const categoryPattern = /^#\s*(Ambiente|Segurança|Qualidade|Energia|Alimentar)\s*\/\s*(.+)$/;
  const diplomaPattern = /^(?:#\s*)?(Lei|Decreto-Lei|Decreto|Portaria|Despacho|Resolução|Regulamento|Declaração|Aviso|Acórdão|Deliberação)\s+(?:n\.º\s*)?[\w\-\.\/]+.*(?:de\s+\d{1,2}\s+de\s+\w+)?/i;
  const skipPatterns = [
    /^##\s*Page\s+\d+/i,
    /^###\s*Images/i,
    /^-\s*`parsed-documents/,
    /^SAWISE/i,
    /^QUALIDADE\s*I\s*AMBIENTE/i,
    /^OUALIDADE\s*I\s*AMBIENTE/i,
    /^Incredible and Dynamic/i,
    /^©\s*SIAWISE/i,
    /^\d+\/\d+$/,
    /^Mariana Pinto/i,
    /^#\s*Legislação$/i,
    /^#\s*Retificações/i,
    /^#\s*Portarias$/i,
    /^#\s*Resoluções$/i,
    /^#\s*Despachos$/i,
  ];
  
  const saveCurrent = () => {
    if (currentDiploma && currentCategory) {
      // Clean up the diploma text
      const cleanDiploma = currentDiploma.replace(/^#\s*/, '').trim();
      const cleanSummary = currentSummary.trim();
      
      legislation.push({
        number: cleanDiploma,
        title: cleanDiploma,
        summary: cleanSummary || null,
        publicationDate: parseDateFromDiploma(cleanDiploma),
        categoryPath: currentCategory
      });
    }
    currentDiploma = '';
    currentSummary = '';
  };
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines and noise
    if (!trimmedLine) continue;
    if (skipPatterns.some(p => p.test(trimmedLine))) continue;
    
    // Check if it's a category header
    const categoryMatch = trimmedLine.match(categoryPattern);
    if (categoryMatch) {
      saveCurrent();
      currentCategory = trimmedLine.replace(/^#\s*/, '').trim();
      continue;
    }
    
    // Check if it's a diploma entry
    if (diplomaPattern.test(trimmedLine)) {
      saveCurrent();
      currentDiploma = trimmedLine;
      continue;
    }
    
    // If we have a current diploma and this line is text, it's probably the summary
    if (currentDiploma && trimmedLine.length > 10) {
      // Skip if it looks like another category or noise
      if (!trimmedLine.startsWith('#') && !trimmedLine.startsWith('-')) {
        if (currentSummary) {
          currentSummary += ' ' + trimmedLine;
        } else {
          currentSummary = trimmedLine;
        }
      }
    }
  }
  
  // Don't forget the last entry
  saveCurrent();
  
  return legislation;
}

// Find the best matching category in the database
async function findMatchingCategory(
  supabase: any,
  categoryPath: string,
  categoriesCache: Map<string, { id: string; theme_id: string; name: string; parent_id: string | null }[]>
): Promise<string | null> {
  // Split the category path: "Ambiente / Legislação Nacional / Água / Mar, Oceanos e Orla Costeira"
  const parts = categoryPath.split('/').map(p => p.trim()).filter(p => p);
  
  if (parts.length < 2) return null;
  
  const themeName = parts[0]; // e.g., "Ambiente"
  const subCategories = parts.slice(1); // Rest of the path
  
  // Get all categories for this theme
  let themeCategories = categoriesCache.get(themeName);
  if (!themeCategories) {
    const { data: theme } = await supabase
      .from('themes')
      .select('id')
      .ilike('name', themeName)
      .maybeSingle();
    
    if (!theme) return null;
    
    const { data: categories } = await supabase
      .from('theme_categories')
      .select('id, name, parent_id, theme_id')
      .eq('theme_id', theme.id);
    
    themeCategories = categories || [];
    categoriesCache.set(themeName, themeCategories as { id: string; theme_id: string; name: string; parent_id: string | null }[]);
  }
  
  if (!themeCategories || themeCategories.length === 0) return null;
  
  // Try to find the deepest matching category
  // Start from the last subcategory and work backwards
  for (let i = subCategories.length - 1; i >= 0; i--) {
    const searchTerm = subCategories[i].toLowerCase();
    
    // Try exact match first
    let match = themeCategories.find(c => 
      c.name.toLowerCase() === searchTerm
    );
    
    // Try partial match
    if (!match) {
      match = themeCategories.find(c => 
        c.name.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(c.name.toLowerCase())
      );
    }
    
    // Try fuzzy match on key words
    if (!match) {
      const keywords = searchTerm.split(/\s+/).filter(w => w.length > 3);
      match = themeCategories.find(c => {
        const catName = c.name.toLowerCase();
        return keywords.some(kw => catName.includes(kw));
      });
    }
    
    if (match) return match.id;
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { pdfContent, textContent } = await req.json();

    // Accept either raw text content or base64 PDF
    const contentToProcess = textContent || pdfContent;

    if (!contentToProcess) {
      return new Response(
        JSON.stringify({ error: 'pdfContent or textContent is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting PDF import...');
    console.log(`Content length: ${contentToProcess.length} characters`);

    // Parse the content - if it looks like base64, decode it first
    let textToProcess = contentToProcess;
    if (!textToProcess.includes('\n') && textToProcess.length > 1000) {
      // Likely base64, but we can't parse binary PDF in Deno easily
      // Return error asking for text content
      return new Response(
        JSON.stringify({ error: 'Please provide textContent (parsed PDF text) instead of binary PDF' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const parsedLegislation = parsePdfContent(textToProcess);
    console.log(`Parsed ${parsedLegislation.length} legislation entries`);

    // Get existing legislation to avoid duplicates
    const { data: existingLegislation } = await supabase
      .from('legislation')
      .select('number');
    
    const existingNumbers = new Set((existingLegislation || []).map(l => l.number.toLowerCase().trim()));

    // Cache for categories
    const categoriesCache = new Map<string, any[]>();
    
    let created = 0;
    let skipped = 0;
    let mappingsCreated = 0;
    const errors: string[] = [];

    for (const leg of parsedLegislation) {
      // Skip if already exists
      if (existingNumbers.has(leg.number.toLowerCase().trim())) {
        skipped++;
        continue;
      }

      // Determine origin
      let origin = 'PT';
      const lowerNumber = leg.number.toLowerCase();
      if (lowerNumber.includes('regulamento (ue)') || 
          lowerNumber.includes('diretiva') ||
          lowerNumber.includes('decisão (ue)') ||
          lowerNumber.includes('regulamento de execução')) {
        origin = 'EU';
      }

      // Create legislation
      const { data: newLeg, error: legError } = await supabase
        .from('legislation')
        .insert({
          number: leg.number,
          title: leg.title,
          summary: leg.summary,
          publication_date: leg.publicationDate,
          origin: origin,
          source: 'pdf-import'
        })
        .select('id')
        .single();

      if (legError) {
        errors.push(`Error creating ${leg.number}: ${legError.message}`);
        continue;
      }

      created++;
      existingNumbers.add(leg.number.toLowerCase().trim());

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

    console.log(`Import complete: ${created} created, ${skipped} skipped, ${mappingsCreated} mappings, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          totalParsed: parsedLegislation.length,
          created,
          skipped,
          mappingsCreated,
          errors: errors.slice(0, 10) // Return first 10 errors
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
