// Resolve missing/invalid DRE URLs using Firecrawl /v2/search with site:diariodarepublica.pt
// Bypasses the broken OpenData API by leveraging Google index via Firecrawl.
//
// Body params:
//   limit          number   max diplomas to process this run (default 25, max 100)
//   onlyMissing    boolean  only process rows with NULL document_url (default true)
//   includeInvalid boolean  also include rows whose URL failed validation (default false)
//   ids            string[] explicit legislation ids to resolve (optional)
//   dryRun         boolean  do not write updates (default false)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

interface Row {
  id: string;
  number: string;
  title: string | null;
  document_url: string | null;
  origin: string | null;
}

function buildQueries(row: Row): string[] {
  const num = (row.number ?? "").trim();
  const title = (row.title ?? "").trim();
  const queries: string[] = [];
  if (num) {
    queries.push(`site:diariodarepublica.pt "${num}"`);
    // Try with "n.º" prefix variants if number looks like "12/2024"
    const m = num.match(/^([A-Za-zçÇãÃ\-]+)?\s*n?\.?º?\s*(\d+[\-\/A-Za-z]*)\s*\/\s*(\d{2,4})$/i);
    if (m) {
      const type = m[1] ?? "";
      queries.push(
        `site:diariodarepublica.pt ${type} "${m[2]}/${m[3]}"`.trim(),
      );
    }
  }
  if (title && title !== num && title.length > 8) {
    queries.push(`site:diariodarepublica.pt ${title.slice(0, 120)}`);
  }
  return [...new Set(queries)].slice(0, 3);
}

function pickBestUrl(urls: string[]): string | null {
  // Prefer /dr/detalhe/... canonical detail pages
  const detail = urls.find((u) => /diariodarepublica\.pt\/dr\/detalhe\//i.test(u));
  if (detail) return detail;
  const anyDre = urls.find((u) => /diariodarepublica\.pt\/dr\//i.test(u) && !/\/error/i.test(u));
  return anyDre ?? null;
}

async function firecrawlSearch(query: string, apiKey: string): Promise<string[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${FIRECRAWL_V2}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit: 10 }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`Firecrawl search ${res.status}: ${txt.slice(0, 200)}`);
      return [];
    }
    const json = await res.json();
    const items = (json?.data ?? json?.web?.results ?? json?.results ?? []) as any[];
    return items.map((it) => it.url).filter((u): u is string => typeof u === "string");
  } catch (e) {
    console.warn("Firecrawl search error:", (e as Error).message);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!firecrawlApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 100);
  const onlyMissing = body.onlyMissing !== false;
  const includeInvalid = body.includeInvalid === true;
  const dryRun = body.dryRun === true;
  const ids: string[] | undefined = Array.isArray(body.ids) && body.ids.length ? body.ids : undefined;

  // Create sync log
  const { data: log } = await supabase
    .from("sync_logs")
    .insert({
      source: "resolve-dre-via-search",
      operation: "resolve_dre_via_search",
      status: "running",
      metadata: { limit, onlyMissing, includeInvalid, ids: ids?.length ?? 0 },
    })
    .select("id")
    .single();

  // Pick targets
  let rows: Row[] = [];
  if (ids) {
    const { data } = await supabase
      .from("legislation")
      .select("id, number, title, document_url, origin")
      .in("id", ids);
    rows = (data ?? []) as Row[];
  } else {
    let q = supabase
      .from("legislation")
      .select("id, number, title, document_url, origin")
      .or("origin.eq.PT,origin.eq.dre,origin.is.null")
      .limit(limit);
    if (onlyMissing) {
      q = q.is("document_url", null);
    }
    const { data } = await q;
    rows = (data ?? []) as Row[];

    if (includeInvalid && rows.length < limit) {
      const need = limit - rows.length;
      const { data: invalid } = await supabase
        .from("url_validation_results")
        .select("legislation_id, legislation:legislation_id(id, number, title, document_url, origin)")
        .eq("is_valid", false)
        .limit(need);
      for (const inv of invalid ?? []) {
        const l = (inv as any).legislation;
        if (l && !rows.find((r) => r.id === l.id)) rows.push(l as Row);
      }
    }
  }

  const summary = { processed: 0, resolved: 0, failed: 0, dryRun, details: [] as any[] };

  for (const row of rows) {
    summary.processed++;
    const queries = buildQueries(row);
    let resolved: string | null = null;

    for (const q of queries) {
      const urls = await firecrawlSearch(q, firecrawlApiKey);
      const best = pickBestUrl(urls);
      if (best) { resolved = best; break; }
    }

    if (resolved) {
      summary.resolved++;
      summary.details.push({ id: row.id, number: row.number, url: resolved });
      if (!dryRun) {
        await supabase
          .from("legislation")
          .update({ document_url: resolved, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    } else {
      summary.failed++;
      summary.details.push({ id: row.id, number: row.number, error: "no_url_found" });
    }
  }

  if (log?.id) {
    await supabase
      .from("sync_logs")
      .update({
        status: summary.failed === summary.processed && summary.processed > 0 ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        records_processed: summary.processed,
        records_failed: summary.failed,
        metadata: { ...summary, details: summary.details.slice(0, 50) },
      })
      .eq("id", log.id);
  }

  return new Response(JSON.stringify({ success: true, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
