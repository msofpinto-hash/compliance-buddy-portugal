import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/adminGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const ALLOWED_DOMAINS = ["diariodarepublica.pt", "eur-lex.europa.eu"];

function isAllowedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
}

// ---------- Scraping (Firecrawl principal, fallbacks seguros) ----------

async function firecrawlScrape(url: string): Promise<{ markdown: string; status: number } | null> {
  const keys = [
    Deno.env.get("FIRECRAWL_API_KEY"),
    Deno.env.get("FIRECRAWL_API_KEY_2"),
    Deno.env.get("FIRECRAWL_API_KEY_3"),
  ].filter((k): k is string => !!k);

  for (const key of keys) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402 || res.status === 429) continue;
      const md = data?.data?.markdown || data?.markdown || "";
      if (res.ok && md) return { markdown: md, status: res.status };
    } catch (e) {
      console.error("[import-official-articles] firecrawl error", e);
    }
  }
  return null;
}

async function readerScrape(url: string): Promise<{ markdown: string; status: number } | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "markdown",
        "User-Agent": "Mozilla/5.0 (compatible; IDComplianceLex/1.0)",
      },
    });
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw || raw.length < 200) return null;
    const idx = raw.indexOf("Markdown Content:");
    const markdown = idx >= 0 ? raw.slice(idx + "Markdown Content:".length).trim() : raw;
    return { markdown, status: res.status };
  } catch {
    return null;
  }
}

async function nativeScrape(url: string): Promise<{ markdown: string; status: number } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text.length < 200) return null;
    return { markdown: text, status: res.status };
  } catch {
    return null;
  }
}

// ---------- Normalização e segmentação do articulado ----------

function normalizeContent(raw: string): string {
  return decodeEntities(raw)
    .replace(/\r\n?/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

type Segment = {
  article_number: string | null;
  article_title: string | null;
  paragraph_number: string | null;
  point_letter: string | null;
  official_text: string;
  article_type: string;
  display_order: number;
};

const ARTICLE_RE =
  /^(?:Artigo|Article|Artículo)\s+(\d+\.?[ºo°]?(?:-[A-Za-z]+)?)\s*\.?\s*(.*)$/i;
const ANNEX_RE = /^(ANEXO\s*[IVXLC\d]*[-A-Za-z]*|ANNEX\s*[IVXLC\d]*)\s*(.*)$/i;
const SECTION_RE =
  /^((?:CAPÍTULO|CAPITULO|SECÇÃO|SECCAO|SUBSECÇÃO|TÍTULO|TITULO|PARTE)\s+[IVXLC\d]+[-A-Za-z]*)\s*(.*)$/i;
const FINAL_RE =
  /^(Disposições\s+(?:finais|transitórias|transitorias)(?:\s+e\s+\w+)?)\s*$/i;
const PARAGRAPH_RE = /^(\d+)\s*[-–—.]\s+(.+)$/;
const POINT_RE = /^([a-zA-Z])\)\s*(.+)$/;

function segmentArticles(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let order = 0;

  let current: Segment | null = null;
  let currentArticle: string | null = null;
  let currentType = "PREAMBULO";

  const push = (s: Segment | null) => {
    if (s && s.official_text.trim().length > 0) segments.push(s);
  };

  const start = (
    article_number: string | null,
    article_title: string | null,
    paragraph_number: string | null,
    point_letter: string | null,
    firstText: string,
    article_type: string,
  ) => {
    push(current);
    current = {
      article_number,
      article_title,
      paragraph_number,
      point_letter,
      official_text: firstText,
      article_type,
      display_order: ++order,
    };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      if (current) current.official_text += "\n";
      continue;
    }

    const art = line.match(ARTICLE_RE);
    if (art) {
      currentArticle = art[1].replace(/\.?[ºo°]$/, ".º");
      currentType = "ARTIGO";
      // O título pode estar na mesma linha ou na linha seguinte
      let title = art[2]?.trim() || "";
      if (!title) {
        const next = lines[i + 1]?.trim() || "";
        if (
          next &&
          !ARTICLE_RE.test(next) &&
          !PARAGRAPH_RE.test(next) &&
          !POINT_RE.test(next) &&
          next.length <= 160
        ) {
          title = next;
          i++;
        }
      }
      start(currentArticle, title || null, null, null, line, "ARTIGO");
      continue;
    }

    const annex = line.match(ANNEX_RE);
    if (annex) {
      currentArticle = null;
      currentType = "ANEXO";
      start(null, annex[1].trim(), null, null, line, "ANEXO");
      continue;
    }

    const sec = line.match(SECTION_RE);
    if (sec) {
      currentType = "SECCAO";
      start(currentArticle, sec[1].trim(), null, null, line, "SECCAO");
      continue;
    }

    if (FINAL_RE.test(line)) {
      currentType = "DISPOSICAO";
      start(currentArticle, line.trim(), null, null, line, "DISPOSICAO");
      continue;
    }

    const par = line.match(PARAGRAPH_RE);
    if (par && currentType === "ARTIGO") {
      start(currentArticle, current?.article_title ?? null, par[1], null, line, "NUMERO");
      continue;
    }

    const point = line.match(POINT_RE);
    if (point && (currentType === "ARTIGO" || currentType === "NUMERO")) {
      start(
        currentArticle,
        current?.article_title ?? null,
        current?.paragraph_number ?? null,
        point[1].toLowerCase(),
        line,
        "ALINEA",
      );
      continue;
    }

    if (current) {
      current.official_text += "\n" + line;
    } else {
      start(null, null, null, null, line, "PREAMBULO");
    }
  }
  push(current);

  return segments
    .map((s) => ({ ...s, official_text: s.official_text.trim() }))
    .filter((s) => s.official_text.length > 0);
}

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireAdmin(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => ({}));
    const legislationId: string | undefined = body?.legislationId;
    const dryRun: boolean = body?.dryRun !== false; // default seguro

    if (!legislationId || !/^[0-9a-f-]{36}$/i.test(legislationId)) {
      return json({ success: false, error: "legislationId (UUID) é obrigatório" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: source, error: srcError } = await supabase
      .from("legislation_official_sources")
      .select("id, legislation_id, source_url, source_type, source_system, version_date, is_current")
      .eq("legislation_id", legislationId)
      .eq("source_type", "CONSOLIDATED")
      .eq("is_current", true)
      .maybeSingle();

    if (srcError) return json({ success: false, error: srcError.message }, 500);
    if (!source) {
      return json(
        {
          success: false,
          error_code: "no_consolidated_source",
          error: "Não existe fonte consolidada oficial ativa para este diploma.",
        },
        200,
      );
    }

    if (!isAllowedUrl(source.source_url)) {
      return json(
        {
          success: false,
          error_code: "source_not_allowed",
          error: "A fonte não é oficial (apenas diariodarepublica.pt ou eur-lex.europa.eu).",
          source_url: source.source_url,
        },
        403,
      );
    }

    const scraped =
      (await firecrawlScrape(source.source_url)) ||
      (await readerScrape(source.source_url)) ||
      (await nativeScrape(source.source_url));

    if (!scraped) {
      return json(
        {
          success: false,
          error_code: "scrape_failed",
          error: "Não foi possível obter o texto oficial consolidado.",
          source_url: source.source_url,
        },
        200,
      );
    }

    const contentNormalized = normalizeContent(scraped.markdown);
    const segments = segmentArticles(contentNormalized);
    const fetchedAt = new Date().toISOString();

    const summary = {
      total_segments: segments.length,
      articles: segments.filter((s) => s.article_type === "ARTIGO").length,
      numbers: segments.filter((s) => s.article_type === "NUMERO").length,
      points: segments.filter((s) => s.article_type === "ALINEA").length,
      annexes: segments.filter((s) => s.article_type === "ANEXO").length,
      sections: segments.filter((s) => s.article_type === "SECCAO").length,
      dispositions: segments.filter((s) => s.article_type === "DISPOSICAO").length,
      distinct_article_numbers: [
        ...new Set(segments.map((s) => s.article_number).filter(Boolean)),
      ].length,
    };

    if (dryRun) {
      return json({
        success: true,
        dry_run: true,
        persisted: false,
        legislation_id: legislationId,
        official_source_id: source.id,
        source_url: source.source_url,
        http_status: scraped.status,
        content_length: contentNormalized.length,
        summary,
        preview: segments.slice(0, 40),
      });
    }

    const { error: updError } = await supabase
      .from("legislation_official_sources")
      .update({
        content: scraped.markdown,
        content_normalized: contentNormalized,
        content_length: contentNormalized.length,
        http_status: scraped.status,
        fetched_at: fetchedAt,
      })
      .eq("id", source.id);

    if (updError) return json({ success: false, error: updError.message }, 500);

    const rows = segments.map((s) => ({
      legislation_id: legislationId,
      official_source_id: source.id,
      article_number: s.article_number,
      article_title: s.article_title,
      paragraph_number: s.paragraph_number,
      point_letter: s.point_letter,
      official_text: s.official_text,
      source_url: source.source_url,
      source_type: "CONSOLIDATED",
      consolidated_date: source.version_date ?? null,
      display_order: s.display_order,
      article_type: s.article_type,
      is_current: true,
    }));

    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: insError } = await supabase.from("legislation_articles").insert(chunk);
      if (insError) {
        return json(
          { success: false, error: insError.message, inserted_before_failure: inserted },
          500,
        );
      }
      inserted += chunk.length;
    }

    return json({
      success: true,
      dry_run: false,
      persisted: true,
      legislation_id: legislationId,
      official_source_id: source.id,
      source_url: source.source_url,
      http_status: scraped.status,
      content_length: contentNormalized.length,
      inserted_articles: inserted,
      deleted_articles: 0,
      legal_requirements_touched: false,
      summary,
    });
  } catch (error) {
    console.error("[import-official-articles] error", error);
    return json(
      { success: false, error: error instanceof Error ? error.message : "Erro inesperado" },
      500,
    );
  }
});
