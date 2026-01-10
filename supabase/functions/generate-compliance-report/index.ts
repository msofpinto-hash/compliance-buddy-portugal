import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReportData {
  organization: {
    id: string;
    name: string;
    description: string | null;
  };
  stats: {
    totalLegislation: number;
    totalRequirements: number;
    conforme: number;
    naoConforme: number;
    emCurso: number;
    pendente: number;
    complianceRate: number;
  };
  legislation: Array<{
    number: string;
    title: string;
    requirements: Array<{
      article: string | null;
      text: string;
      status: string;
      notes: string | null;
    }>;
  }>;
  actionPlans: Array<{
    title: string;
    description: string | null;
    status: string;
    responsible: string | null;
    dueDate: string | null;
    requirement: string | null;
  }>;
  generatedAt: string;
}

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
    case "nao_conforme": return "Não Conforme";
    case "em_curso": return "Em Avaliação";
    case "pendente": return "Pendente";
    case "concluido": return "Concluído";
    default: return status || "Pendente";
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "conforme": return "#16a34a";
    case "concluido": return "#16a34a";
    case "nao_conforme": return "#dc2626";
    case "em_curso": return "#ca8a04";
    default: return "#6b7280";
  }
}

function generateHtmlReport(data: ReportData): string {
  const legislationHtml = data.legislation.map(leg => `
    <div class="legislation-section">
      <h3>${escapeHtml(leg.number)} - ${escapeHtml(leg.title)}</h3>
      ${leg.requirements.length > 0 ? `
        <table class="requirements-table">
          <thead>
            <tr>
              <th>Artigo</th>
              <th>Requisito</th>
              <th>Estado</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${leg.requirements.map(req => `
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
  `).join("");

  const actionPlansHtml = data.actionPlans.length > 0 ? `
    <table class="action-plans-table">
      <thead>
        <tr>
          <th>Ação</th>
          <th>Estado</th>
          <th>Responsável</th>
          <th>Prazo</th>
          <th>Requisito Associado</th>
        </tr>
      </thead>
      <tbody>
        ${data.actionPlans.map(plan => `
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
  <style>
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
    .header h1 {
      font-size: 24px;
      color: #111827;
    }
    .header .org-name {
      font-size: 16px;
      color: #6b7280;
      margin-top: 5px;
    }
    .header .date {
      text-align: right;
      color: #6b7280;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      padding: 15px;
      border-radius: 8px;
      text-align: center;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
    }
    .stat-card .value {
      font-size: 24px;
      font-weight: bold;
    }
    .stat-card .label {
      font-size: 10px;
      color: #6b7280;
      text-transform: uppercase;
    }
    .stat-card.green { background: #dcfce7; border-color: #86efac; }
    .stat-card.green .value { color: #16a34a; }
    .stat-card.yellow { background: #fef9c3; border-color: #fde047; }
    .stat-card.yellow .value { color: #ca8a04; }
    .stat-card.red { background: #fee2e2; border-color: #fca5a5; }
    .stat-card.red .value { color: #dc2626; }
    .stat-card.blue { background: #dbeafe; border-color: #93c5fd; }
    .stat-card.blue .value { color: #2563eb; }
    
    h2 {
      font-size: 18px;
      margin: 30px 0 15px 0;
      padding-bottom: 10px;
      border-bottom: 1px solid #e5e7eb;
    }
    h3 {
      font-size: 13px;
      margin: 20px 0 10px 0;
      color: #374151;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 10px;
    }
    th, td {
      padding: 8px 10px;
      text-align: left;
      border: 1px solid #e5e7eb;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      color: white;
      font-size: 9px;
      font-weight: 500;
    }
    .legislation-section {
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    .no-data {
      color: #9ca3af;
      font-style: italic;
      padding: 15px;
      text-align: center;
      background: #f9fafb;
      border-radius: 4px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 9px;
    }
    @media print {
      body { padding: 20px; }
      .legislation-section { page-break-inside: avoid; }
    }
  </style>
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

  <h2>Diplomas e Requisitos</h2>
  ${legislationHtml}

  <div class="footer">
    Relatório gerado automaticamente pelo Sistema de Gestão de Conformidade Legal
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organizationId } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "organizationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating compliance report for organization: ${organizationId}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch organization
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

    // Fetch assigned legislation
    const { data: orgLegislation, error: legError } = await supabase
      .from("organization_legislation")
      .select(`
        legislation_id,
        legislation(id, number, title)
      `)
      .eq("organization_id", organizationId);

    if (legError) {
      console.error("Error fetching legislation:", legError);
      throw legError;
    }

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
      .in("legislation_id", legislationIds.length > 0 ? legislationIds : ["00000000-0000-0000-0000-000000000000"]);

    if (reqError) {
      console.error("Error fetching requirements:", reqError);
      throw reqError;
    }

    // Fetch applicabilities
    const { data: applicabilities, error: appError } = await supabase
      .from("applicabilities")
      .select("*")
      .eq("organization_id", organizationId);

    if (appError) {
      console.error("Error fetching applicabilities:", appError);
      throw appError;
    }

    // Fetch action plans
    const { data: actionPlans, error: apError } = await supabase
      .from("action_plans")
      .select(`
        *,
        legal_requirements(article, legislation(number))
      `)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (apError) {
      console.error("Error fetching action plans:", apError);
      throw apError;
    }

    // Build applicabilities map
    const appMap = new Map<string, any>();
    applicabilities?.forEach((app: any) => {
      appMap.set(app.requirement_id, app);
    });

    // Calculate stats
    const stats = {
      totalLegislation: orgLegislation?.length || 0,
      totalRequirements: requirements?.length || 0,
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

    // Group requirements by legislation
    const legMap = new Map<string, any>();
    orgLegislation?.forEach((ol: any) => {
      legMap.set(ol.legislation_id, {
        number: ol.legislation?.number,
        title: ol.legislation?.title,
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

    // Build report data
    const reportData: ReportData = {
      organization: {
        id: organization.id,
        name: organization.name,
        description: organization.description,
      },
      stats,
      legislation: Array.from(legMap.values()),
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
      generatedAt: new Date().toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    console.log(`Report data generated. Stats:`, stats);

    // Generate HTML report
    const html = generateHtmlReport(reportData);

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="relatorio-conformidade-${organization.name.replace(/[^a-zA-Z0-9]/g, "-")}.html"`,
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
