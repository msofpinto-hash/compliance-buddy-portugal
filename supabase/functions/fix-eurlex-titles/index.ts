import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EURLexResult {
  celex: string;
  title: string;
}

// Fetch title from EUR-Lex SPARQL endpoint for a single CELEX
async function fetchTitleFromSparql(celex: string): Promise<string | null> {
  // Publications Office RDF stores the human title on "expressions" and the language as a separate triple.
  // Using LANG() on the title literal often returns "" (or nothing), so we query via expression_uses_language.
  const query = `
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT DISTINCT ?title ?iso WHERE {
      ?w cdm:work_id_document "celex:${celex}"^^xsd:string .
      ?expr cdm:expression_belongs_to_work ?w .
      ?expr cdm:expression_uses_language ?langRes .
      ?langRes skos:notation ?iso .
      ?expr cdm:expression_title ?title .

      BIND(LCASE(STR(?iso)) AS ?iso_lc)
      FILTER(?iso_lc = "pt" || ?iso_lc = "en")
    }
    ORDER BY (IF(LCASE(STR(?iso)) = "pt", 0, 1))
    LIMIT 1
  `;

  try {
    const response = await fetch("https://publications.europa.eu/webapi/rdf/sparql", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
      },
      body: `query=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      console.warn(`SPARQL query failed for ${celex} with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    const binding = data?.results?.bindings?.[0];

    const raw = binding?.title?.value as string | undefined;
    const iso = binding?.iso?.value as string | undefined;

    if (!raw) {
      console.log(`No SPARQL title found for ${celex}`);
      return null;
    }

    let title = raw.replace(/\s+/g, " ").trim();

    // Truncate if too long
    if (title.length > 500) {
      const periodIdx = title.indexOf(".", 100);
      if (periodIdx > 0 && periodIdx < 400) {
        title = title.substring(0, periodIdx);
      } else {
        title = title.substring(0, 300) + "...";
      }
    }

    console.log(`SPARQL title found for ${celex} (iso=${iso ?? "n/a"})`);
    return title;
  } catch (error) {
    console.error(`Error querying SPARQL for ${celex}:`, error);
    return null;
  }
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

    // Find EU legislation with generic/short titles using direct filter
    // Query in batches to find all candidates
    let allCandidates: Array<{id: string; number: string; title: string; external_id: string | null; document_url: string | null; summary: string | null}> = [];
    let offset = 0;
    const batchSize = 500;
    
    while (allCandidates.length < limit) {
      const { data: batch, error: fetchError } = await supabase
        .from('legislation')
        .select('id, number, title, external_id, document_url, summary')
        .or('origin.eq.EU,origin.eq.eurlex')
        .not('external_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (fetchError) {
        throw new Error(`Failed to fetch legislation: ${fetchError.message}`);
      }

      if (!batch || batch.length === 0) break;

      // Filter to find generic titles
      const candidates = batch.filter(leg => {
        if (!leg.external_id) return false;
        const title = leg.title || '';
        
        // Check if title is generic or too short
        return (
          title === leg.external_id ||
          title === leg.number ||
          title.startsWith('Documento ') ||
          title.startsWith('32') ||
          title.startsWith('22') ||
          title.startsWith('52') ||
          title.length < 50  // Expanded threshold to catch more short titles
        );
      });

      allCandidates = allCandidates.concat(candidates);
      offset += batchSize;
      
      // Stop if we've scanned enough or no more data
      if (batch.length < batchSize) break;
      if (offset > 3000) break; // Safety limit
    }

    const toProcess = allCandidates.slice(0, limit);

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

    let updated = 0;
    let failed = 0;
    const results: Array<{ celex: string; oldTitle: string; newTitle: string; success: boolean }> = [];

    // Process each document sequentially to avoid overwhelming the API
    for (const doc of toProcess) {
      const celex = doc.external_id;
      if (!celex) continue;

      console.log(`Processing ${celex}...`);
      
      // Try SPARQL first
      let newTitle = await fetchTitleFromSparql(celex);
      
      // Fallback to generated title if SPARQL fails
      if (!newTitle || newTitle.startsWith('Documento ')) {
        newTitle = buildTitleFromCelex(celex);
      }

      // Skip if no improvement
      if (newTitle === doc.title || newTitle.startsWith('Documento ')) {
        console.log(`No improvement for ${celex}`);
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
      const { error: updateError } = await supabase
        .from('legislation')
        .update({
          title: newTitle,
          updated_at: new Date().toISOString()
        })
        .eq('id', doc.id);

      if (updateError) {
        console.error(`Failed to update ${celex}:`, updateError);
        results.push({ celex, oldTitle: doc.title, newTitle, success: false });
        failed++;
      } else {
        console.log(`Updated ${celex}: "${doc.title.substring(0, 40)}..." -> "${newTitle.substring(0, 40)}..."`);
        results.push({ celex, oldTitle: doc.title, newTitle, success: true });
        updated++;
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const response = {
      success: true,
      totalProcessed: toProcess.length,
      updated,
      failed,
      dryRun,
      results: results.filter(r => r.success).slice(0, 50),
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
