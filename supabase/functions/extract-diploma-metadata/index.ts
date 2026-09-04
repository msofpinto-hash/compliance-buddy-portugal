// Extrai automaticamente título, entidade emissora, data, tipo de diploma e
// número CE para os diplomas importados.
//  - Diplomas UE: título oficial em português obtido no EUR-Lex (CELEX).
//  - Diplomas PT: derivação determinística a partir do número/título.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/adminGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function monthIndex(name: string): number | null {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const i = MESES.findIndex((m) => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === n);
  return i >= 0 ? i + 1 : null;
}

function parsePtDate(text: string, fallbackYear?: number): string | null {
  const full = text.match(/(\d{1,2})\s+de\s+([a-zA-ZçÇãéíó]+)\s+de\s+(\d{4})/);
  if (full) {
    const m = monthIndex(full[2]);
    if (m) return `${full[3]}-${String(m).padStart(2, "0")}-${String(Number(full[1])).padStart(2, "0")}`;
  }
  const partial = text.match(/(\d{1,2})\s+de\s+([a-zA-ZçÇãéíó]+)/);
  if (partial && fallbackYear) {
    const m = monthIndex(partial[2]);
    if (m) return `${fallbackYear}-${String(m).padStart(2, "0")}-${String(Number(partial[1])).padStart(2, "0")}`;
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  return null;
}

const PT_TYPES = [
  "Decreto-Lei", "Decreto Regulamentar Regional", "Decreto Regulamentar",
  "Decreto Legislativo Regional", "Decreto Regional", "Decreto do Presidente da República",
  "Decreto", "Lei Orgânica", "Lei Constitucional", "Lei",
  "Resolução do Conselho de Ministros", "Resolução da Assembleia da República", "Resolução",
  "Portaria", "Despacho Normativo", "Despacho Conjunto", "Despacho",
  "Declaração de Retificação", "Declaração de Rectificação", "Declaração",
  "Regulamento", "Aviso", "Deliberação", "Acórdão", "Circular", "Norma", "Recomendação", "Parecer",
];

function ptType(number: string, title: string): string | null {
  const hay = `${number} ${title}`;
  for (const t of PT_TYPES) {
    if (new RegExp(`^\\s*${t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(number)) return t;
  }
  for (const t of PT_TYPES) {
    if (new RegExp(`\\b${t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(hay)) return t;
  }
  return null;
}

function ptEntity(type: string | null, title: string, number: string): string | null {
  const hay = `${number} ${title}`;
  const min = hay.match(/Minist[ée]rios?\s+d[oae]s?\s+[^,.;–-]{3,80}/i);
  if (min) return min[0].replace(/\s+/g, " ").trim();
  const pres = /Presid[êe]ncia do Conselho de Ministros/i.exec(hay);
  if (pres) return "Presidência do Conselho de Ministros";
  switch (type) {
    case "Lei":
    case "Lei Orgânica":
    case "Lei Constitucional":
    case "Resolução da Assembleia da República":
      return "Assembleia da República";
    case "Resolução do Conselho de Ministros":
      return "Presidência do Conselho de Ministros";
    case "Decreto-Lei":
    case "Decreto Regulamentar":
    case "Decreto":
      return "Governo";
    case "Decreto do Presidente da República":
      return "Presidência da República";
    case "Decreto Legislativo Regional":
    case "Decreto Regulamentar Regional":
    case "Decreto Regional":
      return "Região Autónoma";
    default:
      return null;
  }
}

function celexFor(number: string, url: string | null): string | null {
  const n = number.match(/(\d{4})\/(\d{1,4})/);
  if (n) {
    const year = Number(n[1]);
    const seq = n[2].padStart(4, "0");
    let letter: string | null = null;
    if (/regulament/i.test(number)) letter = "R";
    else if (/diretiva|directiva/i.test(number)) letter = "L";
    else if (/decis/i.test(number)) letter = "D";
    if (letter && year > 1950 && year < 2100) return `3${year}${letter}${seq}`;
  }
  const m = (url ?? "").match(/CELEX:(\d{5}[A-Z]\d{4})/);
  return m ? m[1] : null;
}

async function fetchEurLex(celex: string) {
  const url = `https://eur-lex.europa.eu/legal-content/PT/ALL/?uri=CELEX:${celex}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-PT,pt;q=0.9" },
      signal: ctrl.signal,
    });
    const html = await res.text();
    const raw = html.match(/id="originalTitle"[^>]*>([\s\S]*?)<\/p>/);
    if (!raw) return null;
    const title = raw[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!title) return null;
    const date = parsePtDate(title);
    const entity = /\bda Comiss[ãa]o\b/.test(title)
      ? "Comissão Europeia"
      : /Parlamento Europeu e do Conselho/.test(title)
      ? "Parlamento Europeu e Conselho da União Europeia"
      : /\bdo Conselho\b/.test(title)
      ? "Conselho da União Europeia"
      : null;
    const typeMatch = title.match(
      /^(Regulamento de Execução|Regulamento Delegado|Regulamento|Diretiva|Directiva|Decisão de Execução|Decisão Delegada|Decisão|Recomendação|Parecer)/,
    );
    const ce = title.match(/\(?(?:UE|CE|CEE|Euratom)\)?\s*(?:n\.?º?\s*)?(\d{4}\/\d{1,4})/);
    return {
      title,
      publication_date: date,
      entity,
      document_type: typeMatch ? typeMatch[1].replace("Directiva", "Diretiva") : null,
      ce_number: ce ? ce[1] : null,
      document_url: url,
    };
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (guard) return guard;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const scope: string = body.scope ?? "all"; // 'eu' | 'pt' | 'all'
  const limit: number = Math.min(Number(body.limit ?? 400), 600);

  const { data: rows, error } = await supabase
    .from("legislation")
    .select("id, number, title, origin, entity, publication_date, document_type, ce_number, document_url")
    .limit(2000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isEu = (r: { origin: string | null }) => r.origin === "EU" || r.origin === "eurlex";
  const needs = (r: Record<string, unknown>) =>
    !r.entity || !r.publication_date || !r.document_type ||
    (isEu(r as { origin: string | null }) && !r.ce_number);

  const targets = (rows ?? [])
    .filter((r) => (scope === "eu" ? isEu(r) : scope === "pt" ? !isEu(r) : true))
    .filter(needs)
    .slice(0, limit);

  const run = async () => {
    let euOk = 0, ptOk = 0, failed = 0;
    // UE — EUR-Lex, em lotes com concorrência limitada
    const euRows = targets.filter(isEu);
    for (let i = 0; i < euRows.length; i += 5) {
      const chunk = euRows.slice(i, i + 5);
      await Promise.all(chunk.map(async (r) => {
        const celex = celexFor(r.number ?? "", r.document_url);
        if (!celex) { failed++; return; }
        const meta = await fetchEurLex(celex);
        if (!meta) { failed++; return; }
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (meta.title) patch.title = meta.title;
        if (meta.publication_date) patch.publication_date = meta.publication_date;
        if (meta.entity) patch.entity = meta.entity;
        if (meta.document_type) patch.document_type = meta.document_type;
        if (meta.ce_number) patch.ce_number = meta.ce_number;
        if (!r.document_url) patch.document_url = meta.document_url;
        const { error: upErr } = await supabase.from("legislation").update(patch).eq("id", r.id);
        if (upErr) failed++; else euOk++;
      }));
    }
    // PT — derivação determinística
    for (const r of targets.filter((x) => !isEu(x))) {
      const type = r.document_type ?? ptType(r.number ?? "", r.title ?? "");
      const yearMatch = `${r.number ?? ""} ${r.title ?? ""}`.match(/\b(19|20)\d{2}\b/);
      const date = r.publication_date ??
        parsePtDate(`${r.number ?? ""} ${r.title ?? ""}`, yearMatch ? Number(yearMatch[0]) : undefined);
      const entity = r.entity || ptEntity(type, r.title ?? "", r.number ?? "");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (type && !r.document_type) patch.document_type = type;
      if (date && !r.publication_date) patch.publication_date = date;
      if (entity && !r.entity) patch.entity = entity;
      if (Object.keys(patch).length === 1) continue;
      const { error: upErr } = await supabase.from("legislation").update(patch).eq("id", r.id);
      if (upErr) failed++; else ptOk++;
    }
    console.log(`metadata extraction done: eu=${euOk} pt=${ptOk} failed=${failed}`);
  };

  // @ts-ignore EdgeRuntime global
  EdgeRuntime.waitUntil(run());

  return new Response(
    JSON.stringify({ started: true, candidates: targets.length, eu: targets.filter(isEu).length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
