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
    // 1. Count pending requirements
    const { data: pendingReqs } = await supabase.rpc("get_legislation_without_requirements", {
      p_origin: null,
      p_limit: 5000,
    });
    const ptPending = (pendingReqs || []).filter((r: any) =>
      r.origin === "PT" || r.origin === "dre" || r.origin === null
    ).length;
    const euPending = (pendingReqs || []).filter((r: any) =>
      r.origin === "EU" || r.origin === "eurlex"
    ).length;

    // 2. Count pending relations
    const { count: totalLeg } = await supabase
      .from("legislation")
      .select("id", { count: "exact", head: true });
    const { count: processedRel } = await supabase
      .from("legislation_relations_processed")
      .select("legislation_id", { count: "exact", head: true });
    const relPending = (totalLeg || 0) - (processedRel || 0);

    log.pending = { ptPending, euPending, relPending };

    // 3. Check active jobs
    const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: activeJobs } = await supabase
      .from("sync_logs")
      .select("sync_type, status, started_at")
      .eq("status", "running")
      .gte("started_at", sinceIso);

    const activeTypes = new Set((activeJobs || []).map((j: any) => j.sync_type));
    log.activeTypes = Array.from(activeTypes);

    const launched: string[] = [];

    // 4. Launch PT requirements if pending and no active job
    if (ptPending > 0 && !activeTypes.has("extract-requirements-background-PT")) {
      await fetch(`${supabaseUrl}/functions/v1/extract-requirements-background`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: "PT",
          batchSize: 25,
          maxBatches: 40,
          useUrl: true,
          background: true,
        }),
      });
      launched.push("PT-requirements");
    }

    // 5. Launch EU requirements
    if (euPending > 0 && !activeTypes.has("extract-requirements-background-EU")) {
      await fetch(`${supabaseUrl}/functions/v1/extract-requirements-background`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: "EU",
          batchSize: 25,
          maxBatches: 40,
          useUrl: true,
          background: true,
        }),
      });
      launched.push("EU-requirements");
    }

    // 6. Launch relations
    if (relPending > 0 && !activeTypes.has("extract-legislation-relations")) {
      await fetch(`${supabaseUrl}/functions/v1/extract-legislation-relations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: 100,
          background: true,
          autoImport: true,
        }),
      });
      launched.push("relations");
    }

    log.launched = launched;

    // 7. Audit entry
    await supabase.from("sync_logs").insert({
      sync_type: "cron_chain_pending_extractions",
      status: launched.length > 0 ? "completed" : "completed_idle",
      items_processed: ptPending + euPending + relPending,
      items_added: launched.length,
      completed_at: new Date().toISOString(),
      error_message: launched.length === 0 && ptPending + euPending + relPending === 0
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
