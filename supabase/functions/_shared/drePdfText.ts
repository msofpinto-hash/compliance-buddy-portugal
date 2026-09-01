import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

/**
 * Downloads the official DRE PDF for a diploma and returns clean text.
 * The DRE detail pages are a JS-only SPA (they always return a 2.3KB shell),
 * so the PDF endpoint is the only reliable free source of the full text.
 */
export async function fetchDrePdfText(dreId: string): Promise<string | null> {
  const endpoints = [
    `https://dre.pt/application/conteudo/${dreId}`,
    `https://dre.pt/application/file/a/${dreId}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(endpoint, {
        headers: {
          "Accept": "application/pdf,*/*",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("pdf")) continue;

      const buffer = new Uint8Array(await res.arrayBuffer());
      if (buffer.length < 1000) continue;

      const pdf = await getDocumentProxy(buffer);
      const { text } = await extractText(pdf, { mergePages: true });
      const cleaned = cleanDreText(typeof text === "string" ? text : text.join("\n"));
      if (cleaned.length > 400) return cleaned;
    } catch (e) {
      console.log("[drePdf] failed", endpoint, e instanceof Error ? e.message : e);
    }
  }

  return null;
}

/**
 * Removes running headers/footers and repairs words and sentences broken
 * across page boundaries or hyphenated line wraps.
 */
export function cleanDreText(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");

  // Drop DR running headers / footers that break articles across pages
  const noise = [
    /^\s*Di[áa]rio da Rep[úu]blica[^\n]*$/gim,
    /^\s*N\.[ºo]\s*\d+\s*$/gim,
    /^\s*P[áa]g\.\s*[\d\-()]+\s*$/gim,
    /^\s*\d{1,2} de [a-zç]+ de \d{4}\s*$/gim,
    /^\s*PARTE [A-Z]\s*$/gim,
  ];
  for (const re of noise) text = text.replace(re, "");

  text = text
    // hyphenated word split across lines/pages
    .replace(/([a-zàáâãéêíóôõúç])-\n\s*([a-zàáâãéêíóôõúç])/g, "$1$2")
    // sentence continuing on the next line (lowercase start) -> join
    .replace(/([^\n.:;!?])\n(?=[a-zàáâãéêíóôõúç(])/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

/**
 * Keeps only the section of a DR issue that belongs to the requested diploma.
 */
export function sliceDiploma(text: string, designation?: string | null): string {
  if (!designation) return text;
  const norm = designation
    .replace(/[.\u00ba\u00b0]/g, "")
    .replace(/\s+/g, "\\s*")
    .replace(/[-–]/g, "[-–]");
  try {
    const re = new RegExp(norm.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === "\\" ? m : "\\" + m)), "i");
    const idx = text.search(re);
    if (idx > 0) return text.slice(idx);
  } catch {
    // ignore malformed regex, fall through
  }
  return text;
}
