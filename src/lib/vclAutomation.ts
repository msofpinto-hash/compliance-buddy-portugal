import { supabase } from "@/integrations/supabase/client";
import {
  VclReport,
  VclDiploma,
  parseVclReport,
  vclShortPeriod,
  vclPeriodLabel,
} from "@/lib/vclReport";

type Audit = {
  id: string;
  title: string;
  audit_date?: string | null;
  executed_at?: string | null;
  organization_id: string;
  vcl_report?: unknown;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function vclPeriodRange(audit: Audit) {
  const ref = new Date(audit.executed_at || audit.audit_date || Date.now());
  const start = `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-01`;
  const end = `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-${pad(
    new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate(),
  )}`;
  return { start, end, ref };
}

/** Marcador de origem usado nos planos de ação criados a partir de uma VCL. */
export const vclOriginTag = (audit: Audit) => `[VCL ${vclShortPeriod(audit)}]`;

/**
 * Preenche automaticamente uma VCL futura com base nas atas reais anteriores:
 * participantes, tipo de reunião, descrição do período e diplomas classificados.
 */
export async function buildVclAutofill(
  audit: Audit,
  current: VclReport,
): Promise<Partial<VclReport>> {
  const { start, end, ref } = vclPeriodRange(audit);
  const monthName = new Date(start).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
  });
  const patch: Partial<VclReport> = {};

  // 1) Última ata mensal real desta organização (modelo de participantes/reunião)
  const { data: previous } = await supabase
    .from("audits")
    .select("id, audit_date, executed_at, vcl_report")
    .eq("organization_id", audit.organization_id)
    .eq("audit_type", "mensal")
    .not("vcl_report", "is", null)
    .neq("id", audit.id)
    .order("audit_date", { ascending: false })
    .limit(12);

  const model = (previous || [])
    .map((p) => parseVclReport(p.vcl_report))
    .find((r) => r.participants || r.actions.length > 0);

  if (model) {
    if (!current.participants && model.participants)
      patch.participants = model.participants;
    if (!current.meeting_type && model.meeting_type)
      patch.meeting_type = model.meeting_type;
    if (!current.special_notes && model.special_notes)
      patch.special_notes = model.special_notes;
  }

  // 2) Descrição do período
  if (!current.description) {
    const startLabel = new Date(start).toLocaleDateString("pt-PT");
    const endLabel = new Date(end).toLocaleDateString("pt-PT");
    patch.description =
      `Foi realizada a verificação de conformidade legal mensal assumindo os diplomas ` +
      `publicados e devidamente identificados no período de ${startLabel} a ${endLabel}. ` +
      `A lista alvo de verificação corresponde aos diplomas classificados em ${monthName}, ` +
      `bem como o controlo das Normas, despachos e notas técnicas do mesmo período.`;
  }

  // 3) Diplomas classificados publicados no mês
  if (current.diplomas.length === 0) {
    const { data } = await supabase
      .from("organization_legislation")
      .select(
        "applicability_type, legislation:legislation(id, number, title, publication_date)",
      )
      .eq("organization_id", audit.organization_id)
      .not("applicability_type", "is", null)
      .neq("applicability_type", "nao_avaliado");
    const diplomas: VclDiploma[] = (data || [])
      .filter((r: any) => {
        const p = r.legislation?.publication_date;
        return p && p >= start && p <= end;
      })
      .map((r: any) => ({
        id: r.legislation.id,
        number: r.legislation.number,
        title: r.legislation.title,
        applicability: r.applicability_type,
        publication_date: r.legislation.publication_date,
      }))
      .sort((a, b) =>
        (b.publication_date || "").localeCompare(a.publication_date || ""),
      );
    if (diplomas.length) patch.diplomas = diplomas;
  }

  // 4) Ações já existentes no plano de ação com origem nesta VCL
  if (current.actions.length === 0) {
    const { data: plans } = await supabase
      .from("action_plans")
      .select("title, description, responsible, due_date")
      .eq("organization_id", audit.organization_id)
      .ilike("title", `${vclOriginTag(audit)}%`);
    if (plans?.length) {
      patch.actions = plans.map((p: any) => ({
        description: (p.description || p.title || "").replace(
          /^Origem:[^\n]*\n+/,
          "",
        ),
        responsible: p.responsible || "",
        deadline: p.due_date
          ? new Date(p.due_date).toLocaleDateString("pt-PT")
          : "",
      }));
    }
  }

  void ref;
  return patch;
}

function parseDeadline(value: string): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  const dmy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad(+dmy[2])}-${pad(+dmy[1])}`;
  const iso = v.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return v;
  const months: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  };
  const my = v.toLowerCase().match(/([a-zç]{3})[a-zç]*\.?\s*(\d{4})/);
  if (my && months[my[1]]) {
    const m = months[my[1]];
    const last = new Date(+my[2], m, 0).getDate();
    return `${my[2]}-${pad(m)}-${pad(last)}`;
  }
  return null;
}

/**
 * Sincroniza as ações do relatório VCL com o plano de ações da organização,
 * identificando sempre a origem (mês da verificação).
 */
export async function syncVclActionsToPlans(
  audit: Audit,
  report: VclReport,
  createdBy?: string,
): Promise<{ created: number; updated: number }> {
  const tag = vclOriginTag(audit);
  const originLine = `Origem: ${vclPeriodLabel(audit)} — ação n.º`;

  const { data: existing } = await supabase
    .from("action_plans")
    .select("id, title")
    .eq("organization_id", audit.organization_id)
    .ilike("title", `${tag}%`);

  const byIndex = new Map<number, string>();
  (existing || []).forEach((p: any) => {
    const m = String(p.title).match(/^\[VCL [^\]]+\]\s*(\d+)\./);
    if (m) byIndex.set(+m[1], p.id);
  });

  let created = 0;
  let updated = 0;

  for (let i = 0; i < report.actions.length; i++) {
    const a = report.actions[i];
    if (!a.description?.trim()) continue;
    const n = i + 1;
    const shortDesc = a.description.trim().replace(/\s+/g, " ").slice(0, 140);
    const payload = {
      organization_id: audit.organization_id,
      title: `${tag} ${n}. ${shortDesc}`,
      description: `${originLine} ${n}\nAuditoria: ${audit.title}\n\n${a.description.trim()}`,
      responsible: a.responsible || null,
      due_date: parseDeadline(a.deadline),
      priority: "media",
      created_by: createdBy || null,
    };
    const id = byIndex.get(n);
    if (id) {
      const { title, description, responsible, due_date } = payload;
      await supabase
        .from("action_plans")
        .update({ title, description, responsible, due_date })
        .eq("id", id);
      updated++;
      byIndex.delete(n);
    } else {
      await supabase.from("action_plans").insert({ ...payload, status: "pendente" });
      created++;
    }
  }

  // Ações removidas do relatório deixam de estar pendentes
  const stale = Array.from(byIndex.values());
  if (stale.length) {
    await supabase
      .from("action_plans")
      .update({ status: "cancelado" })
      .in("id", stale)
      .eq("status", "pendente");
  }

  return { created, updated };
}
