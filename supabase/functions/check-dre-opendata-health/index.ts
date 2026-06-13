// Pings the DRE OpenData API and updates external_source_status accordingly.
// If the API responds with valid JSON it is marked online; otherwise offline (24h block).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROBE_URLS = [
  "https://data.dre.pt/opendata/diploma/lei-12-2024",
  "https://dre.pt/dr/api/diploma/123",
];

async function probe(url: string): Promise<{ ok: boolean; status: number; isJson: boolean; sample: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "IDComplianceLex-HealthCheck/1.0" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const text = await res.text();
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json") || /^\s*[\{\[]/.test(text);
    const finalUrl = res.url || url;
    const looksLikeError = /diariodarepublica\.pt\/dr\/error/i.test(finalUrl) || /<!DOCTYPE\s+html/i.test(text);
    return { ok: res.ok && isJson && !looksLikeError, status: res.status, isJson, sample: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, isJson: false, sample: String((e as Error).message || e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: any[] = [];
  let anySuccess = false;
  for (const url of PROBE_URLS) {
    const r = await probe(url);
    results.push({ url, ...r });
    if (r.ok) { anySuccess = true; break; }
  }

  if (anySuccess) {
    await supabase.rpc("update_source_status", {
      p_source_name: "dre_opendata",
      p_status: "online",
      p_error_message: null,
      p_block_hours: null,
    });
  } else {
    // Re-block only 24h so we keep probing frequently instead of staying blocked for months.
    await supabase.rpc("update_source_status", {
      p_source_name: "dre_opendata",
      p_status: "offline",
      p_error_message: `Health check failed: ${results.map(r => `${r.status || "ERR"}@${r.url}`).join(" | ")}`,
      p_block_hours: 24,
    });
  }

  return new Response(
    JSON.stringify({ success: true, reactivated: anySuccess, probes: results }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
