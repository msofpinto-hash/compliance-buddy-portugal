import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  BookOpen,
  Loader2,
  RefreshCw,
  Flag,
  Globe,
  ListOrdered,
} from "lucide-react";

export function DataQualityPanel() {
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const queryClient = useQueryClient();

  // Bulk recalculate display_order for all legislation requirements
  const recalculateAllOrdersMutation = useMutation({
    mutationFn: async () => {
      // Helper: roman numeral to integer
      const romanToInt = (roman: string) => {
        const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        let total = 0;
        let prev = 0;
        const s = roman.toUpperCase().replace(/[^IVXLCDM]/g, "");
        for (let i = s.length - 1; i >= 0; i--) {
          const val = map[s[i]] || 0;
          if (val < prev) total -= val;
          else {
            total += val;
            prev = val;
          }
        }
        return total;
      };

      // Helper: get sort key from article
      const getSortKey = (article: string | null) => {
        const a = (article || "").trim();
        const lower = a.toLowerCase();
        let typeRank = 3; // 0: considerandos, 1: artigos, 2: anexos, 3: outros
        let n1 = Number.POSITIVE_INFINITY;
        let n2 = 0;

        if (lower.startsWith("considerando")) {
          typeRank = 0;
          const m = a.match(/(\d+)/);
          if (m) n1 = parseInt(m[1], 10);
        } else if (lower.includes("art")) {
          typeRank = 1;
          const mArt = a.match(/art\.?\s*(\d+)/i);
          if (mArt) n1 = parseInt(mArt[1], 10);
          const mN = a.match(/n\.?\s*º\s*(\d+)/i) || a.match(/n.\s*(\d+)/i);
          if (mN) n2 = parseInt(mN[1], 10);
        } else if (lower.includes("anexo")) {
          typeRank = 2;
          const mRoman = a.match(/anexo\s+([IVXLCDM]+)/i);
          const mNum = a.match(/anexo\s+(\d+)/i);
          if (mRoman) n1 = romanToInt(mRoman[1]);
          else if (mNum) n1 = parseInt(mNum[1], 10);
          else n1 = 0;
        }

        return { typeRank, n1, n2, raw: a };
      };

      // Fetch all legislation IDs that have requirements
      const { data: legislationIds, error: legError } = await supabase
        .from("legislation")
        .select("id, legal_requirements!inner(id)")
        .limit(10000);

      if (legError) throw legError;

      const uniqueLegIds = [...new Set(legislationIds?.map((l) => l.id) || [])];
      let updatedCount = 0;
      let legislationProcessed = 0;

      // Process in batches of 50 legislation
      const batchSize = 50;
      for (let i = 0; i < uniqueLegIds.length; i += batchSize) {
        const batchIds = uniqueLegIds.slice(i, i + batchSize);

        // Fetch requirements for this batch
        const { data: requirements, error: reqError } = await supabase
          .from("legal_requirements")
          .select("id, legislation_id, article, display_order")
          .in("legislation_id", batchIds);

        if (reqError) throw reqError;

        // Group by legislation_id
        const byLegislation = new Map<string, typeof requirements>();
        for (const req of requirements || []) {
          if (!byLegislation.has(req.legislation_id)) {
            byLegislation.set(req.legislation_id, []);
          }
          byLegislation.get(req.legislation_id)!.push(req);
        }

        // For each legislation, sort and update display_order
        for (const [legId, reqs] of byLegislation) {
          const sorted = [...reqs].sort((x, y) => {
            const ax = getSortKey(x.article);
            const ay = getSortKey(y.article);
            if (ax.typeRank !== ay.typeRank) return ax.typeRank - ay.typeRank;
            if (ax.n1 !== ay.n1) return ax.n1 - ay.n1;
            if (ax.n2 !== ay.n2) return ax.n2 - ay.n2;
            return ax.raw.localeCompare(ay.raw, "pt");
          });

          // Check if any order needs updating
          const updates: { id: string; display_order: number }[] = [];
          sorted.forEach((req, idx) => {
            const newOrder = idx + 1;
            if (req.display_order !== newOrder) {
              updates.push({ id: req.id, display_order: newOrder });
            }
          });

          // Batch update
          if (updates.length > 0) {
            for (const upd of updates) {
              await supabase
                .from("legal_requirements")
                .update({ display_order: upd.display_order })
                .eq("id", upd.id);
            }
            updatedCount += updates.length;
          }

          legislationProcessed++;
        }
      }

      return { legislationProcessed, updatedCount };
    },
    onSuccess: (result) => {
      toast.success(
        `Ordem recalculada: ${result.legislationProcessed} diplomas processados, ${result.updatedCount} requisitos atualizados`
      );
      queryClient.invalidateQueries({ queryKey: ["legal-requirements"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-requirements"] });
    },
    onError: (error) => {
      console.error("Bulk order recalculation error:", error);
      toast.error("Erro ao recalcular ordem em lote");
    },
  });

  // Fetch comprehensive data quality statistics
  // Check for running jobs to enable auto-refresh
  const { data: runningJob } = useQuery({
    queryKey: ["running-job-for-quality"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("id, status")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: qualityStats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["data-quality-stats"],
    queryFn: async () => {
      setLastRefresh(new Date());
      
      const [
        totalLegislation,
        missingSummary,
        missingUrl,
        missingUrlExcludingNoDigital,
        noCategories,
        totalRequirements,
        ptLegislation,
        euLegislation,
        legislationWithReqs,
        ptLegislationWithReqs,
        euLegislationWithReqs,
        noDigitalVersion,
      ] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true }),
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("summary.is.null,summary.eq."),
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("document_url.is.null,document_url.eq."),
        // Exclude no_digital_version from missing URL count
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("document_url.is.null,document_url.eq.")
          .or("no_digital_version.is.null,no_digital_version.eq.false"),
        supabase.rpc("get_legislation_without_categories_count"),
        supabase.from("legal_requirements").select("id", { count: "exact", head: true }),
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("origin.eq.PT,origin.eq.dre"),
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("origin.eq.EU,origin.eq.eurlex"),
        // Count legislation WITH requirements (inner join)
        supabase.from("legislation")
          .select("id, legal_requirements!inner(id)", { count: "exact", head: true }),
        // Count PT legislation with requirements
        supabase.from("legislation")
          .select("id, legal_requirements!inner(id)", { count: "exact", head: true })
          .or("origin.eq.PT,origin.eq.dre"),
        // Count EU legislation with requirements
        supabase.from("legislation")
          .select("id, legal_requirements!inner(id)", { count: "exact", head: true })
          .or("origin.eq.EU,origin.eq.eurlex"),
        // Count legislation marked as no digital version available
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .eq("no_digital_version", true),
      ]);

      const total = totalLegislation.count || 0;
      const withReqsCount = legislationWithReqs.count || 0;
      const withoutReqsCount = total - withReqsCount;

      // Get requirements count by origin
      const { count: ptReqsCount } = await supabase
        .from("legal_requirements")
        .select("id, legislation:legislation_id!inner(origin)", { count: "exact", head: true })
        .or("origin.eq.PT,origin.eq.dre", { foreignTable: "legislation" });

      const { count: euReqsCount } = await supabase
        .from("legal_requirements")
        .select("id, legislation:legislation_id!inner(origin)", { count: "exact", head: true })
        .or("origin.eq.EU,origin.eq.eurlex", { foreignTable: "legislation" });
      
      return {
        total,
        missingSummary: missingSummary.count || 0,
        missingUrl: missingUrlExcludingNoDigital.count || 0, // Use filtered count
        withUrl: total - (missingUrlExcludingNoDigital.count || 0),
        noCategories: typeof noCategories.data === 'number' ? noCategories.data : 0,
        noRequirements: withoutReqsCount,
        totalRequirements: totalRequirements.count || 0,
        ptLegislation: ptLegislation.count || 0,
        euLegislation: euLegislation.count || 0,
        ptRequirements: ptReqsCount || 0,
        euRequirements: euReqsCount || 0,
        ptWithRequirements: ptLegislationWithReqs.count || 0,
        euWithRequirements: euLegislationWithReqs?.count || 0,
        noDigitalVersion: noDigitalVersion.count || 0,
      };
    },
    refetchInterval: runningJob ? 10000 : false, // Auto-refresh every 10s when job is running
  });

  const calculateQualityScore = () => {
    if (!qualityStats) return 0;
    const { total, missingSummary, missingUrl, noRequirements, noCategories } = qualityStats;
    if (total === 0) return 100;

    const summaryScore = ((total - missingSummary) / total) * 25;
    const urlScore = ((total - missingUrl) / total) * 25;
    const requirementsScore = ((total - noRequirements) / total) * 30;
    const categoriesScore = ((total - noCategories) / total) * 20;

    return Math.round(summaryScore + urlScore + requirementsScore + categoriesScore);
  };

  const qualityScore = calculateQualityScore();

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Qualidade de Dados
              </CardTitle>
              <CardDescription>
                Análise geral da qualidade e completude da base de dados
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => recalculateAllOrdersMutation.mutate()}
                disabled={recalculateAllOrdersMutation.isPending}
                className="gap-2"
              >
                {recalculateAllOrdersMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ListOrdered className="h-4 w-4" />
                )}
                Recalcular Ordem em Lote
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Atualizar
              </Button>
              {lastRefresh && (
                <span className="text-xs text-muted-foreground">
                  Última: {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Quality Score */}
            <div className="col-span-1 flex flex-col items-center justify-center p-6 rounded-lg border bg-muted/30">
              <div className={`text-5xl font-bold ${getScoreColor(qualityScore)}`}>
                {qualityScore}%
              </div>
              <div className="text-sm text-muted-foreground mt-2">Score de Qualidade</div>
              <Progress 
                value={qualityScore} 
                className="mt-3 h-2 w-full"
              />
            </div>

            {/* Stats Grid */}
            <div className="col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={<FileText className="h-4 w-4" />}
                label="Total Legislação"
                value={qualityStats?.total || 0}
                sublabel={`${qualityStats?.ptLegislation || 0} PT / ${qualityStats?.euLegislation || 0} EU`}
              />
              <StatCard
                icon={<BookOpen className="h-4 w-4" />}
                label="Total Requisitos"
                value={qualityStats?.totalRequirements || 0}
                sublabel={`${qualityStats?.ptRequirements || 0} PT / ${qualityStats?.euRequirements || 0} EU`}
              />
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
                label="Com Requisitos"
                value={(qualityStats?.total || 0) - (qualityStats?.noRequirements || 0)}
                sublabel={`${Math.round(((qualityStats?.total || 0) - (qualityStats?.noRequirements || 0)) / (qualityStats?.total || 1) * 100)}% completo`}
                positive
              />
              <StatCard
                icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                label="Pendentes"
                value={qualityStats?.noRequirements || 0}
                sublabel="Sem requisitos"
                negative
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<BookOpen className="h-5 w-5" />}
          title="Sem Requisitos"
          count={qualityStats?.noRequirements || 0}
          total={qualityStats?.total || 0}
          severity="error"
          description="Diplomas sem obrigações legais extraídas"
        />

        <MetricCard
          icon={<FileText className="h-5 w-5" />}
          title="Sem Sumário"
          count={qualityStats?.missingSummary || 0}
          total={qualityStats?.total || 0}
          severity="warning"
          description="Diplomas sem resumo preenchido"
        />

        <MetricCard
          icon={<Globe className="h-5 w-5" />}
          title="Sem Categoria"
          count={qualityStats?.noCategories || 0}
          total={qualityStats?.total || 0}
          severity="warning"
          description="Diplomas sem categorias atribuídas"
        />

        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Com URL"
          count={qualityStats?.withUrl || 0}
          total={qualityStats?.total || 0}
          severity="info"
          description="Diplomas com link oficial"
          inverted
        />
      </div>

      {/* No Digital Version Notice */}
      {(qualityStats?.noDigitalVersion || 0) > 0 && (
        <Card className="border-muted bg-muted/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-medium">
                  {qualityStats?.noDigitalVersion} diplomas sem versão digital disponível
                </div>
                <div className="text-xs text-muted-foreground">
                  Legislação antiga sem versão digitalizada online (ex: Decretos do Estado Novo). Excluídos do contador de problemas.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Origin Distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Distribuição por Origem</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-green-500/5">
              <div className="flex items-center gap-3">
                <Flag className="h-5 w-5 text-green-600" />
                <div>
                  <div className="font-medium">🇵🇹 Portugal (DRE)</div>
                  <div className="text-sm text-muted-foreground">
                    {qualityStats?.ptRequirements || 0} requisitos
                  </div>
                </div>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {qualityStats?.ptLegislation || 0}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border bg-blue-500/5">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="font-medium">🇪🇺 União Europeia</div>
                  <div className="text-sm text-muted-foreground">
                    {qualityStats?.euRequirements || 0} requisitos
                  </div>
                </div>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {qualityStats?.euLegislation || 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Stat Card Component
function StatCard({ 
  icon, 
  label, 
  value, 
  sublabel,
  positive,
  negative,
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number;
  sublabel?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${positive ? "text-green-600" : negative ? "text-amber-600" : ""}`}>
        {value.toLocaleString("pt-PT")}
      </div>
      {sublabel && (
        <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>
      )}
    </div>
  );
}

// Metric Card Component (simplified, no actions)
function MetricCard({
  icon,
  title,
  count,
  total,
  severity,
  description,
  inverted,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  total: number;
  severity: "error" | "warning" | "info";
  description: string;
  inverted?: boolean;
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  
  const severityColors = {
    error: "border-red-200 bg-red-500/5",
    warning: "border-amber-200 bg-amber-500/5",
    info: "border-blue-200 bg-blue-500/5",
  };

  const iconColors = {
    error: "text-red-600",
    warning: "text-amber-600",
    info: "text-blue-600",
  };

  const isGood = inverted ? percentage > 80 : percentage === 0;

  return (
    <Card className={`${severityColors[severity]} border`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={iconColors[severity]}>{icon}</div>
            <div className="font-medium">{title}</div>
          </div>
          <Badge variant={isGood ? "outline" : severity === "error" ? "destructive" : "secondary"}>
            {percentage}%
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{count.toLocaleString("pt-PT")}</span>
            <span className="text-sm text-muted-foreground">/ {total.toLocaleString("pt-PT")}</span>
          </div>

          <Progress 
            value={inverted ? percentage : 100 - percentage} 
            className="h-2"
          />

          <p className="text-xs text-muted-foreground">{description}</p>

          {isGood && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              {inverted ? "Bom estado" : "Sem problemas"}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
