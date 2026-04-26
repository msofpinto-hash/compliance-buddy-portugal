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

  try {
    const { items, jobId } = (await req.json()) as { items: FixItem[]; jobId?: string };

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No items provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    if (jobId) {
      await supabase.from("sync_logs").insert({
        sync_type: "apply_url_fixes",
        status: "completed",
        items_processed: items.length,
        items_added: summary.updated,
        items_updated: summary.cleared,
        completed_at: new Date().toISOString(),
        error_message: `Cleared: ${summary.cleared}, Updated: ${summary.updated}, Kept: ${summary.kept}, Failed: ${summary.failed}`,
      });
    }

    return new Response(
      JSON.stringify({ success: true, summary, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("apply-url-fixes error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
