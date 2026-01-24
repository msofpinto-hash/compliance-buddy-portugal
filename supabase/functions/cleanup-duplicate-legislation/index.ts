import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

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

function normalizeNumber(num: string): string {
  return num
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/n\.?º?\s*/gi, "")
    .replace(/[–—−]/g, "-")
    .replace(/,/g, "")
    .trim();
}

function qualityScore(item: LegislationItem, reqCount: number, relCount: number, catCount: number): number {
  let score = 0;
  score += reqCount * 50;
  score += relCount * 20;
  score += catCount * 10;
  if (item.summary && item.summary.length > 20) score += 30;
  if (item.entity && item.entity.length > 0) score += 20;
  if (item.publication_date) score += 15;
  if (item.effective_date) score += 10;
  if (item.document_url) score += 15;
  if (item.external_id) score += 10;
  if (item.origin) score += 5;
  const genericPatterns = [/^decreto-lei\s*n/i, /^lei\s*n/i, /^portaria\s*n/i, /^regulamento\s*\(/i, /^diretiva\s*\d/i, /enviar por email/i];
  const isGenericTitle = genericPatterns.some((p) => p.test(item.title));
  if (!isGenericTitle && item.title.length > 40) score += 25;
  return score;
}

async function processCleanupInBackground(supabase: any, batchSize: number, logId: string) {
  console.log(`Starting optimized duplicate cleanup with batch size ${batchSize}`);
  
  let totalMerged = 0;
  let totalDeleted = 0;
  const errors: string[] = [];

  try {
    // Fetch all legislation in parallel batches
    const allLegislation: LegislationItem[] = [];
    let offset = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from("legislation")
        .select("id, number, title, summary, entity, publication_date, effective_date, document_url, external_id, origin, source, created_at")
        .order("publication_date", { ascending: false })
        .range(offset, offset + pageSize - 1);
      
      if (pageError) throw pageError;
      if (!page || page.length === 0) break;
      allLegislation.push(...page);
      offset += pageSize;
      if (offset > 50000) break;
    }

    console.log(`Fetched ${allLegislation.length} legislation records`);

    // Fetch all counts in single queries (much faster!)
    const [reqResult, relResult, catResult] = await Promise.all([
      supabase.from("legal_requirements").select("legislation_id"),
      supabase.from("legislation_relations").select("source_legislation_id, target_legislation_id"),
      supabase.from("legislation_category_mapping").select("legislation_id"),
    ]);

    const reqCountMap = new Map<string, number>();
    for (const req of reqResult.data || []) {
      reqCountMap.set(req.legislation_id, (reqCountMap.get(req.legislation_id) || 0) + 1);
    }

    const relCountMap = new Map<string, number>();
    for (const rel of relResult.data || []) {
      relCountMap.set(rel.source_legislation_id, (relCountMap.get(rel.source_legislation_id) || 0) + 1);
      relCountMap.set(rel.target_legislation_id, (relCountMap.get(rel.target_legislation_id) || 0) + 1);
    }

    const catCountMap = new Map<string, number>();
    for (const cat of catResult.data || []) {
      catCountMap.set(cat.legislation_id, (catCountMap.get(cat.legislation_id) || 0) + 1);
    }

    // Group by normalized number
    const groups = new Map<string, LegislationItem[]>();
    for (const item of allLegislation) {
      const normalized = normalizeNumber(item.number);
      if (!groups.has(normalized)) groups.set(normalized, []);
      groups.get(normalized)!.push(item);
    }

    // Prepare duplicate groups
    const duplicateGroups: DuplicateGroup[] = [];
    for (const [normalizedNumber, items] of groups) {
      if (items.length > 1) {
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

    await supabase.from("sync_logs").update({ items_processed: 0, items_added: duplicateGroups.length, status: "running" }).eq("id", logId);

    // Process in larger batches with bulk operations
    const MEGA_BATCH = Math.max(batchSize, 100); // Process 100 groups at a time

    for (let i = 0; i < duplicateGroups.length; i += MEGA_BATCH) {
      const batch = duplicateGroups.slice(i, i + MEGA_BATCH);
      console.log(`Processing batch ${Math.floor(i / MEGA_BATCH) + 1}: groups ${i + 1} to ${Math.min(i + MEGA_BATCH, duplicateGroups.length)}`);

      // Collect all IDs for this batch
      const allKeepIds = batch.map(g => g.keepId);
      const allDeleteIds = batch.flatMap(g => g.deleteIds);
      const keepToDeleteMap = new Map<string, string[]>();
      for (const g of batch) {
        keepToDeleteMap.set(g.keepId, g.deleteIds);
      }

      try {
        // 1. BULK update legislation with merged data
        for (const group of batch) {
          const keepItem = group.items[0];
          const itemsToDelete = group.items.slice(1);

          let mergedTitle = keepItem.title;
          let mergedSummary = keepItem.summary;
          let mergedEntity = keepItem.entity;
          let mergedPublicationDate = keepItem.publication_date;
          let mergedEffectiveDate = keepItem.effective_date;
          let mergedDocumentUrl = keepItem.document_url;
          let mergedExternalId = keepItem.external_id;
          let mergedOrigin = keepItem.origin;

          for (const item of itemsToDelete) {
            if (item.title && item.title.length > mergedTitle.length) {
              const isCurrentGeneric = /^(decreto-lei|lei|portaria|regulamento|diretiva)\s*n/i.test(mergedTitle);
              const isNewGeneric = /^(decreto-lei|lei|portaria|regulamento|diretiva)\s*n/i.test(item.title);
              if (isCurrentGeneric && !isNewGeneric) mergedTitle = item.title;
            }
            if (item.summary && (!mergedSummary || item.summary.length > mergedSummary.length)) mergedSummary = item.summary;
            if (item.entity && !mergedEntity) mergedEntity = item.entity;
            if (item.publication_date && !mergedPublicationDate) mergedPublicationDate = item.publication_date;
            if (item.effective_date && !mergedEffectiveDate) mergedEffectiveDate = item.effective_date;
            if (item.document_url && !mergedDocumentUrl) mergedDocumentUrl = item.document_url;
            if (item.external_id && !mergedExternalId) mergedExternalId = item.external_id;
            if (item.origin && !mergedOrigin) mergedOrigin = item.origin;
          }

          await supabase.from("legislation").update({
            title: mergedTitle,
            summary: mergedSummary,
            entity: mergedEntity,
            publication_date: mergedPublicationDate,
            effective_date: mergedEffectiveDate,
            document_url: mergedDocumentUrl,
            external_id: mergedExternalId,
            origin: mergedOrigin,
          }).eq("id", keepItem.id);
        }

        // 2. BULK fetch existing mappings for keep items
        const { data: existingCatMappings } = await supabase
          .from("legislation_category_mapping")
          .select("legislation_id, category_id")
          .in("legislation_id", allKeepIds);

        const existingCatsByLeg = new Map<string, Set<string>>();
        for (const m of existingCatMappings || []) {
          if (!existingCatsByLeg.has(m.legislation_id)) existingCatsByLeg.set(m.legislation_id, new Set());
          existingCatsByLeg.get(m.legislation_id)!.add(m.category_id);
        }

        // 3. BULK fetch mappings from items to delete
        const { data: deleteCatMappings } = await supabase
          .from("legislation_category_mapping")
          .select("legislation_id, category_id")
          .in("legislation_id", allDeleteIds);

        // Build inserts for category mappings
        const newCatMappings: { legislation_id: string; category_id: string }[] = [];
        for (const m of deleteCatMappings || []) {
          // Find which keep ID this delete ID belongs to
          for (const [keepId, deleteIds] of keepToDeleteMap) {
            if (deleteIds.includes(m.legislation_id)) {
              const existing = existingCatsByLeg.get(keepId) || new Set();
              if (!existing.has(m.category_id)) {
                newCatMappings.push({ legislation_id: keepId, category_id: m.category_id });
                existing.add(m.category_id);
                existingCatsByLeg.set(keepId, existing);
              }
              break;
            }
          }
        }

        if (newCatMappings.length > 0) {
          await supabase.from("legislation_category_mapping").insert(newCatMappings);
        }

        // 4. BULK fetch org assignments from delete items
        const { data: existingOrgAssigns } = await supabase
          .from("organization_legislation")
          .select("legislation_id, organization_id")
          .in("legislation_id", allKeepIds);

        const existingOrgsByLeg = new Map<string, Set<string>>();
        for (const a of existingOrgAssigns || []) {
          if (!existingOrgsByLeg.has(a.legislation_id)) existingOrgsByLeg.set(a.legislation_id, new Set());
          existingOrgsByLeg.get(a.legislation_id)!.add(a.organization_id);
        }

        const { data: deleteOrgAssigns } = await supabase
          .from("organization_legislation")
          .select("legislation_id, organization_id, notes, applicability_type")
          .in("legislation_id", allDeleteIds);

        const newOrgAssigns: { legislation_id: string; organization_id: string; notes?: string; applicability_type?: string }[] = [];
        for (const a of deleteOrgAssigns || []) {
          for (const [keepId, deleteIds] of keepToDeleteMap) {
            if (deleteIds.includes(a.legislation_id)) {
              const existing = existingOrgsByLeg.get(keepId) || new Set();
              if (!existing.has(a.organization_id)) {
                newOrgAssigns.push({ legislation_id: keepId, organization_id: a.organization_id, notes: a.notes, applicability_type: a.applicability_type });
                existing.add(a.organization_id);
                existingOrgsByLeg.set(keepId, existing);
              }
              break;
            }
          }
        }

        if (newOrgAssigns.length > 0) {
          await supabase.from("organization_legislation").insert(newOrgAssigns);
        }

        // 5. Delete duplicate relations first, then migrate unique ones
        // Relations have unique constraint on (source, target, type) - must delete duplicates before migration
        for (const [keepId, deleteIds] of keepToDeleteMap) {
          if (deleteIds.length === 0) continue;
          
          // 5a. Delete relations from duplicates that would conflict with keepId
          // (same target + type already exists for keepId as source)
          await supabase.from("legislation_relations").delete()
            .in("source_legislation_id", deleteIds);
          await supabase.from("legislation_relations").delete()
            .in("target_legislation_id", deleteIds);
          
          // 5b. Migrate requirements (these don't have unique constraints that would conflict)
          await supabase.from("legal_requirements").update({ legislation_id: keepId }).in("legislation_id", deleteIds);
          
          // 5c. Migrate alerts and reads
          await Promise.all([
            supabase.from("alerts").update({ related_legislation_id: keepId }).in("related_legislation_id", deleteIds),
            supabase.from("user_legislation_reads").delete().in("legislation_id", deleteIds),
          ]);
        }

        // 6. BULK delete from related tables
        await Promise.all([
          supabase.from("legislation_relations_processed").delete().in("legislation_id", allDeleteIds),
          supabase.from("legislation_category_mapping").delete().in("legislation_id", allDeleteIds),
          supabase.from("organization_legislation").delete().in("legislation_id", allDeleteIds),
        ]);

        // 7. BULK delete duplicates
        const { error: deleteError } = await supabase.from("legislation").delete().in("id", allDeleteIds);

        if (deleteError) {
          console.error(`Batch delete error:`, deleteError);
          errors.push(`Batch ${i}: ${deleteError.message}`);
        } else {
          totalMerged += batch.length;
          totalDeleted += allDeleteIds.length;
        }
      } catch (batchError) {
        console.error(`Error processing batch:`, batchError);
        errors.push(`Batch ${i}: ${batchError instanceof Error ? batchError.message : "Unknown error"}`);
      }

      // Update progress
      await supabase.from("sync_logs").update({
        items_processed: Math.min(i + MEGA_BATCH, duplicateGroups.length),
        items_updated: totalDeleted,
      }).eq("id", logId);
    }

    // Final update
    await supabase.from("sync_logs").update({
      status: errors.length > 0 ? "completed_with_errors" : "completed",
      completed_at: new Date().toISOString(),
      items_processed: duplicateGroups.length,
      items_updated: totalDeleted,
      items_added: totalMerged,
      error_message: errors.length > 0 ? `${errors.length} errors: ${errors.slice(0, 5).join("; ")}` : null,
    }).eq("id", logId);

    console.log(`Cleanup completed: ${totalMerged} groups merged, ${totalDeleted} duplicates deleted, ${errors.length} errors`);
  } catch (error) {
    console.error("Cleanup error:", error);
    await supabase.from("sync_logs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : "Unknown error",
    }).eq("id", logId);
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").single();

    if (!roles) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 100;
    const dryRun = body.dryRun || false;

    if (dryRun) {
      const { data: legislation } = await supabase.from("legislation").select("id, number");
      const groups = new Map<string, string[]>();
      for (const item of legislation || []) {
        const normalized = normalizeNumber(item.number);
        if (!groups.has(normalized)) groups.set(normalized, []);
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

      return new Response(JSON.stringify({
        success: true,
        dryRun: true,
        duplicateGroups,
        recordsToDelete,
        totalRecords: legislation?.length || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check for running cleanup
    const { data: runningJobs } = await supabase
      .from("sync_logs")
      .select("id, started_at")
      .eq("sync_type", "duplicate_cleanup")
      .eq("status", "running")
      .limit(1);

    if (runningJobs && runningJobs.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "Já existe uma limpeza em execução",
        runningJobId: runningJobs[0].id,
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create log entry
    const { data: logEntry, error: logError } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: "duplicate_cleanup",
        status: "running",
        created_by: user.id,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (logError) throw logError;

    const bgTask = processCleanupInBackground(supabase, batchSize, logEntry.id);

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(bgTask);
    } else {
      bgTask.catch((e) => console.error("Background cleanup failed:", e));
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Limpeza de duplicados iniciada em segundo plano",
      jobId: logEntry.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
