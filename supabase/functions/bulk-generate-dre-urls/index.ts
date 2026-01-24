import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LegislationRecord {
  id: string;
  number: string;
  title: string;
  source: string;
}

// Normalize month names to numbers
const MONTH_MAP: Record<string, string> = {
  'janeiro': '01', 'jan': '01', 'fevereiro': '02', 'fev': '02', 'mar': '03', 'março': '03',
  'abril': '04', 'abr': '04', 'maio': '05', 'mai': '05', 'junho': '06', 'jun': '06',
  'julho': '07', 'jul': '07', 'agosto': '08', 'ago': '08', 'setembro': '09', 'set': '09',
  'outubro': '10', 'out': '10', 'novembro': '11', 'nov': '11', 'dezembro': '12', 'dez': '12'
};

// Generate DRE URL from legislation number
function generateDreUrl(number: string): string | null {
  // Clean and normalize the number
  let normalized = number.trim()
    .replace(/\s+/g, ' ')
    .replace(/n\.?º?\s*/gi, 'n.º ')
    .replace(/de\s+(\d+)\s+de\s+/gi, 'de $1 de ')
    .toLowerCase();

  // Pattern: "Tipo n.º XXX/YYYY" or "Tipo n.º XXX/YYYY/S" (with series)
  // Examples: "Decreto-Lei n.º 276-B/2007", "Portaria n.º 57-D/2015"
  
  let tipo = '';
  let num = '';
  let year = '';
  let series = '';
  let suffix = ''; // For -A, -B, etc.
  
  // Match patterns like "decreto-lei n.º 276-b/2007 de 31 de julho"
  const patterns = [
    // Pattern with suffix: Decreto-Lei n.º 276-B/2007
    /^(decreto-lei|portaria|lei|despacho|aviso|regulamento|resolução|declaração(?:\s+de\s+retificação)?)\s+n\.?º?\s*(\d+)([a-z])?[-\/]?([a-z])?[-\/]?(\d{2,4})(?:[-\/](\d))?/i,
    // Pattern: Tipo n.º X-Y/AAAA/S (with letter suffix)
    /^(decreto-lei|portaria|lei|despacho|aviso|regulamento|resolução|declaração(?:\s+de\s+retificação)?)\s+n\.?º?\s*(\d+)-([a-z])\/(\d{2,4})(?:\/(\d))?/i,
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      tipo = match[1];
      num = match[2];
      suffix = (match[3] || match[4] || '').toUpperCase();
      year = match[4] || match[5] || '';
      series = match[5] || match[6] || '';
      
      // Normalize 2-digit years
      if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
      }
      
      break;
    }
  }
  
  if (!tipo || !num || !year) {
    // Try simpler pattern
    const simpleMatch = normalized.match(
      /^(decreto-lei|portaria|lei|despacho|aviso|regulamento|resolução|declaração(?:\s+de\s+retificação)?)\s+n\.?º?\s*(\d+)[-\/](\d{2,4})/i
    );
    if (simpleMatch) {
      tipo = simpleMatch[1];
      num = simpleMatch[2];
      year = simpleMatch[3];
      if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
      }
    } else {
      return null;
    }
  }
  
  // Map tipo to DRE URL format
  const tipoUrlMap: Record<string, string> = {
    'decreto-lei': 'decreto-lei',
    'portaria': 'portaria',
    'lei': 'lei',
    'despacho': 'despacho',
    'aviso': 'aviso',
    'regulamento': 'regulamento',
    'resolução': 'resolucao',
    'resolucao': 'resolucao',
    'declaração de retificação': 'declaracao-de-retificacao',
  };
  
  const urlTipo = tipoUrlMap[tipo.toLowerCase()] || tipo.toLowerCase().replace(/\s+/g, '-');
  
  // Build URL - DRE format: https://diariodarepublica.pt/dr/detalhe/{tipo}/{num-suffix}/{year}
  // Or with series: https://diariodarepublica.pt/dr/detalhe/{tipo}/{num-suffix}/{year}/{series}
  let url = `https://diariodarepublica.pt/dr/detalhe/${urlTipo}/${num}`;
  
  if (suffix) {
    url += `-${suffix.toLowerCase()}`;
  }
  
  url += `/${year}`;
  
  if (series) {
    url += `/${series}`;
  }
  
  return url;
}

// Check if legislation should be marked as no_digital_version
function shouldMarkNoDigitalVersion(record: LegislationRecord): boolean {
  const number = record.number.toLowerCase();
  const title = record.title.toLowerCase();
  
  // Very old legislation (before 1974 revolution)
  const yearMatch = number.match(/\/(\d{2,4})(?:\/|$)/);
  if (yearMatch) {
    let year = parseInt(yearMatch[1]);
    if (year < 100) year = year > 50 ? 1900 + year : 2000 + year;
    if (year < 1974 && !number.includes('decreto-lei')) {
      return true;
    }
  }
  
  // International conventions and treaties
  if (
    title.includes('convenção') ||
    title.includes('tratado') ||
    title.includes('protocolo') ||
    number.includes('convenção') ||
    number.includes('tratado')
  ) {
    return true;
  }
  
  // UN regulations
  if (number.includes('onu') || number.includes('un ece') || number.includes('un-ece')) {
    return true;
  }
  
  // Very high despacho numbers (administrative)
  const despachoMatch = number.match(/despacho\s+n\.?º?\s*(\d+)/i);
  if (despachoMatch && parseInt(despachoMatch[1]) > 20000) {
    // Likely administrative, not legally relevant
    return true;
  }
  
  return false;
}

// Validate URL by checking if it returns 200
async function validateUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      limit = 200, 
      validateUrls = false,
      dryRun = false,
      types = ['Decreto-Lei', 'Portaria', 'Lei', 'Aviso', 'Despacho', 'Declaração de Retificação'],
      parallel = 50
    } = await req.json();

    console.log(`🚀 Bulk URL generation started - limit: ${limit}, validate: ${validateUrls}, dryRun: ${dryRun}`);

    // Fetch records without URLs
    let query = supabase
      .from('legislation')
      .select('id, number, title, source')
      .or('document_url.is.null,document_url.eq.')
      .or('no_digital_version.is.null,no_digital_version.eq.false')
      .limit(limit);
    
    const { data: records, error } = await query;
    
    if (error) throw error;
    if (!records || records.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No records to process',
        stats: { total: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`📋 Found ${records.length} records to process`);

    let generated = 0;
    let validated = 0;
    let markedNoDigital = 0;
    let skipped = 0;
    
    const updates: { id: string; document_url?: string; no_digital_version?: boolean }[] = [];
    
    // Process in batches for parallel validation
    const processBatch = async (batch: LegislationRecord[]) => {
      const batchPromises = batch.map(async (record) => {
        // Check if should be marked as no_digital_version
        if (shouldMarkNoDigitalVersion(record)) {
          updates.push({ id: record.id, no_digital_version: true });
          markedNoDigital++;
          return;
        }
        
        // Try to generate URL
        const url = generateDreUrl(record.number);
        
        if (!url) {
          skipped++;
          return;
        }
        
        // Optionally validate
        if (validateUrls) {
          const isValid = await validateUrl(url);
          if (isValid) {
            updates.push({ id: record.id, document_url: url });
            validated++;
          } else {
            skipped++;
          }
        } else {
          updates.push({ id: record.id, document_url: url });
          generated++;
        }
      });
      
      await Promise.all(batchPromises);
    };
    
    // Process in parallel batches
    for (let i = 0; i < records.length; i += parallel) {
      const batch = records.slice(i, i + parallel);
      await processBatch(batch);
      console.log(`✅ Processed ${Math.min(i + parallel, records.length)}/${records.length}`);
    }
    
    // Apply updates
    if (!dryRun && updates.length > 0) {
      // Split into URL updates and no_digital updates
      const urlUpdates = updates.filter(u => u.document_url);
      const noDigitalUpdates = updates.filter(u => u.no_digital_version);
      
      // Update URLs in parallel batches
      const updateBatchSize = 50;
      for (let i = 0; i < urlUpdates.length; i += updateBatchSize) {
        const batch = urlUpdates.slice(i, i + updateBatchSize);
        await Promise.all(batch.map(u => 
          supabase.from('legislation').update({ document_url: u.document_url }).eq('id', u.id)
        ));
      }
      
      // Update no_digital flags
      for (let i = 0; i < noDigitalUpdates.length; i += updateBatchSize) {
        const batch = noDigitalUpdates.slice(i, i + updateBatchSize);
        await Promise.all(batch.map(u => 
          supabase.from('legislation').update({ no_digital_version: true }).eq('id', u.id)
        ));
      }
      
      console.log(`💾 Applied ${updates.length} updates`);
    }

    const stats = {
      total: records.length,
      generated: validateUrls ? validated : generated,
      markedNoDigital,
      skipped,
      dryRun
    };

    console.log('📊 Stats:', stats);

    return new Response(JSON.stringify({ 
      success: true, 
      stats,
      message: dryRun 
        ? `Dry run: would generate ${generated} URLs and mark ${markedNoDigital} as no digital version`
        : `Generated ${generated} URLs, marked ${markedNoDigital} as no digital version`
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
