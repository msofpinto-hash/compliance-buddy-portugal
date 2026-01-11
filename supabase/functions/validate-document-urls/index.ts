import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationResult {
  id: string;
  number: string;
  title: string;
  document_url: string;
  status: "valid" | "invalid" | "redirect" | "timeout" | "error";
  statusCode?: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { limit = 50, dryRun = true, origin } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Starting URL validation: limit=${limit}, dryRun=${dryRun}, origin=${origin || 'all'}`);

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
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

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

      // Small delay to avoid rate limiting
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
