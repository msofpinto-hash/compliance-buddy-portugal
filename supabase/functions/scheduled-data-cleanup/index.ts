import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Regex patterns for title validation
const INVALID_TITLE_REGEXES = [
  /^#\s*Diário/i,
  /^Publicação:/i,
  /^##\s+/,
  /^\*\*[^*]/,
  /^Pesquisar/i,
  /Texto integral/i,
  /Versão PDF/i,
];

const INVALID_ENTITY_VALUES = [
  "Pesquisar",
  "Pesquisa Avançada",
  "Diploma referenciado",
  "Versão",
  "Texto",
];

// Regex patterns for summary validation
const INVALID_SUMMARY_REGEXES = [
  /Enviar por email/i,
  /Facebook/i,
  /LinkedIn/i,
  /Twitter/i,
  /Partilhar/i,
  /Diploma referenciado/i,
  /\[!\[/,
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const origin = body.origin || "PT"; // PT, EU, or all

    console.log(`[scheduled-data-cleanup] Starting cleanup, dryRun=${dryRun}, origin=${origin}`);

    // Fetch records with potential issues using SQL LIKE patterns
    let query = supabase
      .from("legislation")
      .select("id, number, title, entity, summary, origin")
      .or(
        "title.like.# Diário%," +
        "title.like.Publicação:%," +
        "title.like.## %," +
        "title.like.Pesquisar%," +
        "entity.eq.Pesquisar," +
        "entity.eq.Pesquisa Avançada," +
        "entity.eq.Diploma referenciado," +
        "summary.like.%Enviar por email%," +
        "summary.like.%Facebook%," +
        "summary.like.%LinkedIn%," +
        "summary.like.%Partilhar%"
      );

    if (origin !== "all") {
      query = query.eq("origin", origin);
    }

    const { data: invalidRecords, error: fetchError } = await query.limit(500);

    if (fetchError) {
      console.error("[scheduled-data-cleanup] Fetch error:", fetchError);
      throw fetchError;
    }

    if (!invalidRecords || invalidRecords.length === 0) {
      console.log("[scheduled-data-cleanup] No invalid records found");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum registo inválido encontrado",
          cleaned: 0,
          dryRun,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[scheduled-data-cleanup] Found ${invalidRecords.length} potential invalid records`);

    // Categorize the issues
    const issues = {
      invalidTitles: 0,
      invalidEntities: 0,
      invalidSummaries: 0,
      titleEqualsNumber: 0,
    };

    const recordsToClean: Array<{ id: string; updates: Record<string, unknown> }> = [];

    for (const record of invalidRecords) {
      const updates: Record<string, unknown> = {};

      // Check title issues using regex
      const hasInvalidTitle = INVALID_TITLE_REGEXES.some(regex => regex.test(record.title || ""));

      if (hasInvalidTitle || record.title === record.number) {
        updates.title = record.number; // Reset to number
        if (hasInvalidTitle) issues.invalidTitles++;
        if (record.title === record.number) issues.titleEqualsNumber++;
      }

      // Check entity issues
      if (INVALID_ENTITY_VALUES.includes(record.entity)) {
        updates.entity = null;
        issues.invalidEntities++;
      }

      // Check summary issues using regex
      const hasInvalidSummary = INVALID_SUMMARY_REGEXES.some(regex => regex.test(record.summary || ""));

      if (hasInvalidSummary) {
        updates.summary = null;
        issues.invalidSummaries++;
      }

      if (Object.keys(updates).length > 0) {
        recordsToClean.push({ id: record.id, updates });
      }
    }

    console.log(`[scheduled-data-cleanup] Issues found:`, issues);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Dry run: encontrados ${recordsToClean.length} registos para limpar`,
          issues,
          recordsToClean: recordsToClean.length,
          sampleIds: recordsToClean.slice(0, 10).map(r => r.id),
          dryRun: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Perform the cleanup
    let cleaned = 0;
    let failed = 0;

    for (const { id, updates } of recordsToClean) {
      const { error: updateError } = await supabase
        .from("legislation")
        .update(updates)
        .eq("id", id);

      if (updateError) {
        console.error(`[scheduled-data-cleanup] Failed to clean ${id}:`, updateError);
        failed++;
      } else {
        cleaned++;
      }
    }

    // Log the cleanup to sync_logs
    await supabase.from("sync_logs").insert({
      sync_type: "scheduled-data-cleanup",
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      items_processed: recordsToClean.length,
      items_updated: cleaned,
      error_message: failed > 0 ? `${failed} registos falharam` : null,
    });

    console.log(`[scheduled-data-cleanup] Cleanup complete: ${cleaned} cleaned, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Limpeza concluída: ${cleaned} registos limpos`,
        issues,
        cleaned,
        failed,
        dryRun: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[scheduled-data-cleanup] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
