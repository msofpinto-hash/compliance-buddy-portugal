import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

interface ValidationResult {
  id: string;
  number: string;
  title: string;
  document_url: string;
  status: "valid" | "invalid" | "redirect" | "timeout" | "error";
  statusCode?: number;
  error?: string;
}

async function validateUrlsInBackground(
  supabase: any,
  legislation: any[],
  logId: string,
  dryRun: boolean
) {
  const summary = { total: 0, valid: 0, invalid: 0, redirect: 0, timeout: 0, error: 0 };
  const invalidIds: string[] = [];

  for (let i = 0; i < legislation.length; i++) {
    const leg = legislation[i];
    summary.total++;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(leg.document_url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeoutId);
      const statusCode = response.status;

      if (statusCode >= 200 && statusCode < 300) {
        summary.valid++;
      } else if (statusCode >= 300 && statusCode < 400) {
        summary.redirect++;
      } else if (statusCode === 404 || statusCode === 410) {
        summary.invalid++;
        invalidIds.push(leg.id);
        console.log(`Invalid URL for ${leg.number}: HTTP ${statusCode}`);
      } else {
        summary.error++;
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError") {
        summary.timeout++;
      } else {
        summary.error++;
      }
    }

    // Update progress every 20 items
    if ((i + 1) % 20 === 0 || i === legislation.length - 1) {
      await supabase
        .from("sync_logs")
        .update({
          items_processed: i + 1,
          items_added: summary.valid,
          items_updated: summary.invalid,
          status: i === legislation.length - 1 ? "completed" : "running",
        })
        .eq("id", logId);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Clear invalid URLs if not dry run
  if (!dryRun && invalidIds.length > 0) {
    const { error: updateError } = await supabase
      .from("legislation")
      .update({ document_url: null })
      .in("id", invalidIds);

    if (updateError) {
      console.error("Failed to clear invalid URLs:", updateError);
    } else {
      console.log(`Cleared ${invalidIds.length} invalid URLs from database`);
    }
  }

  // Final update
  await supabase
    .from("sync_logs")
    .update({
      items_processed: legislation.length,
      items_added: summary.valid,
      items_updated: summary.invalid,
      status: "completed",
      completed_at: new Date().toISOString(),
      error_message: `Valid: ${summary.valid}, Invalid: ${summary.invalid}, Redirect: ${summary.redirect}, Timeout: ${summary.timeout}, Error: ${summary.error}`,
    })
    .eq("id", logId);

  console.log(`URL validation completed: ${JSON.stringify(summary)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 50, dryRun = true, origin, background = false } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Starting URL validation: limit=${limit}, dryRun=${dryRun}, origin=${origin || 'all'}, background=${background}`);

    // Fetch legislation with URLs
    let query = supabase
      .from("legislation")
      .select("id, number, title, document_url, origin")
      .not("document_url", "is", null)
      .neq("document_url", "")
      .limit(limit);

    if (origin) {
      if (origin === "PT") {
        query = query.or("origin.eq.PT,origin.eq.dre");
      } else if (origin === "EU") {
        query = query.or("origin.eq.EU,origin.eq.eurlex");
      }
    }

    const { data: legislation, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch legislation: ${fetchError.message}`);
    }

    if (!legislation || legislation.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No legislation with URLs found",
          results: [],
          summary: { total: 0, valid: 0, invalid: 0, redirect: 0, timeout: 0, error: 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${legislation.length} legislation items with URLs to validate`);

    // Background mode
    if (background) {
      const { data: logData, error: logError } = await supabase
        .from("sync_logs")
        .insert({
          sync_type: "validate_urls",
          status: "running",
          items_processed: 0,
          items_added: 0,
          items_updated: 0,
        })
        .select("id")
        .single();

      if (logError) throw logError;

      EdgeRuntime.waitUntil(validateUrlsInBackground(supabase, legislation, logData.id, dryRun));

      return new Response(
        JSON.stringify({
          success: true,
          message: "Background job started",
          jobId: logData.id,
          total: legislation.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Synchronous mode (original behavior)
    const results: ValidationResult[] = [];
    const summary = { total: 0, valid: 0, invalid: 0, redirect: 0, timeout: 0, error: 0 };

    for (const leg of legislation) {
      summary.total++;
      const result: ValidationResult = {
        id: leg.id,
        number: leg.number,
        title: leg.title?.substring(0, 100) || "",
        document_url: leg.document_url,
        status: "error",
      };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(leg.document_url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "manual",
        });

        clearTimeout(timeoutId);
        result.statusCode = response.status;

        if (response.status >= 200 && response.status < 300) {
          result.status = "valid";
          summary.valid++;
        } else if (response.status >= 300 && response.status < 400) {
          result.status = "redirect";
          summary.redirect++;
        } else if (response.status === 404 || response.status === 410) {
          result.status = "invalid";
          summary.invalid++;
          result.error = `HTTP ${response.status}`;
        } else {
          result.status = "error";
          summary.error++;
          result.error = `HTTP ${response.status}`;
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (error.name === "AbortError") {
          result.status = "timeout";
          result.error = "Request timeout (10s)";
          summary.timeout++;
        } else {
          result.status = "error";
          result.error = error.message || "Unknown error";
          summary.error++;
        }
      }

      results.push(result);
      console.log(`Validated ${leg.number}: ${result.status} (${result.statusCode || result.error})`);

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // If not dry run, clear invalid URLs from the database
    if (!dryRun) {
      const invalidIds = results
        .filter(r => r.status === "invalid")
        .map(r => r.id);

      if (invalidIds.length > 0) {
        const { error: updateError } = await supabase
          .from("legislation")
          .update({ document_url: null })
          .in("id", invalidIds);

        if (updateError) {
          console.error("Failed to clear invalid URLs:", updateError);
        } else {
          console.log(`Cleared ${invalidIds.length} invalid URLs from database`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary,
        dryRun,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("URL validation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
