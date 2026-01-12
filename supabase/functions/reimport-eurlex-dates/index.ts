import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LegislationDates {
  publication_date: string | null;
  effective_date: string | null;
  revocation_date: string | null;
}

// Extract CELEX number from legislation number
function extractCelexNumber(number: string): string | null {
  // Patterns for EU legislation numbers
  const patterns = [
    // Direct CELEX: 32013L0059
    /^3\d{4}[A-Z]\d+$/i,
    // Regulation (EU) 2016/679 -> 32016R0679
    /Regulamento\s*\(?(?:UE|CE)?\)?\s*(?:n\.?[ºo°]?\s*)?(\d{4})\/(\d+)/i,
    // Directive 2013/59/Euratom -> 32013L0059
    /Diretiva\s*(?:de\s*Execução\s*)?\(?(?:UE|Euratom|CEE|CE)?\)?\s*(?:n\.?[ºo°]?\s*)?(\d{4})\/(\d+)/i,
    /Directiva\s*(?:de\s*Execução\s*)?\(?(?:UE|Euratom|CEE|CE)?\)?\s*(?:n\.?[ºo°]?\s*)?(\d{4})\/(\d+)/i,
    // Decision 2022/1953 -> 32022D1953
    /Decisão\s*(?:de\s*Execução\s*)?\(?(?:UE|PESC)?\)?\s*(?:n\.?[ºo°]?\s*)?(\d{4})\/(\d+)/i,
    // Legacy format: 93/61/CEE -> 31993L0061
    /Diretiva\s*(?:n\.?[ºo°]?\s*)?(\d{2})\/(\d+)\/(?:CEE|CE|Euratom)/i,
    /Directiva\s*(?:n\.?[ºo°]?\s*)?(\d{2})\/(\d+)\/(?:CEE|CE|Euratom)/i,
  ];

  for (const pattern of patterns) {
    const match = number.match(pattern);
    if (match) {
      let year = match[1];
      let num = match[2];
      
      // Convert 2-digit year to 4-digit
      if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
      }
      
      // Pad number to 4 digits
      num = num.padStart(4, '0');
      
      // Determine type letter
      let typeLetter = 'L'; // Default to Directive
      if (/Regulamento/i.test(number)) typeLetter = 'R';
      if (/Decisão/i.test(number)) typeLetter = 'D';
      
      return `3${year}${typeLetter}${num}`;
    }
  }
  
  return null;
}

// Scrape EUR-Lex page for dates
async function scrapeEurlexDates(celexNumber: string, firecrawlKey: string): Promise<LegislationDates | null> {
  const url = `https://eur-lex.europa.eu/legal-content/PT/ALL/?uri=CELEX:${celexNumber}`;
  
  console.log(`Scraping EUR-Lex: ${url}`);
  
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl error for ${celexNumber}: ${response.status} - ${errorText}`);
      return null;
    }

    const result = await response.json();
    const markdown = result.data?.markdown || "";
    
    return extractDatesFromMarkdown(markdown);
  } catch (error) {
    console.error(`Error scraping ${celexNumber}:`, error);
    return null;
  }
}

// Extract dates from EUR-Lex markdown content
function extractDatesFromMarkdown(markdown: string): LegislationDates {
  const dates: LegislationDates = {
    publication_date: null,
    effective_date: null,
    revocation_date: null,
  };
  
  // Date patterns in Portuguese EUR-Lex pages
  // Format: DD/MM/YYYY or DD.MM.YYYY
  const datePattern = /(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/g;
  
  // Publication date patterns
  const publicationPatterns = [
    /Data\s+(?:de\s+)?(?:publicação|documento)[:\s]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
    /JO\s+[A-Z]\s*\d+\s*(?:de|,)\s*(\d{1,2})[\/\.\s]+(\d{1,2}|\w+)[\/\.\s]+(\d{4})/i,
    /Jornal\s+Oficial[^,]*,?\s*(\d{1,2})[\/\.\s]+(\d{1,2}|\w+)[\/\.\s]+(\d{4})/i,
    /publicado[^\d]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
  ];
  
  // Effective date patterns
  const effectivePatterns = [
    /Data\s+(?:de\s+)?(?:entrada\s+em\s+)?vigor[:\s]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
    /entr(?:a|ou)\s+em\s+vigor[^\d]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
    /vigor\s+(?:a\s+partir\s+de|em)[:\s]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
    /aplica(?:r-se-á|ção)[^\d]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
  ];
  
  // Revocation date patterns
  const revocationPatterns = [
    /Data\s+(?:de\s+)?(?:revogação|cessação)[:\s]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
    /revogad[oa][^\d]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
    /cessação\s+de\s+vigência[^\d]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
    /deixou?\s+de\s+(?:estar\s+em\s+)?vigor[^\d]*(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/i,
  ];
  
  // Try to extract publication date
  for (const pattern of publicationPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      dates.publication_date = formatDate(match[1], match[2], match[3]);
      break;
    }
  }
  
  // Try to extract effective date
  for (const pattern of effectivePatterns) {
    const match = markdown.match(pattern);
    if (match) {
      dates.effective_date = formatDate(match[1], match[2], match[3]);
      break;
    }
  }
  
  // Try to extract revocation date
  for (const pattern of revocationPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      dates.revocation_date = formatDate(match[1], match[2], match[3]);
      break;
    }
  }
  
  return dates;
}

// Format date to YYYY-MM-DD
function formatDate(day: string, monthOrName: string, year: string): string | null {
  try {
    const d = parseInt(day);
    let m: number;
    
    // Check if month is a name
    const monthNames: Record<string, number> = {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4,
      'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
      'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
    };
    
    if (isNaN(parseInt(monthOrName))) {
      m = monthNames[monthOrName.toLowerCase()] || 1;
    } else {
      m = parseInt(monthOrName);
    }
    
    const y = parseInt(year);
    
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
      return `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    }
  } catch (e) {
    console.error('Error formatting date:', e);
  }
  
  return null;
}

// Process a batch of legislation
async function processLegislationBatch(
  supabase: any,
  legislation: any[],
  firecrawlKey: string,
  syncLogId: string | null
): Promise<{ processed: number; updated: number; errors: number }> {
  let processed = 0;
  let updated = 0;
  let errors = 0;
  
  for (const leg of legislation) {
    try {
      const celexNumber = extractCelexNumber(leg.number);
      
      if (!celexNumber) {
        console.log(`Could not extract CELEX for: ${leg.number}`);
        processed++;
        continue;
      }
      
      console.log(`Processing ${leg.number} -> CELEX: ${celexNumber}`);
      
      const dates = await scrapeEurlexDates(celexNumber, firecrawlKey);
      
      if (dates && (dates.publication_date || dates.effective_date || dates.revocation_date)) {
        const updateData: any = {};
        
        if (dates.publication_date) {
          updateData.publication_date = dates.publication_date;
        }
        if (dates.effective_date) {
          updateData.effective_date = dates.effective_date;
        }
        if (dates.revocation_date) {
          updateData.revocation_date = dates.revocation_date;
        }
        
        const { error } = await supabase
          .from("legislation")
          .update(updateData)
          .eq("id", leg.id);
        
        if (error) {
          console.error(`Error updating ${leg.number}:`, error);
          errors++;
        } else {
          console.log(`Updated ${leg.number}: ${JSON.stringify(updateData)}`);
          updated++;
        }
      } else {
        console.log(`No dates found for ${leg.number}`);
      }
      
      processed++;
      
      // Update sync log periodically
      if (syncLogId && processed % 10 === 0) {
        await supabase
          .from("sync_logs")
          .update({
            items_processed: processed,
            items_updated: updated,
          })
          .eq("id", syncLogId);
      }
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      console.error(`Error processing ${leg.number}:`, error);
      errors++;
      processed++;
    }
  }
  
  return { processed, updated, errors };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { 
      legislationIds, // Specific IDs to process
      limit = 50,     // Batch size
      onlyMissingDates = false, // Only process legislation with missing/suspicious dates
      scheduled = false, // Running as scheduled job
    } = body;
    
    // Build query
    let query = supabase
      .from("legislation")
      .select("id, number, publication_date, effective_date, revocation_date")
      .eq("origin", "EU")
      .order("created_at", { ascending: false });
    
    if (legislationIds && legislationIds.length > 0) {
      query = query.in("id", legislationIds);
    } else if (onlyMissingDates) {
      // Find legislation with suspicious dates (before 1990 or generic dates like 01-01)
      query = query.or("publication_date.lt.1990-01-01,effective_date.lt.1990-01-01,publication_date.is.null,effective_date.is.null");
    }
    
    query = query.limit(limit);
    
    const { data: legislation, error: fetchError } = await query;
    
    if (fetchError) {
      console.error("Error fetching legislation:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!legislation || legislation.length === 0) {
      return new Response(
        JSON.stringify({ message: "No EU legislation found to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Found ${legislation.length} EU legislation items to process`);
    
    // Create sync log
    let syncLogId: string | null = null;
    
    const { data: syncLog, error: syncLogError } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: "reimport-eurlex-dates",
        status: "running",
        items_processed: 0,
        items_added: 0,
        items_updated: 0,
      })
      .select()
      .single();
    
    if (!syncLogError && syncLog) {
      syncLogId = syncLog.id;
    }
    
    // For scheduled runs, process in background
    if (scheduled) {
      const backgroundTask = async () => {
        try {
          const result = await processLegislationBatch(supabase, legislation, firecrawlKey, syncLogId);
          
          // Update sync log
          if (syncLogId) {
            await supabase
              .from("sync_logs")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                items_processed: result.processed,
                items_updated: result.updated,
                error_message: result.errors > 0 ? `${result.errors} errors occurred` : null,
              })
              .eq("id", syncLogId);
          }
          
          console.log(`Background task completed: ${JSON.stringify(result)}`);
        } catch (error: unknown) {
          console.error("Background task error:", error);
          if (syncLogId) {
            await supabase
              .from("sync_logs")
              .update({
                status: "failed",
                completed_at: new Date().toISOString(),
                error_message: error instanceof Error ? error.message : String(error),
              })
              .eq("id", syncLogId);
          }
        }
      };
      
      EdgeRuntime.waitUntil(backgroundTask());
      
      return new Response(
        JSON.stringify({
          message: "EUR-Lex dates reimport started in background",
          syncLogId,
          itemsToProcess: legislation.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // For manual runs, process synchronously
    const result = await processLegislationBatch(supabase, legislation, firecrawlKey, syncLogId);
    
    // Update sync log
    if (syncLogId) {
      await supabase
        .from("sync_logs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          items_processed: result.processed,
          items_updated: result.updated,
          error_message: result.errors > 0 ? `${result.errors} errors occurred` : null,
        })
        .eq("id", syncLogId);
    }
    
    return new Response(
      JSON.stringify({
        message: "EUR-Lex dates reimport completed",
        syncLogId,
        ...result,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: unknown) {
    console.error("Error in reimport-eurlex-dates:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
