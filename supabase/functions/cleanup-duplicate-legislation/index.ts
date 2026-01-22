import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LegislationItem {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  entity: string | null;
  publication_date: string | null;
  effective_date: string | null;
  document_url: string | null;
  external_id: string | null;
  origin: string | null;
  source: string | null;
  created_at: string;
}

interface DuplicateGroup {
  normalizedNumber: string;
  items: LegislationItem[];
  keepId: string;
  deleteIds: string[];
}

// Normalize number for comparison - same logic as frontend
function normalizeNumber(num: string): string {
  return num
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/n\.?º?\s*/gi, "")
    .replace(/[–—−]/g, "-")
    .replace(/,/g, "")
    .trim();
}

// Score for quality comparison - prefer more complete records
function qualityScore(item: LegislationItem, reqCount: number, relCount: number, catCount: number): number {
  let score = 0;

  // Heavily weight requirement count
  score += reqCount * 50;
  
  // Weight relations and categories
  score += relCount * 20;
  score += catCount * 10;

  // Prefer items with more complete data
  if (item.summary && item.summary.length > 20) score += 30;
  if (item.entity && item.entity.length > 0) score += 20;
  if (item.publication_date) score += 15;
  if (item.effective_date) score += 10;
  if (item.document_url) score += 15;
  if (item.external_id) score += 10;
  if (item.origin) score += 5;

  // Prefer descriptive titles over generic ones
  const genericPatterns = [
    /^decreto-lei\s*n/i,
    /^lei\s*n/i,
    /^portaria\s*n/i,
    /^regulamento\s*\(/i,
    /^diretiva\s*\d/i,
    /enviar por email/i,
    /copiar link/i,
  ];
  const isGenericTitle = genericPatterns.some((p) => p.test(item.title));
  if (!isGenericTitle && item.title.length > 40) score += 25;

  return score;
}

async function processCleanupInBackground(supabase: any, batchSize: number, logId: string) {
  console.log(`Starting duplicate cleanup with batch size ${batchSize}`);
  
  let totalMerged = 0;
  let totalDeleted = 0;
  let errors: string[] = [];

  try {
    // Fetch all legislation with counts
    const { data: legislation, error: legError } = await supabase
      .from("legislation")
      .select("id, number, title, summary, entity, publication_date, effective_date, document_url, external_id, origin, source, created_at")
      .order("publication_date", { ascending: false });

    if (legError) throw legError;

    console.log(`Fetched ${legislation?.length || 0} legislation records`);

    // Get requirement counts per legislation
    const { data: reqCounts } = await supabase
      .from("legal_requirements")
      .select("legislation_id");

    const reqCountMap = new Map<string, number>();
    for (const req of reqCounts || []) {
      reqCountMap.set(req.legislation_id, (reqCountMap.get(req.legislation_id) || 0) + 1);
    }

    // Get relation counts per legislation
    const { data: relCounts } = await supabase
      .from("legislation_relations")
      .select("source_legislation_id, target_legislation_id");

    const relCountMap = new Map<string, number>();
    for (const rel of relCounts || []) {
      relCountMap.set(rel.source_legislation_id, (relCountMap.get(rel.source_legislation_id) || 0) + 1);
      relCountMap.set(rel.target_legislation_id, (relCountMap.get(rel.target_legislation_id) || 0) + 1);
    }

    // Get category counts per legislation
    const { data: catCounts } = await supabase
      .from("legislation_category_mapping")
      .select("legislation_id");

    const catCountMap = new Map<string, number>();
    for (const cat of catCounts || []) {
      catCountMap.set(cat.legislation_id, (catCountMap.get(cat.legislation_id) || 0) + 1);
    }

    // Group by normalized number
    const groups = new Map<string, LegislationItem[]>();
    for (const item of legislation || []) {
      const normalized = normalizeNumber(item.number);
      if (!groups.has(normalized)) {
        groups.set(normalized, []);
      }
      groups.get(normalized)!.push(item);
    }

    // Filter to only groups with duplicates and prepare for merge
    const duplicateGroups: DuplicateGroup[] = [];
    for (const [normalizedNumber, items] of groups) {
      if (items.length > 1) {
        // Sort by quality score descending
        items.sort((a, b) => {
          const scoreA = qualityScore(a, reqCountMap.get(a.id) || 0, relCountMap.get(a.id) || 0, catCountMap.get(a.id) || 0);
          const scoreB = qualityScore(b, reqCountMap.get(b.id) || 0, relCountMap.get(b.id) || 0, catCountMap.get(b.id) || 0);
          return scoreB - scoreA;
        });

        duplicateGroups.push({
          normalizedNumber,
          items,
          keepId: items[0].id,
          deleteIds: items.slice(1).map((i) => i.id),
        });
      }
    }

    console.log(`Found ${duplicateGroups.length} duplicate groups`);

    // Update log with total
    await supabase
      .from("sync_logs")
      .update({
        items_processed: 0,
        items_added: duplicateGroups.length,
        status: "running",
      })
      .eq("id", logId);

    // Process in batches
    for (let i = 0; i < duplicateGroups.length; i += batchSize) {
      const batch = duplicateGroups.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}, groups ${i + 1} to ${Math.min(i + batchSize, duplicateGroups.length)}`);

      for (const group of batch) {
        try {
          const keepItem = group.items[0];
          const itemsToDelete = group.items.slice(1);

          // Merge data from deleted items into keep item
          let mergedTitle = keepItem.title;
          let mergedSummary = keepItem.summary;
          let mergedEntity = keepItem.entity;
          let mergedPublicationDate = keepItem.publication_date;
          let mergedEffectiveDate = keepItem.effective_date;
          let mergedDocumentUrl = keepItem.document_url;
          let mergedExternalId = keepItem.external_id;
          let mergedOrigin = keepItem.origin;

          for (const item of itemsToDelete) {
            // Use better title if current is generic
            if (item.title && item.title.length > mergedTitle.length) {
              const isCurrentGeneric = /^(decreto-lei|lei|portaria|regulamento|diretiva)\s*n/i.test(mergedTitle) ||
                /enviar por email/i.test(mergedTitle);
              const isNewGeneric = /^(decreto-lei|lei|portaria|regulamento|diretiva)\s*n/i.test(item.title) ||
                /enviar por email/i.test(item.title);
              if (isCurrentGeneric && !isNewGeneric) {
                mergedTitle = item.title;
              }
            }

            // Use longer/better summary
            if (item.summary && (!mergedSummary || item.summary.length > mergedSummary.length)) {
              mergedSummary = item.summary;
            }

            // Use entity if missing
            if (item.entity && !mergedEntity) {
              mergedEntity = item.entity;
            }

            // Use dates if missing
            if (item.publication_date && !mergedPublicationDate) {
              mergedPublicationDate = item.publication_date;
            }
            if (item.effective_date && !mergedEffectiveDate) {
              mergedEffectiveDate = item.effective_date;
            }

            // Use document URL if missing
            if (item.document_url && !mergedDocumentUrl) {
              mergedDocumentUrl = item.document_url;
            }

            // Use external_id if missing
            if (item.external_id && !mergedExternalId) {
              mergedExternalId = item.external_id;
            }

            // Use origin if missing
            if (item.origin && !mergedOrigin) {
              mergedOrigin = item.origin;
            }
          }

          // Update the keep item with merged data
          const { error: updateError } = await supabase
            .from("legislation")
            .update({
              title: mergedTitle,
              summary: mergedSummary,
              entity: mergedEntity,
              publication_date: mergedPublicationDate,
              effective_date: mergedEffectiveDate,
              document_url: mergedDocumentUrl,
              external_id: mergedExternalId,
              origin: mergedOrigin,
            })
            .eq("id", keepItem.id);

          if (updateError) {
            console.error(`Update error for ${keepItem.number}:`, updateError);
            errors.push(`${keepItem.number}: ${updateError.message}`);
            continue;
          }

          // Transfer all related data from deleted items to keep item
          for (const item of itemsToDelete) {
            // Transfer category mappings
            const { data: mappings } = await supabase
              .from("legislation_category_mapping")
              .select("category_id")
              .eq("legislation_id", item.id);

            if (mappings && mappings.length > 0) {
              const { data: existingMappings } = await supabase
                .from("legislation_category_mapping")
                .select("category_id")
                .eq("legislation_id", keepItem.id);

              const existingCategoryIds = new Set(existingMappings?.map((m: any) => m.category_id) || []);

              for (const mapping of mappings) {
                if (!existingCategoryIds.has(mapping.category_id)) {
                  await supabase
                    .from("legislation_category_mapping")
                    .insert({
                      legislation_id: keepItem.id,
                      category_id: mapping.category_id,
                    });
                }
              }
            }

            // Transfer organization legislation assignments
            const { data: orgAssignments } = await supabase
              .from("organization_legislation")
              .select("organization_id, notes, applicability_type")
              .eq("legislation_id", item.id);

            if (orgAssignments && orgAssignments.length > 0) {
              const { data: existingAssignments } = await supabase
                .from("organization_legislation")
                .select("organization_id")
                .eq("legislation_id", keepItem.id);

              const existingOrgIds = new Set(existingAssignments?.map((a: any) => a.organization_id) || []);

              for (const assignment of orgAssignments) {
                if (!existingOrgIds.has(assignment.organization_id)) {
                  await supabase
                    .from("organization_legislation")
                    .insert({
                      legislation_id: keepItem.id,
                      organization_id: assignment.organization_id,
                      notes: assignment.notes,
                      applicability_type: assignment.applicability_type,
                    });
                }
              }
            }

            // Transfer requirements
            await supabase
              .from("legal_requirements")
              .update({ legislation_id: keepItem.id })
              .eq("legislation_id", item.id);

            // Transfer relations (update source)
            await supabase
              .from("legislation_relations")
              .update({ source_legislation_id: keepItem.id })
              .eq("source_legislation_id", item.id);

            // Transfer relations (update target)
            await supabase
              .from("legislation_relations")
              .update({ target_legislation_id: keepItem.id })
              .eq("target_legislation_id", item.id);

            // Transfer alerts
            await supabase
              .from("alerts")
              .update({ related_legislation_id: keepItem.id })
              .eq("related_legislation_id", item.id);

            // Transfer user reads
            await supabase
              .from("user_legislation_reads")
              .update({ legislation_id: keepItem.id })
              .eq("legislation_id", item.id);

            // Transfer relations processed status
            await supabase
              .from("legislation_relations_processed")
              .delete()
              .eq("legislation_id", item.id);

            // Delete category mappings from item to delete
            await supabase
              .from("legislation_category_mapping")
              .delete()
              .eq("legislation_id", item.id);

            // Delete organization assignments from item to delete
            await supabase
              .from("organization_legislation")
              .delete()
              .eq("legislation_id", item.id);
          }

          // Delete duplicate items
          const { error: deleteError } = await supabase
            .from("legislation")
            .delete()
            .in("id", group.deleteIds);

          if (deleteError) {
            console.error(`Delete error for group ${group.normalizedNumber}:`, deleteError);
            errors.push(`${group.normalizedNumber}: ${deleteError.message}`);
            continue;
          }

          totalMerged++;
          totalDeleted += group.deleteIds.length;
        } catch (groupError) {
          console.error(`Error processing group ${group.normalizedNumber}:`, groupError);
          errors.push(`${group.normalizedNumber}: ${groupError instanceof Error ? groupError.message : "Unknown error"}`);
        }
      }

      // Update progress
      await supabase
        .from("sync_logs")
        .update({
          items_processed: Math.min(i + batchSize, duplicateGroups.length),
          items_updated: totalDeleted,
        })
        .eq("id", logId);
    }

    // Final update
    await supabase
      .from("sync_logs")
      .update({
        status: errors.length > 0 ? "completed_with_errors" : "completed",
        completed_at: new Date().toISOString(),
        items_processed: duplicateGroups.length,
        items_updated: totalDeleted,
        items_added: totalMerged,
        error_message: errors.length > 0 ? `${errors.length} errors: ${errors.slice(0, 5).join("; ")}` : null,
      })
      .eq("id", logId);

    console.log(`Cleanup completed: ${totalMerged} groups merged, ${totalDeleted} duplicates deleted, ${errors.length} errors`);
  } catch (error) {
    console.error("Cleanup error:", error);
    await supabase
      .from("sync_logs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", logId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roles) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 50;
    const dryRun = body.dryRun || false;

    if (dryRun) {
      // Just count duplicates without processing
      const { data: legislation } = await supabase
        .from("legislation")
        .select("id, number");

      const groups = new Map<string, string[]>();
      for (const item of legislation || []) {
        const normalized = normalizeNumber(item.number);
        if (!groups.has(normalized)) {
          groups.set(normalized, []);
        }
        groups.get(normalized)!.push(item.id);
      }

      let duplicateGroups = 0;
      let recordsToDelete = 0;
      for (const [, ids] of groups) {
        if (ids.length > 1) {
          duplicateGroups++;
          recordsToDelete += ids.length - 1;
        }
      }

      return new Response(
        JSON.stringify({
          dryRun: true,
          totalLegislation: legislation?.length || 0,
          duplicateGroups,
          recordsToDelete,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check for running job
    const { data: runningJob } = await supabase
      .from("sync_logs")
      .select("id, started_at")
      .eq("sync_type", "duplicate_cleanup")
      .eq("status", "running")
      .single();

    if (runningJob) {
      return new Response(
        JSON.stringify({
          error: "Job already running",
          jobId: runningJob.id,
          startedAt: runningJob.started_at,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create sync log entry
    const { data: logEntry, error: logError } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: "duplicate_cleanup",
        status: "running",
        created_by: user.id,
      })
      .select()
      .single();

    if (logError) {
      throw logError;
    }

    // Start background processing
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    (globalThis as any).EdgeRuntime.waitUntil(processCleanupInBackground(supabase, batchSize, logEntry.id));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Limpeza de duplicados iniciada em background",
        jobId: logEntry.id,
        batchSize,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
