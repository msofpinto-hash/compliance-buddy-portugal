import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { limit = 20, batchSize = 5 } = await req.json().catch(() => ({}));

    console.log(`Starting EUR-Lex title fix - limit: ${limit}, batchSize: ${batchSize}`);

    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find EU legislation with generic titles
    const { data: genericDocs, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, external_id, document_url')
      .eq('origin', 'EU')
      .or('title.like.Documento %,title.like.32%,title.like.22%,title.like.52%')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch legislation: ${fetchError.message}`);
    }

    console.log(`Found ${genericDocs?.length || 0} documents with generic titles`);

    let updated = 0;
    let failed = 0;
    const results: Array<{ celex: string; oldTitle: string; newTitle: string; success: boolean }> = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < (genericDocs?.length || 0); i += batchSize) {
      const batch = genericDocs!.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (doc) => {
        try {
          const title = await fetchEURLexTitle(doc.document_url, doc.external_id, firecrawlApiKey);
          
          if (title && title !== doc.title && !title.startsWith('Documento ')) {
            // Also try to extract summary
            const summary = await fetchEURLexSummary(doc.document_url, firecrawlApiKey);
            
            const { error: updateError } = await supabase
              .from('legislation')
              .update({ 
                title: title,
                summary: summary || undefined,
                updated_at: new Date().toISOString()
              })
              .eq('id', doc.id);

            if (updateError) {
              console.error(`Failed to update ${doc.external_id}:`, updateError);
              return { celex: doc.external_id, oldTitle: doc.title, newTitle: title, success: false };
            }

            console.log(`Updated ${doc.external_id}: "${doc.title}" -> "${title}"`);
            return { celex: doc.external_id, oldTitle: doc.title, newTitle: title, success: true };
          }
          
          return { celex: doc.external_id, oldTitle: doc.title, newTitle: doc.title, success: false };
        } catch (error) {
          console.error(`Error processing ${doc.external_id}:`, error);
          return { celex: doc.external_id, oldTitle: doc.title, newTitle: doc.title, success: false };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        results.push(result);
        if (result.success && result.newTitle !== result.oldTitle) {
          updated++;
        } else {
          failed++;
        }
      }

      // Small delay between batches
      if (i + batchSize < (genericDocs?.length || 0)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const response = {
      success: true,
      totalProcessed: genericDocs?.length || 0,
      updated,
      failed,
      results: results.filter(r => r.success),
      message: `Fixed ${updated} titles out of ${genericDocs?.length || 0} processed`
    };

    console.log('EUR-Lex title fix completed:', response.message);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fix-eurlex-titles function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchEURLexTitle(
  url: string, 
  celex: string, 
  apiKey: string,
  retries: number = 3,
  retryDelay: number = 2000
): Promise<string | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching title for ${celex} from ${url} (attempt ${attempt}/${retries})`);
      
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          url: url,
          formats: ['markdown'],
          waitFor: 3000,
          onlyMainContent: true
        })
      });

      // Handle rate limiting and server errors with retry
      if (response.status === 429 || response.status >= 500) {
        const delay = retryDelay * attempt; // Exponential backoff
        console.warn(`Firecrawl returned ${response.status} for ${url}, retrying in ${delay}ms...`);
        
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        console.warn(`Firecrawl failed after ${retries} attempts for ${url}`);
        return buildTitleFromCelex(celex);
      }

      if (!response.ok) {
        console.warn(`Firecrawl returned ${response.status} for ${url}`);
        return null;
      }

      const data = await response.json();
      const markdown = data?.data?.markdown || '';
      const metadata = data?.data?.metadata || {};
      
      let title: string | null = null;
      
      // Search markdown for the actual title - EUR-Lex puts it after type indicators
      const lines = markdown.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip navigation and metadata lines
        if (!trimmed || trimmed.startsWith('[') || trimmed.startsWith('|') || 
            trimmed.includes('EUR-Lex') || trimmed.includes('cookie') ||
            trimmed.length < 20) {
          continue;
        }
        
        // Look for lines that start with document type keywords in Portuguese
        if (/^(Regulamento|Diretiva|Decisão|Recomendação|Decisão de Execução|Regulamento de Execução|Regulamento Delegado|Parecer|Orçamento|Proposta|Comunicação|Resolução|Relatório|Informação|Documento|Retificação|Corrigenda)/i.test(trimmed)) {
          // Skip if it's just "Documento XXXXX" pattern
          if (/^Documento\s+[A-Z0-9]+$/i.test(trimmed)) {
            continue;
          }
          
          // Take the full line as title, but clean it up
          title = trimmed
            .replace(/\s*\|.*$/, '') // Remove trailing navigation
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim();
          
          // Limit length
          if (title && title.length > 500) {
            const periodIdx = title.indexOf('.', 100);
            if (periodIdx > 0 && periodIdx < 400) {
              title = title.substring(0, periodIdx);
            } else {
              title = title.substring(0, 300) + '...';
            }
          }
          break;
        }
        
        // Or look for heading lines that are substantial
        if (trimmed.startsWith('#')) {
          const headerText = trimmed.replace(/^#+\s*/, '').trim();
          if (headerText.length > 30 && 
              !headerText.includes('EUR-Lex') && 
              !headerText.includes('Document') &&
              /^(Regulamento|Diretiva|Decisão|Parecer|Orçamento)/i.test(headerText)) {
            title = headerText;
            break;
          }
        }
      }
      
      // If still no good title, build a readable one from CELEX
      if (!title) {
        title = buildTitleFromCelex(celex);
      }
      
      console.log(`Extracted title for ${celex}: "${title?.substring(0, 80)}..."`);
      return title || null;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Error fetching title for ${celex} (attempt ${attempt}/${retries}):`, lastError.message);
      
      if (attempt < retries) {
        const delay = retryDelay * attempt;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`Failed to fetch title for ${celex} after ${retries} attempts:`, lastError?.message);
  return buildTitleFromCelex(celex);
}

async function fetchEURLexSummary(url: string, apiKey: string): Promise<string | null> {
  // The summary was likely already in the markdown from the previous call
  // For now, return null - we can enhance this later if needed
  return null;
}

function buildTitleFromCelex(celex: string): string {
  // Parse CELEX number structure: SYYYYTNNNN
  // S = Sector (3 = EU law, 2 = External agreements, 5 = Preparatory acts)
  // YYYY = Year
  // T = Type (R = Regulation, L = Directive, D = Decision, H = Recommendation, etc.)
  // NNNN = Number
  
  const match = celex.match(/^(\d)(\d{4})([A-Z])(\d+)/);
  if (!match) return `Documento ${celex}`;
  
  const [, sector, year, type, number] = match;
  
  const typeNames: { [key: string]: string } = {
    'R': 'Regulamento',
    'L': 'Diretiva',
    'D': 'Decisão',
    'H': 'Recomendação',
    'Q': 'Regulamento Interno',
    'O': 'Parecer',
    'S': 'Resolução',
    'A': 'Acordo',
    'X': 'Outro',
    'B': 'Orçamento',
    'C': 'Declaração',
    'G': 'Resolução',
    'J': 'Decisão',
    'P': 'Proposta',  // PC = Proposta COM
    'Y': 'Documento'  // Y = Other documents
  };
  
  // Special handling for preparatory documents (sector 5)
  if (sector === '5') {
    const prepTypes: { [key: string]: string } = {
      'PC': 'Proposta COM',
      'DC': 'Comunicação COM',
      'SC': 'Documento de Trabalho'
    };
    
    const subType = celex.substring(5, 7);
    const prepTypeName = prepTypes[subType] || 'Documento Preparatório';
    return `${prepTypeName} ${year}/${parseInt(number, 10)}`;
  }
  
  // Special handling for other documents (sector 4)
  if (sector === '4') {
    return `Documento (UE) ${year}/${parseInt(number, 10)}`;
  }
  
  const typeName = typeNames[type] || 'Documento';
  
  // Format number without leading zeros
  const formattedNumber = parseInt(number, 10);
  
  return `${typeName} (UE) ${year}/${formattedNumber}`;
}
