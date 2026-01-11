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
    logoUrl?: string;
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
      logoUrl: org.logo_url || undefined,
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

// ==================== PDF THEME CONFIGURATION ====================

// You can customize these colors to match your brand
// Colors are in RGB format [R, G, B] with values 0-255
export const PDF_THEME = {
  // Brand colors
  colors: {
    primary: [37, 99, 235] as [number, number, number],      // Blue - main accent
    secondary: [99, 102, 241] as [number, number, number],   // Indigo - secondary accent
    success: [22, 163, 74] as [number, number, number],      // Green - compliant
    warning: [234, 179, 8] as [number, number, number],      // Yellow - in progress
    danger: [220, 38, 38] as [number, number, number],       // Red - non-compliant
    
    // Text colors
    textDark: [17, 24, 39] as [number, number, number],      // Headings
    textMuted: [107, 114, 128] as [number, number, number],  // Secondary text
    textLight: [156, 163, 175] as [number, number, number],  // Subtle text
    
    // Background colors
    bgLight: [249, 250, 251] as [number, number, number],    // Light background
    bgHeader: [243, 244, 246] as [number, number, number],   // Table header
    bgAccent: [239, 246, 255] as [number, number, number],   // Accent background
    
    // Border colors
    border: [229, 231, 235] as [number, number, number],     // Light border
    borderAccent: [191, 219, 254] as [number, number, number], // Accent border
  },
  
  // Typography settings
  typography: {
    // Font sizes in points
    titleSize: 22,
    subtitleSize: 14,
    headingSize: 12,
    bodySize: 10,
    smallSize: 8,
    tinySize: 7,
    
    // Line heights (multiplier)
    lineHeight: 1.4,
  },
  
  // Spacing in mm
  spacing: {
    margin: 20,
    sectionGap: 15,
    itemGap: 8,
  },
  
  // Stats box configuration
  statsBox: {
    width: 35,
    height: 28,
    gap: 4,
    borderRadius: 4,
  },
};

// Legacy alias for backwards compatibility
const PDF_COLORS = {
  primary: PDF_THEME.colors.primary,
  success: PDF_THEME.colors.success,
  warning: PDF_THEME.colors.warning,
  danger: PDF_THEME.colors.danger,
  muted: PDF_THEME.colors.textMuted,
  header: PDF_THEME.colors.bgHeader,
};

// Helper to load image as base64
async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addPDFHeader(doc: jsPDF, title: string, orgName: string, logoBase64?: string | null): void {
  const { colors, typography, spacing } = PDF_THEME;
  let textStartX = spacing.margin;
  
  // Add logo if available
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', spacing.margin, 12, 30, 30);
      textStartX = spacing.margin + 40;
    } catch {
      // If logo fails to load, continue without it
    }
  }
  
  // Title with primary color accent
  doc.setFontSize(typography.titleSize);
  doc.setTextColor(...colors.primary);
  doc.text(title, textStartX, 25);
  
  // Organization name
  doc.setFontSize(typography.subtitleSize);
  doc.setTextColor(...colors.textDark);
  doc.text(orgName, textStartX, 36);
  
  // Date with muted color
  doc.setFontSize(typography.smallSize);
  doc.setTextColor(...colors.textMuted);
  doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-PT", { 
    day: "2-digit", 
    month: "long", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })}`, textStartX, 45);
  
  // Decorative line under header with gradient effect
  doc.setDrawColor(...colors.primary);
  doc.setLineWidth(0.8);
  doc.line(spacing.margin, 52, 60, 52);
  
  doc.setDrawColor(...colors.border);
  doc.setLineWidth(0.3);
  doc.line(60, 52, 210 - spacing.margin, 52);
}

function addStatsBox(doc: jsPDF, stats: ReportStats, startY: number): number {
  const { colors, typography, spacing, statsBox } = PDF_THEME;
  const { width: boxWidth, height: boxHeight, gap, borderRadius } = statsBox;
  const startX = spacing.margin;
  
  const statsItems = [
    { label: "Diplomas", value: stats.totalLegislation.toString(), color: colors.primary, bgColor: colors.bgAccent },
    { label: "Requisitos", value: stats.totalRequirements.toString(), color: colors.secondary, bgColor: colors.bgLight },
    { label: "Conforme", value: stats.conforme.toString(), color: colors.success, bgColor: [236, 253, 245] as [number, number, number] },
    { label: "Não Conforme", value: stats.naoConforme.toString(), color: colors.danger, bgColor: [254, 242, 242] as [number, number, number] },
    { label: "Conformidade", value: `${stats.complianceRate}%`, color: colors.primary, bgColor: colors.bgAccent },
  ];
  
  statsItems.forEach((stat, index) => {
    const x = startX + (boxWidth + gap) * index;
    
    // Box background with subtle color
    doc.setFillColor(...stat.bgColor);
    doc.roundedRect(x, startY, boxWidth, boxHeight, borderRadius, borderRadius, "F");
    
    // Border accent
    doc.setDrawColor(...stat.color);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, startY, boxWidth, boxHeight, borderRadius, borderRadius, "S");
    
    // Value - larger and bold looking
    doc.setFontSize(18);
    doc.setTextColor(...stat.color);
    doc.text(stat.value, x + boxWidth / 2, startY + 13, { align: "center" });
    
    // Label - smaller and muted
    doc.setFontSize(typography.tinySize);
    doc.setTextColor(...colors.textMuted);
    doc.text(stat.label, x + boxWidth / 2, startY + 22, { align: "center" });
  });
  
  return startY + boxHeight + spacing.sectionGap;
}

// Helper function to get consistent table styles
function getTableStyles() {
  const { colors, typography } = PDF_THEME;
  
  return {
    headStyles: {
      fillColor: colors.primary,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: typography.smallSize,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: typography.tinySize,
      textColor: colors.textDark,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: colors.bgLight,
    },
    styles: {
      lineColor: colors.border,
      lineWidth: 0.1,
    },
  };
}

// Helper function to add section title
function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  const { colors, typography, spacing } = PDF_THEME;
  
  doc.setFontSize(typography.subtitleSize);
  doc.setTextColor(...colors.primary);
  doc.text(title, spacing.margin, y);
  
  // Underline
  doc.setDrawColor(...colors.borderAccent);
  doc.setLineWidth(0.5);
  doc.line(spacing.margin, y + 2, spacing.margin + doc.getTextWidth(title), y + 2);
  
  return y + 10;
}

// Helper function to add footer to all pages
function addFooter(doc: jsPDF, orgName: string): void {
  const { colors, typography, spacing } = PDF_THEME;
  const pageCount = doc.getNumberOfPages();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Footer line
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.3);
    doc.line(spacing.margin, doc.internal.pageSize.height - 18, 210 - spacing.margin, doc.internal.pageSize.height - 18);
    
    // Organization name on left
    doc.setFontSize(typography.tinySize);
    doc.setTextColor(...colors.textLight);
    doc.text(orgName, spacing.margin, doc.internal.pageSize.height - 12);
    
    // Page number on right
    doc.text(
      `Página ${i} de ${pageCount}`,
      210 - spacing.margin,
      doc.internal.pageSize.height - 12,
      { align: "right" }
    );
  }
}

export async function exportLegislationToPDF(data: ReportData): Promise<void> {
  const doc = new jsPDF();
  const { colors, spacing } = PDF_THEME;
  const tableStyles = getTableStyles();
  
  // Load logo if available
  const logoBase64 = data.organization.logoUrl 
    ? await loadImageAsBase64(data.organization.logoUrl) 
    : null;
  
  addPDFHeader(doc, "Lista de Legislação Aplicável", data.organization.name, logoBase64);
  
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
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 80 },
      2: { cellWidth: 25 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20, halign: "center" as const },
    },
    margin: { left: spacing.margin, right: spacing.margin },
  });
  
  addFooter(doc, data.organization.name);
  
  const fileName = `legislacao-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

export async function exportRequirementsToPDF(data: ReportData): Promise<void> {
  const doc = new jsPDF();
  const { colors, typography, spacing } = PDF_THEME;
  const tableStyles = getTableStyles();
  
  // Load logo if available
  const logoBase64 = data.organization.logoUrl 
    ? await loadImageAsBase64(data.organization.logoUrl) 
    : null;
  
  addPDFHeader(doc, "Lista de Requisitos Legais", data.organization.name, logoBase64);
  
  let currentY = addStatsBox(doc, data.stats, 58);
  
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
    
    // Legislation header with colored background
    doc.setFillColor(...colors.bgAccent);
    doc.rect(spacing.margin, currentY - 4, 170, 8, "F");
    
    doc.setFontSize(typography.bodySize);
    doc.setTextColor(...colors.primary);
    doc.text(`${legNumber}`, spacing.margin + 2, currentY);
    
    doc.setFontSize(typography.smallSize);
    doc.setTextColor(...colors.textDark);
    const titleText = legTitle.length > 60 ? legTitle.substring(0, 57) + "..." : legTitle;
    doc.text(titleText, spacing.margin + 45, currentY);
    currentY += 8;
    
    doc.autoTable({
      startY: currentY,
      head: [["Artigo", "Requisito", "Estado", "Observações"]],
      body: reqs.map(req => [
        req.article || "-",
        req.text.length > 80 ? req.text.substring(0, 77) + "..." : req.text,
        getStatusLabel(req.status),
        req.notes ? (req.notes.length > 30 ? req.notes.substring(0, 27) + "..." : req.notes) : "-",
      ]),
      ...tableStyles,
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 90 },
        2: { cellWidth: 25 },
        3: { cellWidth: 35 },
      },
      margin: { left: spacing.margin, right: spacing.margin },
    });
    
    currentY = doc.lastAutoTable.finalY + spacing.itemGap;
  });
  
  addFooter(doc, data.organization.name);
  
  const fileName = `requisitos-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

export async function exportComplianceReportToPDF(data: ReportData): Promise<void> {
  const doc = new jsPDF();
  const { colors, typography, spacing } = PDF_THEME;
  const tableStyles = getTableStyles();
  
  // Load logo if available
  const logoBase64 = data.organization.logoUrl 
    ? await loadImageAsBase64(data.organization.logoUrl) 
    : null;
  
  addPDFHeader(doc, "Relatório de Conformidade Legal", data.organization.name, logoBase64);
  
  let currentY = addStatsBox(doc, data.stats, 58);
  
  // Action Plans Section
  if (data.actionPlans.length > 0) {
    currentY = addSectionTitle(doc, "Planos de Ação", currentY);
    
    doc.autoTable({
      startY: currentY,
      head: [["Ação", "Estado", "Responsável", "Prazo"]],
      body: data.actionPlans.map(plan => [
        plan.title,
        getStatusLabel(plan.status),
        plan.responsible || "-",
        formatDate(plan.dueDate),
      ]),
      ...tableStyles,
      margin: { left: spacing.margin, right: spacing.margin },
    });
    
    currentY = doc.lastAutoTable.finalY + spacing.sectionGap;
  }
  
  // Requirements by Legislation
  if (currentY > 250) {
    doc.addPage();
    currentY = 20;
  }
  currentY = addSectionTitle(doc, "Requisitos por Diploma", currentY);
  
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
    
    // Legislation header with accent
    doc.setFillColor(...colors.bgAccent);
    doc.rect(spacing.margin, currentY - 4, 170, 7, "F");
    
    doc.setFontSize(typography.bodySize);
    doc.setTextColor(...colors.primary);
    doc.text(legNumber, spacing.margin + 2, currentY);
    currentY += 6;
    
    doc.autoTable({
      startY: currentY,
      head: [["Artigo", "Requisito", "Estado"]],
      body: reqs.map(req => [
        req.article || "-",
        req.text.length > 100 ? req.text.substring(0, 97) + "..." : req.text,
        getStatusLabel(req.status),
      ]),
      ...tableStyles,
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 120 },
        2: { cellWidth: 30 },
      },
      margin: { left: spacing.margin, right: spacing.margin },
    });
    
    currentY = doc.lastAutoTable.finalY + spacing.itemGap;
  });
  
  addFooter(doc, data.organization.name);
  
  const fileName = `relatorio-conformidade-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}
