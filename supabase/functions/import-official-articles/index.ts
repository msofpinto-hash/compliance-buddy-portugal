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

type ScrapeResult = { markdown: string; status: number; method: string };

async function firecrawlScrape(url: string): Promise<ScrapeResult | null> {
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
      if (res.ok && md) return { markdown: md, status: res.status, method: "firecrawl" };
    } catch (e) {
      console.error("[import-official-articles] firecrawl error", e);
    }
  }
  return null;
}

async function readerScrape(url: string): Promise<ScrapeResult | null> {
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
    return { markdown, status: res.status, method: "jina_reader" };
  } catch {
    return null;
  }
}

async function nativeScrape(url: string): Promise<ScrapeResult | null> {
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
    return { markdown: text, status: res.status, method: "native_fetch" };
  } catch {
    return null;
  }
}

// ---------- Normalização ----------

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

// ---------- Extração do corpo consolidado (limpeza de ruído DRE) ----------

const ARTICLE_RE =
  /^(?:Artigo|Article|Artículo)\s+(\d+\.?[ºo°]?(?:-[A-Za-z]+)?)\s*\.?\s*(.*)$/i;
const ANNEX_RE = /^(ANEXO\s*[IVXLC\d]*[-A-Za-z]*|ANNEX\s*[IVXLC\d]*)\s*(.*)$/i;
const SECTION_RE =
  /^((?:CAPÍTULO|CAPITULO|SECÇÃO|SECCAO|SUBSECÇÃO|TÍTULO|TITULO|PARTE)\s+[IVXLC\d]+[-A-Za-z]*)\s*(.*)$/i;
const FINAL_RE =
  /^(Disposições\s+(?:finais|transitórias|transitorias)(?:\s+e\s+\w+)?)\s*$/i;

// Nota editorial do DRE: "Artigo 33.º, Lei n.º 17/2014 - Diário da República n.º 71/2014..."
const EDITORIAL_NOTE_RE =
  /^(?:Artigo|Art\.?)\s+\d+\.?[ºo°]?(?:-[A-Za-z]+)?\s*,?\s*(?:\(?(?:Lei|Decreto-Lei|Decreto|Portaria|Despacho|Declaração|Regulamento|Diretiva|Resolução|Lei Orgânica|Lei Constitucional)\b)/i;
const EDITORIAL_DRE_RE = /Diário da República n\.[ºo]\s*\d+\/\d{4}/i;
const EDITORIAL_MARKER_RE =
  /^(?:[-–—>\[\(]\s*)?(?:Alterad[oa]|Revogad[oa]|Derrogad[oa]|Aditad[oa]|Retificad[oa]|Rectificad[oa]|Redação dada|Redacção dada|Na redação d[ae]|Com efeitos a partir|Republicad[oa]|Suspenso|Anulad[oa]|Declarad[oa])\b/i;

// Linhas de navegação/UI do site
const UI_NOISE_RE =
  /^(Ir para o conteúdo principal|Ir para|Voltar|Fechar|Fechar Alterações|Ver todos os detalhes|Ver detalhes das alterações|Enviar por email|Copiar ligação|Índice|Filtrar|Mostrar revogado|Ato Original|Versão Consolidada|Análise Jurídica|Informações gerais|Modificações|Retificações|Outros Tipos|Parlamento|Decisões Judiciais|Pode sugerir melhorias|Relacionados|Versão à data de|Início|Legislação|Por código|Por data|Por tema|Lexionário|Lia|Sobre o DR|Ajuda|O meu Diário|Aberto|Jornal Oficial da República Portuguesa)\b/i;

function isUiNoise(line: string): boolean {
  if (line.length <= 2) return true;
  if (/^[-–—*•=\s]+$/.test(line)) return true;
  if (/^-?\s*\[[ xX]?\]/.test(line)) return true; // checkboxes
  if (/^(Facebook|LinkedIn|Pinterest|Reddit|Telegram|X|Whatsapp)\b/i.test(line)) return true;
  if (/^Use a tecla/i.test(line)) return true;
  return UI_NOISE_RE.test(line);
}

function isEditorialNote(line: string): boolean {
  if (EDITORIAL_NOTE_RE.test(line)) return true;
  if (EDITORIAL_DRE_RE.test(line) && /^(?:Artigo|Art\.?)\s/i.test(line)) return true;
  if (EDITORIAL_MARKER_RE.test(line)) return true;
  return false;
}

/**
 * Extrai o corpo consolidado do diploma:
 * - corta tudo antes do marcador "TEXTO" da página DRE (ou do cabeçalho do diploma);
 * - remove linhas de navegação/UI e notas editoriais de alteração;
 * - corta rodapé de navegação final, se existir.
 */
function extractConsolidatedBody(
  normalized: string,
): { body: string; warnings: string[] } {
  const warnings: string[] = [];
  const lines = normalized.split("\n");

  // 1) Encontrar início do TEXTO consolidado
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^TEXTO\s*$/i.test(lines[i])) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) {
    // fallback: primeira linha que pareça o cabeçalho do diploma ou Artigo 1.º
    for (let i = 0; i < lines.length; i++) {
      if (
        ARTICLE_RE.test(lines[i]) && !isEditorialNote(lines[i])
      ) {
        startIdx = Math.max(0, i - 30); // inclui eventual preâmbulo próximo
        break;
      }
    }
    if (startIdx === -1) {
      startIdx = 0;
      warnings.push("text_marker_not_found: marcador 'TEXTO' não encontrado; conteúdo usado na íntegra após limpeza de ruído.");
    } else {
      warnings.push("text_marker_not_found: marcador 'TEXTO' não encontrado; usado o primeiro artigo como referência.");
    }
  }

  let bodyLines = lines.slice(startIdx);

  // 2) Cortar rodapé: última ocorrência de ruído forte após o fim do articulado
  for (let i = bodyLines.length - 1; i >= 0; i--) {
    const l = bodyLines[i];
    if (/^(Documento (relacionado|anexo)|Versão (à data|de impressão)|Imprimir|Descarregar|Ir para o topo)/i.test(l)) {
      bodyLines = bodyLines.slice(0, i);
    } else if (l && !isUiNoise(l)) {
      break;
    }
  }

  // 3) Remover ruído de UI e notas editoriais
  const cleaned: string[] = [];
  let removedEditorial = 0;
  let removedUi = 0;
  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line) {
      // preservar uma única quebra de parágrafo
      if (cleaned.length && cleaned[cleaned.length - 1] !== "") cleaned.push("");
      continue;
    }
    if (isEditorialNote(line)) {
      removedEditorial++;
      continue;
    }
    if (isUiNoise(line)) {
      removedUi++;
      continue;
    }
    cleaned.push(line);
  }
  if (removedEditorial > 0) {
    warnings.push(`editorial_notes_removed: ${removedEditorial} nota(s) editorial(ais) de alteração do DRE ignorada(s).`);
  }
  if (removedUi > 0) {
    warnings.push(`ui_noise_removed: ${removedUi} linha(s) de navegação/interface ignorada(s).`);
  }

  return { body: cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim(), warnings };
}

// ---------- Segmentação: 1 registo = 1 artigo completo ----------

type Segment = {
  article_number: string | null;
  article_title: string | null;
  paragraph_number: string | null;
  point_letter: string | null;
  official_text: string;
  article_type: string;
  display_order: number;
};

function segmentArticles(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let order = 0;

  let current: Segment | null = null;

  const push = (s: Segment | null) => {
    if (s && s.official_text.trim().length > 0) segments.push(s);
  };

  const start = (
    article_number: string | null,
    article_title: string | null,
    firstText: string,
    article_type: string,
  ) => {
    push(current);
    current = {
      article_number,
      article_title,
      paragraph_number: null,
      point_letter: null,
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
      const num = art[1].replace(/\.?[ºo°]$/, ".º");
      // O título pode estar na mesma linha ou nas linhas seguintes,
      // tolerando uma ou mais linhas em branco (ex.: DRE versão consolidada).
      let title = art[2]?.trim() || "";
      let bodyStart = line;
      if (!title) {
        let lookahead = i + 1;
        while (lookahead < lines.length) {
          const candidate = lines[lookahead]?.trim() || "";
          if (!candidate) {
            lookahead++;
            continue;
          }
          if (
            ARTICLE_RE.test(candidate) || /^\d+\s*[-–—.]\s+/.test(candidate) ||
            /^[a-zA-Z]\)\s*/.test(candidate) || SECTION_RE.test(candidate) ||
            ANNEX_RE.test(candidate) || FINAL_RE.test(candidate) ||
            candidate.length > 160
          ) {
            break;
          }
          title = candidate;
          i = lookahead;
          bodyStart = line + "\n" + candidate;
          break;
        }
      }
      start(num, title || null, bodyStart, "ARTIGO");
      continue;
    }

    const annex = line.match(ANNEX_RE);
    if (annex) {
      start(null, annex[1].trim(), line, "ANEXO");
      continue;
    }

    const sec = line.match(SECTION_RE);
    if (sec) {
      start(null, sec[1].trim(), line, "SECCAO");
      continue;
    }

    if (FINAL_RE.test(line)) {
      start(null, line.trim(), line, "DISPOSICAO");
      continue;
    }

    // Tudo o resto (números, alíneas, subalíneas, texto corrido) fica
    // dentro do segmento atual — unidade = artigo completo.
    if (current) {
      current.official_text += "\n" + line;
    } else {
      start(null, null, line, "PREAMBULO");
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
    const { body: consolidatedBody, warnings } = extractConsolidatedBody(contentNormalized);
    const segments = segmentArticles(consolidatedBody);
    const fetchedAt = new Date().toISOString();

    // Métricas e validação de duplicados (só artigos reais do corpo)
    const articles = segments.filter((s) => s.article_type === "ARTIGO");
    const articleNumbers = articles
      .map((s) => s.article_number)
      .filter((n): n is string => !!n);
    const counts = new Map<string, number>();
    for (const n of articleNumbers) counts.set(n, (counts.get(n) ?? 0) + 1);
    const duplicateArticleNumbers = [...counts.entries()]
      .filter(([, c]) => c > 1)
      .map(([n]) => n);

    const totalSections = segments.filter((s) => s.article_type === "SECCAO").length;
    const totalAnnexes = segments.filter((s) => s.article_type === "ANEXO").length;

    if (duplicateArticleNumbers.length > 0) {
      warnings.push(
        `duplicate_article_numbers: ${duplicateArticleNumbers.join(", ")}`,
      );
    }

    const summary = {
      total_segments: segments.length,
      articles: articles.length,
      annexes: totalAnnexes,
      sections: totalSections,
      dispositions: segments.filter((s) => s.article_type === "DISPOSICAO").length,
      distinct_article_numbers: new Set(articleNumbers).size,
    };

    if (dryRun) {
      const textStart = (t: string | null | undefined, n = 400) =>
        (t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
      const annexSegments = segments.filter((s) => s.article_type === "ANEXO");
      const sectionSegments = segments.filter((s) => s.article_type === "SECCAO");
      const dispositionSegments = segments.filter(
        (s) => s.article_type === "DISPOSICAO",
      );
      return json({
        success: true,
        dry_run: true,
        persisted: false,
        legislation_id: legislationId,
        legislationId,
        official_source_id: source.id,
        source_url: source.source_url,
        sourceUrl: source.source_url,
        scrapeMethod: scraped.method,
        http_status: scraped.status,
        content_length: contentNormalized.length,
        textLength: consolidatedBody.length,
        totalArticles: articles.length,
        distinctArticleNumbers: new Set(articleNumbers).size,
        duplicateArticleNumbers,
        totalSections,
        totalAnnexes,
        warnings,
        summary,
        preview: articles.slice(0, 20).map((s) => ({
          article_number: s.article_number,
          article_title: s.article_title,
          paragraph_number: null,
          point_letter: null,
          official_text: s.official_text,
          article_type: s.article_type,
          display_order: s.display_order,
        })),
        articleNumbers,
        lastArticlesPreview: articles.slice(-10).map((s) => ({
          article_number: s.article_number,
          article_title: s.article_title,
          official_text_start: textStart(s.official_text),
        })),
        annexes: annexSegments.map((s) => ({
          article_number: s.article_number,
          article_title: s.article_title,
          official_text_start: textStart(s.official_text),
        })),
        sections: sectionSegments.map((s) => ({
          article_number: s.article_number,
          article_title: s.article_title,
          article_type: s.article_type,
        })),
        dispositions: dispositionSegments.map((s) => ({
          article_number: s.article_number,
          article_title: s.article_title,
          article_type: s.article_type,
          official_text_start: textStart(s.official_text),
        })),
      });
    }

    // Regra 12: duplicados inesperados bloqueiam a persistência
    if (duplicateArticleNumbers.length > 0) {
      return json(
        {
          success: false,
          error_code: "validation_error",
          error: "Foram detetados números de artigo duplicados na versão consolidada; a persistência foi bloqueada.",
          duplicateArticleNumbers,
          warnings,
        },
        200,
      );
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
      scrapeMethod: scraped.method,
      http_status: scraped.status,
      content_length: contentNormalized.length,
      inserted_articles: inserted,
      deleted_articles: 0,
      legal_requirements_touched: false,
      warnings,
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
