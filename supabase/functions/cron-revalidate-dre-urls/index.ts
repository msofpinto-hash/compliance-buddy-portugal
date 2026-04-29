// Weekly cron job: revalidates ALL DRE URLs in batches.
// Triggered by pg_cron every Sunday at 03:00 UTC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

const BATCH_SIZE = 500;
const BATCH_DELAY_MS = 2 * 60 * 1000; // 2 minutes between batches to avoid overlap

async function orchestrateBatches(supabase: any, totalPt: number, parentLogId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const totalBatches = Math.ceil(totalPt / BATCH_SIZE);
  let dispatched = 0;
  const childJobs: string[] = [];

  for (let i = 0; i < totalBatches; i++) {
    const offset = i * BATCH_SIZE;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/validate-document-urls`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: BATCH_SIZE,
          offset,
          origin: "PT",
          dryRun: false,
          background: true,
        }),
      });
      const data = await res.json();
      if (data?.jobId) childJobs.push(data.jobId);
      dispatched++;
      console.log(`Cron batch ${i + 1}/${totalBatches} dispatched (offset=${offset}) jobId=${data?.jobId}`);
    } catch (err) {
      console.error(`Failed to dispatch batch ${i + 1}:`, err);
    }
    // Update progress
    await supabase
      .from("sync_logs")
      .update({
        items_processed: dispatched,
        error_message: `Dispatched ${dispatched}/${totalBatches} batches. Child jobs: ${childJobs.length}`,
      })
      .eq("id", parentLogId);

    // Wait between batches except for the last
    if (i < totalBatches - 1) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  await supabase
    .from("sync_logs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      items_processed: dispatched,
      items_added: childJobs.length,
      error_message: `Cron completed. Dispatched ${dispatched}/${totalBatches} batches across ${childJobs.length} jobs.`,
    })
    .eq("id", parentLogId);

  console.log(`Cron orchestration complete: ${dispatched} batches dispatched`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Count total PT URLs
    const { count: totalPt } = await supabase
      .from("legislation")
      .select("id", { count: "exact", head: true })
      .not("document_url", "is", null)
      .neq("document_url", "")
      .or("origin.eq.PT,origin.eq.dre,origin.is.null");

    const total = totalPt || 0;

    // Create parent log
    const { data: logData, error: logError } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: "cron_revalidate_dre_urls",
        status: "running",
        items_processed: 0,
        items_added: 0,
        items_updated: total,
        error_message: `Starting weekly revalidation of ${total} URLs in batches of ${BATCH_SIZE}`,
      })
      .select("id")
      .single();

    if (logError) throw logError;

    EdgeRuntime.waitUntil(orchestrateBatches(supabase, total, logData.id));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Weekly DRE revalidation started for ${total} URLs`,
        parentJobId: logData.id,
        estimatedBatches: Math.ceil(total / BATCH_SIZE),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("cron-revalidate-dre-urls error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
