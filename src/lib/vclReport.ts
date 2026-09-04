import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

export const VCL_REPORT_PREFIX = "Verificação de Conformidade Legal Mensal";

export type VclAction = {
  description: string;
  responsible: string;
  deadline: string;
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

/** Builds the monthly VCL report PDF in the same structure as the Word/PDF template. */
export function buildVclPdf(
  audit: Audit,
  report: VclReport,
  orgName?: string,
): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth();
  let y = margin;

  const period = vclPeriodLabel(audit);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("VERIFICAÇÃO DE CONFORMIDADE", margin, y);
  y += 19;
  doc.text(`LEGAL MENSAL — ${period}`, margin, y);
  y += 22;

  if (orgName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(orgName, margin, y);
    y += 18;
  }

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6, valign: "top" },
    headStyles: { fillColor: [44, 62, 80] },
    head: [["Participantes", "Tipo de reunião"]],
    body: [[report.participants || "-", report.meeting_type || "-"]],
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 20;

  const section = (title: string, text: string, always = false) => {
    if (!text?.trim() && !always) return;
    text = text?.trim() ? text : "-";

    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text.trim(), width - margin * 2);
    lines.forEach((line: string) => {
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 13;
    });
    y += 12;
  };

  section("Descrição da reunião:", report.description, true);
  section("Conclusões:", report.conclusions, true);


  if (report.diplomas.length) {
    if (y > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Diplomas analisados no período", margin, y);
    autoTable(doc, {
      startY: y + 14,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 5, valign: "top" },
      headStyles: { fillColor: [44, 62, 80] },
      columnStyles: { 0: { cellWidth: 110 }, 2: { cellWidth: 95 } },
      head: [["Diploma", "Título", "Aplicabilidade"]],
      body: report.diplomas.map((d) => [
        d.number || "",
        d.title || "",
        d.applicability === "aplicavel_direto"
          ? "Aplicável direto"
          : d.applicability === "aplicavel_indireto"
            ? "Aplicável indireto"
            : d.applicability || "",
      ]),
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  if (report.actions.length) {
    if (y > doc.internal.pageSize.getHeight() - 140) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Ações a desenvolver", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y + 6,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 6, valign: "top" },
      headStyles: { fillColor: [44, 62, 80] },
      columnStyles: {
        0: { cellWidth: 28 },
        2: { cellWidth: 90 },
        3: { cellWidth: 70 },
      },
      head: [["N.º", "Ações a desenvolver", "Responsabilidade", "Prazo"]],
      body: report.actions.map((a, i) => [
        String(i + 1),
        a.description || "",
        a.responsible || "",
        a.deadline || "",
      ]),
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  section("Notas especiais:", report.special_notes || "Nada a relevar.");

  if (report.next_meeting_date || report.next_meeting_time) {
    section(
      "Próxima reunião:",
      [report.next_meeting_date, report.next_meeting_time]
        .filter(Boolean)
        .join("  •  "),
    );
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
) {
  const blob = buildVclPdf(audit, report, orgName);
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
        "id, title, audit_type, audit_date, executed_at, organization_id, vcl_report, organizations(name)",
      )
      .eq("id", auditId)
      .maybeSingle();
    if (!audit) return null;
    if ((audit.audit_type || "anual") !== "mensal") return null;
    if (!(audit as any).vcl_report) return null;
    if (await hasVclReportDoc(auditId)) return null;
    return await generateAndAttachVclPdf(
      audit as any,
      parseVclReport((audit as any).vcl_report),
      (audit as any).organizations?.name,
    );
  } catch (err) {
    console.error("vcl report pdf failed", err);
    return null;
  }
}
