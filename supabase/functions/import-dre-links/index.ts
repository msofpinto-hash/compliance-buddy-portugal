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
    // Try to extract from article schema (more reliable)
    const articleMatch = html.match(/headline="([^"]+)"/i);
    const datePublishedMatch = html.match(/datepublished="([^"]+)"/i);
    
    // Extract title from breadcrumb or h1
    let title = '';
    if (articleMatch) {
      title = articleMatch[1].trim();
    } else {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) title = h1Match[1].trim();
    }
    
    // Extract number from title or URL
    let number = title;
    const urlNumberMatch = url.match(/detalhe\/([^\/]+)\/([^\/]+)/);
    if (urlNumberMatch && !title) {
      // Convert URL slug to number: "portaria/15-2026-1002139945" -> "Portaria n.º 15/2026"
      const type = urlNumberMatch[1].charAt(0).toUpperCase() + urlNumberMatch[1].slice(1);
      const numParts = urlNumberMatch[2].split('-');
      if (numParts.length >= 2) {
        number = `${type} n.º ${numParts[0]}/${numParts[1]}`;
        title = number;
      }
    }
    
    // Extract summary - look for SUMÁRIO section
    let summary = '';
    const sumarioIndex = html.indexOf('SUMÁRIO');
    if (sumarioIndex !== -1) {
      const afterSumario = html.substring(sumarioIndex + 10, sumarioIndex + 2000);
      // Get text until TEXTO section
      const textoIndex = afterSumario.indexOf('TEXTO');
      const sumarioText = textoIndex !== -1 ? afterSumario.substring(0, textoIndex) : afterSumario;
      // Clean HTML tags
      summary = sumarioText
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 1000);
    }
    
    // Extract entity/emissor
    let entity = '';
    const emissorMatch = html.match(/Emissor[:\s]*(?:<[^>]+>)*\s*([^<]+)/i);
    if (emissorMatch) {
      entity = emissorMatch[1].trim();
    }
    
    // Extract publication date
    let publicationDate: string | null = null;
    if (datePublishedMatch) {
      const dateStr = datePublishedMatch[1];
      // Parse date from various formats
      const dateObj = new Date(dateStr);
      if (!isNaN(dateObj.getTime())) {
        publicationDate = dateObj.toISOString().split('T')[0];
      }
    }
    
    // Fallback: extract date from URL or text
    if (!publicationDate) {
      const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        publicationDate = dateMatch[1];
      }
    }
    
    // Extract external ID from URL
    const idMatch = url.match(/(\d+)(?:\?|$)/);
    const externalId = idMatch ? `dre-${idMatch[1]}` : `dre-${Date.now()}`;
    
    if (!number && !title) {
      console.log('Could not extract number or title from HTML');
      return null;
    }
    
    console.log(`Parsed: ${number}, Entity: ${entity}, Date: ${publicationDate}`);
    
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
