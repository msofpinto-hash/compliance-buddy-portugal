import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

interface UrlFixResult {
  id: string;
  number: string;
  oldUrl: string | null;
  newUrl: string | null;
  action: "validated" | "recovered" | "cleared" | "unchanged" | "error";
  error?: string;
}

// Generate DRE URL from legislation number
function generateDreUrl(number: string): string | null {
  // Pattern: Lei n.º 123/2020, Decreto-Lei n.º 456/99, etc.
  const match = number.match(/(\d+)\/(\d{2,4})/);
  if (!match) return null;

  const num = match[1];
  let year = match[2];
  
  // Convert 2-digit year to 4-digit
  if (year.length === 2) {
    const yearNum = parseInt(year);
    year = yearNum <= 30 ? `20${year}` : `19${year}`;
  }

  return `https://diariodarepublica.pt/dr/legislacao-consolidada/legislacao-consolidada/${year}/${num}`;
}

// Generate EUR-Lex URL from legislation number
function generateEurlexUrl(number: string, title: string): string | null {
  // Try to extract CELEX from number or title
  const celexMatch = (number + " " + title).match(/3(\d{4})[A-Z](\d{4})/);
  if (celexMatch) {
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:3${celexMatch[1]}${celexMatch[2]}`;
  }

  // Pattern for directives: Diretiva 2023/1234/UE
  const directiveMatch = (number + " " + title).match(/(?:Directive|Diretiva)[^\d]*(\d{4})\/(\d+)/i);
  if (directiveMatch) {
    const year = directiveMatch[1];
    const num = directiveMatch[2].padStart(4, "0");
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32${year}L${num}`;
  }

  // Pattern for regulations: Regulamento (UE) 2023/1234
  const regMatch = (number + " " + title).match(/(?:Regulation|Regulamento)[^\d]*(?:\([^)]+\))?\s*(?:n[º.]?\s*)?(\d{4})\/(\d+)/i);
  if (regMatch) {
    const year = regMatch[1];
    const num = regMatch[2].padStart(4, "0");
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32${year}R${num}`;
  }

  return null;
}

// Check if URL is accessible
async function checkUrl(url: string): Promise<{ valid: boolean; statusCode?: number }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    
    return {
      valid: response.status >= 200 && response.status < 400,
      statusCode: response.status,
    };
  } catch {
    return { valid: false };
  }
}

async function fixUrlsInBackground(
  supabase: AnySupabaseClient,
  legislation: Array<{ id: string; number: string; title: string; document_url: string | null; origin: string | null }>,
  logId: string,
  options: { validateExisting: boolean; recoverMissing: boolean; clearInvalid: boolean }
) {
  const results: UrlFixResult[] = [];
  let processed = 0;
  let recovered = 0;
  let cleared = 0;
  let validated = 0;

  for (const leg of legislation) {
    const result: UrlFixResult = {
      id: leg.id,
      number: leg.number,
      oldUrl: leg.document_url,
      newUrl: null,
      action: "unchanged",
    };

    try {
      const isPT = leg.origin === "PT" || leg.origin === "dre";
      const isEU = leg.origin === "EU" || leg.origin === "eurlex";

      // Case 1: Has URL - validate it
      if (leg.document_url && options.validateExisting) {
        const check = await checkUrl(leg.document_url);
        
        if (check.valid) {
          result.action = "validated";
          validated++;
        } else if (options.clearInvalid) {
          // Try to recover before clearing
          const newUrl = isPT ? generateDreUrl(leg.number) : generateEurlexUrl(leg.number, leg.title);
          
          if (newUrl) {
            const newCheck = await checkUrl(newUrl);
            if (newCheck.valid) {
              await supabase
                .from("legislation")
                .update({ document_url: newUrl })
                .eq("id", leg.id);
              result.newUrl = newUrl;
              result.action = "recovered";
              recovered++;
            } else {
              // Clear the invalid URL
              await supabase
                .from("legislation")
                .update({ document_url: null })
                .eq("id", leg.id);
              result.action = "cleared";
              cleared++;
            }
          } else {
            // Clear the invalid URL
            await supabase
              .from("legislation")
              .update({ document_url: null })
              .eq("id", leg.id);
            result.action = "cleared";
            cleared++;
          }
        }
      }
      // Case 2: No URL - try to recover
      else if (!leg.document_url && options.recoverMissing) {
        const newUrl = isPT ? generateDreUrl(leg.number) : generateEurlexUrl(leg.number, leg.title);
        
        if (newUrl) {
          const check = await checkUrl(newUrl);
          if (check.valid) {
            await supabase
              .from("legislation")
              .update({ document_url: newUrl })
              .eq("id", leg.id);
            result.newUrl = newUrl;
            result.action = "recovered";
            recovered++;
          }
        }
      }
    } catch (err) {
      result.action = "error";
      result.error = err instanceof Error ? err.message : "Unknown error";
    }

    results.push(result);
    processed++;

    // Update progress every 10 items
    if (processed % 10 === 0 || processed === legislation.length) {
      await supabase
        .from("sync_logs")
        .update({
          items_processed: processed,
          items_added: recovered,
          items_updated: cleared,
        })
        .eq("id", logId);
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Final update
  await supabase
    .from("sync_logs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      items_processed: processed,
      items_added: recovered,
      items_updated: cleared,
      error_message: `Validados: ${validated}, Recuperados: ${recovered}, Limpos: ${cleared}`,
    })
    .eq("id", logId);

  console.log(`URL fix completed: ${JSON.stringify({ processed, recovered, cleared, validated })}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      limit = 100,
      origin, // "PT" | "EU" | undefined for all
      mode = "all", // "validate" | "recover" | "all"
      background = true,
    } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Starting URL fix: limit=${limit}, origin=${origin || "all"}, mode=${mode}, background=${background}`);

    const options = {
      validateExisting: mode === "validate" || mode === "all",
      recoverMissing: mode === "recover" || mode === "all",
      clearInvalid: mode === "validate" || mode === "all",
    };

    // Build query based on mode
    let query = supabase
      .from("legislation")
      .select("id, number, title, document_url, origin")
      // include rows where no_digital_version is NULL (treated as false)
      .or("no_digital_version.is.null,no_digital_version.eq.false")
      .limit(limit);

    if (origin === "PT") {
      query = query.or("origin.eq.PT,origin.eq.dre");
    } else if (origin === "EU") {
      query = query.or("origin.eq.EU,origin.eq.eurlex");
    }

    // For recover mode, only get items without URLs
    if (mode === "recover") {
      query = query.or("document_url.is.null,document_url.eq.");
    }

    const { data: legislation, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch legislation: ${fetchError.message}`);
    }

    if (!legislation || legislation.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No legislation found to process",
          total: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${legislation.length} legislation items to process`);

    if (background) {
      const { data: logData, error: logError } = await supabase
        .from("sync_logs")
        .insert({
          // Keep underscore for backward compatibility with existing logs
          sync_type: "fix_broken_urls",
          status: "running",
          items_processed: 0,
          items_added: 0,
          items_updated: 0,
        })
        .select("id")
        .single();

      if (logError) throw logError;

      EdgeRuntime.waitUntil(fixUrlsInBackground(supabase, legislation, logData.id, options));

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

    // Synchronous mode (for small batches)
    const results: UrlFixResult[] = [];
    let recovered = 0;
    let cleared = 0;

    for (const leg of legislation) {
      const isPT = leg.origin === "PT" || leg.origin === "dre";
      
      if (!leg.document_url && options.recoverMissing) {
        const newUrl = isPT ? generateDreUrl(leg.number) : generateEurlexUrl(leg.number, leg.title);
        
        if (newUrl) {
          const check = await checkUrl(newUrl);
          if (check.valid) {
            await supabase
              .from("legislation")
              .update({ document_url: newUrl })
              .eq("id", leg.id);
            results.push({
              id: leg.id,
              number: leg.number,
              oldUrl: null,
              newUrl,
              action: "recovered",
            });
            recovered++;
            continue;
          }
        }
      }

      results.push({
        id: leg.id,
        number: leg.number,
        oldUrl: leg.document_url,
        newUrl: null,
        action: "unchanged",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: { total: legislation.length, recovered, cleared },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("URL fix error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
