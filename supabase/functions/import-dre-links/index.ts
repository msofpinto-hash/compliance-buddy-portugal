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

// Extract legislation data from DRE page HTML
function parseHtmlContent(html: string, url: string): ParsedLegislation | null {
  try {
    // Extract title - usually in <h1> or title tag
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || 
                       html.match(/<title>([^<]+)<\/title>/i);
    const fullTitle = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract number from title (e.g., "Portaria n.º 15/2026/1")
    const numberMatch = fullTitle.match(/((?:Lei|Decreto-Lei|Decreto|Portaria|Despacho|Resolução|Regulamento|Declaração|Aviso|Acórdão|Deliberação|Diretiva|Decisão)[^–—-]+)/i);
    const number = numberMatch ? numberMatch[1].trim() : fullTitle;
    
    // Extract summary - look for sumário or resumo sections
    const summaryMatch = html.match(/Sumário[:\s]*<\/[^>]+>\s*<[^>]+>([^<]+)/i) ||
                        html.match(/sumario[^>]*>([^<]+)/i) ||
                        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    
    // Extract entity/emissor
    const entityMatch = html.match(/Entidade[:\s]*<\/[^>]+>\s*<[^>]+>([^<]+)/i) ||
                       html.match(/emissor[^>]*>([^<]+)/i) ||
                       html.match(/Ministério[^<]*/i);
    const entity = entityMatch ? entityMatch[0].replace(/<[^>]+>/g, '').trim() : '';
    
    // Extract publication date
    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/) ||
                     html.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
    let publicationDate: string | null = null;
    
    if (dateMatch) {
      if (dateMatch[0].includes('-')) {
        publicationDate = dateMatch[0];
      } else {
        const months: Record<string, string> = {
          'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
          'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
          'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
        };
        const day = dateMatch[1].padStart(2, '0');
        const month = months[dateMatch[2].toLowerCase()] || '01';
        const year = dateMatch[3];
        publicationDate = `${year}-${month}-${day}`;
      }
    }
    
    // Extract external ID from URL
    const idMatch = url.match(/(\d+)(?:\?|$|\/)/);
    const externalId = idMatch ? idMatch[1] : url;
    
    if (!number && !fullTitle) {
      return null;
    }
    
    return {
      number: number || fullTitle,
      title: fullTitle,
      summary,
      entity,
      publicationDate,
      documentUrl: url,
      externalId: `dre-link-${externalId}`
    };
  } catch (error) {
    console.error('Error parsing HTML:', error);
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { links } = await req.json();

    if (!links || !Array.isArray(links) || links.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Links array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting import of ${links.length} DRE links...`);

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
    const results: { url: string; status: string; number?: string }[] = [];

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
        console.log(`Fetching: ${url}`);
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const parsed = parseHtmlContent(html, url);

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
        results.push({ url, status: 'created', number: parsed.number });
        console.log(`Created: ${parsed.number}`);

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
