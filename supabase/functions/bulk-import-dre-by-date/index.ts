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

const months: Record<string, string> = {
  janeiro: '01', fevereiro: '02', março: '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08',
  setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
};

function sanitizeDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const currentYear = new Date().getFullYear();
    if (year >= 1900 && year <= currentYear + 1) return dateStr;
    return null;
  } catch {
    return null;
  }
}

function parseDate(dateStr: string): string | null {
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return sanitizeDate(isoMatch[0]);

  const slashMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) return sanitizeDate(`${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`);

  const ptMatch = dateStr.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (ptMatch) {
    const month = months[ptMatch[2].toLowerCase()];
    if (month) return sanitizeDate(`${ptMatch[3]}-${month}-${ptMatch[1].padStart(2, '0')}`);
  }
  return null;
}

// Parse a diploma detail page markdown
function parseDiplomaMarkdown(markdown: string, url: string, pageDate: string): DREDocument | null {
  if (!markdown || markdown.length < 100) return null;
  if (markdown.includes('página que acedeu não se encontra disponível') || 
      (markdown.includes('Lamentamos') && markdown.length < 500)) return null;

  // Extract from URL: /dr/detalhe/tipo/numero-ano-id
  const urlMatch = url.match(/\/dr\/detalhe\/([^\/]+)\/([^\/]+)/);
  if (!urlMatch) return null;

  const type = urlMatch[1].replace(/-/g, ' ');
  const capitalizedType = type.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const refParts = urlMatch[2].split('-');
  
  let number = '';
  let externalId = urlMatch[2];
  
  if (refParts.length >= 3) {
    // Format: numero-ano-dbid (e.g., 156-2026-1083325918)
    // Could also be: numero-sufixo-ano-dbid (e.g., 10-a-2026-123456)
    const lastPart = refParts[refParts.length - 1];
    const yearPart = refParts[refParts.length - 2];
    
    if (/^\d{4}$/.test(yearPart) && lastPart.length > 6) {
      // Standard: num-year-id
      const numParts = refParts.slice(0, -2).join('-');
      number = `${capitalizedType} n.º ${numParts}/${yearPart}`;
      externalId = lastPart;
    } else if (/^\d{4}$/.test(refParts[1]) && refParts.length === 3) {
      number = `${capitalizedType} n.º ${refParts[0]}/${refParts[1]}`;
      externalId = refParts[2];
    } else {
      number = `${capitalizedType} n.º ${refParts[0]}/${refParts[1]}`;
      externalId = refParts[refParts.length - 1];
    }
  } else if (refParts.length === 2) {
    number = `${capitalizedType} n.º ${refParts[0]}/${refParts[1]}`;
  }

  if (!number) return null;

  // Extract title from markdown
  let title = number;
  const titleMatch = markdown.match(/(?:Portaria|Decreto-Lei|Despacho|Lei|Regulamento|Resolução|Declaração|Aviso)[^\n]*n\.º[^\n]+/i);
  if (titleMatch) {
    title = titleMatch[0].trim().replace(/\*+/g, '').replace(/\[|\]/g, '').replace(/\(.*?\)/g, '').trim();
  }

  // Extract summary
  let summary = '';
  const sumPatterns = [
    /SUMÁRIO\s*[:\-]?\s*([\s\S]+?)(?=\n\s*(?:TEXTO|Emissor|Entidade|\n#|\*\*Emissor|\*\*Data))/i,
    /Sumário[:\s]*([\s\S]+?)(?=\n\s*(?:Texto|Emissor|Entidade|\*\*))/i,
  ];
  for (const p of sumPatterns) {
    const m = markdown.match(p);
    if (m?.[1]) {
      const cleaned = m[1].trim().replace(/\s+/g, ' ').replace(/\[.*?\]\([^)]*\)/g, '').replace(/\*+/g, '').substring(0, 1000);
      if (cleaned.length > 20) { summary = cleaned; break; }
    }
  }
  if (!summary) {
    // Use first meaningful paragraph
    const lines = markdown.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('[') && l.length > 30);
    summary = (lines[0] || '').replace(/\*+/g, '').substring(0, 500);
  }

  // Extract entity
  let entity = '';
  const entityMatch = markdown.match(/(?:Emissor|Entidade)[:\s]*\**([^\n*]+)/i);
  if (entityMatch) entity = entityMatch[1].trim().replace(/\*+/g, '').substring(0, 200);

  // Extract dates
  let publicationDate: string | null = null;
  const pubPatterns = [
    /Data de Publicação[:\s]*\**([^\n*]+)/i,
    /Publicação[:\s]*\**([^\n*]+)/i,
    /Diário da República.*?(\d{4}-\d{2}-\d{2})/i,
  ];
  for (const p of pubPatterns) {
    const m = markdown.match(p);
    if (m) { publicationDate = parseDate(m[1]); if (publicationDate) break; }
  }
  if (!publicationDate) publicationDate = pageDate;

  let effectiveDate: string | null = null;
  const effMatch = markdown.match(/(?:Data de entrada em vigor|Entrada em vigor|Vigência)[:\s]*\**([^\n*]+)/i);
  if (effMatch) effectiveDate = parseDate(effMatch[1]);

  return {
    number, title, summary, entity,
    publicationDate, effectiveDate,
    documentUrl: url, externalId
  };
}

// Generate all business dates between two dates
function getBusinessDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    // Include weekdays only (DRE doesn't publish on weekends typically)
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Scrape a DRE daily page to get diploma links
async function scrapeDailyPage(date: string, firecrawlApiKey: string): Promise<string[]> {
  const seriesUrls = [
    `https://diariodarepublica.pt/dr/diario/serie-i/${date}`,
    `https://diariodarepublica.pt/dr/diario/serie-ii/${date}`,
  ];
  
  const allLinks: string[] = [];
  
  for (const pageUrl of seriesUrls) {
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firecrawlApiKey}`,
        },
        body: JSON.stringify({
          url: pageUrl,
          formats: ['links'],
          waitFor: 5000,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 402 || status === 429) {
          console.warn(`Firecrawl rate limited (${status}) for ${pageUrl}`);
          return allLinks; // Stop to avoid burning credits
        }
        continue;
      }

      const data = await response.json();
      const links: string[] = data?.data?.links || [];
      
      const diplomaLinks = links.filter((link: string) =>
        link.includes('/dr/detalhe/') &&
        !link.includes('legislacao-consolidada') &&
        !link.includes('diario-republica')
      );
      
      allLinks.push(...diplomaLinks);
    } catch (error) {
      console.error(`Error scraping daily page ${pageUrl}:`, error);
    }
  }
  
  return [...new Set(allLinks)]; // Deduplicate
}

// Scrape a single diploma page
async function scrapeDiploma(url: string, firecrawlApiKey: string, pageDate: string): Promise<DREDocument | null> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        waitFor: 3000,
        onlyMainContent: true,
      }),
    });

    if (!response.ok) {
      console.warn(`Firecrawl ${response.status} for diploma ${url}`);
      return null;
    }

    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    return parseDiplomaMarkdown(markdown, url, pageDate);
  } catch (error) {
    console.error(`Error scraping diploma ${url}:`, error);
    return null;
  }
}

// Normalize number for duplicate detection
function normalizeNumber(num: string): string {
  return num.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ' ')
    .replace(/n\.º\s*/g, 'n.º ')
    .replace(/de\s+(\d)/g, '$1')
    .replace(/\s+de\s+\d{1,2}\s+de\s+\w+$/i, '')
    .trim();
}

// Match categories by keywords
function matchCategories(doc: DREDocument, categories: any[]): string[] {
  const matchedIds: string[] = [];
  const searchText = `${doc.title} ${doc.summary} ${doc.number}`.toLowerCase();
  for (const cat of categories) {
    if (!cat.keywords?.length) continue;
    for (const kw of cat.keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        if (!matchedIds.includes(cat.id)) matchedIds.push(cat.id);
        break;
      }
    }
  }
  return matchedIds;
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

// Background processing
async function processInBackground(
  supabase: any,
  dates: string[],
  logId: string,
  firecrawlApiKey: string,
  categories: any[],
  existingByNumber: Map<string, any>,
  existingByExtId: Map<string, any>,
  seriesFilter: string,
): Promise<void> {
  let totalProcessed = 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  console.log(`🚀 Background import: ${dates.length} days, series: ${seriesFilter}`);

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    console.log(`[Day ${i + 1}/${dates.length}] ${date} - Scraping daily page...`);

    try {
      // Get diploma links for this day
      const links = await scrapeDailyPage(date, firecrawlApiKey);
      console.log(`[${date}] Found ${links.length} diploma links`);

      if (links.length === 0) {
        // Update progress
        await supabase.from('sync_logs').update({
          items_processed: totalProcessed,
          items_added: totalAdded,
          items_updated: totalUpdated,
        }).eq('id', logId);
        continue;
      }

      // Process diplomas in batches of 3 (to avoid Firecrawl rate limits)
      for (let j = 0; j < links.length; j += 3) {
        const batch = links.slice(j, j + 3);
        const results = await Promise.all(
          batch.map(link => scrapeDiploma(link, firecrawlApiKey, date))
        );

        for (const doc of results) {
          totalProcessed++;
          if (!doc) { totalSkipped++; continue; }

          // Check duplicates
          const normalizedNum = normalizeNumber(doc.number);
          let existing = existingByExtId.get(doc.externalId) || existingByNumber.get(normalizedNum);

          if (existing) {
            // Smart merge - update only empty fields
            const updates: Record<string, unknown> = {};
            if (doc.title && doc.title !== doc.number && (!existing.title || existing.title === existing.number)) updates.title = doc.title;
            if (doc.summary && doc.summary.length > 20 && (!existing.summary || existing.summary.length < doc.summary.length)) updates.summary = doc.summary;
            if (doc.entity && !existing.entity) updates.entity = doc.entity;
            if (doc.publicationDate && !existing.publication_date) updates.publication_date = doc.publicationDate;
            if (doc.effectiveDate && !existing.effective_date) updates.effective_date = doc.effectiveDate;
            if (doc.documentUrl && !existing.document_url) updates.document_url = doc.documentUrl;

            if (Object.keys(updates).length > 0) {
              updates.updated_at = new Date().toISOString();
              await supabase.from('legislation').update(updates).eq('id', existing.id);
              totalUpdated++;
            }
            continue;
          }

          // Insert new
          const { data: newLeg, error } = await supabase
            .from('legislation')
            .insert({
              external_id: doc.externalId,
              source: 'dre',
              number: doc.number,
              title: doc.title,
              summary: doc.summary,
              entity: doc.entity,
              origin: 'PT',
              publication_date: doc.publicationDate,
              effective_date: doc.effectiveDate,
              document_url: doc.documentUrl,
            })
            .select('id')
            .single();

          if (error) {
            console.error(`Insert error for ${doc.number}:`, error.message);
            continue;
          }

          totalAdded++;
          existingByNumber.set(normalizedNum, { ...doc, id: newLeg.id, external_id: doc.externalId });
          existingByExtId.set(doc.externalId, { ...doc, id: newLeg.id });

          // Auto-categorize
          const catIds = matchCategories(doc, categories);
          if (catIds.length > 0) {
            await supabase.from('legislation_category_mapping').insert(
              catIds.map(cid => ({ legislation_id: newLeg.id, category_id: cid }))
            );
          }
        }

        // Delay between batches
        await new Promise(r => setTimeout(r, 500));
      }

      // Update progress every day
      await supabase.from('sync_logs').update({
        items_processed: totalProcessed,
        items_added: totalAdded,
        items_updated: totalUpdated,
      }).eq('id', logId);

      console.log(`[${date}] Done. Total: +${totalAdded} added, ${totalUpdated} updated, ${totalSkipped} skipped`);

      // Small delay between days
      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      console.error(`Error processing day ${date}:`, error);
    }
  }

  // Final update
  await supabase.from('sync_logs').update({
    items_processed: totalProcessed,
    items_added: totalAdded,
    items_updated: totalUpdated,
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', logId);

  console.log(`✅ Import completed: ${totalAdded} added, ${totalUpdated} updated, ${totalSkipped} skipped out of ${totalProcessed}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      startDate = '2026-01-01',
      endDate,
      series = 'both', // 'i', 'ii', 'both'
      dryRun = false,
    } = await req.json().catch(() => ({}));

    const effectiveEndDate = endDate || new Date().toISOString().split('T')[0];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate business dates
    const dates = getBusinessDates(startDate, effectiveEndDate);
    console.log(`📋 Import DRE: ${dates.length} business days from ${startDate} to ${effectiveEndDate}`);

    if (dates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No dates to process', total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load categories for auto-categorization
    const { data: categories } = await supabase
      .from('theme_categories')
      .select('id, name, keywords, theme_id');

    // Load existing legislation for duplicate detection
    const { data: existingLeg } = await supabase
      .from('legislation')
      .select('id, number, title, summary, entity, publication_date, effective_date, document_url, external_id');

    const existingByNumber = new Map<string, any>();
    const existingByExtId = new Map<string, any>();
    for (const leg of existingLeg || []) {
      const normalized = normalizeNumber(leg.number || '');
      if (normalized) existingByNumber.set(normalized, leg);
      if (leg.external_id) existingByExtId.set(leg.external_id, leg);
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true, dryRun: true,
          totalDays: dates.length,
          dateRange: { from: dates[0], to: dates[dates.length - 1] },
          existingCount: existingLeg?.length || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create sync log
    const { data: logEntry, error: logError } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'bulk_import_dre',
        status: 'running',
        items_processed: 0,
        items_added: 0,
      })
      .select()
      .single();

    if (logError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create sync log' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start background processing
    EdgeRuntime.waitUntil(processInBackground(
      supabase, dates, logEntry.id, firecrawlApiKey,
      categories || [], existingByNumber, existingByExtId, series
    ));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Background import started for ${dates.length} business days`,
        jobId: logEntry.id,
        totalDays: dates.length,
        dateRange: { from: dates[0], to: dates[dates.length - 1] },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
