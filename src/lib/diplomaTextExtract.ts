import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const MONTHS: Record<string, string> = {
  janeiro: "01",
  fevereiro: "02",
  "março": "03",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

/** Extract plain text from a PDF file (all pages). */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = (content.items as Array<{ str?: string }>)
      .map((it) => it.str ?? "")
      .join(" ");
    parts.push(line);
  }
  return parts.join("\n").replace(/[ \t]{2,}/g, " ").trim();
}

function toIso(day: string, month: string, year: string): string | null {
  const m = MONTHS[month.toLowerCase()] ?? (/^\d{1,2}$/.test(month) ? month.padStart(2, "0") : null);
  if (!m) return null;
  const d = day.padStart(2, "0");
  const y = Number(year);
  if (y < 1900 || y > new Date().getFullYear() + 2) return null;
  const iso = `${y}-${m}-${d}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DetectedDates = {
  publicationDate: string | null;
  effectiveDate: string | null;
  notes: string[];
};

/** Detect publication and effective dates from a legal text. Never invents values. */
export function detectDates(text: string): DetectedDates {
  const notes: string[] = [];
  const head = text.slice(0, 6000);
  let publicationDate: string | null = null;
  let effectiveDate: string | null = null;

  const longDate = /(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/gi;
  const numericDate = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g;

  const firstLong = longDate.exec(head);
  if (firstLong) publicationDate = toIso(firstLong[1], firstLong[2], firstLong[3]);
  if (!publicationDate) {
    const firstNum = numericDate.exec(head);
    if (firstNum) publicationDate = toIso(firstNum[1], firstNum[2], firstNum[3]);
  }
  if (publicationDate) notes.push(`Data de publicação detetada: ${publicationDate}`);

  // Explicit entry into force
  const explicit = text.match(
    /entra(?:m)?\s+em\s+vigor[^.]{0,120}?(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i,
  );
  if (explicit) {
    effectiveDate = toIso(explicit[1], explicit[2], explicit[3]);
    if (effectiveDate) notes.push("Entrada em vigor indicada no texto.");
  }

  if (!effectiveDate && publicationDate) {
    if (/entra(?:m)?\s+em\s+vigor\s+no\s+dia\s+seguinte/i.test(text)) {
      effectiveDate = addDays(publicationDate, 1);
      notes.push("Entra em vigor no dia seguinte à publicação.");
    } else {
      const after = text.match(/entra(?:m)?\s+em\s+vigor[^.]{0,80}?(\d{1,3})\s*dias/i);
      if (after) {
        effectiveDate = addDays(publicationDate, Number(after[1]));
        notes.push(`Entra em vigor ${after[1]} dias após a publicação.`);
      }
    }
  }

  if (!publicationDate) notes.push("Não foi encontrada data de publicação no texto.");
  if (!effectiveDate) notes.push("Não foi encontrada data de entrada em vigor no texto.");

  return { publicationDate, effectiveDate, notes };
}

/** Normalise a diploma number for comparison: "Decreto-Lei n.º 12/2020" -> "12/2020" */
export function normalizeNumber(value: string): string {
  return value
    .toLowerCase()
    .replace(/n\.?\s*[ºo°]\s*/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d/\-a-z()]/g, "");
}

/** Detect the diploma number referenced at the start of a document text. */
export function detectDiplomaNumber(text: string): string | null {
  const head = text.slice(0, 3000);
  const patterns = [
    /(?:Decreto-Lei|Decreto Legislativo Regional|Decreto Regulamentar|Decreto|Lei Constitucional|Lei|Portaria|Despacho(?:\s+Normativo)?|Resolução(?:\s+do\s+Conselho\s+de\s+Ministros)?|Regulamento(?:\s+Delegado|\s+de\s+Execução)?|Diretiva|Decisão|Aviso|Declaração de Retificação|Edital)\s*(?:\(UE\)\s*)?n\.?\s*[ºo°]?\s*([\dA-Z]+[-/][\d/A-Z]+)/i,
    /\(UE\)\s*(\d{4}\/\d+)/i,
  ];
  for (const re of patterns) {
    const m = head.match(re);
    if (m) return m[1];
  }
  return null;
}
