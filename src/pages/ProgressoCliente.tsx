import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IDTopNav } from "@/components/client/IDTopNav";
import { IDBackground, IDHeroSection } from "@/components/client/IDBackground";
import { RouteSeo } from "@/components/seo/RouteSeo";
import indicatorsHero from "@/assets/indicators-hero.png";
import {
  Activity,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Gavel,
  RefreshCw,
} from "lucide-react";

const CHUNK = 200;
const PAGE = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

const APPLICABLE = ["aplicavel_direto", "aplicavel_indireto", "aplicavel_condicionado"];

type OrgStats = {
  diplomas: number;
  diplomasApplicable: number;
  diplomasWithoutRequirements: number;
  diplomasWithoutUrl: number;
  diplomasUnclassified: number;
  requirementsTotal: number;
  requirementsApplicable: number;
  requirementsWithStatus: number;
  requirementsPending: number;
  evidence: { total: number; visible: number; byStatus: Record<string, number> };
  audits: { total: number; byStatus: Record<string, number>; annual: number; monthly: number };
};

async function fetchAll<T>(
  run: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 60; page++) {
    const { data, error } = await run(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  submitted: "Submetido",
  approved: "Aprovado",
  rejected: "Devolvido",
  planned: "Planeada",
  in_progress: "Em curso",
  pending_approval: "Em aprovação",
  closed: "Encerrada",
  cancelled: "Cancelada",
};

function StatCard({
  title,
  icon: Icon,
  value,
  caption,
  done,
  total,
  to,
}: {
  title: string;
  icon: React.ElementType;
  value: React.ReactNode;
  caption: string;
  done?: number;
  total?: number;
  to?: string;
}) {
  const body = (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{caption}</p>
        {typeof done === "number" && typeof total === "number" && (
          <>
            <Progress value={pct(done, total)} />
            <p className="text-xs text-muted-foreground">
              {done} de {total} ({pct(done, total)}%)
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function ProgressoCliente() {
  const { user, isAdmin } = useAuth();
  const [orgId, setOrgId] = useState<string>("");

  const { data: organizations } = useQuery({
    queryKey: ["progresso-cliente-orgs", user?.id, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name")
          .order("name");
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("organizations(id, name)")
        .eq("user_id", user!.id)
        .not("organization_id", "is", null);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.organizations as { id: string; name: string } | null)
        .filter((o): o is { id: string; name: string } => !!o);
    },
  });

  useEffect(() => {
    if (orgId || !organizations?.length) return;
    const amcor = organizations.find((o) => o.name.toUpperCase().includes("AMCOR"));
    setOrgId((amcor ?? organizations[0]).id);
  }, [organizations, orgId]);

  const currentOrg = useMemo(
    () => organizations?.find((o) => o.id === orgId) ?? null,
    [organizations, orgId],
  );

  const { data: stats, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["progresso-cliente-stats", orgId],
    enabled: !!orgId,
    refetchInterval: 60000,
    queryFn: async (): Promise<OrgStats> => {
      // Diplomas atribuídos à organização
      const orgLeg = await fetchAll<{ legislation_id: string; applicability_type: string | null }>(
        (from, to) =>
          supabase
            .from("organization_legislation")
            .select("legislation_id, applicability_type")
            .eq("organization_id", orgId)
            .range(from, to) as never,
      );
      const legIds = [...new Set(orgLeg.map((r) => r.legislation_id))];

      // Metadados dos diplomas
      const legRows: { id: string; document_url: string | null; no_digital_version: boolean | null }[] = [];
      for (const ids of chunk(legIds, CHUNK)) {
        const { data, error } = await supabase
          .from("legislation")
          .select("id, document_url, no_digital_version")
          .in("id", ids);
        if (error) throw error;
        legRows.push(...(data ?? []));
      }

      // Requisitos dos diplomas da organização
      const reqRows: { id: string; legislation_id: string }[] = [];
      for (const ids of chunk(legIds, CHUNK)) {
        const rows = await fetchAll<{ id: string; legislation_id: string }>((from, to) =>
          supabase
            .from("legal_requirements")
            .select("id, legislation_id")
            .in("legislation_id", ids)
            .range(from, to) as never,
        );
        reqRows.push(...rows);
      }
      const legWithReq = new Set(reqRows.map((r) => r.legislation_id));

      // Aplicabilidades de requisitos
      const apps = await fetchAll<{
        requirement_id: string;
        is_applicable: boolean;
        applicability_type: string | null;
        compliance_status: string | null;
      }>((from, to) =>
        supabase
          .from("applicabilities")
          .select("requirement_id, is_applicable, applicability_type, compliance_status")
          .eq("organization_id", orgId)
          .range(from, to) as never,
      );

      const applicableApps = apps.filter(
        (a) => a.is_applicable && (!a.applicability_type || APPLICABLE.includes(a.applicability_type)),
      );
      const withStatus = applicableApps.filter((a) => !!a.compliance_status).length;

      // Pedidos de evidência
      const { data: evRows, error: evErr } = await supabase
        .from("organization_evidence_requests")
        .select("id, status, visible_to_client")
        .eq("organization_id", orgId);
      if (evErr) throw evErr;

      // Auditorias
      const { data: audRows, error: audErr } = await supabase
        .from("audits")
        .select("id, status, audit_type")
        .eq("organization_id", orgId);
      if (audErr) throw audErr;

      const byStatus = <T extends { status: string }>(rows: T[]) =>
        rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        }, {});

      const applicableDiplomas = orgLeg.filter(
        (r) => r.applicability_type && APPLICABLE.includes(r.applicability_type),
      ).length;

      return {
        diplomas: legIds.length,
        diplomasApplicable: applicableDiplomas,
        diplomasUnclassified: orgLeg.filter((r) => !r.applicability_type).length,
        diplomasWithoutRequirements: legIds.filter((id) => !legWithReq.has(id)).length,
        diplomasWithoutUrl: legRows.filter((l) => !l.document_url && !l.no_digital_version).length,
        requirementsTotal: reqRows.length,
        requirementsApplicable: applicableApps.length,
        requirementsWithStatus: withStatus,
        requirementsPending: applicableApps.length - withStatus,
        evidence: {
          total: evRows?.length ?? 0,
          visible: (evRows ?? []).filter((e) => e.visible_to_client).length,
          byStatus: byStatus((evRows ?? []) as { status: string }[]),
        },
        audits: {
          total: audRows?.length ?? 0,
          byStatus: byStatus((audRows ?? []) as { status: string }[]),
          annual: (audRows ?? []).filter((a) => a.audit_type === "anual").length,
          monthly: (audRows ?? []).filter((a) => a.audit_type === "mensal").length,
        },
      };
    },
  });

  return (
    <div className="min-h-screen relative overflow-hidden">
      <IDBackground />
      <div className="relative z-10">
      <RouteSeo
        title="Progresso de conformidade | I&D Compliance Lex"
        description="Acompanhe o progresso do cliente: diplomas por extrair, requisitos por classificar, pedidos de evidência e auditorias."
      />
      <IDTopNav currentOrg={currentOrg} />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <IDHeroSection
          title="Progresso de conformidade"
          subtitle={
            currentOrg
              ? `Estado atual do trabalho de conformidade de ${currentOrg.name}.`
              : "Estado atual do trabalho de conformidade."
          }
          badge="Indicadores"
          icon={Activity}
          image={indicatorsHero}
          imageAlt=""
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {(organizations?.length ?? 0) > 1 && (
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger className="w-[240px] bg-background">
                    <SelectValue placeholder="Selecionar cliente" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {organizations?.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          }
        />

        {isLoading || !stats ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Diplomas por extrair"
                icon={Gavel}
                value={stats.diplomasWithoutRequirements}
                caption={`${stats.diplomas} diplomas atribuídos · ${stats.diplomasApplicable} aplicáveis`}
                done={stats.diplomas - stats.diplomasWithoutRequirements}
                total={stats.diplomas}
                to="/biblioteca"
              />
              <StatCard
                title="Requisitos por classificar"
                icon={FileText}
                value={stats.requirementsPending}
                caption={`${stats.requirementsTotal} requisitos extraídos · ${stats.requirementsApplicable} aplicáveis`}
                done={stats.requirementsWithStatus}
                total={stats.requirementsApplicable}
                to="/conformidade"
              />
              <StatCard
                title="Pedidos de evidência"
                icon={FolderOpen}
                value={stats.evidence.total}
                caption={`${stats.evidence.visible} visíveis ao cliente`}
                done={stats.evidence.byStatus["approved"] ?? 0}
                total={stats.evidence.total}
                to="/dashboard?tab=documents"
              />
              <StatCard
                title="Auditorias"
                icon={ClipboardCheck}
                value={stats.audits.total}
                caption={`${stats.audits.annual} anuais · ${stats.audits.monthly} mensais`}
                done={stats.audits.byStatus["closed"] ?? 0}
                total={stats.audits.total}
                to="/dashboard?tab=audits"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Qualidade dos diplomas</CardTitle>
                  <CardDescription>Pendências de dados na biblioteca do cliente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sem requisitos extraídos</span>
                    <Badge variant="outline">{stats.diplomasWithoutRequirements}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sem link oficial</span>
                    <Badge variant="outline">{stats.diplomasWithoutUrl}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sem aplicabilidade definida</span>
                    <Badge variant="outline">{stats.diplomasUnclassified}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Pedidos de evidência</CardTitle>
                  <CardDescription>Distribuição por estado</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.keys(stats.evidence.byStatus).length === 0 && (
                    <p className="text-muted-foreground">Sem pedidos registados.</p>
                  )}
                  {Object.entries(stats.evidence.byStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{STATUS_LABELS[status] ?? status}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Auditorias</CardTitle>
                  <CardDescription>Distribuição por estado</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {Object.keys(stats.audits.byStatus).length === 0 && (
                    <p className="text-muted-foreground">Sem auditorias registadas.</p>
                  )}
                  {Object.entries(stats.audits.byStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{STATUS_LABELS[status] ?? status}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
      </div>
    </div>
  );
}
