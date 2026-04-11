import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DREDocument {
  number: string;
  title: string;
  summary: string;
  entity: string;
  publicationDate: string | null;
  effectiveDate: string | null;
  documentUrl: string;
  externalId: string;
}

const monthNames: Record<string, string> = {
  janeiro: '01', fevereiro: '02', março: '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08',
  setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
};

function sanitizeDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    return (y >= 1900 && y <= new Date().getFullYear() + 1) ? dateStr : null;
  } catch { return null; }
}

function parseDate(s: string): string | null {
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return sanitizeDate(m[0]);
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return sanitizeDate(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  m = s.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (m && monthNames[m[2].toLowerCase()]) return sanitizeDate(`${m[3]}-${monthNames[m[2].toLowerCase()]}-${m[1].padStart(2,'0')}`);
  return null;
}

function parseDiplomaMarkdown(markdown: string, url: string): DREDocument | null {
  if (!markdown || markdown.length < 100) return null;
  if (markdown.includes('página que acedeu não se encontra disponível')) return null;

  const urlMatch = url.match(/\/dr\/detalhe\/([^\/]+)\/([^\/]+)/);
  if (!urlMatch) return null;

  const type = urlMatch[1].replace(/-/g, ' ');
  const capitalizedType = type.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const refParts = urlMatch[2].split('-');
  
  let number = '';
  let externalId = urlMatch[2];

  // Parse URL ref: could be num-year-id or num-suffix-year-id
  if (refParts.length >= 3) {
    const lastPart = refParts[refParts.length - 1];
    const yearPart = refParts[refParts.length - 2];
    if (/^\d{4}$/.test(yearPart) && lastPart.length > 6) {
      const numParts = refParts.slice(0, -2).join('-');
      number = `${capitalizedType} n.º ${numParts}/${yearPart}`;
      externalId = lastPart;
    } else if (/^\d{4}$/.test(refParts[1]) && refParts.length === 3) {
      number = `${capitalizedType} n.º ${refParts[0]}/${refParts[1]}`;
      externalId = refParts[2];
    }
  }
  if (!number && refParts.length >= 2) {
    number = `${capitalizedType} n.º ${refParts[0]}/${refParts[1]}`;
  }
  if (!number) return null;

  // Extract title
  let title = number;
  const titleMatch = markdown.match(/(?:Portaria|Decreto-Lei|Despacho|Lei|Regulamento|Resolução|Declaração|Aviso|Decreto|Edital|Deliberação)[^\n]*n\.º[^\n]+/i);
  if (titleMatch) title = titleMatch[0].trim().replace(/\*+/g, '').replace(/\[|\]/g, '').replace(/\(.*?\)/g, '').trim();

  // Extract summary
  let summary = '';
  for (const p of [
    /SUMÁRIO\s*[:\-]?\s*([\s\S]+?)(?=\n\s*(?:TEXTO|Emissor|Entidade|\n#|\*\*Emissor|\*\*Data))/i,
    /Sumário[:\s]*([\s\S]+?)(?=\n\s*(?:Texto|Emissor|Entidade|\*\*))/i,
  ]) {
    const m = markdown.match(p);
    if (m?.[1]) {
      const c = m[1].trim().replace(/\s+/g, ' ').replace(/\[.*?\]\([^)]*\)/g, '').replace(/\*+/g, '').substring(0, 1000);
      if (c.length > 20) { summary = c; break; }
    }
  }
  if (!summary) {
    const lines = markdown.split('\n').filter(l => l.trim().length > 30 && !l.startsWith('#') && !l.startsWith('['));
    summary = (lines[0] || '').replace(/\*+/g, '').substring(0, 500);
  }

  // Extract entity
  let entity = '';
  const em = markdown.match(/(?:Emissor|Entidade)[:\s]*\**([^\n*]+)/i);
  if (em) entity = em[1].trim().replace(/\*+/g, '').substring(0, 200);

  // Extract dates
  let publicationDate: string | null = null;
  for (const p of [/Data de Publicação[:\s]*\**([^\n*]+)/i, /Publicação[:\s]*\**([^\n*]+)/i, /Diário.*?(\d{4}-\d{2}-\d{2})/i]) {
    const m = markdown.match(p);
    if (m) { publicationDate = parseDate(m[1]); if (publicationDate) break; }
  }

  let effectiveDate: string | null = null;
  const effM = markdown.match(/(?:Data de entrada em vigor|Entrada em vigor|Vigência)[:\s]*\**([^\n*]+)/i);
  if (effM) effectiveDate = parseDate(effM[1]);

  return { number, title, summary, entity, publicationDate, effectiveDate, documentUrl: url, externalId };
}

function normalizeNumber(num: string): string {
  return num.toLowerCase().replace(/\s+/g, ' ').replace(/n\.º\s*/g, 'n.º ').trim();
}

function matchCategories(doc: DREDocument, categories: any[]): string[] {
  const ids: string[] = [];
  const text = `${doc.title} ${doc.summary} ${doc.number}`.toLowerCase();
  for (const c of categories) {
    if (!c.keywords?.length) continue;
    for (const kw of c.keywords) {
      if (text.includes(kw.toLowerCase())) { ids.push(c.id); break; }
    }
  }
  return ids;
}

// Excluded doc types from DRE (not legislation)
const EXCLUDED_TYPES = ['anuncio', 'contrato-publico', 'aviso-extrato', 'diario-republica'];

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

async function processInBackground(
  supabase: any, urls: string[], logId: string, firecrawlApiKey: string,
  categories: any[], existingByNum: Map<string, any>, existingByExt: Map<string, any>,
): Promise<void> {
  let processed = 0, added = 0, updated = 0, skipped = 0;
  console.log(`🚀 Processing ${urls.length} diploma URLs`);

  for (let i = 0; i < urls.length; i += 3) {
    const batch = urls.slice(i, i + 3);
    const results = await Promise.all(batch.map(async (url) => {
      try {
        const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firecrawlApiKey}` },
          body: JSON.stringify({ url, formats: ['markdown'], waitFor: 3000, onlyMainContent: true }),
        });
        if (!resp.ok) { console.warn(`Firecrawl ${resp.status} for ${url}`); return null; }
        const data = await resp.json();
        return parseDiplomaMarkdown(data?.data?.markdown || '', url);
      } catch (e) { console.error(`Error scraping ${url}:`, e); return null; }
    }));

    for (const doc of results) {
      processed++;
      if (!doc) { skipped++; continue; }

      const normNum = normalizeNumber(doc.number);
      const existing = existingByExt.get(doc.externalId) || existingByNum.get(normNum);

      if (existing) {
        const upd: Record<string, unknown> = {};
        if (doc.title && doc.title !== doc.number && (!existing.title || existing.title === existing.number)) upd.title = doc.title;
        if (doc.summary?.length > 20 && (!existing.summary || existing.summary.length < doc.summary.length)) upd.summary = doc.summary;
        if (doc.entity && !existing.entity) upd.entity = doc.entity;
        if (doc.publicationDate && !existing.publication_date) upd.publication_date = doc.publicationDate;
        if (doc.effectiveDate && !existing.effective_date) upd.effective_date = doc.effectiveDate;
        if (doc.documentUrl && !existing.document_url) upd.document_url = doc.documentUrl;
        if (Object.keys(upd).length > 0) {
          upd.updated_at = new Date().toISOString();
          await supabase.from('legislation').update(upd).eq('id', existing.id);
          updated++;
          console.log(`Updated: ${doc.number}`);
        }
        continue;
      }

      const { data: newLeg, error } = await supabase.from('legislation').insert({
        external_id: doc.externalId, source: 'dre', number: doc.number, title: doc.title,
        summary: doc.summary, entity: doc.entity, origin: 'PT',
        publication_date: doc.publicationDate, effective_date: doc.effectiveDate,
        document_url: doc.documentUrl,
      }).select('id').single();

      if (error) { console.error(`Insert error ${doc.number}:`, error.message); continue; }

      added++;
      existingByNum.set(normNum, { ...doc, id: newLeg.id });
      existingByExt.set(doc.externalId, { ...doc, id: newLeg.id });
      console.log(`Added: ${doc.number}`);

      const catIds = matchCategories(doc, categories);
      if (catIds.length > 0) {
        await supabase.from('legislation_category_mapping').insert(
          catIds.map(cid => ({ legislation_id: newLeg.id, category_id: cid }))
        );
      }
    }

    // Update progress every batch
    await supabase.from('sync_logs').update({
      items_processed: processed, items_added: added, items_updated: updated,
    }).eq('id', logId);

    // Throttle
    if (i + 3 < urls.length) await new Promise(r => setTimeout(r, 500));
  }

  await supabase.from('sync_logs').update({
    items_processed: processed, items_added: added, items_updated: updated,
    status: 'completed', completed_at: new Date().toISOString(),
  }).eq('id', logId);

  console.log(`✅ Done: ${added} added, ${updated} updated, ${skipped} skipped / ${processed} total`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { yearFilter = '2026', dryRun = false, mapLimit = 5000 } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!firecrawlApiKey) {
      return new Response(JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 1: Use Firecrawl map to discover diploma URLs
    console.log(`📍 Discovering ${yearFilter} diploma URLs via Firecrawl map...`);
    const mapResp = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firecrawlApiKey}` },
      body: JSON.stringify({ url: 'https://diariodarepublica.pt', limit: mapLimit }),
    });

    if (!mapResp.ok) {
      return new Response(JSON.stringify({ success: false, error: `Map API returned ${mapResp.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const mapData = await mapResp.json();
    const allLinks: string[] = mapData?.links || [];
    console.log(`Found ${allLinks.length} total links`);

    // Filter to relevant legislation URLs for the specified year
    const diplomaUrls = allLinks.filter(link => {
      if (!link.includes('/dr/detalhe/')) return false;
      if (!link.includes(yearFilter)) return false;
      const typePart = link.replace('https://diariodarepublica.pt/dr/detalhe/', '').split('/')[0];
      return !EXCLUDED_TYPES.some(ex => typePart.includes(ex));
    });

    console.log(`📋 Found ${diplomaUrls.length} ${yearFilter} legislation URLs`);

    // Load existing for dedup
    const { data: existingLeg } = await supabase
      .from('legislation')
      .select('id, number, title, summary, entity, publication_date, effective_date, document_url, external_id')
      .limit(5000);

    const existingByNum = new Map<string, any>();
    const existingByExt = new Map<string, any>();
    for (const leg of existingLeg || []) {
      const n = normalizeNumber(leg.number || '');
      if (n) existingByNum.set(n, leg);
      if (leg.external_id) existingByExt.set(leg.external_id, leg);
    }

    // Filter out already imported
    const newUrls = diplomaUrls.filter(url => {
      const urlMatch = url.match(/\/dr\/detalhe\/([^\/]+)\/([^\/]+)/);
      if (!urlMatch) return true;
      const refParts = urlMatch[2].split('-');
      const externalId = refParts[refParts.length - 1];
      return !existingByExt.has(externalId);
    });

    console.log(`🆕 ${newUrls.length} new URLs to process (${diplomaUrls.length - newUrls.length} already imported)`);

    if (dryRun) {
      // Count by type
      const typeCounts: Record<string, number> = {};
      for (const url of newUrls) {
        const t = url.replace('https://diariodarepublica.pt/dr/detalhe/', '').split('/')[0];
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      return new Response(JSON.stringify({
        success: true, dryRun: true, totalDiscovered: diplomaUrls.length,
        newToImport: newUrls.length, alreadyImported: diplomaUrls.length - newUrls.length,
        byType: typeCounts, sampleUrls: newUrls.slice(0, 10),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (newUrls.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No new legislation to import', total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Load categories
    const { data: categories } = await supabase.from('theme_categories').select('id, name, keywords, theme_id');

    // Create sync log
    const { data: logEntry, error: logError } = await supabase.from('sync_logs').insert({
      sync_type: 'bulk_import_dre', status: 'running', items_processed: 0, items_added: 0,
    }).select().single();

    if (logError) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to create sync log' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Start background
    EdgeRuntime.waitUntil(processInBackground(
      supabase, newUrls, logEntry.id, firecrawlApiKey,
      categories || [], existingByNum, existingByExt,
    ));

    return new Response(JSON.stringify({
      success: true, jobId: logEntry.id,
      message: `Importing ${newUrls.length} new legislation items in background`,
      totalDiscovered: diplomaUrls.length, newToImport: newUrls.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
