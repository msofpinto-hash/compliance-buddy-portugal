import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RelType = "revogado" | "revogacao_parcial" | "alteracao" | "transposicao" | "regulamentacao";

const TYPE_ALIASES: Record<string, string> = {
  "decreto-lei": "decreto-lei",
  "decreto lei": "decreto-lei",
  "dl": "decreto-lei",
  "decreto legislativo regional": "decreto legislativo regional",
  "decreto regulamentar regional": "decreto regulamentar",
  "decreto regulamentar": "decreto regulamentar",
  "decreto": "decreto",
  "lei": "lei",
  "lei orgânica": "lei",
  "portaria": "portaria",
  "despacho normativo": "despacho",
  "despacho": "despacho",
  "resolução do conselho de ministros": "resolução",
  "resolução da assembleia da república": "resolução",
  "resolução": "resolução",
  "declaração de retificação": "declaração",
  "declaração": "declaração",
  "aviso": "aviso",
  "deliberação": "deliberação",
  "regulamento delegado": "regulamento",
  "regulamento de execução": "regulamento",
  "regulamento": "regulamento",
  "diretiva delegada": "diretiva",
  "diretiva de execução": "diretiva",
  "diretiva": "diretiva",
  "directiva": "diretiva",
  "decisão de execução": "decisão",
  "decisão delegada": "decisão",
  "decisão": "decisão",
  "recomendação": "recomendação",
};

const TYPE_PATTERN =
  "(Decreto[-\\s]?Lei|Decreto Legislativo Regional|Decreto Regulamentar Regional|Decreto Regulamentar|Decreto|Lei Org[âa]nica|Lei|Portaria|Despacho Normativo|Despacho|Resolu[çc][ãa]o do Conselho de Ministros|Resolu[çc][ãa]o da Assembleia da Rep[úu]blica|Resolu[çc][ãa]o|Declara[çc][ãa]o de Retifica[çc][ãa]o|Declara[çc][ãa]o|Aviso|Delibera[çc][ãa]o|Regulamento Delegado|Regulamento de Execu[çc][ãa]o|Regulamento|Diretiva Delegada|Diretiva de Execu[çc][ãa]o|Diretiva|Directiva|Decis[ãa]o de Execu[çc][ãa]o|Decis[ãa]o Delegada|Decis[ãa]o|Recomenda[çc][ãa]o)";

// e.g. "Decreto-Lei n.º 101-D/2020", "Regulamento (CE) n.o 1907/2006", "Diretiva 2010/75/UE"
const REF_REGEX = new RegExp(
  TYPE_PATTERN +
    "\\s*(?:\\((?:UE|CE|CEE|CEEA|Euratom)(?:,\\s*Euratom)?\\)\\s*)?" +
    "(?:n\\.?\\s*[.ºo°]{0,2}\\s*)?" +
    "(\\d{1,4}(?:[-–][A-Z])?/\\d{2,4})(?:/(?:UE|CE|CEE|Euratom))?",
  "gi",
);

function canonicalType(raw: string): string | null {
  const key = raw.toLowerCase().replace(/\s+/g, " ").replace(/–/g, "-").trim();
  return TYPE_ALIASES[key] ?? TYPE_ALIASES[key.replace(/-/g, " ")] ?? null;
}

function normalizeNumberPart(raw: string): string {
  return raw.replace(/–/g, "-").replace(/\s+/g, "").toUpperCase();
}

/** Builds the lookup key for a legislation.number stored in the database. */
function keysForLegislation(number: string): string[] {
  const keys: string[] = [];
  REF_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_REGEX.exec(number)) !== null) {
    const type = canonicalType(m[1]);
    if (!type) continue;
    keys.push(`${type}|${normalizeNumberPart(m[2])}`);
    break; // the first reference in the title is the diploma itself
  }
  return keys;
}

const KEYWORDS: { re: RegExp; type: RelType }[] = [
  { re: /revoga(?:ç[ãa]o)?\s+parcial|revoga\s+parcialmente|revogad[ao]s?\s+parcialmente/i, type: "revogacao_parcial" },
  { re: /revoga(?:m|ndo|d[ao]s?|ç[ãa]o)?\b/i, type: "revogado" },
  { re: /transp(?:õe|oe|ondo|osiç[ãa]o|õem)\b/i, type: "transposicao" },
  { re: /regulament(?:a|ando|ação|a\s+o)\b|assegura\s+a\s+execu[çc][ãa]o|execu[çc][ãa]o\s+na\s+ordem\s+jur[íi]dica/i, type: "regulamentacao" },
  { re: /altera(?:m|ndo|ç[ãa]o|d[ao]s?)?\b|aditad?o?\s+ao|nova\s+redaç[ãa]o/i, type: "alteracao" },
];

function detectType(context: string): RelType | null {
  let best: { type: RelType; idx: number } | null = null;
  for (const { re, type } of KEYWORDS) {
    const m = context.match(re);
    if (!m || m.index === undefined) continue;
    if (!best || m.index > best.idx) best = { type, idx: m.index };
  }
  return best?.type ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const limit: number = Math.min(body.limit ?? 200, 400);
    const reprocess: boolean = body.reprocess !== false;

    // 1) Index every diploma in the database by normalized reference key
    const index = new Map<string, { id: string; origin: string | null; number: string }[]>();
    const all: { id: string; number: string; origin: string | null; summary: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, origin, summary")
        .range(from, from + 999);
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data);
      if (data.length < 1000) break;
    }
    for (const leg of all) {
      for (const key of keysForLegislation(leg.number)) {
        const arr = index.get(key) ?? [];
        arr.push({ id: leg.id, origin: leg.origin, number: leg.number });
        index.set(key, arr);
      }
    }

    // 2) Pick the batch of sources still without relations.
    // In reprocess mode we retry diplomas that were previously marked as
    // "0 relations found", but only once per day so batches keep advancing.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const { data: processedRows } = await supabase
      .from("legislation_relations_processed")
      .select("legislation_id, relations_found, processed_at");
    const skip = new Set(
      (processedRows ?? [])
        .filter((p) =>
          reprocess
            ? (p.relations_found ?? 0) > 0 || new Date(p.processed_at).getTime() > cutoff
            : true
        )
        .map((p) => p.legislation_id),
    );
    const batch = all.filter((l) => !skip.has(l.id)).slice(0, limit);


    // 3) Existing relations (avoid duplicates)
    const existing = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("legislation_relations")
        .select("source_legislation_id, target_legislation_id, relation_type")
        .range(from, from + 999);
      if (!data?.length) break;
      for (const r of data) existing.add(`${r.source_legislation_id}|${r.target_legislation_id}|${r.relation_type}`);
      if (data.length < 1000) break;
    }

    let inserted = 0;
    const processedUpserts: any[] = [];

    for (const leg of batch) {
      // Text sources already in the database: summary + requirement texts
      const { data: reqs } = await supabase
        .from("legal_requirements")
        .select("article, requirement_text")
        .eq("legislation_id", leg.id)
        .limit(400);

      const relevant = (reqs ?? [])
        .filter((r) =>
          /revoga|altera|transp|regulament/i.test(`${r.article ?? ""} ${r.requirement_text ?? ""}`)
        )
        .slice(0, 25)
        .map((r) => `${r.article ?? ""}. ${r.requirement_text ?? ""}`);

      const text = [leg.number, leg.summary ?? "", ...relevant].join("\n").slice(0, 40000);

      const found = new Map<string, RelType>();
      REF_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      let first = true;
      while ((m = REF_REGEX.exec(text)) !== null) {
        if (first && m.index < leg.number.length) { first = false; continue; } // the diploma itself
        first = false;
        const type = canonicalType(m[1]);
        if (!type) continue;
        const key = `${type}|${normalizeNumberPart(m[2])}`;
        const candidates = index.get(key);
        if (!candidates || candidates.length !== 1) continue;
        const target = candidates[0];
        if (target.id === leg.id) continue;

        const context = text.slice(Math.max(0, m.index - 220), m.index);
        let relType = detectType(context);
        if (!relType) continue;

        // PT -> EU can only be transposition or implementing regulation
        if (leg.origin === "PT" && target.origin === "EU" && (relType === "alteracao" || relType === "revogado" || relType === "revogacao_parcial")) {
          relType = type === "diretiva" ? "transposicao" : "regulamentacao";
        }
        found.set(target.id, relType);
      }

      const toInsert = [...found.entries()]
        .filter(([targetId, t]) => !existing.has(`${leg.id}|${targetId}|${t}`))
        .map(([targetId, t]) => ({
          source_legislation_id: leg.id,
          target_legislation_id: targetId,
          relation_type: t,
          notes: "Extraído automaticamente do texto do diploma",
        }));

      if (toInsert.length) {
        const { error } = await supabase.from("legislation_relations").insert(toInsert);
        if (!error) {
          inserted += toInsert.length;
          for (const r of toInsert) existing.add(`${r.source_legislation_id}|${r.target_legislation_id}|${r.relation_type}`);
        } else {
          console.error("insert error", leg.number, error.message);
        }
      }

      processedUpserts.push({
        legislation_id: leg.id,
        relations_found: found.size,
        relations_matched: found.size,
        processed_at: new Date().toISOString(),
      });
    }

    for (let i = 0; i < processedUpserts.length; i += 200) {
      await supabase
        .from("legislation_relations_processed")
        .upsert(processedUpserts.slice(i, i + 200), { onConflict: "legislation_id" });
    }

    return new Response(
      JSON.stringify({ success: true, processed: batch.length, inserted, remaining: all.length - skip.size - batch.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
