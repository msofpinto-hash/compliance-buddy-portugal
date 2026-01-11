import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LegislationToFix {
  id: string;
  number: string;
  title: string;
  origin: string;
  document_url: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

  try {
    const { 
      fixType = 'all', // 'eurlex' | 'dre' | 'all'
      limit = 50,
      dryRun = false 
    } = await req.json().catch(() => ({}));

    console.log(`Starting metadata fix - Type: ${fixType}, Limit: ${limit}, DryRun: ${dryRun}`);

    // Find legislation with problems - get all and filter in code since we need to compare title=number
    let query = supabase
      .from('legislation')
      .select('id, number, title, origin, document_url, summary, publication_date, effective_date');

    if (fixType === 'eurlex') {
      query = query.or('origin.eq.EU,origin.eq.eurlex');
    } else if (fixType === 'dre') {
      query = query.or('origin.eq.PT,origin.eq.dre');
    }

    const { data: allLegislation, error: fetchError } = await query.limit(1000);
    
    if (fetchError) {
      throw new Error(`Failed to fetch legislation: ${fetchError.message}`);
    }

    // Filter to find legislation with actual problems
    const legislationToFix = (allLegislation || []).filter(leg => {
      // Check for generic title (title equals number or starts with type name)
      const titleEqualsNumber = leg.title === leg.number;
      const hasGenericTitlePattern = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Diretiva|Decisão|Declaração)\s+n\.?º?\s/i.test(leg.title) && 
        leg.title.length < 80 && !leg.title.includes(' - ');
      const hasGenericTitle = titleEqualsNumber || hasGenericTitlePattern;
      
      // Check for missing data
      const hasMissingOrigin = !leg.origin || (leg.origin !== 'PT' && leg.origin !== 'EU' && leg.origin !== 'dre' && leg.origin !== 'eurlex');
      const hasMissingSummary = !leg.summary || leg.summary.length < 10;
      const hasMissingUrl = !leg.document_url;
      
      return hasGenericTitle || hasMissingOrigin || hasMissingSummary || hasMissingUrl;
    }).slice(0, limit);


    console.log(`Found ${legislationToFix?.length || 0} items to fix`);

    const results = {
      total: legislationToFix?.length || 0,
      fixed: 0,
      failed: 0,
      skipped: 0,
      details: [] as any[]
    };

    if (!legislationToFix || legislationToFix.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No legislation needs fixing', results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    for (const leg of legislationToFix) {
      const problems: string[] = [];
      const updates: Record<string, any> = {};

      // Detect problems - improved detection for generic titles
      const titleEqualsNumber = leg.title === leg.number;
      const hasGenericTitlePattern = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Diretiva|Decisão|Declaração|Acórdão)\s+n\.?º?\s/i.test(leg.title) && 
        leg.title.length < 80 && !leg.title.includes(' - ');
      const hasGenericTitle = titleEqualsNumber || hasGenericTitlePattern || leg.title?.startsWith('Documento ');
      
      const hasMissingOrigin = !leg.origin || (leg.origin !== 'PT' && leg.origin !== 'EU' && leg.origin !== 'dre' && leg.origin !== 'eurlex');
      const hasMissingUrl = !leg.document_url;
      const hasMissingSummary = !leg.summary || leg.summary.length < 10;

      if (hasGenericTitle) problems.push('generic_title');
      if (hasMissingOrigin) problems.push('missing_origin');
      if (hasMissingUrl) problems.push('missing_url');
      if (hasMissingSummary) problems.push('missing_summary');

      // Determine origin from number pattern
      let detectedOrigin = leg.origin;
      if (hasMissingOrigin) {
        // EUR-Lex CELEX numbers: start with 3, 1, 2, C, E, etc
        if (/^[0-9]{5}[A-Z]/.test(leg.number) || /^3\d{4}[RDLB]/.test(leg.number)) {
          detectedOrigin = 'EU';
        } else {
          detectedOrigin = 'PT';
        }
        updates.origin = detectedOrigin;
      }

      // Generate proper URL
      if (hasMissingUrl || (hasGenericTitle && detectedOrigin === 'EU')) {
        if (detectedOrigin === 'EU') {
          // Generate EUR-Lex URL from CELEX number
          const celexNumber = leg.number.replace(/\s/g, '');
          updates.document_url = `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celexNumber}`;
        }
      }

      // Fetch metadata from EUR-Lex if EU legislation
      if (detectedOrigin === 'EU' && (hasGenericTitle || hasMissingSummary)) {
        const celexNumber = leg.number.replace(/\s/g, '');
        
        try {
          // Use EUR-Lex SPARQL to get proper title
          const sparqlQuery = `
            PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
            SELECT ?title ?summary WHERE {
              ?work cdm:resource_legal_id_celex "${celexNumber}" .
              OPTIONAL {
                ?work cdm:work_has_expression ?expr .
                ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/POR> .
                ?expr cdm:expression_title ?title .
              }
              OPTIONAL { ?work cdm:work_summary ?summary }
            }
            LIMIT 1
          `;

          const sparqlResponse = await fetch('https://publications.europa.eu/webapi/rdf/sparql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/sparql-results+json',
            },
            body: `query=${encodeURIComponent(sparqlQuery)}`,
          });

          if (sparqlResponse.ok) {
            const sparqlData = await sparqlResponse.json();
            const bindings = sparqlData?.results?.bindings?.[0];
            
            if (bindings?.title?.value && hasGenericTitle) {
              updates.title = bindings.title.value;
              console.log(`Got title from SPARQL for ${celexNumber}: ${bindings.title.value.substring(0, 50)}...`);
            }
            
            if (bindings?.summary?.value && hasMissingSummary) {
              updates.summary = bindings.summary.value;
            }
          }
        } catch (sparqlError) {
          console.warn(`SPARQL query failed for ${celexNumber}:`, sparqlError);
        }

        // Fallback: use Firecrawl to scrape EUR-Lex page
        if ((hasGenericTitle && !updates.title) && firecrawlApiKey) {
          try {
            const eurlexUrl = updates.document_url || `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celexNumber}`;
            
            console.log(`Scraping EUR-Lex page for ${celexNumber}...`);
            
            const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${firecrawlApiKey}`
              },
              body: JSON.stringify({
                url: eurlexUrl,
                formats: ['markdown'],
                waitFor: 3000,
                onlyMainContent: true
              })
            });

            if (scrapeResponse.ok) {
              const scrapeData = await scrapeResponse.json();
              const metadata = scrapeData?.data?.metadata || {};
              const markdown = scrapeData?.data?.markdown || '';

              if (metadata.title && hasGenericTitle) {
                // Clean up the title
                let cleanTitle = metadata.title
                  .replace(/\s*-\s*EUR-Lex$/, '')
                  .replace(/^\s*|\s*$/g, '');
                
                if (cleanTitle && cleanTitle.length > 10 && !cleanTitle.includes('EUR-Lex')) {
                  updates.title = cleanTitle;
                  console.log(`Got title from Firecrawl for ${celexNumber}: ${cleanTitle.substring(0, 50)}...`);
                }
              }

              // Extract summary from first paragraph
              if (hasMissingSummary && markdown) {
                const paragraphs = markdown.split('\n\n').filter((p: string) => 
                  p.length > 50 && !p.startsWith('#') && !p.startsWith('[')
                );
                if (paragraphs.length > 0) {
                  updates.summary = paragraphs[0].substring(0, 500);
                }
              }
            }
          } catch (scrapeError) {
            console.warn(`Firecrawl failed for ${celexNumber}:`, scrapeError);
          }
        }
      }

      // Handle DRE legislation
      if (detectedOrigin === 'PT' && firecrawlApiKey) {
        if (hasMissingUrl) {
          // Try to generate DRE URL from number
          // Format: "Portaria n.º 123/2024" -> search on DRE
          const numberMatch = leg.number.match(/(\d+)\/(\d{4})/);
          if (numberMatch) {
            updates.document_url = `https://diariodarepublica.pt/dr/pesquisa/-/search/basic?q=${encodeURIComponent(leg.number)}`;
          }
        }

        // Scrape DRE if we have URL and need title/summary
        if ((hasGenericTitle || hasMissingSummary) && (leg.document_url || updates.document_url)) {
          const dreUrl = updates.document_url || leg.document_url;
          
          // Only scrape actual diploma pages, not search pages
          if (dreUrl.includes('/dr/detalhe/')) {
            try {
              console.log(`Scraping DRE page for ${leg.number}...`);
              
              const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${firecrawlApiKey}`
                },
                body: JSON.stringify({
                  url: dreUrl,
                  formats: ['markdown'],
                  waitFor: 3000,
                  onlyMainContent: true
                })
              });

              if (scrapeResponse.ok) {
                const scrapeData = await scrapeResponse.json();
                const metadata = scrapeData?.data?.metadata || {};
                const markdown = scrapeData?.data?.markdown || '';

                if (metadata.title && hasGenericTitle) {
                  updates.title = metadata.title;
                  console.log(`Got title from DRE for ${leg.number}: ${metadata.title.substring(0, 50)}...`);
                }

                if (hasMissingSummary && markdown) {
                  const paragraphs = markdown.split('\n\n').filter((p: string) => 
                    p.length > 50 && !p.startsWith('#') && !p.startsWith('[')
                  );
                  if (paragraphs.length > 0) {
                    updates.summary = paragraphs[0].substring(0, 500);
                  }
                }
              }
            } catch (scrapeError) {
              console.warn(`Firecrawl failed for DRE ${leg.number}:`, scrapeError);
            }
          }
        }
      }

      // Apply updates if not dry run
      if (Object.keys(updates).length > 0) {
        if (dryRun) {
          results.details.push({
            id: leg.id,
            number: leg.number,
            problems,
            wouldUpdate: updates
          });
          results.skipped++;
        } else {
          updates.updated_at = new Date().toISOString();
          
          const { error: updateError } = await supabase
            .from('legislation')
            .update(updates)
            .eq('id', leg.id);

          if (updateError) {
            console.error(`Failed to update ${leg.number}:`, updateError);
            results.failed++;
            results.details.push({
              id: leg.id,
              number: leg.number,
              problems,
              error: updateError.message
            });
          } else {
            console.log(`Updated ${leg.number} with:`, Object.keys(updates));
            results.fixed++;
            results.details.push({
              id: leg.id,
              number: leg.number,
              problems,
              updated: Object.keys(updates)
            });
          }
        }
      } else {
        results.skipped++;
        results.details.push({
          id: leg.id,
          number: leg.number,
          problems,
          message: 'No fixes available'
        });
      }

      // Rate limiting to avoid API throttling
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Fix completed: ${results.fixed} fixed, ${results.failed} failed, ${results.skipped} skipped`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: dryRun 
          ? `Dry run completed: ${results.total} items analyzed`
          : `Fix completed: ${results.fixed} fixed, ${results.failed} failed, ${results.skipped} skipped`,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in fix-legislation-metadata:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
