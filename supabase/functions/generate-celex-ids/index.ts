import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract CELEX from various EU legislation number formats
function generateCelexFromNumber(number: string, title: string): string | null {
  const combined = `${number} ${title}`.toUpperCase();
  
  // Pattern 1: Direct CELEX (32024R1234)
  let match = combined.match(/\b(3\d{4}[A-Z]\d{4,5})\b/);
  if (match) return match[1];
  
  // Pattern 2: Modern format "(UE) 2024/1234" or "(EU) 2024/1234" with various ordinal markers
  // Supports: n.º, n.°, n.o, nº, n°, no, n.⁰ or none - more permissive regex
  match = combined.match(/\(U?E\)\s*(?:N\.?\s*[ºO°o⁰]?\s*)?(20\d{2})\/(\d+)/i);
  if (match && match[1] && match[2]) {
    const year = match[1];
    const num = match[2].padStart(4, '0');
    const type = detectDocumentType(combined);
    return `3${year}${type}${num}`;
  }
  
  // Pattern 3: Old format "2024/1234/UE" or "2024/1234/CE"
  match = combined.match(/(20\d{2})\/(\d+)\/(UE|CE|EU|EC|CEE|EEC)/i);
  if (match) {
    const year = match[1];
    const num = match[2].padStart(4, '0');
    const type = detectDocumentType(combined);
    return `3${year}${type}${num}`;
  }
  
  // Pattern 4: Legacy format "1234/2024/CEE" (number/year)
  match = combined.match(/(\d+)\/(19\d{2}|20\d{2})\/(CEE|CE|UE|EU|EC|EEC)/i);
  if (match) {
    const num = match[1].padStart(4, '0');
    const year = match[2];
    const type = detectDocumentType(combined);
    return `3${year}${type}${num}`;
  }
  
  // Pattern 4b: "(CE) n.º 1234/2009" or "(CEE) n.º 2328/91"
  match = combined.match(/\((?:CE|CEE|EC|EEC)\)\s*N\.?[ºO°]?\s*(\d+)\/(19\d{2}|20\d{2}|\d{2})/i);
  if (match && match[1] && match[2]) {
    const num = match[1].padStart(4, '0');
    let year = match[2];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    const type = detectDocumentType(combined);
    return `3${year}${type}${num}`;
  }
  
  // Pattern 5: Very old format "89/106/CEE"
  match = combined.match(/(\d{2})\/(\d+)\/(CEE|CE|EEC|EC)/i);
  if (match) {
    const shortYear = match[1];
    const year = parseInt(shortYear) > 50 ? `19${shortYear}` : `20${shortYear}`;
    const num = match[2].padStart(4, '0');
    const type = detectDocumentType(combined);
    return `3${year}${type}${num}`;
  }
  
  // Pattern 6: "Regulamento (UE) n.º 2024/1234"
  match = combined.match(/(?:REGULAMENTO|DIRETIVA|DECISÃO|DIRECTIVA)\s*(?:\(U?E\))?\s*(?:N\.?[ºO°]?\s*)?(20\d{2})\/(\d+)/i);
  if (match) {
    const year = match[1];
    const num = match[2].padStart(4, '0');
    const type = detectDocumentType(combined);
    return `3${year}${type}${num}`;
  }
  
  // Pattern 7: Just year/number like "2017/1216"
  match = combined.match(/\b(20\d{2})\/(\d{3,5})\b/);
  if (match) {
    const year = match[1];
    const num = match[2].padStart(4, '0');
    const type = detectDocumentType(combined);
    return `3${year}${type}${num}`;
  }
  
  return null;
}

// Detect document type from text
function detectDocumentType(text: string): string {
  const upper = text.toUpperCase();
  
  if (/\bREGULAMENTO\s+DE\s+EXECU[CÇ][AÃ]O\b/i.test(text)) return 'R';
  if (/\bREGULAMENTO\s+DELEGADO\b/i.test(text)) return 'R';
  if (/\bREGULAMENTO\b/i.test(text)) return 'R';
  if (/\bREGULATION\b/i.test(text)) return 'R';
  
  if (/\bDIRETIVA\b/i.test(text) || /\bDIRECTIVA\b/i.test(text) || /\bDIRECTIVE\b/i.test(text)) return 'L';
  
  if (/\bDECIS[AÃ]O\s+DE\s+EXECU[CÇ][AÃ]O\b/i.test(text)) return 'D';
  if (/\bDECIS[AÃ]O\b/i.test(text) || /\bDECISION\b/i.test(text)) return 'D';
  
  if (/\bRECOMENDA[CÇ][AÃ]O\b/i.test(text) || /\bRECOMMENDATION\b/i.test(text)) return 'H';
  
  if (/\bORIENTA[CÇ][AÃ]O\b/i.test(text) || /\bGUIDELINE\b/i.test(text)) return 'O';
  
  // Default to R (Regulation) if unclear
  return 'R';
}

// Validate CELEX format
function isValidCelex(celex: string): boolean {
  // Valid CELEX: 3 + 4-digit year + type letter + 4-5 digit number
  return /^3(19|20)\d{2}[A-Z]\d{4,5}$/.test(celex);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { limit = 100, dryRun = false } = await req.json().catch(() => ({}));

    console.log(`Starting CELEX generation - limit: ${limit}, dryRun: ${dryRun}`);

    // Find EU legislation without external_id (CELEX)
    const { data: legislation, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title, external_id')
      .or('origin.eq.EU,origin.eq.eurlex')
      .is('external_id', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch legislation: ${fetchError.message}`);
    }

    console.log(`Found ${legislation?.length || 0} EU documents without CELEX`);

    if (!legislation || legislation.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        totalProcessed: 0,
        generated: 0,
        failed: 0,
        message: 'Todos os diplomas EU já têm CELEX'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let generated = 0;
    let failed = 0;
    const results: Array<{ id: string; number: string; celex: string | null; success: boolean }> = [];

    for (const doc of legislation) {
      const celex = generateCelexFromNumber(doc.number, doc.title);
      
      if (!celex || !isValidCelex(celex)) {
        console.log(`Could not generate valid CELEX for: ${doc.number}`);
        results.push({ id: doc.id, number: doc.number, celex: null, success: false });
        failed++;
        continue;
      }

      console.log(`Generated CELEX ${celex} for: ${doc.number}`);
      
      if (dryRun) {
        results.push({ id: doc.id, number: doc.number, celex, success: true });
        generated++;
        continue;
      }

      // Generate document URL from CELEX
      const docUrl = `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;

      const { error: updateError } = await supabase
        .from('legislation')
        .update({
          external_id: celex,
          document_url: docUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', doc.id);

      if (updateError) {
        console.error(`Failed to update ${doc.number}:`, updateError);
        results.push({ id: doc.id, number: doc.number, celex, success: false });
        failed++;
      } else {
        results.push({ id: doc.id, number: doc.number, celex, success: true });
        generated++;
      }
    }

    const response = {
      success: true,
      totalProcessed: legislation.length,
      generated,
      failed,
      dryRun,
      results: results.slice(0, 50),
      message: dryRun
        ? `[SIMULAÇÃO] Seriam gerados ${generated} CELEX de ${legislation.length} processados`
        : `Gerados ${generated} CELEX de ${legislation.length} processados`
    };

    console.log('CELEX generation completed:', response.message);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in generate-celex-ids function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
