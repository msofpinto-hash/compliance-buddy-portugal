import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedLegislation {
  number: string;
  title: string;
  summary: string;
  entity: string;
  publicationDate: string | null;
  documentUrl: string;
  externalId: string;
}

// Parse legislation data from Firecrawl markdown response
function parseMarkdownContent(markdown: string, url: string): ParsedLegislation | null {
  try {
    console.log('Parsing markdown content, length:', markdown.length);
    console.log('First 500 chars:', markdown.substring(0, 500));
    
    // Extract number from URL pattern: detalhe/tipo/numero-ano-id
    let number = '';
    let title = '';
    const urlNumberMatch = url.match(/detalhe\/([^\/]+)\/([^\/]+)/);
    if (urlNumberMatch) {
      const type = urlNumberMatch[1].charAt(0).toUpperCase() + urlNumberMatch[1].slice(1).replace(/-/g, ' ');
      const numParts = urlNumberMatch[2].split('-');
      if (numParts.length >= 2) {
        number = `${type} n.º ${numParts[0]}/${numParts[1]}`;
        title = number;
      }
    }
    
    // Try to extract title from markdown - look for legislation number pattern
    const legislationTitleMatch = markdown.match(/(?:Portaria|Decreto-Lei|Despacho|Lei|Regulamento|Resolução|Declaração)[^\n]*n\.º[^\n]+/i);
    if (legislationTitleMatch) {
      title = legislationTitleMatch[0].trim().replace(/\*+/g, '').replace(/\[|\]/g, '');
    }
    
    // Extract summary - look for SUMÁRIO section more carefully
    let summary = '';
    // Try multiple patterns for summary
    const sumarioPatterns = [
      /SUMÁRIO\s*[:\-]?\s*([\s\S]+?)(?=\n\s*(?:TEXTO|Emissor|Entidade|\n#|\*\*Emissor))/i,
      /Sumário[:\s]*([\s\S]+?)(?=\n\s*(?:Texto|Emissor|Entidade|\*\*))/i,
      /(?:^|\n)(?:O presente|A presente|Estabelece|Aprova|Define|Altera|Regulamenta)[^.]+\./i,
    ];
    
    for (const pattern of sumarioPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        const extracted = (match[1] || match[0]).trim()
          .replace(/\s+/g, ' ')
          .replace(/\[.*?\]\([^)]*\)/g, '') // Remove markdown links
          .replace(/\*+/g, '')
          .substring(0, 1000);
        if (extracted.length > 20 && !extracted.includes('Página de entrada')) {
          summary = extracted;
          break;
        }
      }
    }
    
    // If still no summary, look for descriptive text after the title
    if (!summary) {
      const lines = markdown.split('\n').filter(l => l.trim().length > 0);
      for (const line of lines) {
        const cleanLine = line.replace(/\[.*?\]\([^)]*\)/g, '').replace(/\*+/g, '').trim();
        if (cleanLine.length > 50 && 
            !cleanLine.includes('Página de entrada') && 
            !cleanLine.includes('Diário da República') &&
            !cleanLine.startsWith('#') &&
            !cleanLine.includes('Série I') &&
            !cleanLine.includes('Série II')) {
          summary = cleanLine.substring(0, 1000);
          break;
        }
      }
    }
    
    // Extract entity/emissor
    let entity = '';
    const entityPatterns = [
      /Emissor[:\s]*([^\n]+)/i,
      /Entidade[:\s]*([^\n]+)/i,
      /Ministério[^\n]*([^\n]+)/i,
      /Presidência[^\n]*([^\n]+)/i,
    ];
    for (const pattern of entityPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        entity = match[1].trim().replace(/\*+/g, '').substring(0, 200);
        break;
      }
    }
    
    // Extract publication date
    let publicationDate: string | null = null;
    const datePatterns = [
      /Data de Publicação[:\s]*(\d{4}-\d{2}-\d{2})/i,
      /Publicado em[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
      /Data[:\s]*(\d{4}-\d{2}-\d{2})/i,
      /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = markdown.match(pattern);
      if (match) {
        if (match.length === 2) {
          // Already in YYYY-MM-DD format
          publicationDate = match[1];
        } else if (match.length === 4) {
          // DD/MM/YYYY or DD de Mês de YYYY
          const months: Record<string, string> = {
            janeiro: '01', fevereiro: '02', março: '03', abril: '04',
            maio: '05', junho: '06', julho: '07', agosto: '08',
            setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
          };
          const month = months[match[2].toLowerCase()] || match[2].padStart(2, '0');
          const day = match[1].padStart(2, '0');
          const year = match[3];
          publicationDate = `${year}-${month}-${day}`;
        }
        break;
      }
    }
    
    // Fallback: extract year from URL
    if (!publicationDate && urlNumberMatch) {
      const numParts = urlNumberMatch[2].split('-');
      if (numParts.length >= 2 && numParts[1].length === 4) {
        publicationDate = `${numParts[1]}-01-01`;
      }
    }
    
    // Extract external ID from URL
    const idMatch = url.match(/(\d+)(?:\?|$)/);
    const externalId = idMatch ? `dre-${idMatch[1]}` : `dre-${Date.now()}`;
    
    if (!number && !title) {
      console.log('Could not extract number or title from markdown');
      return null;
    }
    
    console.log(`Parsed: ${number}, Entity: ${entity}, Date: ${publicationDate}, Summary length: ${summary.length}`);
    
    return {
      number: number || title,
      title: title || number,
      summary,
      entity,
      publicationDate,
      documentUrl: url,
      externalId
    };
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return null;
  }
}

// Fallback: extract from URL only
function parseFromUrl(url: string): ParsedLegislation | null {
  try {
    const urlNumberMatch = url.match(/detalhe\/([^\/]+)\/([^\/]+)/);
    if (!urlNumberMatch) return null;
    
    const type = urlNumberMatch[1].charAt(0).toUpperCase() + urlNumberMatch[1].slice(1).replace(/-/g, ' ');
    const numParts = urlNumberMatch[2].split('-');
    if (numParts.length < 2) return null;
    
    const number = `${type} n.º ${numParts[0]}/${numParts[1]}`;
    const idMatch = url.match(/(\d+)(?:\?|$)/);
    const externalId = idMatch ? `dre-${idMatch[1]}` : `dre-${Date.now()}`;
    
    return {
      number,
      title: number,
      summary: '',
      entity: '',
      publicationDate: numParts[1].length === 4 ? `${numParts[1]}-01-01` : null,
      documentUrl: url,
      externalId
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { links } = await req.json();

    if (!links || !Array.isArray(links) || links.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Links array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting import of ${links.length} DRE links...`);
    console.log(`Firecrawl API key available: ${!!firecrawlApiKey}`);

    // Get existing legislation to avoid duplicates
    const { data: existingLegislation } = await supabase
      .from('legislation')
      .select('external_id, document_url');
    
    const existingUrls = new Set((existingLegislation || []).map(l => l.document_url));
    const existingIds = new Set((existingLegislation || []).map(l => l.external_id));

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];
    const results: { url: string; status: string; number?: string; method?: string }[] = [];

    for (const link of links) {
      const url = link.trim();
      if (!url) continue;
      
      // Check if already exists
      if (existingUrls.has(url)) {
        skipped++;
        results.push({ url, status: 'skipped', number: 'Já existe' });
        continue;
      }

      try {
        console.log(`Processing: ${url}`);
        let parsed: ParsedLegislation | null = null;
        let method = 'url';

        // Try Firecrawl first if available
        if (firecrawlApiKey) {
          try {
            console.log('Fetching with Firecrawl...');
            const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${firecrawlApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: url,
                formats: ['markdown'],
                onlyMainContent: true,
                waitFor: 2000, // Wait for JS rendering
              }),
            });

            if (firecrawlResponse.ok) {
              const firecrawlData = await firecrawlResponse.json();
              const markdown = firecrawlData.data?.markdown || firecrawlData.markdown;
              
              if (markdown) {
                console.log('Firecrawl returned markdown, parsing...');
                parsed = parseMarkdownContent(markdown, url);
                if (parsed) {
                  method = 'firecrawl';
                }
              }
            } else {
              console.log(`Firecrawl error: ${firecrawlResponse.status}`);
            }
          } catch (fcError) {
            console.log('Firecrawl fetch failed:', fcError);
          }
        }

        // Fallback to URL parsing
        if (!parsed) {
          console.log('Falling back to URL parsing...');
          parsed = parseFromUrl(url);
          method = 'url';
        }

        if (!parsed) {
          throw new Error('Could not parse legislation data');
        }

        // Check if external_id already exists
        if (existingIds.has(parsed.externalId)) {
          skipped++;
          results.push({ url, status: 'skipped', number: parsed.number });
          continue;
        }

        // Insert legislation
        const { error: insertError } = await supabase
          .from('legislation')
          .insert({
            external_id: parsed.externalId,
            source: 'dre-link',
            number: parsed.number,
            title: parsed.title,
            summary: parsed.summary,
            entity: parsed.entity,
            origin: 'PT',
            publication_date: parsed.publicationDate,
            document_url: parsed.documentUrl
          });

        if (insertError) {
          throw new Error(insertError.message);
        }

        created++;
        existingUrls.add(url);
        existingIds.add(parsed.externalId);
        results.push({ url, status: 'created', number: parsed.number, method });
        console.log(`Created: ${parsed.number} (via ${method})`);

      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${url}: ${errorMsg}`);
        results.push({ url, status: 'failed' });
        console.error(`Failed ${url}:`, errorMsg);
      }
    }

    console.log(`Import complete: ${created} created, ${skipped} skipped, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total: links.length,
          created,
          skipped,
          failed,
          errors: errors.slice(0, 10)
        },
        results
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
