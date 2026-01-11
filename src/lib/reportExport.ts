import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';

// Extend jsPDF type for autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

// Types
export interface ReportData {
  organization: {
    id: string;
    name: string;
    description?: string;
  };
  legislation: LegislationItem[];
  requirements: RequirementItem[];
  actionPlans: ActionPlanItem[];
  stats: ReportStats;
}

export interface LegislationItem {
  id: string;
  number: string;
  title: string;
  publicationDate: string | null;
  effectiveDate: string | null;
  source: string;
  entity: string | null;
  requirementsCount: number;
}

export interface RequirementItem {
  id: string;
  article: string | null;
  text: string;
  legislationNumber: string;
  legislationTitle: string;
  status: string;
  notes: string | null;
}

export interface ActionPlanItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  responsible: string | null;
  dueDate: string | null;
  requirementText: string | null;
}

export interface ReportStats {
  totalLegislation: number;
  totalRequirements: number;
  conforme: number;
  naoConforme: number;
  emCurso: number;
  complianceRate: number;
}

// Helper functions
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    conforme: "Conforme",
    compliant: "Conforme",
    nao_conforme: "Não Conforme",
    non_compliant: "Não Conforme",
    partial: "Parcial",
    em_curso: "Em Avaliação",
    pending: "Pendente",
    pendente: "Pendente",
    concluido: "Concluído",
    planned: "Planeada",
    in_progress: "Em Curso",
    completed: "Concluída",
    cancelled: "Cancelada",
  };
  return labels[status] || status || "Pendente";
}

function getSourceLabel(source: string): string {
  if (source === "dre") return "DRE";
  if (source === "eurlex") return "EUR-Lex";
  return "Manual";
}

// Fetch report data from Supabase
export async function fetchReportData(organizationId: string): Promise<ReportData> {
  // Fetch organization
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .single();
  
  if (orgError) throw orgError;

  // Fetch assigned legislation with requirements count
  const { data: orgLegislation } = await supabase
    .from("organization_legislation")
    .select(`
      legislation_id,
      legislation(
        id, number, title, publication_date, effective_date, source, entity
      )
    `)
    .eq("organization_id", organizationId);

  const legislationIds = orgLegislation?.map(ol => ol.legislation_id) || [];

  // Fetch requirements count per legislation
  const { data: requirementsCounts } = await supabase
    .from("legal_requirements")
    .select("legislation_id")
    .in("legislation_id", legislationIds);

  const reqCountMap = new Map<string, number>();
  requirementsCounts?.forEach(r => {
    reqCountMap.set(r.legislation_id, (reqCountMap.get(r.legislation_id) || 0) + 1);
  });

  const legislation: LegislationItem[] = (orgLegislation || []).map((ol: any) => ({
    id: ol.legislation.id,
    number: ol.legislation.number,
    title: ol.legislation.title,
    publicationDate: ol.legislation.publication_date,
    effectiveDate: ol.legislation.effective_date,
    source: ol.legislation.source,
    entity: ol.legislation.entity,
    requirementsCount: reqCountMap.get(ol.legislation.id) || 0,
  }));

  // Fetch applicabilities (requirements with status)
  const { data: applicabilities } = await supabase
    .from("applicabilities")
    .select(`
      id,
      compliance_status,
      notes,
      requirement_id,
      legal_requirements(
        id, article, requirement_text, legislation_id,
        legislation(number, title)
      )
    `)
    .eq("organization_id", organizationId);

  const requirements: RequirementItem[] = (applicabilities || [])
    .filter((a: any) => a.legal_requirements)
    .map((a: any) => ({
      id: a.legal_requirements.id,
      article: a.legal_requirements.article,
      text: a.legal_requirements.requirement_text,
      legislationNumber: a.legal_requirements.legislation?.number || "",
      legislationTitle: a.legal_requirements.legislation?.title || "",
      status: a.compliance_status || "em_curso",
      notes: a.notes,
    }));

  // Fetch action plans
  const { data: actionPlansData } = await supabase
    .from("action_plans")
    .select(`
      id, title, description, status, responsible, due_date,
      requirement_id,
      legal_requirements(requirement_text)
    `)
    .eq("organization_id", organizationId);

  const actionPlans: ActionPlanItem[] = (actionPlansData || []).map((ap: any) => ({
    id: ap.id,
    title: ap.title,
    description: ap.description,
    status: ap.status || "pendente",
    responsible: ap.responsible,
    dueDate: ap.due_date,
    requirementText: ap.legal_requirements?.requirement_text || null,
  }));

  // Calculate stats
  const conforme = requirements.filter(r => r.status === "conforme").length;
  const naoConforme = requirements.filter(r => r.status === "nao_conforme").length;
  const emCurso = requirements.filter(r => r.status === "em_curso" || !r.status).length;
  const total = requirements.length;
  const complianceRate = total > 0 ? Math.round((conforme / total) * 100) : 0;

  return {
    organization: {
      id: org.id,
      name: org.name,
      description: org.description || undefined,
    },
    legislation,
    requirements,
    actionPlans,
    stats: {
      totalLegislation: legislation.length,
      totalRequirements: total,
      conforme,
      naoConforme,
      emCurso,
      complianceRate,
    },
  };
}

// ==================== EXCEL EXPORT ====================

export function exportLegislationToExcel(data: ReportData): void {
  const ws = XLSX.utils.json_to_sheet(
    data.legislation.map(leg => ({
      "Número": leg.number,
      "Título": leg.title,
      "Data Publicação": formatDate(leg.publicationDate),
      "Data Vigência": formatDate(leg.effectiveDate),
      "Origem": getSourceLabel(leg.source),
      "Entidade": leg.entity || "-",
      "Nº Requisitos": leg.requirementsCount,
    }))
  );

  // Set column widths
  ws["!cols"] = [
    { wch: 20 }, // Número
    { wch: 60 }, // Título
    { wch: 15 }, // Data Publicação
    { wch: 15 }, // Data Vigência
    { wch: 12 }, // Origem
    { wch: 30 }, // Entidade
    { wch: 12 }, // Nº Requisitos
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Legislação");

  const fileName = `legislacao-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportRequirementsToExcel(data: ReportData): void {
  const ws = XLSX.utils.json_to_sheet(
    data.requirements.map(req => ({
      "Diploma": req.legislationNumber,
      "Título Diploma": req.legislationTitle,
      "Artigo": req.article || "-",
      "Requisito": req.text,
      "Estado": getStatusLabel(req.status),
      "Observações": req.notes || "-",
    }))
  );

  ws["!cols"] = [
    { wch: 20 }, // Diploma
    { wch: 40 }, // Título Diploma
    { wch: 12 }, // Artigo
    { wch: 60 }, // Requisito
    { wch: 15 }, // Estado
    { wch: 40 }, // Observações
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Requisitos");

  // Add summary sheet
  const summaryData = [
    { "Métrica": "Total Requisitos", "Valor": data.stats.totalRequirements },
    { "Métrica": "Conforme", "Valor": data.stats.conforme },
    { "Métrica": "Não Conforme", "Valor": data.stats.naoConforme },
    { "Métrica": "Em Avaliação", "Valor": data.stats.emCurso },
    { "Métrica": "Taxa Conformidade", "Valor": `${data.stats.complianceRate}%` },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  const fileName = `requisitos-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportActionPlansToExcel(data: ReportData): void {
  const ws = XLSX.utils.json_to_sheet(
    data.actionPlans.map(plan => ({
      "Título": plan.title,
      "Descrição": plan.description || "-",
      "Estado": getStatusLabel(plan.status),
      "Responsável": plan.responsible || "-",
      "Prazo": formatDate(plan.dueDate),
      "Requisito Associado": plan.requirementText || "-",
    }))
  );

  ws["!cols"] = [
    { wch: 30 }, // Título
    { wch: 50 }, // Descrição
    { wch: 15 }, // Estado
    { wch: 20 }, // Responsável
    { wch: 15 }, // Prazo
    { wch: 50 }, // Requisito
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planos de Ação");

  const fileName = `planos-acao-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportFullReportToExcel(data: ReportData): void {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    { "Métrica": "Organização", "Valor": data.organization.name },
    { "Métrica": "Data do Relatório", "Valor": new Date().toLocaleDateString("pt-PT") },
    { "Métrica": "", "Valor": "" },
    { "Métrica": "Total Diplomas", "Valor": data.stats.totalLegislation },
    { "Métrica": "Total Requisitos", "Valor": data.stats.totalRequirements },
    { "Métrica": "Conforme", "Valor": data.stats.conforme },
    { "Métrica": "Não Conforme", "Valor": data.stats.naoConforme },
    { "Métrica": "Em Avaliação", "Valor": data.stats.emCurso },
    { "Métrica": "Taxa Conformidade", "Valor": `${data.stats.complianceRate}%` },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 25 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  // Legislation sheet
  const wsLeg = XLSX.utils.json_to_sheet(
    data.legislation.map(leg => ({
      "Número": leg.number,
      "Título": leg.title,
      "Data Publicação": formatDate(leg.publicationDate),
      "Origem": getSourceLabel(leg.source),
      "Nº Requisitos": leg.requirementsCount,
    }))
  );
  wsLeg["!cols"] = [{ wch: 20 }, { wch: 50 }, { wch: 15 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsLeg, "Legislação");

  // Requirements sheet
  const wsReq = XLSX.utils.json_to_sheet(
    data.requirements.map(req => ({
      "Diploma": req.legislationNumber,
      "Artigo": req.article || "-",
      "Requisito": req.text,
      "Estado": getStatusLabel(req.status),
      "Observações": req.notes || "-",
    }))
  );
  wsReq["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 60 }, { wch: 15 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsReq, "Requisitos");

  // Action Plans sheet
  if (data.actionPlans.length > 0) {
    const wsPlans = XLSX.utils.json_to_sheet(
      data.actionPlans.map(plan => ({
        "Título": plan.title,
        "Estado": getStatusLabel(plan.status),
        "Responsável": plan.responsible || "-",
        "Prazo": formatDate(plan.dueDate),
      }))
    );
    wsPlans["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsPlans, "Planos de Ação");
  }

  const fileName = `relatorio-conformidade-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ==================== PDF EXPORT ====================

const PDF_COLORS = {
  primary: [59, 130, 246] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],
  warning: [202, 138, 4] as [number, number, number],
  danger: [220, 38, 38] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  header: [243, 244, 246] as [number, number, number],
};

function addPDFHeader(doc: jsPDF, title: string, orgName: string): void {
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39);
  doc.text(title, 20, 25);
  
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(orgName, 20, 35);
  
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-PT")}`, 20, 45);
  
  // Line under header
  doc.setDrawColor(229, 231, 235);
  doc.line(20, 50, 190, 50);
}

function addStatsBox(doc: jsPDF, stats: ReportStats, startY: number): number {
  const boxWidth = 35;
  const boxHeight = 25;
  const startX = 20;
  const gap = 5;
  
  const statsItems = [
    { label: "Diplomas", value: stats.totalLegislation.toString(), color: PDF_COLORS.primary },
    { label: "Requisitos", value: stats.totalRequirements.toString(), color: PDF_COLORS.muted },
    { label: "Conforme", value: stats.conforme.toString(), color: PDF_COLORS.success },
    { label: "Não Conforme", value: stats.naoConforme.toString(), color: PDF_COLORS.danger },
    { label: "Conformidade", value: `${stats.complianceRate}%`, color: PDF_COLORS.primary },
  ];
  
  statsItems.forEach((stat, index) => {
    const x = startX + (boxWidth + gap) * index;
    
    // Box background
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, startY, boxWidth, boxHeight, 3, 3, "F");
    
    // Value
    doc.setFontSize(16);
    doc.setTextColor(...stat.color);
    doc.text(stat.value, x + boxWidth / 2, startY + 12, { align: "center" });
    
    // Label
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(stat.label, x + boxWidth / 2, startY + 20, { align: "center" });
  });
  
  return startY + boxHeight + 15;
}

export function exportLegislationToPDF(data: ReportData): void {
  const doc = new jsPDF();
  
  addPDFHeader(doc, "Lista de Legislação Aplicável", data.organization.name);
  
  doc.autoTable({
    startY: 60,
    head: [["Número", "Título", "Publicação", "Origem", "Requisitos"]],
    body: data.legislation.map(leg => [
      leg.number,
      leg.title.length > 60 ? leg.title.substring(0, 57) + "..." : leg.title,
      formatDate(leg.publicationDate),
      getSourceLabel(leg.source),
      leg.requirementsCount.toString(),
    ]),
    headStyles: {
      fillColor: PDF_COLORS.header,
      textColor: [31, 41, 55],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [55, 65, 81],
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 80 },
      2: { cellWidth: 25 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
    },
    margin: { left: 20, right: 20 },
  });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }
  
  const fileName = `legislacao-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

export function exportRequirementsToPDF(data: ReportData): void {
  const doc = new jsPDF();
  
  addPDFHeader(doc, "Lista de Requisitos Legais", data.organization.name);
  
  let currentY = addStatsBox(doc, data.stats, 55);
  
  // Group requirements by legislation
  const grouped = new Map<string, RequirementItem[]>();
  data.requirements.forEach(req => {
    const key = req.legislationNumber;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(req);
  });
  
  grouped.forEach((reqs, legNumber) => {
    const legTitle = reqs[0]?.legislationTitle || "";
    
    // Check if we need a new page
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }
    
    // Legislation header
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    doc.text(`${legNumber} - ${legTitle.length > 70 ? legTitle.substring(0, 67) + "..." : legTitle}`, 20, currentY);
    currentY += 5;
    
    doc.autoTable({
      startY: currentY,
      head: [["Artigo", "Requisito", "Estado", "Observações"]],
      body: reqs.map(req => [
        req.article || "-",
        req.text.length > 80 ? req.text.substring(0, 77) + "..." : req.text,
        getStatusLabel(req.status),
        req.notes ? (req.notes.length > 30 ? req.notes.substring(0, 27) + "..." : req.notes) : "-",
      ]),
      headStyles: {
        fillColor: PDF_COLORS.header,
        textColor: [31, 41, 55],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [55, 65, 81],
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 90 },
        2: { cellWidth: 25 },
        3: { cellWidth: 35 },
      },
      margin: { left: 20, right: 20 },
    });
    
    currentY = doc.lastAutoTable.finalY + 10;
  });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }
  
  const fileName = `requisitos-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

export function exportComplianceReportToPDF(data: ReportData): void {
  const doc = new jsPDF();
  
  addPDFHeader(doc, "Relatório de Conformidade Legal", data.organization.name);
  
  let currentY = addStatsBox(doc, data.stats, 55);
  
  // Action Plans Section
  if (data.actionPlans.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text("Planos de Ação", 20, currentY);
    currentY += 5;
    
    doc.autoTable({
      startY: currentY,
      head: [["Ação", "Estado", "Responsável", "Prazo"]],
      body: data.actionPlans.map(plan => [
        plan.title,
        getStatusLabel(plan.status),
        plan.responsible || "-",
        formatDate(plan.dueDate),
      ]),
      headStyles: {
        fillColor: PDF_COLORS.header,
        textColor: [31, 41, 55],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [55, 65, 81],
      },
      margin: { left: 20, right: 20 },
    });
    
    currentY = doc.lastAutoTable.finalY + 15;
  }
  
  // Requirements by Legislation
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  if (currentY > 250) {
    doc.addPage();
    currentY = 20;
  }
  doc.text("Requisitos por Diploma", 20, currentY);
  currentY += 10;
  
  // Group requirements by legislation
  const grouped = new Map<string, RequirementItem[]>();
  data.requirements.forEach(req => {
    const key = req.legislationNumber;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(req);
  });
  
  grouped.forEach((reqs, legNumber) => {
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(legNumber, 20, currentY);
    currentY += 5;
    
    doc.autoTable({
      startY: currentY,
      head: [["Artigo", "Requisito", "Estado"]],
      body: reqs.map(req => [
        req.article || "-",
        req.text.length > 100 ? req.text.substring(0, 97) + "..." : req.text,
        getStatusLabel(req.status),
      ]),
      headStyles: {
        fillColor: PDF_COLORS.header,
        textColor: [31, 41, 55],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [55, 65, 81],
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 120 },
        2: { cellWidth: 30 },
      },
      margin: { left: 20, right: 20 },
    });
    
    currentY = doc.lastAutoTable.finalY + 8;
  });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }
  
  const fileName = `relatorio-conformidade-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}
