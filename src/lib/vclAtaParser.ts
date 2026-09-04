import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
// @ts-ignore - worker asset URL
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";
import { VclReport, VclAction, VclDiploma } from "@/lib/vclReport";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

/** Extrai o texto completo de uma ata em PDF (mantendo as quebras de linha). */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = "";
    const lines: string[] = [];
    for (const item of content.items as any[]) {
      const y = Math.round(item.transform?.[5] ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = "";
      }
      line += item.str + (item.hasEOL ? " " : "");
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

const clean = (s: string) =>
  s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

type SectionKey =
  | "participants"
  | "meeting_type"
  | "description"
  | "conclusions"
  | "actions"
  | "special_notes"
  | "next_meeting";

const HEADINGS: { key: SectionKey; re: RegExp }[] = [
  {
    key: "participants",
    re: /^(participantes|presen[çc]as|intervenientes|interlocutores)\b/i,
  },
  { key: "meeting_type", re: /^(tipo de reuni[ãa]o|modalidade)\b/i 
  },
  {
    key: "description",
    re: /^(descri[çc][ãa]o( da reuni[ãa]o)?|objetivo[s]?|[âa]mbito|metodologia|enquadramento)\b/i,
  },
  {
    key: "conclusions",
    re: /^(conclus[õo]es|resultados|s[íi]ntese|considera[çc][õo]es finais)\b/i,
  },
  {
    key: "actions",
    re: /^(a[çc][õo]es( a desenvolver)?|plano de a[çc][õa]o|a[çc][õo]es a implementar|n[ãa]o conformidades)\b/i,
  },
  {
    key: "special_notes",
    re: /^(notas( especiais| adicionais)?|observa[çc][õo]es|outros assuntos)\b/i,
  },
  {
    key: "next_meeting",
    re: /^(pr[óo]xima reuni[ãa]o|pr[óo]xima vcl|agendamento)\b/i,
  },
];

function splitSections(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: SectionKey | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (current) {
      const value = clean(buffer.join("\n"));
      out[current] = out[current] ? `${out[current]}\n${value}` : value;
    }
    buffer = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      buffer.push("");
      continue;
    }
    const bare = line.replace(/^\d+[.)]\s*/, "");
    const match = HEADINGS.find((h) => h.re.test(bare));
    if (match) {
      flush();
      current = match.key;
      const rest = bare.replace(/^[^:]{0,60}:\s*/, "");
      if (rest && rest !== bare) buffer.push(rest);
      continue;
    }
    buffer.push(line);
  }
  flush();
  return out;
}

/** Nomes de participantes: linhas curtas com nome próprio, opcional " - função". */
function parseParticipants(block: string): string {
  if (!block) return "";
  return block
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter((l) => l.length > 2 && l.length < 120)
    .join("\n");
}

const DEADLINE_RE =
  /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|imediat\w*|em curso|permanente)/i;

function parseActions(block: string): VclAction[] {
  if (!block) return [];
  const actions: VclAction[] = [];
  for (const raw of block.split("\n")) {
    const line = raw.replace(/^[-•*]\s*/, "").trim();
    if (line.length < 8) continue;
    if (/^(a[çc][õo]es|respons[áa]vel|prazo)\b/i.test(line)) continue;
    // formatos "descrição | responsável | prazo" ou "descrição – responsável – prazo"
    const parts = line.split(/\s*[|;]\s*|\s+[–—]\s+/).map((p) => p.trim());
    let description = parts[0];
    let responsible = "";
    let deadline = "";
    if (parts.length >= 3) {
      responsible = parts[1];
      deadline = parts[2];
    } else if (parts.length === 2) {
      if (DEADLINE_RE.test(parts[1])) deadline = parts[1];
      else responsible = parts[1];
    }
    const inline = description.match(
      /\((?:prazo|at[ée])\s*:?\s*([^)]+)\)\s*$/i,
    );
    if (inline && !deadline) {
      deadline = inline[1].trim();
      description = description.replace(inline[0], "").trim();
    }
    actions.push({
      description,
      responsible,
      deadline,
      legislation_id: null,
      legislation_label: null,
    });
  }
  return actions;
}

/** Números de diplomas presentes no texto (DL, Lei, Portaria, Regulamento UE, ...). */
export function extractDiplomaNumbers(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\b\d{1,4}\s*\/\s*\d{2,4}(?:\/[A-Z]{2,3})?\b/g,
    /\b\(?(?:UE|CE)\)?\s*\d{4}\s*\/\s*\d{1,4}\b/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      found.add(m[0].replace(/\s+/g, ""));
    }
  }
  return [...found];
}

const normalizeNumber = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.º°]/g, "")
    .replace(/[()]/g, "");

/** Cruza os números encontrados na ata com os diplomas disponíveis. */
export function matchDiplomas(text: string, pool: VclDiploma[]): VclDiploma[] {
  const numbers = extractDiplomaNumbers(text).map(normalizeNumber);
  if (numbers.length === 0) return [];
  return pool.filter((d) => {
    const n = normalizeNumber(d.number);
    if (!n) return false;
    return numbers.some((x) => n.includes(x) || x.includes(n));
  });
}

export type AtaParseResult = {
  patch: Partial<VclReport>;
  text: string;
  matchedDiplomas: VclDiploma[];
};

/**
 * Lê uma ata em PDF e devolve os campos do relatório VCL preenchidos
 * automaticamente (participantes, tipo de reunião, descrição, conclusões,
 * ações, notas, próxima reunião e diplomas referidos).
 */
export async function parseAtaPdf(
  file: File,
  pool: VclDiploma[] = [],
): Promise<AtaParseResult> {
  return parseAtaText(await extractPdfText(file), pool);
}

/** Igual a parseAtaPdf, mas a partir do texto já extraído (testável). */
export function parseAtaText(
  rawText: string,
  pool: VclDiploma[] = [],
): AtaParseResult {
  const text = clean(rawText);
  const sections = splitSections(text);
  const patch: Partial<VclReport> = {};

  const inlineType = text.match(/tipo de reuni[ãa]o\s*:\s*([^\n]+)/i);
  const participants = parseParticipants(
    (sections.participants || "").replace(/tipo de reuni[ãa]o\s*:\s*[^\n]*/gi, ""),
  );
  if (participants) patch.participants = participants;

  const typeSource = sections.meeting_type || inlineType?.[1] || "";
  if (typeSource) {
    const t = typeSource.toLowerCase();
    patch.meeting_type = /presenc/.test(t)
      ? "Presencial"
      : /mista|h[íi]brid/.test(t)
        ? "Mista"
        : "Remota";
  } else if (/reuni[ãa]o\s+(remota|presencial)/i.test(text)) {
    patch.meeting_type = /presencial/i.test(text) ? "Presencial" : "Remota";
  }

  if (sections.description) patch.description = sections.description;
  if (sections.conclusions) patch.conclusions = sections.conclusions;
  if (sections.special_notes) {
    const notes = sections.special_notes
      .split("\n")
      .filter(
        (l) =>
          !/^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*$/.test(l) &&
          !/^\s*\d{1,2}\s*[hH:]\s*\d{2}\s*[–-]?\s*(\d{1,2}\s*[hH:]\s*\d{2})?\s*$/.test(l),
      )
      .join("\n")
      .trim();
    if (notes) patch.special_notes = notes;
  }

  const actions = parseActions(sections.actions || "");
  if (actions.length) patch.actions = actions;

  const lines = text.split("\n");
  const dateLineIdx = [...lines]
    .map((l, i) => ({ l, i }))
    .reverse()
    .find(({ l }) => /^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\s*$/.test(l))?.i;
  const tail =
    dateLineIdx !== undefined
      ? lines.slice(dateLineIdx, dateLineIdx + 3).join("\n")
      : "";
  const next = sections.next_meeting || tail;
  const dateMatch = next.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dateMatch) {
    const [, d, m, y] = dateMatch;
    const year = y.length === 2 ? `20${y}` : y;
    patch.next_meeting_date = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const timeMatch = next.match(/(?:^|\s)(\d{1,2})\s*[:hH]\s*(\d{2})\b/);
  if (timeMatch) patch.next_meeting_time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;

  const matchedDiplomas = matchDiplomas(text, pool);
  return { patch, text, matchedDiplomas };
}
