import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReportType = "compliance" | "legislation" | "requirements" | "audit";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "conforme": return "Conforme";
    case "compliant": return "Conforme";
    case "nao_conforme": return "Não Conforme";
    case "non_compliant": return "Não Conforme";
    case "partial": return "Parcial";
    case "em_curso": return "Em Avaliação";
    case "pending": return "Pendente";
    case "pendente": return "Pendente";
    case "concluido": return "Concluído";
    case "planned": return "Planeada";
    case "in_progress": return "Em Curso";
    case "completed": return "Concluída";
    case "cancelled": return "Cancelada";
    default: return status || "Pendente";
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "conforme": return "#16a34a";
    case "compliant": return "#16a34a";
    case "completed": return "#16a34a";
    case "concluido": return "#16a34a";
    case "nao_conforme": return "#dc2626";
    case "non_compliant": return "#dc2626";
    case "cancelled": return "#6b7280";
    case "partial": return "#f59e0b";
    case "em_curso": return "#ca8a04";
    case "in_progress": return "#ca8a04";
    case "planned": return "#3b82f6";
    case "pending": return "#6b7280";
    default: return "#6b7280";
  }
}

function getBaseStyles(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1f2937;
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .header h1 { font-size: 24px; color: #111827; }
    .header .org-name { font-size: 16px; color: #6b7280; margin-top: 5px; }
    .header .date { text-align: right; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
    th, td { padding: 8px 10px; text-align: left; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; }
    .status-badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      color: white; font-size: 9px; font-weight: 500;
    }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .stat-card { padding: 15px; border-radius: 8px; text-align: center; background: #f9fafb; border: 1px solid #e5e7eb; }
    .stat-card .value { font-size: 24px; font-weight: bold; }
    .stat-card .label { font-size: 10px; color: #6b7280; text-transform: uppercase; }
    .stat-card.green { background: #dcfce7; border-color: #86efac; }
    .stat-card.green .value { color: #16a34a; }
    .stat-card.yellow { background: #fef9c3; border-color: #fde047; }
    .stat-card.yellow .value { color: #ca8a04; }
    .stat-card.red { background: #fee2e2; border-color: #fca5a5; }
    .stat-card.red .value { color: #dc2626; }
    .stat-card.blue { background: #dbeafe; border-color: #93c5fd; }
    .stat-card.blue .value { color: #2563eb; }
    h2 { font-size: 18px; margin: 30px 0 15px 0; padding-bottom: 10px; border-bottom: 1px solid #e5e7eb; }
    h3 { font-size: 13px; margin: 20px 0 10px 0; color: #374151; }
    .legislation-section { margin-bottom: 25px; page-break-inside: avoid; }
    .no-data { color: #9ca3af; font-style: italic; padding: 15px; text-align: center; background: #f9fafb; border-radius: 4px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 9px; }
    .audit-header-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .audit-info-item { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .audit-info-label { color: #6b7280; font-weight: 500; }
    .findings-box { background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 15px; margin-top: 20px; }
    .recommendations-box { background: #dbeafe; border: 1px solid #93c5fd; border-radius: 8px; padding: 15px; margin-top: 15px; }
    @media print { body { padding: 20px; } .legislation-section { page-break-inside: avoid; } }
  `;
}

// Generate Legislation List Report
function generateLegislationReport(data: any): string {
  return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Lista de Legislação Aplicável - ${escapeHtml(data.organization.name)}</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Lista de Legislação Aplicável</h1>
      <div class="org-name">${escapeHtml(data.organization.name)}</div>
    </div>
    <div class="date">
      <strong>Data de Geração</strong><br/>
      ${data.generatedAt}
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card blue">
      <div class="value">${data.legislation.length}</div>
      <div class="label">Total de Diplomas</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 15%">Número</th>
        <th style="width: 50%">Título</th>
        <th style="width: 15%">Publicação</th>
        <th style="width: 10%">Requisitos</th>
        <th style="width: 10%">Origem</th>
      </tr>
    </thead>
    <tbody>
      ${data.legislation.map((leg: any) => `
        <tr>
          <td><strong>${escapeHtml(leg.number)}</strong></td>
          <td>${escapeHtml(leg.title)}</td>
          <td>${formatDate(leg.publicationDate)}</td>
          <td>${leg.requirementsCount}</td>
          <td>${leg.source === "dre" ? "DRE" : leg.source === "eurlex" ? "EUR-Lex" : "Manual"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="footer">
    Lista gerada automaticamente pelo Sistema de Gestão de Conformidade Legal
  </div>
</body>
</html>
  `;
}

// Generate Requirements List Report
function generateRequirementsReport(data: any): string {
  return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Lista de Requisitos Legais - ${escapeHtml(data.organization.name)}</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Lista de Requisitos Legais Aplicáveis</h1>
      <div class="org-name">${escapeHtml(data.organization.name)}</div>
    </div>
    <div class="date">
      <strong>Data de Geração</strong><br/>
      ${data.generatedAt}
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="value">${data.stats.total}</div>
      <div class="label">Total</div>
    </div>
    <div class="stat-card green">
      <div class="value">${data.stats.conforme}</div>
      <div class="label">Conforme</div>
    </div>
    <div class="stat-card yellow">
      <div class="value">${data.stats.emCurso}</div>
      <div class="label">Em Avaliação</div>
    </div>
    <div class="stat-card red">
      <div class="value">${data.stats.naoConforme}</div>
      <div class="label">Não Conforme</div>
    </div>
  </div>

  ${data.groupedRequirements.map((group: any) => `
    <div class="legislation-section">
      <h3>${escapeHtml(group.legislationNumber)} - ${escapeHtml(group.legislationTitle)}</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 10%">Artigo</th>
            <th style="width: 50%">Requisito</th>
            <th style="width: 15%">Estado</th>
            <th style="width: 25%">Observações</th>
          </tr>
        </thead>
        <tbody>
          ${group.requirements.map((req: any) => `
            <tr>
              <td>${escapeHtml(req.article || "-")}</td>
              <td>${escapeHtml(req.text)}</td>
              <td><span class="status-badge" style="background-color: ${getStatusColor(req.status)}">${getStatusLabel(req.status)}</span></td>
              <td>${escapeHtml(req.notes || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `).join("")}

  <div class="footer">
    Lista gerada automaticamente pelo Sistema de Gestão de Conformidade Legal
  </div>
</body>
</html>
  `;
}

// Generate Full Compliance Report
function generateComplianceReport(data: any): string {
  const actionPlansHtml = data.actionPlans.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Ação</th>
          <th>Estado</th>
          <th>Responsável</th>
          <th>Prazo</th>
          <th>Requisito</th>
        </tr>
      </thead>
      <tbody>
        ${data.actionPlans.map((plan: any) => `
          <tr>
            <td>
              <strong>${escapeHtml(plan.title)}</strong>
              ${plan.description ? `<br/><small>${escapeHtml(plan.description)}</small>` : ""}
            </td>
            <td><span class="status-badge" style="background-color: ${getStatusColor(plan.status)}">${getStatusLabel(plan.status)}</span></td>
            <td>${escapeHtml(plan.responsible || "-")}</td>
            <td>${formatDate(plan.dueDate)}</td>
            <td>${escapeHtml(plan.requirement || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : "<p class='no-data'>Sem planos de ação definidos</p>";

  return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Conformidade - ${escapeHtml(data.organization.name)}</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório de Conformidade Legal</h1>
      <div class="org-name">${escapeHtml(data.organization.name)}</div>
    </div>
    <div class="date">
      <strong>Data de Geração</strong><br/>
      ${data.generatedAt}
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="value">${data.stats.totalLegislation}</div>
      <div class="label">Diplomas</div>
    </div>
    <div class="stat-card">
      <div class="value">${data.stats.totalRequirements}</div>
      <div class="label">Requisitos</div>
    </div>
    <div class="stat-card green">
      <div class="value">${data.stats.conforme}</div>
      <div class="label">Conforme</div>
    </div>
    <div class="stat-card yellow">
      <div class="value">${data.stats.emCurso}</div>
      <div class="label">Em Avaliação</div>
    </div>
    <div class="stat-card red">
      <div class="value">${data.stats.naoConforme}</div>
      <div class="label">Não Conforme</div>
    </div>
    <div class="stat-card blue">
      <div class="value">${data.stats.complianceRate}%</div>
      <div class="label">Conformidade</div>
    </div>
  </div>

  <h2>Planos de Ação</h2>
  ${actionPlansHtml}

  <h2>Diplomas e Requisitos Aplicáveis</h2>
  ${data.groupedRequirements.map((group: any) => `
    <div class="legislation-section">
      <h3>${escapeHtml(group.legislationNumber)} - ${escapeHtml(group.legislationTitle)}</h3>
      ${group.requirements.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Artigo</th>
              <th>Requisito</th>
              <th>Estado</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${group.requirements.map((req: any) => `
              <tr>
                <td>${escapeHtml(req.article || "-")}</td>
                <td>${escapeHtml(req.text)}</td>
                <td><span class="status-badge" style="background-color: ${getStatusColor(req.status)}">${getStatusLabel(req.status)}</span></td>
                <td>${escapeHtml(req.notes || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : "<p class='no-data'>Sem requisitos definidos</p>"}
    </div>
  `).join("")}

  <div class="footer">
    Relatório gerado automaticamente pelo Sistema de Gestão de Conformidade Legal
  </div>
</body>
</html>
  `;
}

// Generate Audit Report
function generateAuditReport(data: any): string {
  const complianceStats = {
    compliant: data.requirements.filter((r: any) => r.compliance_status === "compliant").length,
    nonCompliant: data.requirements.filter((r: any) => r.compliance_status === "non_compliant").length,
    partial: data.requirements.filter((r: any) => r.compliance_status === "partial").length,
    pending: data.requirements.filter((r: any) => !r.compliance_status || r.compliance_status === "pending").length,
  };
  const total = data.requirements.length;
  const complianceRate = total > 0 ? Math.round((complianceStats.compliant / total) * 100) : 0;

  return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Auditoria - ${escapeHtml(data.audit.title)}</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório de Auditoria</h1>
      <div class="org-name">${escapeHtml(data.audit.title)}</div>
    </div>
    <div class="date">
      <strong>Data de Geração</strong><br/>
      ${data.generatedAt}
    </div>
  </div>

  <div class="audit-header-info">
    <div>
      <div class="audit-info-item">
        <span class="audit-info-label">Organização:</span>
        <span>${escapeHtml(data.organization.name)}</span>
      </div>
      <div class="audit-info-item">
        <span class="audit-info-label">Estado:</span>
        <span class="status-badge" style="background-color: ${getStatusColor(data.audit.status)}">${getStatusLabel(data.audit.status)}</span>
      </div>
    </div>
    <div>
      ${data.audit.auditor ? `
        <div class="audit-info-item">
          <span class="audit-info-label">Auditor:</span>
          <span>${escapeHtml(data.audit.auditor)}</span>
        </div>
      ` : ""}
      ${data.audit.audit_date ? `
        <div class="audit-info-item">
          <span class="audit-info-label">Data da Auditoria:</span>
          <span>${formatDate(data.audit.audit_date)}</span>
        </div>
      ` : ""}
    </div>
  </div>

  ${data.audit.description ? `<p style="margin-bottom: 20px; color: #4b5563;">${escapeHtml(data.audit.description)}</p>` : ""}

  ${data.audit.executive_summary ? `
    <h2>Sumário Executivo</h2>
    <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
      <p style="white-space: pre-wrap;">${escapeHtml(data.audit.executive_summary)}</p>
    </div>
  ` : ""}

  ${data.audit.interlocutors ? `
    <h2>Interlocutores</h2>
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
      <p style="white-space: pre-wrap;">${escapeHtml(data.audit.interlocutors)}</p>
    </div>
  ` : ""}

  ${data.audit.methodology ? `
    <h2>Metodologia de Trabalho</h2>
    <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
      <p style="white-space: pre-wrap;">${escapeHtml(data.audit.methodology)}</p>
    </div>
  ` : ""}

  <div class="stats-grid">
    <div class="stat-card">
      <div class="value">${total}</div>
      <div class="label">Total Requisitos</div>
    </div>
    <div class="stat-card green">
      <div class="value">${complianceStats.compliant}</div>
      <div class="label">Conforme</div>
    </div>
    <div class="stat-card yellow">
      <div class="value">${complianceStats.partial}</div>
      <div class="label">Parcial</div>
    </div>
    <div class="stat-card red">
      <div class="value">${complianceStats.nonCompliant}</div>
      <div class="label">Não Conforme</div>
    </div>
    <div class="stat-card">
      <div class="value">${complianceStats.pending}</div>
      <div class="label">Pendente</div>
    </div>
    <div class="stat-card blue">
      <div class="value">${complianceRate}%</div>
      <div class="label">Taxa Conformidade</div>
    </div>
  </div>

  ${(data.audit.strengths || data.audit.weaknesses) ? `
    <h2>Análise SWOT</h2>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
      ${data.audit.strengths ? `
        <div style="background: #dcfce7; border: 1px solid #86efac; border-radius: 8px; padding: 15px;">
          <strong style="color: #16a34a;">Pontos Fortes</strong>
          <p style="margin-top: 8px; white-space: pre-wrap;">${escapeHtml(data.audit.strengths)}</p>
        </div>
      ` : "<div></div>"}
      ${data.audit.weaknesses ? `
        <div style="background: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 15px;">
          <strong style="color: #dc2626;">Pontos Fracos</strong>
          <p style="margin-top: 8px; white-space: pre-wrap;">${escapeHtml(data.audit.weaknesses)}</p>
        </div>
      ` : "<div></div>"}
    </div>
  ` : ""}

  ${data.audit.findings ? `
    <div class="findings-box">
      <strong>Constatações Gerais</strong>
      <p style="margin-top: 8px; white-space: pre-wrap;">${escapeHtml(data.audit.findings)}</p>
    </div>
  ` : ""}

  ${data.audit.recommendations ? `
    <div class="recommendations-box">
      <strong>Recomendações</strong>
      <p style="margin-top: 8px; white-space: pre-wrap;">${escapeHtml(data.audit.recommendations)}</p>
    </div>
  ` : ""}

  <h2>Requisitos Auditados</h2>
  ${data.groupedRequirements.length > 0 ? data.groupedRequirements.map((group: any) => `
    <div class="legislation-section">
      <h3>${escapeHtml(group.legislationNumber)} - ${escapeHtml(group.legislationTitle)}</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 8%">Artigo</th>
            <th style="width: 28%">Requisito</th>
            <th style="width: 10%">Aplicab.</th>
            <th style="width: 10%">Conform.</th>
            <th style="width: 14%">Evidência</th>
            <th style="width: 14%">Constatações</th>
            <th style="width: 16%">Documentos</th>
          </tr>
        </thead>
        <tbody>
          ${group.requirements.map((req: any) => `
            <tr>
              <td>${escapeHtml(req.article || "-")}</td>
              <td>${escapeHtml(req.text)}</td>
              <td>${escapeHtml(req.applicability_type || "-")}</td>
              <td><span class="status-badge" style="background-color: ${getStatusColor(req.compliance_status)}">${getStatusLabel(req.compliance_status || "pending")}</span></td>
              <td>${escapeHtml(req.evidence || "-")}</td>
              <td>${escapeHtml(req.findings || "-")}</td>
              <td>${req.documents && req.documents.length > 0 
                ? req.documents.map((doc: any) => 
                    doc.file_url 
                      ? `<a href="${escapeHtml(doc.file_url)}" target="_blank" style="color: #2563eb; text-decoration: underline; display: block; font-size: 9px; margin-bottom: 2px;">📎 ${escapeHtml(doc.name)}</a>`
                      : `<span style="font-size: 9px;">📎 ${escapeHtml(doc.name)}</span>`
                  ).join("")
                : "-"
              }</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `).join("") : "<p class='no-data'>Nenhum requisito incluído nesta auditoria</p>"}

  <div class="footer">
    Relatório de Auditoria gerado automaticamente pelo Sistema de Gestão de Conformidade Legal
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organizationId, reportType = "compliance", auditId } = await req.json();

    // Validate inputs based on report type
    if (reportType === "audit") {
      if (!auditId) {
        return new Response(
          JSON.stringify({ error: "auditId is required for audit reports" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      if (!organizationId) {
        return new Response(
          JSON.stringify({ error: "organizationId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Generating ${reportType} report${auditId ? ` for audit: ${auditId}` : ` for organization: ${organizationId}`}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const generatedAt = new Date().toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Handle audit report separately
    if (reportType === "audit") {
      // Fetch audit with details
      const { data: audit, error: auditError } = await supabase
        .from("audits")
        .select(`
          *,
          organizations(id, name),
          audit_requirements(
            *,
            legal_requirements(id, article, requirement_text),
            legislation(id, number, title)
          )
        `)
        .eq("id", auditId)
        .single();

      if (auditError || !audit) {
        console.error("Error fetching audit:", auditError);
        return new Response(
          JSON.stringify({ error: "Audit not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch linked documents for each audit requirement
      const requirementIds = audit.audit_requirements?.map((ar: any) => ar.id) || [];
      let documentsMap = new Map<string, any[]>();
      
      if (requirementIds.length > 0) {
        const { data: linkedDocs, error: docsError } = await supabase
          .from("audit_requirement_documents")
          .select(`
            audit_requirement_id,
            documents(id, name, file_url, category)
          `)
          .in("audit_requirement_id", requirementIds);

        if (!docsError && linkedDocs) {
          linkedDocs.forEach((ld: any) => {
            if (!documentsMap.has(ld.audit_requirement_id)) {
              documentsMap.set(ld.audit_requirement_id, []);
            }
            if (ld.documents) {
              documentsMap.get(ld.audit_requirement_id)!.push(ld.documents);
            }
          });
        }
      }

      // Group requirements by legislation
      const legMap = new Map<string, any>();
      audit.audit_requirements?.forEach((ar: any) => {
        const legId = ar.legislation_id;
        if (!legMap.has(legId)) {
          legMap.set(legId, {
            legislationNumber: ar.legislation?.number || "N/A",
            legislationTitle: ar.legislation?.title || "N/A",
            requirements: [],
          });
        }
        legMap.get(legId).requirements.push({
          article: ar.legal_requirements?.article,
          text: ar.legal_requirements?.requirement_text || "",
          applicability_type: ar.applicability_type,
          compliance_status: ar.compliance_status,
          evidence: ar.evidence,
          findings: ar.findings,
          documents: documentsMap.get(ar.id) || [],
        });
      });

      const groupedRequirements: any[] = [];
      legMap.forEach((value) => groupedRequirements.push(value));

      const auditData = {
        audit: {
          title: audit.title,
          description: audit.description,
          status: audit.status,
          auditor: audit.auditor,
          audit_date: audit.audit_date,
          findings: audit.findings,
          recommendations: audit.recommendations,
          interlocutors: audit.interlocutors,
          methodology: audit.methodology,
          strengths: audit.strengths,
          weaknesses: audit.weaknesses,
          executive_summary: audit.executive_summary,
        },
        organization: { name: audit.organizations?.name || "N/A" },
        generatedAt,
        requirements: audit.audit_requirements || [],
        groupedRequirements,
      };

      const html = generateAuditReport(auditData);
      const filename = `relatorio-auditoria-${audit.title.replace(/[^a-zA-Z0-9]/g, "-")}.html`;

      console.log(`Audit report generated: ${filename}`);

      return new Response(html, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // Fetch organization for other report types
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single();

    if (orgError || !organization) {
      console.error("Error fetching organization:", orgError);
      return new Response(
        JSON.stringify({ error: "Organization not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch assigned legislation with details
    const { data: orgLegislation, error: legError } = await supabase
      .from("organization_legislation")
      .select(`
        legislation_id,
        legislation(id, number, title, publication_date, source)
      `)
      .eq("organization_id", organizationId);

    if (legError) throw legError;

    const legislationIds = orgLegislation?.map((ol: any) => ol.legislation_id) || [];

    // Fetch requirements for this legislation
    const { data: requirements, error: reqError } = await supabase
      .from("legal_requirements")
      .select(`
        id,
        legislation_id,
        article,
        requirement_text,
        legislation(number, title)
      `)
      .in("legislation_id", legislationIds.length > 0 ? legislationIds : ["00000000-0000-0000-0000-000000000000"])
      .order("legislation_id")
      .order("article");

    if (reqError) throw reqError;

    // Fetch applicabilities
    const { data: applicabilities, error: appError } = await supabase
      .from("applicabilities")
      .select("*")
      .eq("organization_id", organizationId);

    if (appError) throw appError;

    // Fetch action plans
    const { data: actionPlans, error: apError } = await supabase
      .from("action_plans")
      .select(`*, legal_requirements(article, legislation(number))`)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (apError) throw apError;

    // Build applicabilities map
    const appMap = new Map<string, any>();
    applicabilities?.forEach((app: any) => {
      appMap.set(app.requirement_id, app);
    });

    // Calculate stats
    const stats = {
      totalLegislation: orgLegislation?.length || 0,
      totalRequirements: requirements?.length || 0,
      total: requirements?.length || 0,
      conforme: 0,
      naoConforme: 0,
      emCurso: 0,
      pendente: 0,
      complianceRate: 0,
    };

    requirements?.forEach((req: any) => {
      const app = appMap.get(req.id);
      if (!app) {
        stats.pendente++;
      } else if (app.compliance_status === "conforme") {
        stats.conforme++;
      } else if (app.compliance_status === "nao_conforme") {
        stats.naoConforme++;
      } else {
        stats.emCurso++;
      }
    });

    if (stats.totalRequirements > 0) {
      stats.complianceRate = Math.round((stats.conforme / stats.totalRequirements) * 100);
    }

    let html: string;
    let filename: string;

    if (reportType === "legislation") {
      // Legislation list report
      const legislationData = {
        organization: { name: organization.name },
        generatedAt,
        legislation: orgLegislation?.map((ol: any) => ({
          number: ol.legislation?.number,
          title: ol.legislation?.title,
          publicationDate: ol.legislation?.publication_date,
          source: ol.legislation?.source,
          requirementsCount: requirements?.filter((r: any) => r.legislation_id === ol.legislation_id).length || 0,
        })) || [],
      };
      html = generateLegislationReport(legislationData);
      filename = `legislacao-aplicavel-${organization.name.replace(/[^a-zA-Z0-9]/g, "-")}.html`;

    } else if (reportType === "requirements") {
      // Requirements list report
      const groupedReqs: any[] = [];
      const legMap = new Map<string, any>();
      
      orgLegislation?.forEach((ol: any) => {
        legMap.set(ol.legislation_id, {
          legislationNumber: ol.legislation?.number,
          legislationTitle: ol.legislation?.title,
          requirements: [],
        });
      });

      requirements?.forEach((req: any) => {
        const leg = legMap.get(req.legislation_id);
        if (leg) {
          const app = appMap.get(req.id);
          leg.requirements.push({
            article: req.article,
            text: req.requirement_text,
            status: app?.compliance_status || "pendente",
            notes: app?.notes,
          });
        }
      });

      legMap.forEach((value) => {
        if (value.requirements.length > 0) {
          groupedReqs.push(value);
        }
      });

      const requirementsData = {
        organization: { name: organization.name },
        generatedAt,
        stats,
        groupedRequirements: groupedReqs,
      };
      html = generateRequirementsReport(requirementsData);
      filename = `requisitos-legais-${organization.name.replace(/[^a-zA-Z0-9]/g, "-")}.html`;

    } else {
      // Full compliance report
      const groupedReqs: any[] = [];
      const legMap = new Map<string, any>();
      
      orgLegislation?.forEach((ol: any) => {
        legMap.set(ol.legislation_id, {
          legislationNumber: ol.legislation?.number,
          legislationTitle: ol.legislation?.title,
          requirements: [],
        });
      });

      requirements?.forEach((req: any) => {
        const leg = legMap.get(req.legislation_id);
        if (leg) {
          const app = appMap.get(req.id);
          leg.requirements.push({
            article: req.article,
            text: req.requirement_text,
            status: app?.compliance_status || "pendente",
            notes: app?.notes,
          });
        }
      });

      legMap.forEach((value) => groupedReqs.push(value));

      const complianceData = {
        organization: { name: organization.name },
        generatedAt,
        stats,
        groupedRequirements: groupedReqs,
        actionPlans: actionPlans?.map((plan: any) => ({
          title: plan.title,
          description: plan.description,
          status: plan.status || "pendente",
          responsible: plan.responsible,
          dueDate: plan.due_date,
          requirement: plan.legal_requirements
            ? `${plan.legal_requirements.legislation?.number} - ${plan.legal_requirements.article || "Geral"}`
            : null,
        })) || [],
      };
      html = generateComplianceReport(complianceData);
      filename = `relatorio-conformidade-${organization.name.replace(/[^a-zA-Z0-9]/g, "-")}.html`;
    }

    console.log(`Report generated: ${filename}`);

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (error: unknown) {
    console.error("Error generating report:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
