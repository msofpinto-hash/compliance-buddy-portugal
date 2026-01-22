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

function normalizePtLegislationText(input: string): string {
  // Normalize common PT number formats (n.º / n.° / n.o), whitespace and punctuation
  return (input || "")
    .toUpperCase()
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    // normalize n.º variants
    .replace(/\bN\s*[\.\-]?\s*[º°O]\b/g, "N")
    .replace(/\bN\s*[\.\-]?\s*O\b/g, "N")
    .trim();
}

// Generate DRE URL from legislation number
function generateDreUrl(number: string): string | null {
  const text = normalizePtLegislationText(number);
  
  // Try to extract document type and number/year
  // Pattern 1: Lei n.º 123/2020, Decreto-Lei n.º 456/99, Portaria n.º 1102-G/2000
  // Also supports series suffix: Portaria n.º 474/2025/1 and letter suffixes: 1102-G/2000
  const modernMatch = text.match(/(\d+)(?:-([A-Z]+))?\/(\d{2,4})(?:\/(\d+))?/);
  if (modernMatch) {
    const num = modernMatch[1];
    const letterSuffix = modernMatch[2] ? modernMatch[2].toLowerCase() : null;
    let year = modernMatch[3];
    const series = modernMatch[4] ? modernMatch[4] : null;
    
    // Convert 2-digit year to 4-digit
    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum <= 30 ? `20${year}` : `19${year}`;
    }
    
    // Determine document type for URL
    let docType = "lei";
    if (/DECRETO-LEI/i.test(text)) docType = "decreto-lei";
    else if (/DECRETO\s+REGULAMENTAR/i.test(text)) docType = "decreto-regulamentar";
    else if (/DECRETO/i.test(text)) docType = "decreto";
    else if (/PORTARIA/i.test(text)) docType = "portaria";
    else if (/AVISO/i.test(text)) docType = "aviso";
    else if (/DESPACHO/i.test(text)) docType = "despacho";
    else if (/RESOLUÇÃO/i.test(text)) docType = "resolucao-do-conselho-de-ministros";
    
    // Detailed page format
    // Examples (observed): /dr/detalhe/portaria/474-2025, sometimes with suffixes
    // We include letter suffix and series when present (e.g., 1102-g-2000, 474-2025-1)
    const detailIdParts = [num];
    if (letterSuffix) detailIdParts.push(letterSuffix);
    detailIdParts.push(year);
    if (series) detailIdParts.push(series);
    const detailId = detailIdParts.join("-");
    return `https://diariodarepublica.pt/dr/detalhe/${docType}/${detailId}`;
  }
  
  // Pattern 2: Old format - Decreto n.º 45458 (number without year separator)
  const oldMatch = text.match(/(?:DECRETO|LEI)\s+(?:N\.?[º°]?\s*)?(\d{5,})/i);
  if (oldMatch) {
    const num = oldMatch[1];
    // Old decrees are typically pre-1974
    return `https://diariodarepublica.pt/dr/detalhe/decreto/${num}`;
  }
  
  return null;
}

// Generate EUR-Lex URL from legislation number
function generateEurlexUrl(number: string, title: string): string | null {
  const text = `${number} ${title}`.toUpperCase();
  
  // Try to extract CELEX from number or title (e.g., 32020R0704)
  const celexMatch = text.match(/3(\d{4})([RLDC])(\d{4})/);
  if (celexMatch) {
    return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:3${celexMatch[1]}${celexMatch[2]}${celexMatch[3]}`;
  }

  // Patterns for year/number extraction - supports multiple formats
  // Note: Some EU legislation uses NUMBER/YEAR format (e.g., 142/97), others use YEAR/NUMBER (e.g., 2023/1804)
  const patterns = [
    // Modern format: YEAR/NUMBER - Regulamento (UE) 2023/1804
    { regex: /REGULAMENTO[^\d]*(?:N\.?[º°O]?\s*)?(\d{4})\/(\d+)/i, yearFirst: true },
    // Old format: NUMBER/YEAR - Regulamento (CE) n.º 142/97, 1488/94
    { regex: /REGULAMENTO[^\d]*(?:N\.?[º°O]?\s*)?(\d+)\/(\d{2})(?:\s|$|,|DE)/i, yearFirst: false },
    // Diretiva modern
    { regex: /DIRE[CT]IVA[^\d]*(?:N\.?[º°O]?\s*)?(\d{4})\/(\d+)/i, yearFirst: true },
    // Diretiva old
    { regex: /DIRE[CT]IVA[^\d]*(?:N\.?[º°O]?\s*)?(\d+)\/(\d{2})(?:\s|$|,|DE)/i, yearFirst: false },
    // Decisão modern
    { regex: /DECIS[ÃA]O[^\d]*(?:N\.?[º°O]?\s*)?(\d{4})\/(\d+)/i, yearFirst: true },
    // Recomendação
    { regex: /RECOMENDA[ÇC][ÃA]O[^\d]*(?:N\.?[º°O]?\s*)?(\d{4})\/(\d+)/i, yearFirst: true },
    // (UE) 2017/745, (EU) 2017/176 - modern
    { regex: /\([UE][EA]?\)\s*(?:N\.?[º°O]?\s*)?(\d{4})\/(\d+)/i, yearFirst: true },
    // (UE) n.o 293/2012 - could be either format, assume NUMBER/YEAR if second part is 4 digits
    { regex: /\([UE][EA]?\)\s*(?:N\.?[º°O]?\s*)?(\d+)\/(\d{4})/i, yearFirst: false },
    // (CE) old format NUMBER/YEAR
    { regex: /\(C?E[EA]?\)\s*(?:N\.?[º°O]?\s*)?(\d+)\/(\d{2})(?:\s|$|,|DE)/i, yearFirst: false },
    // Decisão 1999/468/CE
    { regex: /(\d{4})\/(\d+)\/(?:C?E|EURATOM)/i, yearFirst: true },
  ];

  for (const { regex, yearFirst } of patterns) {
    const match = text.match(regex);
    if (match) {
      let year = yearFirst ? match[1] : match[2];
      let num = yearFirst ? match[2] : match[1];
      
      // Convert 2-digit year to 4-digit
      if (year.length === 2) {
        const yearNum = parseInt(year);
        year = yearNum <= 30 ? `20${year}` : `19${year}`;
      }
      
      // Pad number to 4 digits
      num = num.padStart(4, "0");
      
      // Determine document type
      let docType = "R"; // Default to Regulation
      if (/DIRE[CT]IVA/i.test(text)) docType = "L";
      else if (/DECIS[ÃA]O/i.test(text)) docType = "D";
      else if (/RECOMENDA[ÇC][ÃA]O/i.test(text)) docType = "H";
      
      return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:3${year}${docType}${num}`;
    }
  }

  return null;
}

// Check if URL is accessible
async function checkUrl(
  url: string,
  opts?: { timeoutMs?: number }
): Promise<{ valid: boolean; statusCode?: number }> {
  try {
    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Math.min(20000, opts?.timeoutMs ?? 5000));
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

// Process a single legislation item
async function processLegislationUrl(
  supabase: AnySupabaseClient,
  leg: { id: string; number: string; title: string; document_url: string | null; origin: string | null },
  options: { validateExisting: boolean; recoverMissing: boolean; clearInvalid: boolean; requestTimeoutMs: number }
): Promise<UrlFixResult> {
  const result: UrlFixResult = {
    id: leg.id,
    number: leg.number,
    oldUrl: leg.document_url,
    newUrl: null,
    action: "unchanged",
  };

  try {
    const isPT = leg.origin === "PT" || leg.origin === "dre";

    // Case 1: Has URL - validate it
    if (leg.document_url && options.validateExisting) {
      const check = await checkUrl(leg.document_url, { timeoutMs: options.requestTimeoutMs });
      
      if (check.valid) {
        result.action = "validated";
      } else if (options.clearInvalid) {
        // Try to recover before clearing
        const newUrl = isPT ? generateDreUrl(leg.number) : generateEurlexUrl(leg.number, leg.title);
        
        if (newUrl) {
            const newCheck = await checkUrl(newUrl, { timeoutMs: options.requestTimeoutMs });
          if (newCheck.valid) {
            await supabase
              .from("legislation")
              .update({ document_url: newUrl })
              .eq("id", leg.id);
            result.newUrl = newUrl;
            result.action = "recovered";
          } else {
            await supabase
              .from("legislation")
              .update({ document_url: null })
              .eq("id", leg.id);
            result.action = "cleared";
          }
        } else {
          await supabase
            .from("legislation")
            .update({ document_url: null })
            .eq("id", leg.id);
          result.action = "cleared";
        }
      }
    }
    // Case 2: No URL - try to recover
    else if (!leg.document_url && options.recoverMissing) {
      const newUrl = isPT ? generateDreUrl(leg.number) : generateEurlexUrl(leg.number, leg.title);
      
      if (newUrl) {
        const check = await checkUrl(newUrl, { timeoutMs: options.requestTimeoutMs });
        if (check.valid) {
          await supabase
            .from("legislation")
            .update({ document_url: newUrl })
            .eq("id", leg.id);
          result.newUrl = newUrl;
          result.action = "recovered";
        }
      }
    }
  } catch (err) {
    result.action = "error";
    result.error = err instanceof Error ? err.message : "Unknown error";
  }

  return result;
}

// Process URLs in parallel batches
async function fixUrlsInBackground(
  supabase: AnySupabaseClient,
  legislation: Array<{ id: string; number: string; title: string; document_url: string | null; origin: string | null }>,
  logId: string,
  options: {
    validateExisting: boolean;
    recoverMissing: boolean;
    clearInvalid: boolean;
    parallel: number;
    batchDelayMs: number;
    requestTimeoutMs: number;
  }
) {
  const PARALLEL_BATCH_SIZE = Math.max(1, Math.min(100, Math.floor(options.parallel || 1)));
  const BATCH_DELAY_MS = Math.max(0, Math.min(5000, Math.floor(options.batchDelayMs || 0)));
  let totalProcessed = 0;
  let totalRecovered = 0;
  let totalCleared = 0;
  let totalValidated = 0;

  console.log(
    `Starting parallel URL fix: ${legislation.length} items | parallel=${PARALLEL_BATCH_SIZE} | delayMs=${BATCH_DELAY_MS} | timeoutMs=${options.requestTimeoutMs}`
  );

  for (let i = 0; i < legislation.length; i += PARALLEL_BATCH_SIZE) {
    const batch = legislation.slice(i, i + PARALLEL_BATCH_SIZE);
    
    // Process batch in parallel
    const results = await Promise.all(batch.map((leg) => processLegislationUrl(supabase, leg, options)));

    // Count results
    for (const result of results) {
      totalProcessed++;
      if (result.action === "validated") totalValidated++;
      if (result.action === "recovered") totalRecovered++;
      if (result.action === "cleared") totalCleared++;
    }

    // Update progress after each batch
    await supabase
      .from("sync_logs")
      .update({
        items_processed: totalProcessed,
        items_added: totalRecovered,
        items_updated: totalCleared,
      })
      .eq("id", logId);

    console.log(`Batch ${Math.floor(i / PARALLEL_BATCH_SIZE) + 1}: processed ${totalProcessed}/${legislation.length}`);

    // Small delay between batches to avoid rate limiting
    if (i + PARALLEL_BATCH_SIZE < legislation.length) {
      if (BATCH_DELAY_MS > 0) await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Final update
  await supabase
    .from("sync_logs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      items_processed: totalProcessed,
      items_added: totalRecovered,
      items_updated: totalCleared,
      error_message: `Validados: ${totalValidated}, Recuperados: ${totalRecovered}, Limpos: ${totalCleared}`,
    })
    .eq("id", logId);

  console.log(`URL fix completed: ${JSON.stringify({ processed: totalProcessed, recovered: totalRecovered, cleared: totalCleared, validated: totalValidated })}`);
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
      parallel,
      batchDelayMs,
      requestTimeoutMs,
    } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Starting URL fix: limit=${limit}, origin=${origin || "all"}, mode=${mode}, background=${background}`);

    const options = {
      validateExisting: mode === "validate" || mode === "all",
      recoverMissing: mode === "recover" || mode === "all",
      clearInvalid: mode === "validate" || mode === "all",
      // Speed controls (safe defaults, overridable by caller)
      parallel: parallel ?? 40,
      batchDelayMs: batchDelayMs ?? 50,
      requestTimeoutMs: Math.max(1000, Math.min(20000, requestTimeoutMs ?? 5000)),
    };

    // Build query based on mode
    let query = supabase
      .from("legislation")
      .select("id, number, title, document_url, origin")
      .or("no_digital_version.is.null,no_digital_version.eq.false");

    // For recover mode, only get items without URLs
    if (mode === "recover") {
      query = query.is("document_url", null);
    }

    // Filter by origin if specified
    if (origin === "PT") {
      query = query.in("origin", ["PT", "dre"]);
    } else if (origin === "EU") {
      query = query.in("origin", ["EU", "eurlex"]);
    }

    const { data: legislation, error: fetchError } = await query.limit(limit);

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
