import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

export const STANDARDS_SNAPSHOT_PREFIX = "Controlo de normas";

type Audit = {
  id: string;
  title: string;
  audit_date?: string | null;
  executed_at?: string | null;
  organization_id: string;
};

const COLUMNS: { key: string; header: string; width: number }[] = [
  { key: "reference_period", header: "Período de referência", width: 22 },
  { key: "document_type", header: "Tipo de documento", width: 20 },
  { key: "document_ref", header: "Referência", width: 22 },
  { key: "document_name", header: "Documento", width: 48 },
  { key: "publication_date", header: "Data de publicação", width: 18 },
  { key: "modification_date", header: "Data de modificação", width: 18 },
  { key: "issuer", header: "Emissor", width: 26 },
  { key: "impact_iso_14001", header: "Impacto ISO 14001", width: 18 },
  { key: "impact_iso_45001", header: "Impacto ISO 45001", width: 18 },
  { key: "applicability_direct", header: "Aplicabilidade direta", width: 20 },
  {
    key: "applicability_indirect",
    header: "Aplicabilidade indireta",
    width: 20,
  },
  { key: "applicability_informative", header: "Informativo", width: 14 },
  { key: "descriptive", header: "Descritivo", width: 60 },
  { key: "actions", header: "Ações", width: 50 },
  { key: "responsible", header: "Responsável", width: 22 },
  { key: "implementation_deadline", header: "Prazo", width: 18 },
  { key: "implementation_status", header: "Estado", width: 20 },
];

/** Checks whether the audit already has a generated standards snapshot attached. */
export async function hasStandardsSnapshot(auditId: string) {
  const { data } = await supabase
    .from("audit_documents")
    .select("id, documents(name)")
    .eq("audit_id", auditId);
  return (data || []).some((row: any) =>
    (row.documents?.name || "").startsWith(STANDARDS_SNAPSHOT_PREFIX),
  );
}

/**
 * Generates an Excel snapshot of the standards control records for the audit's
 * period and attaches it to the audit (monthly minutes). Until the audit is
 * closed the records keep being managed in the standards control panel.
 */
export async function generateStandardsSnapshot(audit: Audit) {
  const refDate = audit.executed_at || audit.audit_date || null;

  const { data: rows, error } = await supabase
    .from("standards_control")
    .select("*")
    .eq("organization_id", audit.organization_id)
    .order("display_order", { ascending: true });
  if (error) throw error;

  const all = rows || [];
  let selected = all;
  if (refDate) {
    const withDate = all.filter((r: any) => r.period_date);
    const upTo = withDate.filter(
      (r: any) => (r.period_date as string) <= refDate,
    );
    if (upTo.length) {
      const latest = upTo
        .map((r: any) => r.period_date as string)
        .sort()
        .pop();
      selected = all.filter((r: any) => r.period_date === latest);
    }
  }
  if (!selected.length) selected = all;

  const periodLabel =
    (selected[0] as any)?.reference_period || refDate || "Sem período";

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Controlo de normas");
  ws.columns = COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  const header = ws.getRow(1);
  header.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2C3E50" },
  };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 28;

  selected.forEach((r: any) => {
    ws.addRow({
      reference_period: r.reference_period || "",
      document_type: r.document_type || "",
      document_ref: r.document_ref || "",
      document_name: r.document_name || "",
      publication_date: r.publication_date || "",
      modification_date: r.modification_date || "",
      issuer: r.issuer || "",
      impact_iso_14001: r.impact_iso_14001 ? "Sim" : "-",
      impact_iso_45001: r.impact_iso_45001 ? "Sim" : "-",
      applicability_direct: r.applicability_direct ? "Sim" : "-",
      applicability_indirect: r.applicability_indirect ? "Sim" : "-",
      applicability_informative: r.applicability_informative ? "Sim" : "-",
      descriptive: r.descriptive || "",
      actions: r.actions || "",
      responsible: r.responsible || "",
      implementation_deadline: r.implementation_deadline || "",
      implementation_status: r.implementation_status || "",
    });
  });

  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    row.font = { name: "Arial", size: 10 };
    row.alignment = { vertical: "top", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const safePeriod = String(periodLabel).replace(/[^\w\-]+/g, "_");
  const fileName = `${STANDARDS_SNAPSHOT_PREFIX} - ${periodLabel}.xlsx`;
  const path = `audits/${audit.id}/${Date.now()}-controlo-normas-${safePeriod}.xlsx`;

  const { error: upErr } = await supabase.storage
    .from("requirement-documents")
    .upload(
      path,
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      { upsert: true },
    );
  if (upErr) throw upErr;

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({
      organization_id: audit.organization_id,
      name: fileName,
      description: `Controlo de normas, despachos e notas técnicas anexado ao encerramento de "${audit.title}"`,
      file_url: path,
      category: "controlo_normas",
    })
    .select("id")
    .single();
  if (docErr) throw docErr;

  const { error: linkErr } = await supabase.from("audit_documents").insert({
    audit_id: audit.id,
    document_id: doc.id,
    note: "Gerado automaticamente no encerramento da VCL",
  });
  if (linkErr) throw linkErr;

  return { fileName, rows: selected.length };
}
