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
      const result = `${yearMatch[1]}-${month}-${day}`;
      return sanitizeDate(result);
    }
  }
  return null;
}

// Simple PDF text extraction using regex on raw PDF content
// This works for text-based PDFs (not scanned images)
function extractTextFromPdfBasic(bytes: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const pdfContent = decoder.decode(bytes);
  
  const textParts: string[] = [];
  
  // Extract text from BT...ET blocks (PDF text objects)
  const textObjectPattern = /BT[\s\S]*?ET/g;
  const textObjects = pdfContent.match(textObjectPattern) || [];
  
  for (const textObj of textObjects) {
    // Extract text from Tj and TJ operators
    const tjPattern = /\(([^)]*)\)\s*Tj/g;
    let match;
    while ((match = tjPattern.exec(textObj)) !== null) {
      const text = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (text.trim()) {
        textParts.push(text);
      }
    }
    
    // Extract from TJ arrays
    const tjArrayPattern = /\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*TJ/gi;
    while ((match = tjArrayPattern.exec(textObj)) !== null) {
      const arrayContent = match[1];
      const stringPattern = /\(([^)]*)\)/g;
      let strMatch;
      while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
        const text = strMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (text.trim()) {
          textParts.push(text);
        }
      }
    }
  }
  
  // Also try to extract stream content that might contain readable text
  const streamPattern = /stream\s*([\s\S]*?)\s*endstream/g;
  let streamMatch;
  while ((streamMatch = streamPattern.exec(pdfContent)) !== null) {
    const streamContent = streamMatch[1];
    // Look for readable text patterns in streams
    const readableText = streamContent.match(/[A-Za-zÀ-ÿ0-9\s\.\,\;\:\-\(\)\/]{10,}/g);
    if (readableText) {
      for (const text of readableText) {
        if (text.trim().length > 15 && !/^[0-9\s\.]+$/.test(text)) {
          textParts.push(text.trim());
        }
      }
    }
  }
  
  const result = textParts.join(' ').replace(/\s+/g, ' ').trim();
  console.log(`Extracted ${result.length} characters from PDF using basic extraction`);
  return result;
}

// Parse the PDF text content to extract legislation entries
function parsePdfContent(content: string): ParsedLegislation[] {
  const legislation: ParsedLegislation[] = [];
  const lines = content.split('\n');
  
  let currentCategory = '';
  let currentDiploma = '';
  let currentSummary = '';
  
  // Patterns to identify different elements
  const categoryPattern = /^#?\s*(Ambiente|Segurança|Qualidade|Energia|Alimentar)\s*[\/\|]\s*(.+)$/i;
  const diplomaPattern = /^(?:#\s*)?(Lei|Decreto-Lei|Decreto|Portaria|Despacho|Resolução|Regulamento|Declaração|Aviso|Acórdão|Deliberação|Diretiva|Decisão)\s+(?:n\.º\s*)?[\w\-\.\/]+.*(?:de\s+\d{1,2}\s+de\s+\w+)?/i;
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
  const parts = categoryPath.split(/[\/\|]/).map(p => p.trim()).filter(p => p);
  
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
      // PDF content provided - check size limits
      const pdfSizeBytes = pdfContent.length * 0.75; // base64 to bytes approximation
      const maxSizeMB = 2; // Max 2MB for PDF processing
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      
      console.log(`PDF content length: ${pdfContent.length} base64 characters (~${(pdfSizeBytes / 1024 / 1024).toFixed(1)}MB)`);
      
      if (pdfSizeBytes > maxSizeBytes) {
        return new Response(
          JSON.stringify({ 
            error: `O ficheiro PDF é demasiado grande (${(pdfSizeBytes / 1024 / 1024).toFixed(1)}MB). Limite: ${maxSizeMB}MB. Por favor, use o campo "textContent" enviando o texto já extraído do PDF, ou divida o documento em partes menores.`,
            suggestion: 'Use uma ferramenta externa para extrair o texto do PDF e envie-o no campo textContent.'
          }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Extracting text from PDF...');
      
      // Decode base64 to Uint8Array
      const binaryString = atob(pdfContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      textToProcess = extractTextFromPdfBasic(bytes);
      console.log(`Extracted text length: ${textToProcess.length} characters`);
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
