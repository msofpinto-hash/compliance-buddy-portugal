import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FixResult {
  task: string;
  success: number;
  failed: number;
  skipped: number;
  error?: string;
}

// Helper function to check if a job of the same type is already running
async function checkConcurrency(supabase: any, syncType: string, maxAgeMinutes: number = 30): Promise<{ canProceed: boolean; runningJob?: any }> {
  // First, mark any very old "running" jobs as timed out
  const { error: timeoutError } = await supabase
    .from("sync_logs")
    .update({ 
      status: "completed_timeout", 
      completed_at: new Date().toISOString(),
      error_message: "Timeout automático após execução prolongada"
    })
    .eq("status", "running")
    .eq("sync_type", syncType)
    .lt("started_at", new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString());

  if (timeoutError) {
    console.warn("Failed to timeout old jobs:", timeoutError);
  }

  // Check for any currently running jobs
  const { data: runningJobs, error: checkError } = await supabase
    .from("sync_logs")
    .select("id, started_at")
    .eq("sync_type", syncType)
    .eq("status", "running")
    .limit(1);

  if (checkError) {
    console.error("Failed to check concurrency:", checkError);
    return { canProceed: true }; // Allow to proceed on error to avoid blocking
  }

  if (runningJobs && runningJobs.length > 0) {
    return { canProceed: false, runningJob: runningJobs[0] };
  }

  return { canProceed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const SYNC_TYPE = "scheduled-quality-fix";
  console.log("🔧 Starting scheduled data quality fix...");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check concurrency - prevent multiple simultaneous runs
    const { canProceed, runningJob } = await checkConcurrency(supabase, SYNC_TYPE);
    if (!canProceed) {
      console.log(`⚠️ Job já em execução desde ${runningJob?.started_at}, ignorando nova execução`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Job já em execução",
          runningJobId: runningJob?.id,
          runningJobStartedAt: runningJob?.started_at,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: FixResult[] = [];

    // Task 1: Fix PT titles via DRE scraping (limit to avoid timeout)
    console.log("📝 Task 1: Fixing PT generic titles...");
    try {
      const ptResult = await fixPTTitles(supabase, 30);
      results.push({ task: "fix-pt-titles", ...ptResult });
      console.log(`✅ PT titles: ${ptResult.success} fixed, ${ptResult.failed} failed`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("❌ PT titles error:", errorMsg);
      results.push({ task: "fix-pt-titles", success: 0, failed: 0, skipped: 0, error: errorMsg });
    }

    // Task 2: Fix EU titles via EUR-Lex API
    console.log("🌍 Task 2: Fixing EU generic titles...");
    try {
      const euResult = await fixEUTitles(supabase, 50);
      results.push({ task: "fix-eu-titles", ...euResult });
      console.log(`✅ EU titles: ${euResult.success} fixed, ${euResult.failed} failed`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("❌ EU titles error:", errorMsg);
      results.push({ task: "fix-eu-titles", success: 0, failed: 0, skipped: 0, error: errorMsg });
    }

    // Task 3: Auto-categorize legislation without categories
    console.log("📁 Task 3: Auto-categorizing legislation...");
    try {
      const catResult = await autoCategorize(supabase, 100);
      results.push({ task: "auto-categorize", ...catResult });
      console.log(`✅ Categorization: ${catResult.success} categorized`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("❌ Categorization error:", errorMsg);
      results.push({ task: "auto-categorize", success: 0, failed: 0, skipped: 0, error: errorMsg });
    }

    // Task 4: Generate EUR-Lex URLs for EU legislation without document_url
    console.log("🔗 Task 4: Generating EUR-Lex URLs...");
    try {
      const urlResult = await generateEURLexUrls(supabase, 50);
      results.push({ task: "generate-eurlex-urls", ...urlResult });
      console.log(`✅ EUR-Lex URLs: ${urlResult.success} generated`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("❌ EUR-Lex URLs error:", errorMsg);
      results.push({ task: "generate-eurlex-urls", success: 0, failed: 0, skipped: 0, error: errorMsg });
    }

    // Log summary
    const totalSuccess = results.reduce((acc, r) => acc + r.success, 0);
    const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n📊 Summary: ${totalSuccess} fixes, ${totalFailed} failures in ${duration}s`);

    // Create sync log entry
    await supabase.from("sync_logs").insert({
      sync_type: "scheduled-quality-fix",
      status: totalFailed > 0 ? "completed_with_errors" : "completed",
      items_processed: totalSuccess + totalFailed,
      items_added: totalSuccess,
      items_updated: 0,
      completed_at: new Date().toISOString(),
      error_message: results.filter(r => r.error).map(r => `${r.task}: ${r.error}`).join("; ") || null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: { totalSuccess, totalFailed, durationSeconds: parseFloat(duration) },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ Scheduled fix error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Fix PT generic titles by scraping DRE
async function fixPTTitles(supabase: any, limit: number): Promise<{ success: number; failed: number; skipped: number }> {
  const genericPattern = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Declaração|Acórdão|Aviso|Parecer)\s+n\.?º?\s/i;

  // Get PT legislation with generic titles and valid DRE URLs
  const { data: legislation, error } = await supabase
    .from("legislation")
    .select("id, number, title, document_url")
    .or("origin.eq.PT,origin.eq.dre")
    .not("document_url", "is", null)
    .like("document_url", "%/dr/detalhe/%")
    .limit(500);

  if (error) throw error;

  // Filter only those with generic titles
  const toFix = (legislation || []).filter((leg: any) => {
    const titleEqualsNumber = leg.title === leg.number;
    const hasGenericPattern = genericPattern.test(leg.title || '') && 
      (leg.title?.length || 0) < 80 && 
      !leg.title?.includes(' - ');
    return titleEqualsNumber || hasGenericPattern || !leg.title;
  }).slice(0, limit);

  if (toFix.length === 0) {
    return { success: 0, failed: 0, skipped: 0 };
  }

  let success = 0;
  let failed = 0;

  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!firecrawlApiKey) {
    console.log("⚠️ FIRECRAWL_API_KEY not set, skipping PT title fixes");
    return { success: 0, failed: 0, skipped: toFix.length };
  }

  for (const leg of toFix) {
    try {
      const scraped = await scrapeWithFirecrawl(leg.document_url, firecrawlApiKey);
      if (scraped?.markdown) {
        const metadata = extractMetadataFromDRE(scraped.markdown, leg.number);
        if (metadata.title && metadata.title !== leg.title) {
          const { error: updateError } = await supabase
            .from("legislation")
            .update({
              title: metadata.title,
              summary: metadata.summary || undefined,
              entity: metadata.entity || undefined,
            })
            .eq("id", leg.id);

          if (updateError) throw updateError;
          success++;
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fix ${leg.number}:`, errorMsg);
      failed++;
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { success, failed, skipped: 0 };
}

// Fix EU generic titles via EUR-Lex SPARQL API
async function fixEUTitles(supabase: any, limit: number): Promise<{ success: number; failed: number; skipped: number }> {
  // Get EU legislation with generic titles
  const { data: legislation, error } = await supabase
    .from("legislation")
    .select("id, number, title, external_id")
    .or("origin.eq.EU,origin.eq.eurlex")
    .not("external_id", "is", null)
    .limit(500);

  if (error) throw error;

  // Filter those with generic titles
  const toFix = (legislation || []).filter((leg: any) => {
    const titleEqualsCelex = leg.title === leg.external_id || leg.title === leg.number;
    const isGenericTitle = 
      leg.title?.startsWith('Documento ') ||
      leg.title?.startsWith('32') ||
      leg.title?.startsWith('22') ||
      leg.title?.startsWith('52') ||
      !leg.title ||
      (leg.title?.length || 0) < 30;
    return titleEqualsCelex || isGenericTitle;
  }).slice(0, limit);

  if (toFix.length === 0) {
    return { success: 0, failed: 0, skipped: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const leg of toFix) {
    try {
      const title = await fetchEURLexTitle(leg.external_id);
      if (title && title !== leg.title && title.length > 30) {
        const { error: updateError } = await supabase
          .from("legislation")
          .update({ title })
          .eq("id", leg.id);

        if (updateError) throw updateError;
        success++;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fix EU ${leg.external_id}:`, errorMsg);
      failed++;
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { success, failed, skipped: 0 };
}

// Auto-categorize legislation based on keywords
async function autoCategorize(supabase: any, limit: number): Promise<{ success: number; failed: number; skipped: number }> {
  // Get categories with keywords
  const { data: categories, error: catError } = await supabase
    .from("theme_categories")
    .select("id, name, keywords, theme_id");

  if (catError) throw catError;

  // Get legislation without categories
  const { data: legislation, error: legError } = await supabase
    .from("legislation")
    .select("id, title, summary, number")
    .limit(limit * 2);

  if (legError) throw legError;

  // Get existing mappings
  const { data: existingMappings } = await supabase
    .from("legislation_category_mapping")
    .select("legislation_id");

  const mappedIds = new Set((existingMappings || []).map((m: any) => m.legislation_id));
  const unmapped = (legislation || []).filter((l: any) => !mappedIds.has(l.id)).slice(0, limit);

  if (unmapped.length === 0) {
    return { success: 0, failed: 0, skipped: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const leg of unmapped) {
    const text = `${leg.title || ''} ${leg.summary || ''} ${leg.number || ''}`.toLowerCase();
    const matchedCategories: string[] = [];

    for (const cat of categories || []) {
      const keywords = cat.keywords || [];
      for (const keyword of keywords) {
        if (keyword && text.includes(keyword.toLowerCase())) {
          matchedCategories.push(cat.id);
          break;
        }
      }
    }

    if (matchedCategories.length > 0) {
      try {
        const mappings = matchedCategories.map(categoryId => ({
          legislation_id: leg.id,
          category_id: categoryId,
        }));

        const { error: insertError } = await supabase
          .from("legislation_category_mapping")
          .upsert(mappings, { onConflict: 'legislation_id,category_id', ignoreDuplicates: true });

        if (insertError) throw insertError;
        success++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to categorize ${leg.number}:`, errorMsg);
        failed++;
      }
    }
  }

  return { success, failed, skipped: unmapped.length - success - failed };
}

// Scrape with Firecrawl
async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<any> {
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      waitFor: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl error: ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

// Extract metadata from DRE markdown
function extractMetadataFromDRE(markdown: string, currentNumber: string): { title?: string; summary?: string; entity?: string } {
  const result: { title?: string; summary?: string; entity?: string } = {};

  // Extract title - look for the main heading that's not generic
  const titlePatterns = [
    /^#\s+(.+?)(?:\n|$)/m,
    /Título[:\s]+(.+?)(?:\n|$)/i,
    /Sumário[:\s]+(.+?)(?:\n|$)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = markdown.match(pattern);
    if (match && match[1] && match[1].length > 40 && !match[1].includes('Diário da República')) {
      result.title = match[1].trim().substring(0, 500);
      break;
    }
  }

  // Extract summary
  const summaryMatch = markdown.match(/Sumário[:\s]+(.+?)(?=\n\n|\n#|Texto do|$)/is);
  if (summaryMatch && summaryMatch[1]) {
    result.summary = summaryMatch[1].trim().substring(0, 2000);
  }

  // Extract entity
  const entityMatch = markdown.match(/Emissor[:\s]+(.+?)(?:\n|$)/i) || 
                      markdown.match(/Entidade[:\s]+(.+?)(?:\n|$)/i);
  if (entityMatch && entityMatch[1]) {
    result.entity = entityMatch[1].trim().substring(0, 200);
  }

  return result;
}

// Fetch title from EUR-Lex SPARQL
async function fetchEURLexTitle(celex: string): Promise<string | null> {
  const query = `
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    SELECT ?title WHERE {
      ?doc cdm:resource_legal_id_celex "${celex}" .
      ?doc cdm:expression_title ?title .
      FILTER(LANG(?title) = "por" || LANG(?title) = "pt")
    } LIMIT 1
  `;

  try {
    const response = await fetch(
      `https://publications.europa.eu/webapi/rdf/sparql?query=${encodeURIComponent(query)}`,
      {
        headers: { Accept: "application/sparql-results+json" },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const bindings = data.results?.bindings || [];
    if (bindings.length > 0) {
      return bindings[0].title?.value || null;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`SPARQL error for ${celex}:`, errorMsg);
  }

  return null;
}

// Generate EUR-Lex URLs for EU legislation without document_url
async function generateEURLexUrls(supabase: any, limit: number): Promise<{ success: number; failed: number; skipped: number }> {
  // Get EU legislation without document_url
  const { data: legislation, error } = await supabase
    .from("legislation")
    .select("id, number, title, origin")
    .or("origin.eq.EU,origin.eq.eurlex")
    .or("document_url.is.null,document_url.eq.")
    .limit(limit);

  if (error) throw error;

  // Filter to only those truly missing URLs
  const toFix = (legislation || []).filter((leg: any) => !leg.document_url);

  if (toFix.length === 0) {
    return { success: 0, failed: 0, skipped: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const leg of toFix) {
    try {
      const url = generateCelexUrl(leg.number);
      if (url) {
        const { error: updateError } = await supabase
          .from("legislation")
          .update({ document_url: url })
          .eq("id", leg.id);

        if (updateError) throw updateError;
        success++;
        console.log(`✅ Generated URL for ${leg.number}: ${url}`);
      } else {
        console.log(`⚠️ Could not parse number for URL: ${leg.number}`);
        failed++;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to generate URL for ${leg.number}:`, errorMsg);
      failed++;
    }
  }

  return { success, failed, skipped: 0 };
}

// Generate CELEX URL from EU legislation number
function generateCelexUrl(number: string): string | null {
  // Patterns for EU legislation:
  // Diretiva 1999/31/CE → 31999L0031
  // Diretiva de Execução (UE) 2022/1647 → 32022L1647
  // Regulamento (UE) 2024/1234 → 32024R1234
  // Decisão (UE) 2023/456 → 32023D0456
  // Regulamento de Execução (UE) 2024/789 → 32024R0789
  
  // Extract year and number from patterns like "2022/1647" or "1999/31"
  const yearNumMatch = number.match(/(\d{2,4})\/(\d+)/);
  if (!yearNumMatch) return null;

  let year = yearNumMatch[1];
  const num = yearNumMatch[2];

  // Convert 2-digit year to 4-digit
  if (year.length === 2) {
    const yearNum = parseInt(year, 10);
    year = yearNum <= 30 ? `20${year}` : `19${year}`;
  }

  // Determine document type letter
  let typeCode = 'L'; // Default to Directive
  const lowerNumber = number.toLowerCase();
  
  if (lowerNumber.includes('regulamento')) {
    typeCode = 'R';
  } else if (lowerNumber.includes('decisão') || lowerNumber.includes('decisao')) {
    typeCode = 'D';
  } else if (lowerNumber.includes('diretiva') || lowerNumber.includes('directiva')) {
    typeCode = 'L';
  }

  // Pad number to at least 4 digits
  const paddedNum = num.padStart(4, '0');
  
  const celex = `3${year}${typeCode}${paddedNum}`;
  return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`;
}
