import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IDTopNav } from "@/components/client/IDTopNav";
import { IDBackground, IDHeroSection } from "@/components/client/IDBackground";
import { PlanFeedbackDialog } from "@/components/client/PlanFeedbackDialog";
import { AuditDocumentsList } from "@/components/client/AuditDocumentsList";
import auditHero from "@/assets/audit-hero.png";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileEdit,
  MessageSquareWarning,
} from "lucide-react";

interface AuditRow {
  id: string;
  title: string;
  description: string | null;
  audit_type: string;
  audit_date: string | null;
  status: string;
  auditor: string | null;
  objectives: string | null;
  scope: string | null;
  methodology: string | null;
  executive_summary: string | null;
  plan_approved_at: string | null;
  plan_feedback: string | null;
  approved_at: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  anual: "Auditoria de Conformidade Legal Anual",
  mensal: "Verificação de Conformidade Legal Mensal",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "dd MMM yyyy", { locale: pt });
  } catch {
    return "—";
  }
}

export default function Aprovacoes() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string>("");
  const [feedbackAudit, setFeedbackAudit] = useState<AuditRow | null>(null);
  const [feedbackKind, setFeedbackKind] = useState<"plan" | "report">("plan");

  const { data: organizations } = useQuery({
    queryKey: ["aprovacoes-orgs", user?.id, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, logo_url")
          .order("name");
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("organization_id, organizations(id, name, logo_url)")
        .eq("user_id", user!.id)
        .not("organization_id", "is", null);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.organizations as { id: string; name: string; logo_url?: string } | null)
        .filter((o): o is { id: string; name: string; logo_url?: string } => !!o);
    },
  });

  useEffect(() => {
    if (!orgId && organizations?.length) setOrgId(organizations[0].id);
  }, [organizations, orgId]);

  const currentOrg = useMemo(
    () => organizations?.find((o) => o.id === orgId) ?? null,
    [organizations, orgId],
  );

  const { data: audits, isLoading } = useQuery({
    queryKey: ["aprovacoes-audits", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select(
          "id, title, description, audit_type, audit_date, status, auditor, objectives, scope, methodology, executive_summary, plan_approved_at, plan_feedback, approved_at",
        )
        .eq("organization_id", orgId)
        .in("status", ["planned", "pending_approval"])
        .order("audit_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const pendingPlans = (audits ?? []).filter(
    (a) => a.status === "planned" && !a.plan_approved_at,
  );
  const approvedPlans = (audits ?? []).filter(
    (a) => a.status === "planned" && !!a.plan_approved_at,
  );
  const pendingReports = (audits ?? []).filter((a) => a.status === "pending_approval");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["aprovacoes-audits", orgId] });
    queryClient.invalidateQueries({ queryKey: ["audits"] });
    queryClient.invalidateQueries({ queryKey: ["action-plans"] });
  };

  /** Approve the audit plan — keeps status "planned" and marks the plan as approved. */
  const approvePlan = useMutation({
    mutationFn: async (audit: AuditRow) => {
      const { error } = await supabase
        .from("audits")
        .update({
          plan_approved_at: new Date().toISOString(),
          plan_approved_by: user?.id,
          plan_feedback: null,
        })
        .eq("id", audit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano de auditoria aprovado");
      invalidate();
    },
    onError: () => toast.error("Não foi possível aprovar o plano"),
  });

  /** Approve the audit report — closes the audit and activates the linked action plans. */
  const approveReport = useMutation({
    mutationFn: async (audit: AuditRow) => {
      const { error } = await supabase
        .from("audits")
        .update({
          status: "closed",
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        })
        .eq("id", audit.id);
      if (error) throw error;

      // Activate action plans generated by this audit
      const { data: reqs } = await supabase
        .from("audit_requirements")
        .select("id")
        .eq("audit_id", audit.id);
      const ids = (reqs ?? []).map((r) => r.id);
      if (ids.length) {
        await supabase
          .from("action_plans")
          .update({ status: "pendente" })
          .in("audit_requirement_id", ids)
          .in("status", ["rascunho", "aguarda_aprovacao"]);
      }
    },
    onSuccess: () => {
      toast.success("Auditoria aprovada e encerrada. Plano de ação ativado.");
      invalidate();
    },
    onError: () => toast.error("Não foi possível aprovar a auditoria"),
  });

  const submitFeedback = async (feedback: string) => {
    if (!feedbackAudit) return;
    const payload: Record<string, unknown> = {
      plan_feedback: feedback,
    };
    if (feedbackKind === "plan") {
      payload.plan_approved_at = null;
      payload.plan_approved_by = null;
    }
    const { error } = await supabase
      .from("audits")
      .update(payload)
      .eq("id", feedbackAudit.id);
    if (error) {
      toast.error("Não foi possível enviar o pedido de alterações");
      throw error;
    }
    toast.success("Pedido de alterações enviado ao auditor");
    invalidate();
  };

  const openFeedback = (audit: AuditRow, kind: "plan" | "report") => {
    setFeedbackKind(kind);
    setFeedbackAudit(audit);
  };

  const renderCard = (audit: AuditRow, kind: "plan" | "report") => (
    <Card key={audit.id} className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base leading-snug">{audit.title}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-primary/40">
                {TYPE_LABELS[audit.audit_type] ?? audit.audit_type}
              </Badge>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatDate(audit.audit_date)}
              </span>
              {audit.auditor && <span>Auditor: {audit.auditor}</span>}
            </div>
          </div>
          <Badge
            className={
              kind === "plan"
                ? "bg-accent/20 text-accent-foreground"
                : "bg-primary/15 text-primary"
            }
          >
            {kind === "plan" ? "Plano por aprovar" : "Relatório por aprovar"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(audit.objectives || audit.scope || audit.executive_summary) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {audit.objectives && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Objetivos</p>
                <p className="text-sm whitespace-pre-line">{audit.objectives}</p>
              </div>
            )}
            {audit.scope && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Âmbito</p>
                <p className="text-sm whitespace-pre-line">{audit.scope}</p>
              </div>
            )}
            {audit.executive_summary && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Resumo executivo
                </p>
                <p className="text-sm whitespace-pre-line">{audit.executive_summary}</p>
              </div>
            )}
          </div>
        )}

        {audit.plan_feedback && (
          <div className="rounded-lg border border-accent/40 bg-accent/10 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <MessageSquareWarning className="h-3.5 w-3.5" /> Alterações pedidas
            </p>
            <p className="mt-1 text-sm whitespace-pre-line">{audit.plan_feedback}</p>
          </div>
        )}

        <AuditDocumentsList auditId={audit.id} canEdit={false} />

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            onClick={() =>
              kind === "plan" ? approvePlan.mutate(audit) : approveReport.mutate(audit)
            }
            disabled={approvePlan.isPending || approveReport.isPending}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {kind === "plan" ? "Aprovar plano" : "Aprovar e encerrar auditoria"}
          </Button>
          <Button variant="outline" onClick={() => openFeedback(audit, kind)}>
            <FileEdit className="mr-2 h-4 w-4" />
            Solicitar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      <IDBackground />
      <div className="relative z-10">
        <IDTopNav
          currentOrg={currentOrg}
          actions={
            (organizations?.length ?? 0) > 1 ? (
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Organização" />
                </SelectTrigger>
                <SelectContent>
                  {organizations?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : undefined
          }
        />

        <main className="p-4 lg:p-8 space-y-5">
          <IDHeroSection
            title="Aprovações"
            subtitle="Aprove planos e relatórios de auditoria ou solicite alterações ao auditor"
            badge="Validação do Cliente"
            icon={ClipboardCheck}
            image={auditHero}
            imageAlt="Sala de reunião de auditoria"
            stats={[
              { label: "Planos pendentes", value: pendingPlans.length },
              { label: "Relatórios pendentes", value: pendingReports.length },
            ]}
          />

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Planos de auditoria por aprovar</h2>
                {pendingPlans.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Não existem planos à espera da sua aprovação.
                  </p>
                ) : (
                  pendingPlans.map((a) => renderCard(a, "plan"))
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Relatórios de auditoria por aprovar</h2>
                {pendingReports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Não existem relatórios à espera da sua aprovação.
                  </p>
                ) : (
                  pendingReports.map((a) => renderCard(a, "report"))
                )}
              </section>

              {approvedPlans.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-lg font-semibold">Planos já aprovados</h2>
                  <ul className="space-y-2">
                    {approvedPlans.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/70 p-3 text-sm"
                      >
                        <span className="font-medium">{a.title}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          Aprovado em {formatDate(a.plan_approved_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </main>
      </div>

      <PlanFeedbackDialog
        open={!!feedbackAudit}
        onOpenChange={(open) => !open && setFeedbackAudit(null)}
        auditTitle={feedbackAudit?.title ?? ""}
        onSubmit={submitFeedback}
      />
    </div>
  );
}
