import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import idLogoUrl from "@/assets/logo-id-compliance.jpg";

export const VCL_REPORT_PREFIX = "Verificação de Conformidade Legal Mensal";

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type VclAction = {
  description: string;
  responsible: string;
  deadline: string;
  legislation_id?: string | null;
  legislation_label?: string | null;
};

export type VclDiploma = {
  id: string;
  number: string;
  title: string;
  applicability: string;
  publication_date?: string | null;
};

export type VclReport = {
  participants: string;
  meeting_type: string;
  /** Data da reunião (dd/mm/aaaa). Se vazio, usa a data da auditoria. */
  meeting_date?: string | null;
  description: string;
  conclusions: string;
  actions: VclAction[];
  diplomas: VclDiploma[];
  special_notes: string;
  next_meeting_date: string;
  next_meeting_time: string;
};

export const emptyVclReport = (): VclReport => ({
  participants: "",
  meeting_type: "Remota",
  description: "",
  conclusions: "",
  actions: [],
  diplomas: [],
  special_notes: "",
  next_meeting_date: "",
  next_meeting_time: "",
});

export function parseVclReport(value: unknown): VclReport {
  const base = emptyVclReport();
  if (!value || typeof value !== "object") return base;
  const v = value as Partial<VclReport>;
  return {
    ...base,
    ...v,
    actions: Array.isArray(v.actions) ? v.actions : [],
    diplomas: Array.isArray(v.diplomas) ? v.diplomas : [],
  };
}

type Audit = {
  id: string;
  title: string;
  audit_date?: string | null;
  executed_at?: string | null;
  organization_id: string;
};

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function vclPeriodLabel(audit: Audit) {
  const ref = audit.executed_at || audit.audit_date;
  if (!ref) return audit.title;
  const d = new Date(ref);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${mm}/${d.getFullYear()} — ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function vclShortPeriod(audit: Audit) {
  const ref = audit.executed_at || audit.audit_date;
  if (!ref) return "";
  const d = new Date(ref);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const NAVY: [number, number, number] = [31, 56, 100];
const BAR: [number, number, number] = [217, 226, 243];
const TEXT: [number, number, number] = [33, 37, 41];

/** Builds the monthly VCL report PDF replicating the original Word template layout. */
export async function buildVclPdf(
  audit: Audit,
  report: VclReport,
  orgName?: string,
  orgLogoUrl?: string | null,
): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const contentW = width - margin * 2;
  let y = margin;

  const pageBreak = (needed = 60) => {
    if (y > height - needed) {
      doc.addPage();
      y = margin;
    }
  };

  // ---- Header logos (cliente à esquerda, I&D Compliance à direita) --------
  const logoH = 34;
  const drawLogo = (dataUrl: string | null, x: number, alignRight = false) => {
    if (!dataUrl) return;
    try {
      const props = doc.getImageProperties(dataUrl);
      const w = (props.width / props.height) * logoH;
      doc.addImage(dataUrl, alignRight ? x - w : x, y - 6, w, logoH);
    } catch {
      /* logotipo inválido — segue sem ele */
    }
  };
  const [orgLogo, idLogo] = await Promise.all([
    orgLogoUrl ? toDataUrl(orgLogoUrl) : Promise.resolve(null),
    toDataUrl(idLogoUrl),
  ]);
  drawLogo(orgLogo, margin);
  drawLogo(idLogo, width - margin, true);
  y += logoH + 10;

  // ---- Title -------------------------------------------------------------
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(19);
  doc.text("VERIFICAÇÃO DE CONFORMIDADE", margin, y);
  y += 24;
  doc.text(`LEGAL MENSAL_${vclShortPeriod(audit)}`, margin, y);
  y += 12;

  const meetingDate =
    report.meeting_date ||
    (() => {
      const ref = audit.executed_at || audit.audit_date;
      if (!ref) return "";
      const d = new Date(ref);
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    })();

  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT);
  const rightBits = [
    orgName ? orgName.toUpperCase() : "",
    meetingDate ? `Data da reunião: ${meetingDate}` : "",
  ].filter(Boolean);
  rightBits.forEach((bit, i) => {
    doc.text(bit, width - margin, y - 20 + i * 12, { align: "right" });
  });

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.4);
  doc.line(margin, y, width - margin, y);
  y += 24;

  // ---- Participants box --------------------------------------------------
  doc.setTextColor(...TEXT);
  doc.setFontSize(9.5);
  const partLines = doc.splitTextToSize(
    report.participants?.trim() || "-",
    contentW * 0.56 - 70,
  );
  const boxH = Math.max(46, partLines.length * 12 + 20);
  doc.setFillColor(249, 250, 252);
  doc.setDrawColor(150, 160, 175);
  doc.setLineWidth(0.7);
  doc.rect(margin, y, contentW, boxH, "FD");

  const ty = y + 16;
  doc.setFont("helvetica", "bold");
  doc.text("Participantes:", margin + 8, ty);
  doc.setFont("helvetica", "normal");
  partLines.forEach((line: string, i: number) => {
    doc.text(line, margin + 80, ty + i * 12);
  });
  doc.setFont("helvetica", "bold");
  doc.text("Tipo de reunião:", margin + contentW * 0.6, ty);
  doc.setFont("helvetica", "normal");
  doc.text(report.meeting_type || "-", margin + contentW * 0.6 + 76, ty);
  y += boxH + 22;

  // ---- Section helpers ---------------------------------------------------
  const bar = (title: string) => {
    pageBreak(90);
    doc.setFillColor(...BAR);
    doc.rect(margin, y - 11, contentW, 17, "F");
    doc.setFillColor(...NAVY);
    doc.rect(margin, y - 11, 3, 17, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(title, margin + 10, y);
    y += 22;
  };

  /** Draws one line with words evenly spread to fill the full column width. */
  const justifyLine = (line: string, isLast: boolean) => {
    const words = line.trim().split(/\s+/);
    if (isLast || words.length < 2) {
      doc.text(line.trim(), margin, y);
      return;
    }
    const wordsW = words.reduce((sum, w) => sum + doc.getTextWidth(w), 0);
    const gap = (contentW - wordsW) / (words.length - 1);
    // Avoid ugly rivers when a line is very short
    if (gap > 14) {
      doc.text(line.trim(), margin, y);
      return;
    }
    let x = margin;
    words.forEach((w) => {
      doc.text(w, x, y);
      x += doc.getTextWidth(w) + gap;
    });
  };

  const body = (text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    const paragraphs = (text?.trim() || "-").split(/\n+/);
    paragraphs.forEach((p) => {
      const lines: string[] = doc.splitTextToSize(p.trim(), contentW);
      lines.forEach((line, i) => {
        pageBreak(70);
        justifyLine(line, i === lines.length - 1);
        y += 14;
      });
      y += 6;
    });
    y += 8;
  };


  bar("Descrição da reunião:");
  body(report.description);

  bar("Conclusões:");
  body(report.conclusions);

  // ---- Diplomas analysed --------------------------------------------------
  if (report.diplomas.length) {
    bar("Diplomas analisados no período");
    autoTable(doc, {
      startY: y - 6,
      theme: "grid",
      styles: {
        fontSize: 8.5,
        cellPadding: 5,
        valign: "top",
        lineColor: [120, 120, 120],
        lineWidth: 0.5,
        textColor: TEXT,
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: TEXT,
        fontStyle: "bold",
      },
      columnStyles: { 0: { cellWidth: 105 }, 2: { cellWidth: 95 } },
      head: [["Diploma", "Título", "Aplicabilidade"]],
      body: report.diplomas.map((d) => [
        d.number || "",
        d.title || "",
        d.applicability === "aplicavel_direto"
          ? "Aplicável direto"
          : d.applicability === "aplicavel_indireto"
            ? "Aplicável indireto"
            : d.applicability === "informativo"
              ? "Informativo"
              : d.applicability === "nao_aplicavel"
                ? "Não aplicável"
                : d.applicability || "",
      ]),
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 24;
  }

  // ---- Actions table ------------------------------------------------------
  bar("Conclusões");
  autoTable(doc, {
    startY: y - 6,
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: 6,
      valign: "middle",
      lineColor: [120, 120, 120],
      lineWidth: 0.5,
      textColor: TEXT,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: TEXT,
      fontStyle: "bold",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 30, halign: "center" },
      2: { cellWidth: 100 },
      3: { cellWidth: 70 },
    },
    head: [["N.º", "Ações a desenvolver", "Responsabilidade", "Prazo"]],
    body: report.actions.length
      ? report.actions.map((a, i) => [
          String(i + 1),
          (a.legislation_label ? a.legislation_label + " — " : "") +
            (a.description || ""),
          a.responsible || "",
          a.deadline || "",
        ])
      : [["", "", "", ""]],
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 26;

  // ---- Special notes ------------------------------------------------------
  bar("Notas especiais:");
  body(report.special_notes || "Nada a relevar.");

  // ---- Next meeting (right aligned, as in the template) -------------------
  if (report.next_meeting_date || report.next_meeting_time) {
    pageBreak(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    if (report.next_meeting_date) {
      doc.text(report.next_meeting_date, width - margin, y, { align: "right" });
      y += 15;
    }
    if (report.next_meeting_time) {
      doc.text(report.next_meeting_time, width - margin, y, { align: "right" });
      y += 15;
    }
  }

  // ---- Footer -------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(200, 208, 220);
    doc.setLineWidth(0.6);
    doc.line(margin, height - 42, width - margin, height - 42);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 128, 140);
    doc.text(
      [orgName, `Verificação de Conformidade Legal Mensal — ${vclShortPeriod(audit)}`]
        .filter(Boolean)
        .join("  |  "),
      margin,
      height - 28,
    );
    doc.text(`${p} / ${pages}`, width - margin, height - 28, {
      align: "right",
    });
  }


  return doc.output("blob");
}


/** Removes previously attached VCL report PDFs so the newest version replaces them. */
async function removeVclReportDocs(auditId: string) {
  const { data } = await supabase
    .from("audit_documents")
    .select("id, document_id, documents(name)")
    .eq("audit_id", auditId);
  const stale = (data || []).filter((row: any) =>
    (row.documents?.name || "").startsWith(VCL_REPORT_PREFIX),
  );
  if (!stale.length) return;
  await supabase
    .from("audit_documents")
    .delete()
    .in("id", stale.map((r: any) => r.id));
  await supabase
    .from("documents")
    .delete()
    .in("id", stale.map((r: any) => r.document_id));
}


/** Generates the monthly VCL report PDF and attaches it to the audit. */
export async function generateAndAttachVclPdf(
  audit: Audit,
  report: VclReport,
  orgName?: string,
  orgLogoUrl?: string | null,
) {
  if (orgName === undefined || orgLogoUrl === undefined) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", audit.organization_id)
      .maybeSingle();
    orgName = orgName ?? org?.name;
    orgLogoUrl = orgLogoUrl ?? org?.logo_url;
  }
  await removeVclReportDocs(audit.id);
  const blob = await buildVclPdf(audit, report, orgName, orgLogoUrl);

  const period = vclPeriodLabel(audit);
  const safe = period.replace(/[^\w]+/g, "_");
  const fileName = `${VCL_REPORT_PREFIX} - ${period}.pdf`;
  const path = `audits/${audit.id}/${Date.now()}-vcl-${safe}.pdf`;

  const { error: upErr } = await supabase.storage
    .from("requirement-documents")
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (upErr) throw upErr;

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({
      organization_id: audit.organization_id,
      name: fileName,
      description: `Relatório da verificação de conformidade legal mensal — ${audit.title}`,
      file_url: path,
      category: "relatorio_vcl",
    })
    .select("id")
    .single();
  if (docErr) throw docErr;

  const { error: linkErr } = await supabase.from("audit_documents").insert({
    audit_id: audit.id,
    document_id: doc.id,
    note: "Relatório VCL gerado no encerramento",
  });
  if (linkErr) throw linkErr;

  return fileName;
}

/** On closing a monthly VCL: generates the report PDF once, if it has content. */
export async function attachVclReportIfMonthly(auditId: string) {
  try {
    const { data: audit } = await supabase
      .from("audits")
      .select(
        "id, title, audit_type, audit_date, executed_at, organization_id, vcl_report, organizations(name, logo_url)",
      )
      .eq("id", auditId)
      .maybeSingle();
    if (!audit) return null;
    if ((audit.audit_type || "anual") !== "mensal") return null;
    if (!(audit as any).vcl_report) return null;
    return await generateAndAttachVclPdf(
      audit as any,
      parseVclReport((audit as any).vcl_report),
      (audit as any).organizations?.name,
      (audit as any).organizations?.logo_url,
    );
  } catch (err) {
    console.error("vcl report pdf failed", err);
    return null;
  }
}
