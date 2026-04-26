import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FixItem {
  legislation_id: string;
  action: "clear" | "update" | "keep";
  new_url?: string;
  result_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Always create a log entry up-front so it shows in the history panel
  let logId: string | null = null;
  try {
    const { data: logRow } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: "apply_url_fixes",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    logId = logRow?.id ?? null;
  } catch (e) {
    console.error("Failed to create sync_logs entry:", e);
  }

  try {
    const { items, jobId } = (await req.json()) as { items: FixItem[]; jobId?: string };

    if (!Array.isArray(items) || items.length === 0) {
      if (logId) {
        await supabase.from("sync_logs").update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: "No items provided",
        }).eq("id", logId);
      }
      return new Response(
        JSON.stringify({ success: false, error: "No items provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const summary = { cleared: 0, updated: 0, kept: 0, failed: 0 };
    const errors: { legislation_id: string; error: string }[] = [];

    for (const item of items) {
      try {
        if (item.action === "clear") {
          const { error } = await supabase
            .from("legislation")
            .update({ document_url: null })
            .eq("id", item.legislation_id);
          if (error) throw error;
          summary.cleared++;
        } else if (item.action === "update") {
          if (!item.new_url || !/^https?:\/\//i.test(item.new_url)) {
            throw new Error("Invalid new_url");
          }
          const { error } = await supabase
            .from("legislation")
            .update({ document_url: item.new_url })
            .eq("id", item.legislation_id);
          if (error) throw error;
          summary.updated++;
        } else {
          summary.kept++;
        }

        if (item.result_id) {
          await supabase
            .from("url_validation_results")
            .update({ cleared: item.action !== "keep" })
            .eq("id", item.result_id);
        }
      } catch (e: any) {
        summary.failed++;
        errors.push({ legislation_id: item.legislation_id, error: e.message || String(e) });
      }
    }

    // Compose structured message: human summary + JSON errors block
    const humanSummary = `Cleared: ${summary.cleared}, Updated: ${summary.updated}, Kept: ${summary.kept}, Failed: ${summary.failed}`;
    const errorPayload = errors.length > 0
      ? `${humanSummary}\n__ERRORS_JSON__${JSON.stringify(errors.slice(0, 200))}`
      : humanSummary;

    if (logId) {
      await supabase.from("sync_logs").update({
        status: summary.failed > 0 && summary.cleared + summary.updated === 0 ? "failed" : "completed",
        items_processed: items.length,
        items_added: summary.updated,
        items_updated: summary.cleared,
        completed_at: new Date().toISOString(),
        error_message: errorPayload,
      }).eq("id", logId);
    }

    return new Response(
      JSON.stringify({ success: true, summary, errors, log_id: logId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("apply-url-fixes error:", error);
    if (logId) {
      await supabase.from("sync_logs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error?.message || "Unknown error",
      }).eq("id", logId);
    }
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
