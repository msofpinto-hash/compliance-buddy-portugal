import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Checking action plans approaching deadline...");

    // Get current date and dates for comparison
    const now = new Date();
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Fetch action plans that are pending or in progress with upcoming due dates
    const { data: actionPlans, error: fetchError } = await supabase
      .from("action_plans")
      .select(`
        id,
        title,
        due_date,
        status,
        responsible,
        organization_id,
        organizations!action_plans_organization_id_fkey(name)
      `)
      .in("status", ["pending", "in_progress"])
      .not("due_date", "is", null)
      .lte("due_date", sevenDaysFromNow.toISOString().split("T")[0])
      .order("due_date", { ascending: true });

    if (fetchError) {
      console.error("Error fetching action plans:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${actionPlans?.length || 0} action plans approaching deadline`);

    const alertsToCreate: Array<{
      title: string;
      message: string;
      type: string;
      organization_id: string;
      related_action_plan_id: string;
    }> = [];

    for (const plan of actionPlans || []) {
      const dueDate = new Date(plan.due_date);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if alert already exists for this action plan today
      const { data: existingAlert } = await supabase
        .from("alerts")
        .select("id")
        .eq("related_action_plan_id", plan.id)
        .gte("created_at", now.toISOString().split("T")[0])
        .limit(1);

      if (existingAlert && existingAlert.length > 0) {
        console.log(`Alert already exists for action plan ${plan.id} today, skipping`);
        continue;
      }

      let alertType: string;
      let alertTitle: string;
      let alertMessage: string;

      if (daysUntilDue < 0) {
        // Overdue
        alertType = "deadline_overdue";
        alertTitle = `⚠️ Plano de ação em atraso`;
        alertMessage = `O plano "${plan.title}" está em atraso há ${Math.abs(daysUntilDue)} dia(s). Responsável: ${plan.responsible || "Não definido"}`;
      } else if (daysUntilDue === 0) {
        // Due today
        alertType = "deadline_today";
        alertTitle = `🔔 Plano de ação vence hoje`;
        alertMessage = `O plano "${plan.title}" vence hoje! Responsável: ${plan.responsible || "Não definido"}`;
      } else if (daysUntilDue <= 3) {
        // Due in 3 days or less
        alertType = "deadline_imminent";
        alertTitle = `⏰ Plano de ação a vencer em breve`;
        alertMessage = `O plano "${plan.title}" vence em ${daysUntilDue} dia(s). Responsável: ${plan.responsible || "Não definido"}`;
      } else {
        // Due in 7 days or less
        alertType = "deadline_approaching";
        alertTitle = `📅 Prazo de plano de ação a aproximar-se`;
        alertMessage = `O plano "${plan.title}" vence em ${daysUntilDue} dias. Responsável: ${plan.responsible || "Não definido"}`;
      }

      alertsToCreate.push({
        title: alertTitle,
        message: alertMessage,
        type: alertType,
        organization_id: plan.organization_id,
        related_action_plan_id: plan.id,
      });
    }

    // Insert alerts
    if (alertsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from("alerts")
        .insert(alertsToCreate);

      if (insertError) {
        console.error("Error creating alerts:", insertError);
        throw insertError;
      }

      console.log(`Created ${alertsToCreate.length} new alerts`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        alertsCreated: alertsToCreate.length,
        plansChecked: actionPlans?.length || 0,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in check-action-plan-deadlines:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
