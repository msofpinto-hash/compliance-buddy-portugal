import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Checking for new legislation to notify organizations...");

    // Get legislation added in the last 24 hours
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const { data: recentLegislation, error: legError } = await supabase
      .from("legislation")
      .select("id, title, number, publication_date")
      .gte("created_at", yesterday.toISOString())
      .order("created_at", { ascending: false });

    if (legError) throw legError;

    if (!recentLegislation || recentLegislation.length === 0) {
      console.log("No new legislation in the last 24h");
      return new Response(JSON.stringify({ success: true, alertsCreated: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Found ${recentLegislation.length} new legislation items`);

    // Get all organizations with assigned legislation to check overlap
    const legislationIds = recentLegislation.map((l) => l.id);

    const { data: orgAssignments, error: orgError } = await supabase
      .from("organization_legislation")
      .select("organization_id, legislation_id")
      .in("legislation_id", legislationIds);

    if (orgError) throw orgError;

    // Build map: org -> list of new assigned legislation
    const orgLegMap = new Map<string, typeof recentLegislation>();
    orgAssignments?.forEach((a) => {
      const leg = recentLegislation.find((l) => l.id === a.legislation_id);
      if (!leg) return;
      if (!orgLegMap.has(a.organization_id)) {
        orgLegMap.set(a.organization_id, []);
      }
      orgLegMap.get(a.organization_id)!.push(leg);
    });

    const alertsToCreate: Array<{
      title: string;
      message: string;
      type: string;
      organization_id: string;
      related_legislation_id: string | null;
    }> = [];

    for (const [orgId, legislations] of orgLegMap) {
      // Check if alert already exists today for this org
      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("alerts")
        .select("id")
        .eq("organization_id", orgId)
        .eq("type", "new_legislation")
        .gte("created_at", today)
        .limit(1);

      if (existing && existing.length > 0) continue;

      if (legislations.length === 1) {
        const leg = legislations[0];
        alertsToCreate.push({
          title: "📋 Nova legislação atribuída",
          message: `${leg.number} - ${leg.title}`,
          type: "new_legislation",
          organization_id: orgId,
          related_legislation_id: leg.id,
        });
      } else {
        alertsToCreate.push({
          title: "📋 Nova legislação atribuída",
          message: `${legislations.length} novos diplomas foram atribuídos à sua organização.`,
          type: "new_legislation",
          organization_id: orgId,
          related_legislation_id: null,
        });
      }
    }

    if (alertsToCreate.length > 0) {
      const { error: insertError } = await supabase.from("alerts").insert(alertsToCreate);
      if (insertError) throw insertError;
      console.log(`Created ${alertsToCreate.length} new legislation alerts`);
    }

    return new Response(
      JSON.stringify({ success: true, alertsCreated: alertsToCreate.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in check-new-legislation-alerts:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
