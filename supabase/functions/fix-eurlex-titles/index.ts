import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EURLexResult {
  celex: string;
  title: string;
  summary?: string;
}

// Build SPARQL query to fetch title for a CELEX number
function buildSparqlQueryForCelex(celexNumbers: string[]): string {
  const celexFilter = celexNumbers.map(c => `"${c}"`).join(' ');
  
  return `
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    
    SELECT DISTINCT ?celex ?title ?summary WHERE {
      ?doc cdm:resource_legal_id_celex ?celex .
      FILTER(?celex IN (${celexFilter}))
      
      # Get Portuguese title first, fallback to English
      OPTIONAL {
        ?doc cdm:resource_legal_title_lgc ?titlePT .
        FILTER(lang(?titlePT) = "por")
      }
      OPTIONAL {
        ?doc cdm:resource_legal_title_lgc ?titleEN .
        FILTER(lang(?titleEN) = "eng")
      }
      OPTIONAL {
        ?doc cdm:work_has_expression ?expr .
        ?expr cdm:expression_title ?exprTitle .
        FILTER(lang(?exprTitle) = "por" || lang(?exprTitle) = "eng")
      }
      
      BIND(COALESCE(?titlePT, ?titleEN, ?exprTitle) AS ?title)
      
      # Try to get summary/abstract
      OPTIONAL {
        ?doc cdm:resource_legal_abstract ?summaryPT .
        FILTER(lang(?summaryPT) = "por")
      }
      OPTIONAL {
        ?doc cdm:resource_legal_abstract ?summaryEN .
        FILTER(lang(?summaryEN) = "eng")
      }
      BIND(COALESCE(?summaryPT, ?summaryEN) AS ?summary)
    }
  `;
}

// Fetch titles from EUR-Lex SPARQL endpoint
async function fetchTitlesFromSparql(celexNumbers: string[]): Promise<Map<string, EURLexResult>> {
  const results = new Map<string, EURLexResult>();
  
  if (celexNumbers.length === 0) return results;
  
  // Process in batches of 20 to avoid query limits
  const batchSize = 20;
  
  for (let i = 0; i < celexNumbers.length; i += batchSize) {
    const batch = celexNumbers.slice(i, i + batchSize);
    const query = buildSparqlQueryForCelex(batch);
    
    try {
      console.log(`Querying SPARQL for batch ${i / batchSize + 1} (${batch.length} items)`);
      
      const response = await fetch('https://publications.europa.eu/webapi/rdf/sparql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json',
        },
        body: `query=${encodeURIComponent(query)}`
      });
      
      if (!response.ok) {
        console.warn(`SPARQL query failed with status ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      for (const binding of data.results?.bindings || []) {
        const celex = binding.celex?.value;
        const title = binding.title?.value;
        const summary = binding.summary?.value;
        
        if (celex && title) {
          // Clean up title
          let cleanTitle = title
            .replace(/\s+/g, ' ')
            .trim();
          
          // Truncate if too long
          if (cleanTitle.length > 500) {
            const periodIdx = cleanTitle.indexOf('.', 100);
            if (periodIdx > 0 && periodIdx < 400) {
              cleanTitle = cleanTitle.substring(0, periodIdx);
            } else {
              cleanTitle = cleanTitle.substring(0, 300) + '...';
            }
          }
          
          results.set(celex, {
            celex,
            title: cleanTitle,
            summary: summary?.substring(0, 1000),
          });
        }
      }
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < celexNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Error querying SPARQL batch:`, error);
    }
  }
  
  return results;
}

// Build a readable title from CELEX if SPARQL fails
function buildTitleFromCelex(celex: string): string {
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
  };
  
  if (sector === '5') {
    return `Documento Preparatório ${year}/${parseInt(number, 10)}`;
  }
  
  if (sector === '4') {
    return `Documento (UE) ${year}/${parseInt(number, 10)}`;
  }
  
  const typeName = typeNames[type] || 'Documento';
  return `${typeName} (UE) ${year}/${parseInt(number, 10)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { limit = 50, dryRun = false } = await req.json().catch(() => ({}));

    console.log(`Starting EUR-Lex title fix via SPARQL - limit: ${limit}, dryRun: ${dryRun}`);

    // Find EU legislation with generic titles
    const { data: allEuLegislation, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, external_id, document_url, summary')
      .or('origin.eq.EU,origin.eq.eurlex')
      .limit(1000);

    if (fetchError) {
      throw new Error(`Failed to fetch legislation: ${fetchError.message}`);
    }

    // Filter to find generic titles
    const genericPattern = /^(Documento\s+[A-Z0-9]+|3\d{4}[A-Z]\d+|2\d{4}[A-Z]\d+|5\d{4}[A-Z]\d+)/i;
    
    const toProcess = (allEuLegislation || [])
      .filter(leg => {
        if (!leg.external_id) return false;
        
        // Check if title is generic (equals CELEX or matches pattern)
        const titleEqualsCelex = leg.title === leg.external_id || leg.title === leg.number;
        const hasGenericPattern = genericPattern.test(leg.title) || 
          leg.title.startsWith('Documento ') ||
          !leg.title ||
          leg.title.length < 30;
        
        return titleEqualsCelex || hasGenericPattern;
      })
      .slice(0, limit);

    console.log(`Found ${toProcess.length} EU documents with generic titles to process`);

    if (toProcess.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        totalProcessed: 0,
        updated: 0,
        failed: 0,
        message: 'Não foram encontrados diplomas EU com títulos genéricos'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract CELEX numbers
    const celexNumbers = toProcess.map(leg => leg.external_id).filter(Boolean) as string[];

    // Fetch titles from SPARQL
    console.log(`Fetching titles from EUR-Lex SPARQL API for ${celexNumbers.length} documents...`);
    const sparqlResults = await fetchTitlesFromSparql(celexNumbers);
    console.log(`SPARQL returned titles for ${sparqlResults.size} documents`);

    let updated = 0;
    let failed = 0;
    const results: Array<{ celex: string; oldTitle: string; newTitle: string; success: boolean }> = [];

    // Update each document
    for (const doc of toProcess) {
      const celex = doc.external_id;
      if (!celex) continue;

      const sparqlResult = sparqlResults.get(celex);
      let newTitle = sparqlResult?.title || buildTitleFromCelex(celex);
      const newSummary = sparqlResult?.summary;

      // Skip if no improvement
      if (newTitle === doc.title || newTitle.startsWith('Documento ')) {
        results.push({ celex, oldTitle: doc.title, newTitle: doc.title, success: false });
        failed++;
        continue;
      }

      if (dryRun) {
        console.log(`[DRY RUN] Would update ${celex}: "${doc.title}" -> "${newTitle}"`);
        results.push({ celex, oldTitle: doc.title, newTitle, success: true });
        updated++;
        continue;
      }

      // Update the database
      const updateData: { title: string; summary?: string; updated_at: string } = {
        title: newTitle,
        updated_at: new Date().toISOString()
      };
      
      // Only update summary if we got one from SPARQL and current is empty
      if (newSummary && (!doc.summary || doc.summary.length < 20)) {
        updateData.summary = newSummary;
      }

      const { error: updateError } = await supabase
        .from('legislation')
        .update(updateData)
        .eq('id', doc.id);

      if (updateError) {
        console.error(`Failed to update ${celex}:`, updateError);
        results.push({ celex, oldTitle: doc.title, newTitle, success: false });
        failed++;
      } else {
        console.log(`Updated ${celex}: "${doc.title.substring(0, 50)}..." -> "${newTitle.substring(0, 50)}..."`);
        results.push({ celex, oldTitle: doc.title, newTitle, success: true });
        updated++;
      }
    }

    const response = {
      success: true,
      totalProcessed: toProcess.length,
      updated,
      failed,
      dryRun,
      results: results.filter(r => r.success).slice(0, 50), // Limit results in response
      message: dryRun 
        ? `[SIMULAÇÃO] Seriam corrigidos ${updated} títulos de ${toProcess.length} processados`
        : `Corrigidos ${updated} títulos de ${toProcess.length} processados`
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
