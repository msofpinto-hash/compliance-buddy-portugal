import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/adminGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Tables that point at legislation.id through a single column. */
const SIMPLE_REFS: Array<{ table: string; column: string; unique?: string[] }> = [
  { table: "legal_requirements", column: "legislation_id" },
  { table: "legislation_category_mapping", column: "legislation_id", unique: ["category_id"] },
  { table: "organization_legislation", column: "legislation_id", unique: ["organization_id"] },
  { table: "audit_requirements", column: "legislation_id" },
  { table: "alerts", column: "related_legislation_id" },
  { table: "user_legislation_reads", column: "legislation_id", unique: ["user_id"] },
  { table: "evidence_template_legislation", column: "legislation_id", unique: ["template_id"] },
  { table: "legislation_relations_processed", column: "legislation_id" },
  { table: "legislation_processing_failures", column: "legislation_id" },
  { table: "url_validation_results", column: "legislation_id" },
  { table: "ai_usage_log", column: "legislation_id" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireAdmin(req);
  if (guard) return guard;

  try {
    const { keep_id, remove_ids } = (await req.json()) as {
      keep_id?: string;
      remove_ids?: string[];
    };

    if (!keep_id || !Array.isArray(remove_ids) || remove_ids.length === 0) {
      return new Response(JSON.stringify({ error: "keep_id and remove_ids are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const removes = remove_ids.filter((id) => id && id !== keep_id);
    if (removes.length === 0) {
      return new Response(JSON.stringify({ error: "Nothing to remove" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const moved: Record<string, number> = {};

    for (const ref of SIMPLE_REFS) {
      // Rows currently attached to the duplicates
      const { data: rows, error } = await admin
        .from(ref.table)
        .select("*")
        .in(ref.column, removes);
      if (error) {
        console.error(`read ${ref.table}`, error.message);
        continue;
      }
      if (!rows || rows.length === 0) continue;

      // Rows already on the keeper — used to detect collisions on unique keys
      let keeperRows: any[] = [];
      if (ref.unique?.length) {
        const { data: kr } = await admin.from(ref.table).select("*").eq(ref.column, keep_id);
        keeperRows = kr ?? [];
      }

      const keyOf = (r: any) => (ref.unique ?? []).map((c) => String(r[c])).join("|");
      const seen = new Set(keeperRows.map(keyOf));

      const toMove: string[] = [];
      const toDrop: string[] = [];

      for (const r of rows as any[]) {
        if (ref.unique?.length) {
          const k = keyOf(r);
          if (seen.has(k)) {
            toDrop.push(r.id);
            continue;
          }
          seen.add(k);
        }
        toMove.push(r.id);
      }

      if (toDrop.length) {
        await admin.from(ref.table).delete().in("id", toDrop);
      }
      if (toMove.length) {
        const { error: upErr } = await admin
          .from(ref.table)
          .update({ [ref.column]: keep_id })
          .in("id", toMove);
        if (upErr) console.error(`update ${ref.table}`, upErr.message);
        else moved[ref.table] = (moved[ref.table] ?? 0) + toMove.length;
      }
    }

    // Relations: two columns, plus self-relation cleanup
    for (const col of ["source_legislation_id", "target_legislation_id"]) {
      const { data: rels } = await admin
        .from("legislation_relations")
        .select("*")
        .in(col, removes);
      for (const r of (rels ?? []) as any[]) {
        const next = { ...r, [col]: keep_id };
        if (next.source_legislation_id === next.target_legislation_id) {
          await admin.from("legislation_relations").delete().eq("id", r.id);
          continue;
        }
        const { data: existing } = await admin
          .from("legislation_relations")
          .select("id")
          .eq("source_legislation_id", next.source_legislation_id)
          .eq("target_legislation_id", next.target_legislation_id)
          .eq("relation_type", next.relation_type)
          .limit(1);
        if (existing && existing.length > 0) {
          await admin.from("legislation_relations").delete().eq("id", r.id);
        } else {
          await admin.from("legislation_relations").update({ [col]: keep_id }).eq("id", r.id);
          moved["legislation_relations"] = (moved["legislation_relations"] ?? 0) + 1;
        }
      }
    }

    // Finally delete the duplicate legislation rows
    const { error: delErr } = await admin.from("legislation").delete().in("id", removes);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message, moved }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, kept: keep_id, removed: removes, moved }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("merge-duplicate-legislation error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
