import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * pg_cron orchestrator: runs every 10 min.
 * - Counts pending requirements (PT/EU) and relations.
 * - If pending > 0 AND no active job of that type, launches a new batch.
 * - Auto-stops once everything is zero.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const log: Record<string, unknown> = {};

  try {
    // 1. Accurate counts via SQL RPCs
    const [{ data: ptPending }, { data: euPending }, { data: relPending }] = await Promise.all([
      supabase.rpc("count_pending_requirements", { p_origin: "PT" }),
      supabase.rpc("count_pending_requirements", { p_origin: "EU" }),
      supabase.rpc("count_pending_relations"),
    ]);
    const ptCount = Number(ptPending ?? 0);
    const euCount = Number(euPending ?? 0);
    const relCount = Number(relPending ?? 0);

    log.pending = { ptPending: ptCount, euPending: euCount, relPending: relCount };


    // 2. Active jobs (real sync_type names: 'background-requirements-extraction', 'extract_relations')
    const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: activeJobs } = await supabase
      .from("sync_logs")
      .select("sync_type, status, started_at")
      .eq("status", "running")
      .gte("started_at", sinceIso);

    const activeTypes = (activeJobs || []).map((j: any) => String(j.sync_type || ""));
    const reqActive = activeTypes.filter((t) => t === "background-requirements-extraction").length;
    const relActive = activeTypes.filter((t) => t === "extract_relations").length;
    log.activeTypes = activeTypes;
    log.reqActive = reqActive;
    log.relActive = relActive;

    const launched: string[] = [];
    const MAX_REQ_CONCURRENT = 2;
    const MAX_REL_CONCURRENT = 1;

    // Launch PT only if total req jobs < max
    if (ptCount > 0 && reqActive < MAX_REQ_CONCURRENT) {
      await fetch(`${supabaseUrl}/functions/v1/extract-requirements-background`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "PT", batchSize: 25, maxBatches: 40, useUrl: true, background: true }),
      });
      launched.push("PT-requirements");
    }

    if (euCount > 0 && reqActive + launched.filter(l=>l.includes("requirements")).length < MAX_REQ_CONCURRENT) {
      await fetch(`${supabaseUrl}/functions/v1/extract-requirements-background`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "EU", batchSize: 25, maxBatches: 40, useUrl: true, background: true }),
      });
      launched.push("EU-requirements");
    }

    if (relCount > 0 && relActive < MAX_REL_CONCURRENT) {
      await fetch(`${supabaseUrl}/functions/v1/extract-legislation-relations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200, background: true, autoImport: true }),
      });
      launched.push("relations");
    }


    log.launched = launched;

    await supabase.from("sync_logs").insert({
      sync_type: "cron_chain_pending_extractions",
      status: launched.length > 0 ? "completed" : "completed_idle",
      items_processed: ptCount + euCount + relCount,
      items_added: launched.length,
      completed_at: new Date().toISOString(),
      error_message: launched.length === 0 && ptCount + euCount + relCount === 0
        ? "All pending work cleared"
        : null,
    });


    return new Response(JSON.stringify({ success: true, ...log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("cron-chain-pending-extractions error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error), ...log }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
