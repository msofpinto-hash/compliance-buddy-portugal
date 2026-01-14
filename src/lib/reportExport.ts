import { exportToExcel, SheetData, ColumnConfig } from './excelUtils';
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

export async function exportLegislationToExcel(data: ReportData): Promise<void> {
  const rows = data.legislation.map(leg => ({
    numero: leg.number,
    titulo: leg.title,
    dataPublicacao: formatDate(leg.publicationDate),
    dataVigencia: formatDate(leg.effectiveDate),
    origem: getSourceLabel(leg.source),
    entidade: leg.entity || "-",
    numRequisitos: leg.requirementsCount,
  }));

  const columns: ColumnConfig[] = [
    { header: "Número", key: "numero", width: 20 },
    { header: "Título", key: "titulo", width: 60 },
    { header: "Data Publicação", key: "dataPublicacao", width: 15 },
    { header: "Data Vigência", key: "dataVigencia", width: 15 },
    { header: "Origem", key: "origem", width: 12 },
    { header: "Entidade", key: "entidade", width: 30 },
    { header: "Nº Requisitos", key: "numRequisitos", width: 12 },
  ];

  const fileName = `legislacao-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
  await exportToExcel([{ name: "Legislação", columns, rows }], fileName);
}

export async function exportRequirementsToExcel(data: ReportData): Promise<void> {
  const reqRows = data.requirements.map(req => ({
    diploma: req.legislationNumber,
    tituloDiploma: req.legislationTitle,
    artigo: req.article || "-",
    requisito: req.text,
    estado: getStatusLabel(req.status),
    observacoes: req.notes || "-",
  }));

  const reqColumns: ColumnConfig[] = [
    { header: "Diploma", key: "diploma", width: 20 },
    { header: "Título Diploma", key: "tituloDiploma", width: 40 },
    { header: "Artigo", key: "artigo", width: 12 },
    { header: "Requisito", key: "requisito", width: 60 },
    { header: "Estado", key: "estado", width: 15 },
    { header: "Observações", key: "observacoes", width: 40 },
  ];

  const summaryRows = [
    { metrica: "Total Requisitos", valor: data.stats.totalRequirements },
    { metrica: "Conforme", valor: data.stats.conforme },
    { metrica: "Não Conforme", valor: data.stats.naoConforme },
    { metrica: "Em Avaliação", valor: data.stats.emCurso },
    { metrica: "Taxa Conformidade", valor: `${data.stats.complianceRate}%` },
  ];

  const summaryColumns: ColumnConfig[] = [
    { header: "Métrica", key: "metrica", width: 20 },
    { header: "Valor", key: "valor", width: 15 },
  ];

  const sheets: SheetData[] = [
    { name: "Requisitos", columns: reqColumns, rows: reqRows },
    { name: "Resumo", columns: summaryColumns, rows: summaryRows },
  ];

  const fileName = `requisitos-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
  await exportToExcel(sheets, fileName);
}

export async function exportActionPlansToExcel(data: ReportData): Promise<void> {
  const rows = data.actionPlans.map(plan => ({
    titulo: plan.title,
    descricao: plan.description || "-",
    estado: getStatusLabel(plan.status),
    responsavel: plan.responsible || "-",
    prazo: formatDate(plan.dueDate),
    requisito: plan.requirementText || "-",
  }));

  const columns: ColumnConfig[] = [
    { header: "Título", key: "titulo", width: 30 },
    { header: "Descrição", key: "descricao", width: 50 },
    { header: "Estado", key: "estado", width: 15 },
    { header: "Responsável", key: "responsavel", width: 20 },
    { header: "Prazo", key: "prazo", width: 15 },
    { header: "Requisito Associado", key: "requisito", width: 50 },
  ];

  const fileName = `planos-acao-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
  await exportToExcel([{ name: "Planos de Ação", columns, rows }], fileName);
}

export async function exportFullReportToExcel(data: ReportData): Promise<void> {
  const sheets: SheetData[] = [];

  // Summary sheet
  const summaryRows = [
    { metrica: "Organização", valor: data.organization.name },
    { metrica: "Data do Relatório", valor: new Date().toLocaleDateString("pt-PT") },
    { metrica: "", valor: "" },
    { metrica: "Total Diplomas", valor: data.stats.totalLegislation },
    { metrica: "Total Requisitos", valor: data.stats.totalRequirements },
    { metrica: "Conforme", valor: data.stats.conforme },
    { metrica: "Não Conforme", valor: data.stats.naoConforme },
    { metrica: "Em Avaliação", valor: data.stats.emCurso },
    { metrica: "Taxa Conformidade", valor: `${data.stats.complianceRate}%` },
  ];
  sheets.push({
    name: "Resumo",
    columns: [
      { header: "Métrica", key: "metrica", width: 25 },
      { header: "Valor", key: "valor", width: 30 },
    ],
    rows: summaryRows,
  });

  // Legislation sheet
  const legRows = data.legislation.map(leg => ({
    numero: leg.number,
    titulo: leg.title,
    dataPublicacao: formatDate(leg.publicationDate),
    origem: getSourceLabel(leg.source),
    numRequisitos: leg.requirementsCount,
  }));
  sheets.push({
    name: "Legislação",
    columns: [
      { header: "Número", key: "numero", width: 20 },
      { header: "Título", key: "titulo", width: 50 },
      { header: "Data Publicação", key: "dataPublicacao", width: 15 },
      { header: "Origem", key: "origem", width: 12 },
      { header: "Nº Requisitos", key: "numRequisitos", width: 12 },
    ],
    rows: legRows,
  });

  // Requirements sheet
  const reqRows = data.requirements.map(req => ({
    diploma: req.legislationNumber,
    artigo: req.article || "-",
    requisito: req.text,
    estado: getStatusLabel(req.status),
    observacoes: req.notes || "-",
  }));
  sheets.push({
    name: "Requisitos",
    columns: [
      { header: "Diploma", key: "diploma", width: 20 },
      { header: "Artigo", key: "artigo", width: 10 },
      { header: "Requisito", key: "requisito", width: 60 },
      { header: "Estado", key: "estado", width: 15 },
      { header: "Observações", key: "observacoes", width: 30 },
    ],
    rows: reqRows,
  });

  // Action Plans sheet
  if (data.actionPlans.length > 0) {
    const planRows = data.actionPlans.map(plan => ({
      titulo: plan.title,
      estado: getStatusLabel(plan.status),
      responsavel: plan.responsible || "-",
      prazo: formatDate(plan.dueDate),
    }));
    sheets.push({
      name: "Planos de Ação",
      columns: [
        { header: "Título", key: "titulo", width: 30 },
        { header: "Estado", key: "estado", width: 15 },
        { header: "Responsável", key: "responsavel", width: 20 },
        { header: "Prazo", key: "prazo", width: 15 },
      ],
      rows: planRows,
    });
  }

  const fileName = `relatorio-conformidade-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx`;
  await exportToExcel(sheets, fileName);
}

// ==================== PDF THEME CONFIGURATION ====================

// Premium corporate theme with emerald accent
export const PDF_THEME = {
  // Brand colors - Updated to corporate emerald palette
  colors: {
    primary: [16, 185, 129] as [number, number, number],      // Emerald - main accent
    secondary: [20, 184, 166] as [number, number, number],    // Teal - secondary accent
    success: [22, 163, 74] as [number, number, number],       // Green - compliant
    warning: [234, 179, 8] as [number, number, number],       // Yellow - in progress
    danger: [220, 38, 38] as [number, number, number],        // Red - non-compliant
    
    // Text colors
    textDark: [17, 24, 39] as [number, number, number],       // Headings
    textMuted: [107, 114, 128] as [number, number, number],   // Secondary text
    textLight: [156, 163, 175] as [number, number, number],   // Subtle text
    
    // Background colors
    bgLight: [249, 250, 251] as [number, number, number],     // Light background
    bgHeader: [236, 253, 245] as [number, number, number],    // Emerald tinted header
    bgAccent: [209, 250, 229] as [number, number, number],    // Accent background
    bgWarm: [255, 251, 235] as [number, number, number],      // Warm beige accent
    
    // Border colors
    border: [229, 231, 235] as [number, number, number],      // Light border
    borderAccent: [167, 243, 208] as [number, number, number], // Emerald border
  },
  
  // Typography settings
  typography: {
    // Font sizes in points
    titleSize: 24,
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
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  // Load logo if available
  const logoBase64 = data.organization.logoUrl 
    ? await loadImageAsBase64(data.organization.logoUrl) 
    : null;
  
  // ===== COVER PAGE =====
  
  // Decorative header bar
  doc.setFillColor(...colors.primary);
  doc.rect(0, 0, pageWidth, 50, "F");
  
  // Subtle gradient effect with secondary color
  doc.setFillColor(...colors.secondary);
  doc.rect(pageWidth - 80, 0, 80, 50, "F");
  
  // Logo on cover
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', spacing.margin, 60, 40, 40);
    } catch {}
  }
  
  // Title section
  const titleStartY = logoBase64 ? 115 : 80;
  
  doc.setFontSize(28);
  doc.setTextColor(...colors.textDark);
  doc.text("Relatório de", spacing.margin, titleStartY);
  
  doc.setFontSize(32);
  doc.setTextColor(...colors.primary);
  doc.text("Conformidade Legal", spacing.margin, titleStartY + 14);
  
  // Organization name
  doc.setFontSize(16);
  doc.setTextColor(...colors.textDark);
  doc.text(data.organization.name, spacing.margin, titleStartY + 35);
  
  // Description if available
  if (data.organization.description) {
    doc.setFontSize(typography.bodySize);
    doc.setTextColor(...colors.textMuted);
    const desc = data.organization.description.length > 100 
      ? data.organization.description.substring(0, 97) + "..." 
      : data.organization.description;
    doc.text(desc, spacing.margin, titleStartY + 45);
  }
  
  // Decorative line
  doc.setDrawColor(...colors.primary);
  doc.setLineWidth(2);
  doc.line(spacing.margin, titleStartY + 55, spacing.margin + 60, titleStartY + 55);
  
  // Date box
  const dateBoxY = titleStartY + 70;
  doc.setFillColor(...colors.bgWarm);
  doc.roundedRect(spacing.margin, dateBoxY, 80, 20, 3, 3, "F");
  doc.setFontSize(typography.smallSize);
  doc.setTextColor(...colors.textMuted);
  doc.text("Data do Relatório", spacing.margin + 5, dateBoxY + 8);
  doc.setFontSize(typography.bodySize);
  doc.setTextColor(...colors.textDark);
  doc.text(new Date().toLocaleDateString("pt-PT", { 
    day: "2-digit", 
    month: "long", 
    year: "numeric"
  }), spacing.margin + 5, dateBoxY + 15);
  
  // ===== SUMMARY STATS ON COVER =====
  const statsY = 180;
  
  // Stats background
  doc.setFillColor(...colors.bgLight);
  doc.roundedRect(spacing.margin, statsY, pageWidth - (spacing.margin * 2), 70, 4, 4, "F");
  
  doc.setFontSize(typography.headingSize);
  doc.setTextColor(...colors.primary);
  doc.text("Resumo Executivo", spacing.margin + 8, statsY + 12);
  
  // Stats grid
  const statsItems = [
    { label: "Diplomas", value: data.stats.totalLegislation.toString(), color: colors.primary },
    { label: "Requisitos", value: data.stats.totalRequirements.toString(), color: colors.secondary },
    { label: "Conforme", value: data.stats.conforme.toString(), color: colors.success },
    { label: "Não Conforme", value: data.stats.naoConforme.toString(), color: colors.danger },
    { label: "Em Avaliação", value: data.stats.emCurso.toString(), color: colors.warning },
  ];
  
  const boxWidth = 30;
  const boxStartX = spacing.margin + 8;
  const boxY = statsY + 22;
  
  statsItems.forEach((stat, index) => {
    const x = boxStartX + (index * (boxWidth + 5));
    
    // Value
    doc.setFontSize(20);
    doc.setTextColor(...stat.color);
    doc.text(stat.value, x + boxWidth / 2, boxY + 15, { align: "center" });
    
    // Label
    doc.setFontSize(typography.tinySize);
    doc.setTextColor(...colors.textMuted);
    doc.text(stat.label, x + boxWidth / 2, boxY + 24, { align: "center" });
  });
  
  // Compliance rate circle
  const circleX = pageWidth - 50;
  const circleY = statsY + 40;
  const circleRadius = 22;
  
  // Background circle
  doc.setFillColor(...colors.bgAccent);
  doc.circle(circleX, circleY, circleRadius, "F");
  
  // Percentage text
  doc.setFontSize(22);
  doc.setTextColor(...colors.primary);
  doc.text(`${data.stats.complianceRate}%`, circleX, circleY + 3, { align: "center" });
  
  doc.setFontSize(typography.tinySize);
  doc.setTextColor(...colors.textMuted);
  doc.text("Conformidade", circleX, circleY + 12, { align: "center" });
  
  // Footer on cover
  doc.setFillColor(...colors.bgHeader);
  doc.rect(0, pageHeight - 25, pageWidth, 25, "F");
  doc.setFontSize(typography.tinySize);
  doc.setTextColor(...colors.textLight);
  doc.text("Documento gerado automaticamente pela plataforma ID Compliance", pageWidth / 2, pageHeight - 10, { align: "center" });
  
  // ===== PAGE 2: ACTION PLANS =====
  if (data.actionPlans.length > 0) {
    doc.addPage();
    addPDFHeader(doc, "Planos de Ação", data.organization.name, logoBase64);
    
    let currentY = 65;
    
    // Summary box
    const planStats = {
      total: data.actionPlans.length,
      pending: data.actionPlans.filter(p => p.status === "pendente" || p.status === "pending").length,
      inProgress: data.actionPlans.filter(p => p.status === "em_curso" || p.status === "in_progress").length,
      completed: data.actionPlans.filter(p => p.status === "concluido" || p.status === "completed").length,
    };
    
    doc.setFillColor(...colors.bgWarm);
    doc.roundedRect(spacing.margin, currentY, pageWidth - (spacing.margin * 2), 20, 3, 3, "F");
    
    doc.setFontSize(typography.smallSize);
    doc.setTextColor(...colors.textMuted);
    doc.text(`Total: ${planStats.total}`, spacing.margin + 10, currentY + 12);
    doc.text(`Pendentes: ${planStats.pending}`, spacing.margin + 50, currentY + 12);
    doc.text(`Em Curso: ${planStats.inProgress}`, spacing.margin + 95, currentY + 12);
    doc.setTextColor(...colors.success);
    doc.text(`Concluídas: ${planStats.completed}`, spacing.margin + 135, currentY + 12);
    
    currentY += 30;
    
    doc.autoTable({
      startY: currentY,
      head: [["Ação", "Descrição", "Estado", "Responsável", "Prazo"]],
      body: data.actionPlans.map(plan => [
        plan.title.length > 30 ? plan.title.substring(0, 27) + "..." : plan.title,
        plan.description ? (plan.description.length > 40 ? plan.description.substring(0, 37) + "..." : plan.description) : "-",
        getStatusLabel(plan.status),
        plan.responsible || "-",
        formatDate(plan.dueDate),
      ]),
      ...getTableStyles(),
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 50 },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { cellWidth: 25 },
      },
      margin: { left: spacing.margin, right: spacing.margin },
      didParseCell: function(data: any) {
        if (data.section === 'body' && data.column.index === 2) {
          const status = data.cell.raw;
          if (status === "Conforme" || status === "Concluída" || status === "Concluído") {
            data.cell.styles.textColor = colors.success;
          } else if (status === "Não Conforme") {
            data.cell.styles.textColor = colors.danger;
          } else if (status === "Em Curso" || status === "Parcial") {
            data.cell.styles.textColor = colors.warning;
          }
        }
      },
    });
  }
  
  // ===== REQUIREMENTS BY LEGISLATION =====
  doc.addPage();
  addPDFHeader(doc, "Requisitos por Diploma", data.organization.name, logoBase64);
  
  let currentY = 65;
  
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
    if (currentY > pageHeight - 60) {
      doc.addPage();
      currentY = 30;
    }
    
    // Legislation header with emerald accent
    doc.setFillColor(...colors.bgAccent);
    doc.roundedRect(spacing.margin, currentY - 4, pageWidth - (spacing.margin * 2), 12, 2, 2, "F");
    
    doc.setFontSize(typography.bodySize);
    doc.setTextColor(...colors.primary);
    doc.text(legNumber, spacing.margin + 3, currentY + 3);
    
    doc.setFontSize(typography.smallSize);
    doc.setTextColor(...colors.textDark);
    const titleText = legTitle.length > 70 ? legTitle.substring(0, 67) + "..." : legTitle;
    doc.text(titleText, spacing.margin + 45, currentY + 3);
    
    currentY += 14;
    
    doc.autoTable({
      startY: currentY,
      head: [["Art.", "Requisito", "Estado", "Observações"]],
      body: reqs.map(req => [
        req.article || "-",
        req.text.length > 70 ? req.text.substring(0, 67) + "..." : req.text,
        getStatusLabel(req.status),
        req.notes ? (req.notes.length > 25 ? req.notes.substring(0, 22) + "..." : req.notes) : "-",
      ]),
      ...getTableStyles(),
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 90 },
        2: { cellWidth: 22, halign: "center" as const },
        3: { cellWidth: 38 },
      },
      margin: { left: spacing.margin, right: spacing.margin },
      didParseCell: function(data: any) {
        if (data.section === 'body' && data.column.index === 2) {
          const status = data.cell.raw;
          if (status === "Conforme") {
            data.cell.styles.textColor = colors.success;
            data.cell.styles.fontStyle = 'bold';
          } else if (status === "Não Conforme") {
            data.cell.styles.textColor = colors.danger;
            data.cell.styles.fontStyle = 'bold';
          } else if (status === "Parcial") {
            data.cell.styles.textColor = colors.warning;
          }
        }
      },
    });
    
    currentY = doc.lastAutoTable.finalY + spacing.itemGap + 4;
  });
  
  addFooter(doc, data.organization.name);
  
  const fileName = `relatorio-conformidade-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// ==================== EXECUTIVE SUMMARY PDF (1 PAGE) ====================

export async function exportExecutiveSummaryToPDF(data: ReportData): Promise<void> {
  const doc = new jsPDF();
  const { colors, typography, spacing } = PDF_THEME;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  // Load logo if available
  const logoBase64 = data.organization.logoUrl 
    ? await loadImageAsBase64(data.organization.logoUrl) 
    : null;
  
  // ===== HEADER BAR =====
  doc.setFillColor(...colors.primary);
  doc.rect(0, 0, pageWidth, 35, "F");
  
  // Gradient effect
  doc.setFillColor(...colors.secondary);
  doc.rect(pageWidth - 60, 0, 60, 35, "F");
  
  // Logo on header
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', spacing.margin, 5, 25, 25);
    } catch {}
  }
  
  // Title on header
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("Relatório Executivo", logoBase64 ? spacing.margin + 32 : spacing.margin, 18);
  
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("Conformidade Legal", logoBase64 ? spacing.margin + 32 : spacing.margin, 27);
  
  // Date on right
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(new Date().toLocaleDateString("pt-PT", { 
    day: "2-digit", 
    month: "short", 
    year: "numeric"
  }), pageWidth - spacing.margin, 20, { align: "right" });
  
  // ===== ORGANIZATION INFO =====
  let currentY = 45;
  
  doc.setFontSize(18);
  doc.setTextColor(...colors.textDark);
  doc.text(data.organization.name, spacing.margin, currentY);
  
  if (data.organization.description) {
    currentY += 7;
    doc.setFontSize(9);
    doc.setTextColor(...colors.textMuted);
    const desc = data.organization.description.length > 120 
      ? data.organization.description.substring(0, 117) + "..." 
      : data.organization.description;
    doc.text(desc, spacing.margin, currentY);
  }
  
  // ===== MAIN STATS SECTION =====
  currentY += 12;
  
  // Stats container
  const statsContainerHeight = 50;
  doc.setFillColor(...colors.bgLight);
  doc.roundedRect(spacing.margin, currentY, pageWidth - (spacing.margin * 2), statsContainerHeight, 4, 4, "F");
  
  // Border accent
  doc.setDrawColor(...colors.primary);
  doc.setLineWidth(1.5);
  doc.line(spacing.margin, currentY, spacing.margin, currentY + statsContainerHeight);
  
  const statsY = currentY + 8;
  
  // Large compliance rate
  const rateX = spacing.margin + 12;
  const rateSize = 36;
  doc.setFillColor(...colors.bgAccent);
  doc.circle(rateX + 18, statsY + 17, 20, "F");
  
  doc.setFontSize(24);
  doc.setTextColor(...colors.primary);
  doc.text(`${data.stats.complianceRate}%`, rateX + 18, statsY + 20, { align: "center" });
  
  doc.setFontSize(7);
  doc.setTextColor(...colors.textMuted);
  doc.text("Conformidade", rateX + 18, statsY + 28, { align: "center" });
  
  // Stats items
  const statsStartX = rateX + 50;
  const statWidth = 30;
  
  const statsItems = [
    { label: "Diplomas", value: data.stats.totalLegislation.toString(), color: colors.primary },
    { label: "Requisitos", value: data.stats.totalRequirements.toString(), color: colors.secondary },
    { label: "Conforme", value: data.stats.conforme.toString(), color: colors.success },
    { label: "Não Conforme", value: data.stats.naoConforme.toString(), color: colors.danger },
    { label: "Em Avaliação", value: data.stats.emCurso.toString(), color: colors.warning },
  ];
  
  statsItems.forEach((stat, index) => {
    const x = statsStartX + (index * (statWidth + 4));
    
    doc.setFontSize(18);
    doc.setTextColor(...stat.color);
    doc.text(stat.value, x + statWidth / 2, statsY + 17, { align: "center" });
    
    doc.setFontSize(7);
    doc.setTextColor(...colors.textMuted);
    doc.text(stat.label, x + statWidth / 2, statsY + 26, { align: "center" });
  });
  
  currentY += statsContainerHeight + 10;
  
  // ===== TWO COLUMN LAYOUT =====
  const colWidth = (pageWidth - (spacing.margin * 2) - 8) / 2;
  const col1X = spacing.margin;
  const col2X = spacing.margin + colWidth + 8;
  
  // ===== LEFT COLUMN: TOP LEGISLATION =====
  doc.setFontSize(11);
  doc.setTextColor(...colors.primary);
  doc.text("Principais Diplomas", col1X, currentY);
  
  doc.setDrawColor(...colors.borderAccent);
  doc.setLineWidth(0.5);
  doc.line(col1X, currentY + 2, col1X + 50, currentY + 2);
  
  currentY += 8;
  
  // Show top 5 legislation
  const topLegislation = data.legislation.slice(0, 5);
  topLegislation.forEach((leg, index) => {
    // Background
    if (index % 2 === 0) {
      doc.setFillColor(...colors.bgLight);
      doc.rect(col1X, currentY - 3, colWidth, 10, "F");
    }
    
    doc.setFontSize(8);
    doc.setTextColor(...colors.primary);
    doc.text(leg.number, col1X + 2, currentY + 2);
    
    doc.setFontSize(7);
    doc.setTextColor(...colors.textDark);
    const title = leg.title.length > 35 ? leg.title.substring(0, 32) + "..." : leg.title;
    doc.text(title, col1X + 2, currentY + 7);
    
    currentY += 10;
  });
  
  if (data.legislation.length > 5) {
    doc.setFontSize(7);
    doc.setTextColor(...colors.textLight);
    doc.text(`+ ${data.legislation.length - 5} diplomas`, col1X + 2, currentY + 2);
  }
  
  // ===== RIGHT COLUMN: ACTION PLANS =====
  let rightY = currentY - (topLegislation.length * 10) - 8;
  
  doc.setFontSize(11);
  doc.setTextColor(...colors.primary);
  doc.text("Planos de Ação", col2X, rightY);
  
  doc.setDrawColor(...colors.borderAccent);
  doc.line(col2X, rightY + 2, col2X + 45, rightY + 2);
  
  rightY += 8;
  
  if (data.actionPlans.length > 0) {
    // Action plan stats
    const planStats = {
      pending: data.actionPlans.filter(p => p.status === "pendente" || p.status === "pending").length,
      inProgress: data.actionPlans.filter(p => p.status === "em_curso" || p.status === "in_progress").length,
      completed: data.actionPlans.filter(p => p.status === "concluido" || p.status === "completed").length,
    };
    
    // Summary bar
    doc.setFillColor(...colors.bgWarm);
    doc.roundedRect(col2X, rightY - 3, colWidth, 12, 2, 2, "F");
    
    doc.setFontSize(8);
    doc.setTextColor(...colors.textMuted);
    doc.text(`${data.actionPlans.length} ações`, col2X + 4, rightY + 4);
    
    doc.setTextColor(...colors.danger);
    doc.text(`${planStats.pending} pend.`, col2X + 30, rightY + 4);
    
    doc.setTextColor(...colors.warning);
    doc.text(`${planStats.inProgress} curso`, col2X + 52, rightY + 4);
    
    doc.setTextColor(...colors.success);
    doc.text(`${planStats.completed} concl.`, col2X + 72, rightY + 4);
    
    rightY += 14;
    
    // Show top 4 action plans
    const topPlans = data.actionPlans.slice(0, 4);
    topPlans.forEach((plan, index) => {
      const statusColor = 
        plan.status === "concluido" || plan.status === "completed" ? colors.success :
        plan.status === "em_curso" || plan.status === "in_progress" ? colors.warning :
        colors.textMuted;
      
      // Status indicator
      doc.setFillColor(...statusColor);
      doc.circle(col2X + 3, rightY + 2, 2, "F");
      
      doc.setFontSize(8);
      doc.setTextColor(...colors.textDark);
      const title = plan.title.length > 32 ? plan.title.substring(0, 29) + "..." : plan.title;
      doc.text(title, col2X + 8, rightY + 3);
      
      if (plan.dueDate) {
        doc.setFontSize(6);
        doc.setTextColor(...colors.textLight);
        doc.text(formatDate(plan.dueDate), col2X + 8, rightY + 8);
      }
      
      rightY += 11;
    });
    
    if (data.actionPlans.length > 4) {
      doc.setFontSize(7);
      doc.setTextColor(...colors.textLight);
      doc.text(`+ ${data.actionPlans.length - 4} ações`, col2X + 4, rightY + 2);
    }
  } else {
    doc.setFontSize(8);
    doc.setTextColor(...colors.textMuted);
    doc.text("Sem planos de ação ativos", col2X + 2, rightY + 3);
  }
  
  // ===== BOTTOM SECTION: COMPLIANCE BY STATUS =====
  const bottomY = Math.max(currentY, rightY) + 15;
  
  // Compliance breakdown bar
  doc.setFontSize(11);
  doc.setTextColor(...colors.primary);
  doc.text("Distribuição de Conformidade", spacing.margin, bottomY);
  
  doc.setDrawColor(...colors.borderAccent);
  doc.line(spacing.margin, bottomY + 2, spacing.margin + 70, bottomY + 2);
  
  const barY = bottomY + 10;
  const barWidth = pageWidth - (spacing.margin * 2);
  const barHeight = 16;
  
  // Background
  doc.setFillColor(...colors.bgLight);
  doc.roundedRect(spacing.margin, barY, barWidth, barHeight, 3, 3, "F");
  
  // Calculate widths
  const total = data.stats.totalRequirements || 1;
  const conformeWidth = (data.stats.conforme / total) * barWidth;
  const naoConformeWidth = (data.stats.naoConforme / total) * barWidth;
  const emCursoWidth = (data.stats.emCurso / total) * barWidth;
  
  let barX = spacing.margin;
  
  // Conforme bar
  if (conformeWidth > 0) {
    doc.setFillColor(...colors.success);
    doc.roundedRect(barX, barY, conformeWidth, barHeight, 3, 3, "F");
    
    if (conformeWidth > 25) {
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(`${Math.round((data.stats.conforme / total) * 100)}%`, barX + conformeWidth / 2, barY + 10, { align: "center" });
    }
    barX += conformeWidth;
  }
  
  // Em Curso bar
  if (emCursoWidth > 0) {
    doc.setFillColor(...colors.warning);
    doc.rect(barX, barY, emCursoWidth, barHeight, "F");
    
    if (emCursoWidth > 25) {
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(`${Math.round((data.stats.emCurso / total) * 100)}%`, barX + emCursoWidth / 2, barY + 10, { align: "center" });
    }
    barX += emCursoWidth;
  }
  
  // Não Conforme bar
  if (naoConformeWidth > 0) {
    doc.setFillColor(...colors.danger);
    doc.roundedRect(barX, barY, naoConformeWidth, barHeight, 3, 3, "F");
    
    if (naoConformeWidth > 25) {
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text(`${Math.round((data.stats.naoConforme / total) * 100)}%`, barX + naoConformeWidth / 2, barY + 10, { align: "center" });
    }
  }
  
  // Legend
  const legendY = barY + barHeight + 8;
  const legendItems = [
    { label: "Conforme", color: colors.success, value: data.stats.conforme },
    { label: "Em Avaliação", color: colors.warning, value: data.stats.emCurso },
    { label: "Não Conforme", color: colors.danger, value: data.stats.naoConforme },
  ];
  
  let legendX = spacing.margin;
  legendItems.forEach((item) => {
    doc.setFillColor(...item.color);
    doc.circle(legendX + 3, legendY, 3, "F");
    
    doc.setFontSize(8);
    doc.setTextColor(...colors.textDark);
    doc.text(`${item.label} (${item.value})`, legendX + 8, legendY + 2);
    
    legendX += 55;
  });
  
  // ===== FOOTER =====
  doc.setFillColor(...colors.bgHeader);
  doc.rect(0, pageHeight - 20, pageWidth, 20, "F");
  
  doc.setFontSize(7);
  doc.setTextColor(...colors.textLight);
  doc.text("Documento gerado automaticamente pela plataforma ID Compliance", pageWidth / 2, pageHeight - 10, { align: "center" });
  
  doc.setTextColor(...colors.textMuted);
  doc.text(data.organization.name, spacing.margin, pageHeight - 10);
  doc.text("Página 1 de 1", pageWidth - spacing.margin, pageHeight - 10, { align: "right" });
  
  const fileName = `resumo-executivo-${data.organization.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}
