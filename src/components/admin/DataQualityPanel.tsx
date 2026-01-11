import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  Link as LinkIcon,
  BookOpen,
  Loader2,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  ArrowRight,
  BarChart3,
  Sparkles,
  Copy,
  Flag,
  Globe,
  Unlink,
  GitBranch,
  Download,
  Activity,
  Clock
} from "lucide-react";
import { BulkFixMetadataDialog } from "./BulkFixMetadataDialog";
import { ValidateUrlsDialog } from "./ValidateUrlsDialog";
import { FixGenericTitlesDialog } from "./FixGenericTitlesDialog";
import { FixEurlexTitlesDialog } from "./FixEurlexTitlesDialog";
import { FindMissingUrlsDialog } from "./FindMissingUrlsDialog";
import { ImportUrlsCsvDialog } from "./ImportUrlsCsvDialog";
import { ImportEurlexSummariesDialog } from "./ImportEurlexSummariesDialog";
import { ExtractRelationsDialog } from "./ExtractRelationsDialog";
import { CompleteAutoImportedDialog } from "./CompleteAutoImportedDialog";
import { BulkAutoFixDialog } from "./BulkAutoFixDialog";

interface DataQualityMetric {
  label: string;
  icon: React.ReactNode;
  count: number;
  total: number;
  severity: "error" | "warning" | "info";
  action?: string;
  actionHandler?: () => void;
}

export function DataQualityPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showFixMetadataDialog, setShowFixMetadataDialog] = useState(false);
  const [showValidateUrlsDialog, setShowValidateUrlsDialog] = useState(false);
  const [showFixTitlesDialog, setShowFixTitlesDialog] = useState(false);
  const [showFixEurlexTitlesDialog, setShowFixEurlexTitlesDialog] = useState(false);
  const [showFindMissingUrlsDialog, setShowFindMissingUrlsDialog] = useState(false);
  const [showImportUrlsCsvDialog, setShowImportUrlsCsvDialog] = useState(false);
  const [showImportEurlexSummariesDialog, setShowImportEurlexSummariesDialog] = useState(false);
  const [showExtractRelationsDialog, setShowExtractRelationsDialog] = useState(false);
  const [showCompleteAutoImportedDialog, setShowCompleteAutoImportedDialog] = useState(false);
  const [showBulkAutoFixDialog, setShowBulkAutoFixDialog] = useState(false);
  const [isRemovingDuplicateReqs, setIsRemovingDuplicateReqs] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Query for active jobs
  const { data: activeJobs } = useQuery({
    queryKey: ["active-sync-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("id, sync_type, started_at")
        .eq("status", "running")
        .order("started_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000, // Check for active jobs every 5 seconds
  });

  // Fetch comprehensive data quality statistics
  const { data: qualityStats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["data-quality-stats"],
    queryFn: async () => {
      setLastRefresh(new Date());
      // Parallel queries for all metrics - use exact counts where possible
      const [
        totalLegislation,
        missingSummary,
        missingUrl,
        missingOrigin,
        noCategories,
        totalRequirements,
        ptLegislation,
        euLegislation,
        relationsData,
        incompleteAutoImported,
        legislationWithReqsCount,
      ] = await Promise.all([
        // Total legislation
        supabase.from("legislation").select("id", { count: "exact", head: true }),
        // Missing summary
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("summary.is.null,summary.eq."),
        // Missing URL
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("document_url.is.null,document_url.eq."),
        // Missing origin
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("origin.is.null,origin.eq."),
        // No categories
        supabase.rpc("get_legislation_without_categories_count"),
        // Total requirements
        supabase.from("legal_requirements").select("id", { count: "exact", head: true }),
        // PT legislation
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("origin.eq.PT,origin.eq.dre"),
        // EU legislation
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("origin.eq.EU,origin.eq.eurlex"),
        // Relations data - use count instead of fetching all
        supabase.from("legislation_relations").select("relation_type", { count: "exact", head: false }).limit(10000),
        // Incomplete auto-imported legislation
        supabase.from("legislation")
          .select("id", { count: "exact", head: true })
          .or("document_url.is.null,summary.ilike.%Diploma referenciado%,summary.is.null"),
        // Count distinct legislation IDs that have requirements
        supabase.from("legal_requirements")
          .select("legislation_id")
          .limit(15000),
      ]);

      const total = totalLegislation.count || 0;
      
      // Calculate legislation without requirements
      const uniqueLegislationWithReqs = new Set(
        (legislationWithReqsCount.data || []).map((r: any) => r.legislation_id)
      );
      const withoutReqsCount = total - uniqueLegislationWithReqs.size;

      // Fetch all legislation for generic title detection (need full data)
      const { data: allLegislation } = await supabase
        .from("legislation")
        .select("id, number, title, origin, external_id, document_url")
        .limit(10000);
      
      const legislationData = allLegislation || [];
      
      // Count generic titles PT (title = number or matches generic pattern)
      const genericPatternPT = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Declaração|Acórdão|Aviso|Parecer)\s+n\.?º?\s/i;
      const ptLegislationData = legislationData.filter((leg: any) => 
        leg.origin === 'PT' || leg.origin === 'dre'
      );
      
      // Filter PT legislation with generic titles
      const ptWithGenericTitles = ptLegislationData.filter((leg: any) => {
        const titleEqualsNumber = leg.title === leg.number;
        const hasGenericPattern = genericPatternPT.test(leg.title || '') && 
          (leg.title?.length || 0) < 80 && 
          !leg.title?.includes(' - ');
        return titleEqualsNumber || hasGenericPattern || !leg.title;
      });
      
      // Count only those with valid DRE URL (can be auto-corrected via scraping)
      const genericTitlesPTCount = ptWithGenericTitles.filter((leg: any) => 
        leg.document_url && leg.document_url.includes('/dr/detalhe/')
      ).length;
      
      // Count those without valid URL (need manual intervention)
      const genericTitlesPTNoUrlCount = ptWithGenericTitles.filter((leg: any) => 
        !leg.document_url || !leg.document_url.includes('/dr/detalhe/')
      ).length;

      // Count generic titles EU
      const euLegislationData = legislationData.filter((leg: any) => 
        leg.origin === 'EU' || leg.origin === 'eurlex'
      );
      const genericTitlesEUCount = euLegislationData.filter((leg: any) => {
        const titleEqualsCelex = leg.title === leg.external_id || leg.title === leg.number;
        const isGenericTitle = 
          leg.title?.startsWith('Documento ') ||
          leg.title?.startsWith('32') ||
          leg.title?.startsWith('22') ||
          leg.title?.startsWith('52') ||
          !leg.title ||
          (leg.title?.length || 0) < 30;
        return titleEqualsCelex || isGenericTitle;
      }).length;

      const missingUrlCount = missingUrl.count || 0;
      
      // Calculate relations stats by type
      const relationsArray = relationsData.data || [];
      const totalRelations = relationsData.count || relationsArray.length;
      const relationsByType: Record<string, number> = {};
      relationsArray.forEach((r: { relation_type: string }) => {
        relationsByType[r.relation_type] = (relationsByType[r.relation_type] || 0) + 1;
      });
      
      // Get unique legislation with relations
      const { data: legislationWithRelations } = await supabase
        .from("legislation_relations")
        .select("source_legislation_id, target_legislation_id")
        .limit(10000);
      
      const uniqueLegislationWithRelations = new Set<string>();
      legislationWithRelations?.forEach(r => {
        uniqueLegislationWithRelations.add(r.source_legislation_id);
        uniqueLegislationWithRelations.add(r.target_legislation_id);
      });

      // Get duplicate requirements count using aggregation
      const { data: dupReqs } = await supabase
        .from("legal_requirements")
        .select("legislation_id, requirement_text")
        .limit(15000);
      
      const reqMap = new Map<string, number>();
      dupReqs?.forEach(r => {
        const key = `${r.legislation_id}:${r.requirement_text}`;
        reqMap.set(key, (reqMap.get(key) || 0) + 1);
      });
      const duplicateCount = Array.from(reqMap.values()).reduce((acc, count) => acc + (count > 1 ? count - 1 : 0), 0);

      // Get requirements count by origin via join
      const { data: ptReqsData, count: ptReqsCount } = await supabase
        .from("legal_requirements")
        .select("id, legislation:legislation_id!inner(origin)", { count: "exact", head: true })
        .or("origin.eq.PT,origin.eq.dre", { foreignTable: "legislation" });

      const { data: euReqsData, count: euReqsCount } = await supabase
        .from("legal_requirements")
        .select("id, legislation:legislation_id!inner(origin)", { count: "exact", head: true })
        .or("origin.eq.EU,origin.eq.eurlex", { foreignTable: "legislation" });
      
      return {
        total,
        genericTitlesPT: genericTitlesPTCount,
        genericTitlesPTNoUrl: genericTitlesPTNoUrlCount,
        genericTitlesEU: genericTitlesEUCount,
        missingSummary: missingSummary.count || 0,
        missingUrl: missingUrlCount,
        withUrl: total - missingUrlCount,
        missingOrigin: missingOrigin.count || 0,
        noCategories: typeof noCategories.data === 'number' ? noCategories.data : 0,
        noRequirements: withoutReqsCount,
        totalRequirements: totalRequirements.count || 0,
        duplicateRequirements: duplicateCount,
        ptLegislation: ptLegislation.count || 0,
        euLegislation: euLegislation.count || 0,
        ptRequirements: ptReqsCount || 0,
        euRequirements: euReqsCount || 0,
        totalRelations,
        relationsByType,
        legislationWithRelations: uniqueLegislationWithRelations.size,
        legislationWithoutRelations: total - uniqueLegislationWithRelations.size,
        incompleteAutoImported: incompleteAutoImported.count || 0,
      };
    },
    refetchInterval: autoRefresh ? 10000 : false, // Refetch every 10 seconds when auto-refresh is enabled
  });

  // Auto-refresh polling effect
  useEffect(() => {
    if (autoRefresh) {
      toast({
        title: "Auto-refresh ativado",
        description: "As métricas serão atualizadas a cada 10 segundos.",
      });
    }
  }, [autoRefresh]);

  // Remove duplicate requirements
  const handleRemoveDuplicateRequirements = async () => {
    setIsRemovingDuplicateReqs(true);
    try {
      // Get all requirements
      const { data: allReqs, error } = await supabase
        .from("legal_requirements")
        .select("id, legislation_id, requirement_text, created_at")
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Find duplicates (keep oldest)
      const seen = new Map<string, string>();
      const toDelete: string[] = [];

      allReqs?.forEach(req => {
        const key = `${req.legislation_id}:${req.requirement_text}`;
        if (seen.has(key)) {
          toDelete.push(req.id); // This is a duplicate, mark for deletion
        } else {
          seen.set(key, req.id);
        }
      });

      if (toDelete.length === 0) {
        toast({
          title: "Sem duplicados",
          description: "Não foram encontrados requisitos duplicados.",
        });
        return;
      }

      // Delete in batches
      const batchSize = 100;
      let deleted = 0;
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);
        const { error: deleteError } = await supabase
          .from("legal_requirements")
          .delete()
          .in("id", batch);
        
        if (deleteError) {
          console.error("Delete batch error:", deleteError);
        } else {
          deleted += batch.length;
        }
      }

      toast({
        title: "Duplicados removidos",
        description: `${deleted} requisitos duplicados foram eliminados.`,
      });

      queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
      refetch();
    } catch (error) {
      console.error("Error removing duplicates:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao remover duplicados",
        variant: "destructive",
      });
    } finally {
      setIsRemovingDuplicateReqs(false);
    }
  };

  const calculateQualityScore = () => {
    if (!qualityStats) return 0;
    const { total, genericTitlesPT, genericTitlesEU, missingSummary, missingUrl, noRequirements } = qualityStats;
    if (total === 0) return 100;

    // Weighted score (titles and requirements are most important)
    const genericTitles = genericTitlesPT + genericTitlesEU;
    const titleScore = ((total - genericTitles) / total) * 30;
    const summaryScore = ((total - missingSummary) / total) * 20;
    const urlScore = ((total - missingUrl) / total) * 20;
    const requirementsScore = ((total - noRequirements) / total) * 30;

    return Math.round(titleScore + summaryScore + urlScore + requirementsScore);
  };

  const qualityScore = calculateQualityScore();

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
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

  // Format job type for display
  const formatJobType = (type: string) => {
    const typeMap: Record<string, string> = {
      'find-missing-urls': 'Correção de URLs',
      'fix-metadata': 'Correção de Metadados',
      'fix-generic-titles': 'Correção de Títulos PT',
      'fix-eurlex-titles': 'Correção de Títulos EU',
      'extract-relations': 'Extração de Relações',
      'validate-urls': 'Validação de URLs',
      'complete-auto-imported': 'Completar Auto-importados',
      'sync-dre': 'Sincronização DRE',
      'sync-eurlex': 'Sincronização EUR-Lex',
      'scheduled-data-quality-fix': 'Correção Automática',
    };
    return typeMap[type] || type;
  };

  // Calculate time elapsed
  const getElapsedTime = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - start.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="space-y-6">
      {/* Active Jobs Banner */}
      {activeJobs && activeJobs.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900">
              <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                {activeJobs.length === 1 ? 'Job em execução' : `${activeJobs.length} Jobs em execução`}
              </h4>
              <div className="flex flex-wrap gap-3 mt-1">
                {activeJobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="font-medium">{formatJobType(job.sync_type)}</span>
                    <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400">
                      <Clock className="h-3 w-3" />
                      {getElapsedTime(job.started_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {!autoRefresh && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setAutoRefresh(true)}
                className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
              >
                <Play className="h-4 w-4 mr-2" />
                Ativar Auto-refresh
              </Button>
            )}
          </div>
        </div>
      )}

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
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowBulkAutoFixDialog(true)}
                className="bg-gradient-to-r from-primary to-primary/80"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Corrigir Tudo
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Atualizar
              </Button>
              <Button 
                variant={autoRefresh ? "default" : "outline"} 
                size="sm" 
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? "bg-green-600 hover:bg-green-700" : ""}
              >
                {autoRefresh ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Parar Auto-refresh
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Auto-refresh
                  </>
                )}
              </Button>
            </div>
            {autoRefresh && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>A atualizar automaticamente a cada 10s</span>
                {lastRefresh && (
                  <span className="text-xs">
                    (última: {lastRefresh.toLocaleTimeString()})
                  </span>
                )}
              </div>
            )}
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

      {/* Problems Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ProblemCard
          icon={<FileText className="h-5 w-5" />}
          title="Títulos Genéricos (PT)"
          count={qualityStats?.genericTitlesPT || 0}
          total={qualityStats?.ptLegislation || 0}
          severity="error"
          description={`Diplomas PT com título genérico e URL válido${qualityStats?.genericTitlesPTNoUrl ? ` (+${qualityStats.genericTitlesPTNoUrl} sem URL)` : ''}`}
          action="Corrigir via DRE"
          onAction={() => setShowFixTitlesDialog(true)}
          disabled={(qualityStats?.genericTitlesPT || 0) === 0}
        />

        <ProblemCard
          icon={<Globe className="h-5 w-5" />}
          title="Títulos Genéricos (EU)"
          count={qualityStats?.genericTitlesEU || 0}
          total={qualityStats?.euLegislation || 0}
          severity="warning"
          description="Diplomas EU que podem ter títulos incompletos (via SPARQL)"
          action="Corrigir via EUR-Lex"
          onAction={() => setShowFixEurlexTitlesDialog(true)}
          disabled={(qualityStats?.euLegislation || 0) === 0}
        />

        <ProblemCard
          icon={<BookOpen className="h-5 w-5" />}
          title="Sem Sumário"
          count={qualityStats?.missingSummary || 0}
          total={qualityStats?.total || 0}
          severity="warning"
          description="Diplomas sem descrição/resumo (maioria EU)"
          action="Importar EUR-Lex"
          onAction={() => setShowImportEurlexSummariesDialog(true)}
          secondaryAction="Corrigir Metadados"
          onSecondaryAction={() => setShowFixMetadataDialog(true)}
        />

        <ProblemCard
          icon={<LinkIcon className="h-5 w-5" />}
          title="URLs em Falta (PT)"
          count={qualityStats?.genericTitlesPTNoUrl || 0}
          total={qualityStats?.ptLegislation || 0}
          severity="warning"
          description="Diplomas PT com título genérico mas sem URL do DRE"
          action="Encontrar URLs"
          onAction={() => setShowFindMissingUrlsDialog(true)}
          disabled={(qualityStats?.genericTitlesPTNoUrl || 0) === 0}
          secondaryAction="Importar via CSV"
          onSecondaryAction={() => setShowImportUrlsCsvDialog(true)}
        />

        <ProblemCard
          icon={<LinkIcon className="h-5 w-5" />}
          title="Sem URL (Geral)"
          count={qualityStats?.missingUrl || 0}
          total={qualityStats?.total || 0}
          severity="warning"
          description="Todos os diplomas sem link para documento oficial"
          action="Corrigir Metadados"
          onAction={() => setShowFixMetadataDialog(true)}
        />

        <ProblemCard
          icon={<Sparkles className="h-5 w-5" />}
          title="Sem Requisitos"
          count={qualityStats?.noRequirements || 0}
          total={qualityStats?.total || 0}
          severity="error"
          description="Diplomas sem obrigações legais extraídas"
          action="Ir para Extração"
          actionLink="/admin?tab=requirements"
        />

        <ProblemCard
          icon={<Copy className="h-5 w-5" />}
          title="Requisitos Duplicados"
          count={qualityStats?.duplicateRequirements || 0}
          total={qualityStats?.totalRequirements || 0}
          severity="warning"
          description="Requisitos repetidos no mesmo diploma"
          action={isRemovingDuplicateReqs ? "A remover..." : "Remover Duplicados"}
          onAction={handleRemoveDuplicateRequirements}
          disabled={isRemovingDuplicateReqs || (qualityStats?.duplicateRequirements || 0) === 0}
        />

        <ProblemCard
          icon={<Unlink className="h-5 w-5" />}
          title="Validar URLs"
          count={qualityStats?.withUrl || 0}
          total={qualityStats?.total || 0}
          severity="info"
          description="Verificar acessibilidade dos links existentes"
          action="Validar URLs"
          onAction={() => setShowValidateUrlsDialog(true)}
        />

        <ProblemCard
          icon={<GitBranch className="h-5 w-5" />}
          title="Sem Relações"
          count={qualityStats?.legislationWithoutRelations || 0}
          total={qualityStats?.total || 0}
          severity="info"
          description={`${qualityStats?.totalRelations || 0} relações identificadas entre ${qualityStats?.legislationWithRelations || 0} diplomas`}
          action="Extrair Relações"
          onAction={() => setShowExtractRelationsDialog(true)}
        />

        <ProblemCard
          icon={<Download className="h-5 w-5" />}
          title="Auto-Importados Incompletos"
          count={qualityStats?.incompleteAutoImported || 0}
          total={qualityStats?.total || 0}
          severity="warning"
          description="Diplomas criados automaticamente com dados em falta (sem URL ou sumário)"
          action="Completar Dados"
          onAction={() => setShowCompleteAutoImportedDialog(true)}
          disabled={(qualityStats?.incompleteAutoImported || 0) === 0}
        />

        <ProblemCard
          icon={<BarChart3 className="h-5 w-5" />}
          title="Sem Categoria"
          count={qualityStats?.noCategories || 0}
          total={qualityStats?.total || 0}
          severity="info"
          description="Diplomas não classificados por tema"
          action="Ir para Temas"
          actionLink="/admin?tab=themes"
        />
      </div>

      {/* Origin Distribution */}
      <Card>
        <CardHeader>
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

      {/* Relations Statistics */}
      {(qualityStats?.totalRelations || 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Relações entre Diplomas
            </CardTitle>
            <CardDescription>
              {qualityStats?.totalRelations || 0} relações identificadas entre {qualityStats?.legislationWithRelations || 0} diplomas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Object.entries(qualityStats?.relationsByType || {})
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div 
                    key={type} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {type.replace(/_/g, ' ')}
                      </div>
                      <div className="text-lg font-bold">{count}</div>
                    </div>
                    <RelationTypeIcon type={type} />
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <BulkFixMetadataDialog
        open={showFixMetadataDialog}
        onOpenChange={setShowFixMetadataDialog}
        problemsCount={(qualityStats?.genericTitlesPT || 0) + (qualityStats?.genericTitlesEU || 0) + (qualityStats?.missingSummary || 0) + (qualityStats?.missingUrl || 0)}
      />

      <ValidateUrlsDialog
        open={showValidateUrlsDialog}
        onOpenChange={setShowValidateUrlsDialog}
      />

      <FixGenericTitlesDialog
        open={showFixTitlesDialog}
        onOpenChange={setShowFixTitlesDialog}
        genericTitlesCount={qualityStats?.genericTitlesPT || 0}
      />

      <FixEurlexTitlesDialog
        open={showFixEurlexTitlesDialog}
        onOpenChange={setShowFixEurlexTitlesDialog}
        genericTitlesCount={qualityStats?.genericTitlesEU || 0}
      />

      <FindMissingUrlsDialog
        open={showFindMissingUrlsDialog}
        onOpenChange={setShowFindMissingUrlsDialog}
        missingUrlsCount={qualityStats?.genericTitlesPTNoUrl || 0}
      />

      <ImportUrlsCsvDialog
        open={showImportUrlsCsvDialog}
        onOpenChange={setShowImportUrlsCsvDialog}
      />

      <ImportEurlexSummariesDialog
        open={showImportEurlexSummariesDialog}
        onOpenChange={setShowImportEurlexSummariesDialog}
      />

      <ExtractRelationsDialog
        open={showExtractRelationsDialog}
        onOpenChange={setShowExtractRelationsDialog}
      />

      <CompleteAutoImportedDialog
        open={showCompleteAutoImportedDialog}
        onOpenChange={setShowCompleteAutoImportedDialog}
      />

      {qualityStats && (
        <BulkAutoFixDialog
          open={showBulkAutoFixDialog}
          onOpenChange={setShowBulkAutoFixDialog}
          qualityStats={{
            genericTitlesPT: qualityStats.genericTitlesPT,
            genericTitlesEU: qualityStats.genericTitlesEU,
            missingSummary: qualityStats.missingSummary,
            missingUrl: qualityStats.missingUrl,
            noRequirements: qualityStats.noRequirements,
            noCategories: qualityStats.noCategories,
          }}
        />
      )}
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

// Problem Card Component
function ProblemCard({
  icon,
  title,
  count,
  total,
  severity,
  description,
  action,
  actionLink,
  onAction,
  disabled,
  secondaryAction,
  onSecondaryAction,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  total: number;
  severity: "error" | "warning" | "info";
  description: string;
  action: string;
  actionLink?: string;
  onAction?: () => void;
  disabled?: boolean;
  secondaryAction?: string;
  onSecondaryAction?: () => void;
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

  const handleAction = () => {
    if (actionLink) {
      window.location.href = actionLink;
    } else if (onAction) {
      onAction();
    }
  };

  return (
    <Card className={`${severityColors[severity]} border`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={iconColors[severity]}>{icon}</div>
            <div className="font-medium">{title}</div>
          </div>
          {count > 0 && (
            <Badge variant={severity === "error" ? "destructive" : severity === "warning" ? "secondary" : "outline"}>
              {percentage}%
            </Badge>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{count.toLocaleString("pt-PT")}</span>
            <span className="text-sm text-muted-foreground">/ {total.toLocaleString("pt-PT")}</span>
          </div>

          <Progress 
            value={100 - percentage} 
            className="h-2"
          />

          <p className="text-xs text-muted-foreground">{description}</p>

          {count > 0 && (
            <div className="space-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={handleAction}
                disabled={disabled}
              >
                {action}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              {secondaryAction && onSecondaryAction && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full"
                  onClick={onSecondaryAction}
                >
                  {secondaryAction}
                </Button>
              )}
            </div>
          )}

          {count === 0 && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              Sem problemas
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Relation Type Icon Component
function RelationTypeIcon({ type }: { type: string }) {
  switch (type.toLowerCase()) {
    case 'revogado':
    case 'revogacao_parcial':
      return <span className="text-red-500">✕</span>;
    case 'alteracao':
      return <span className="text-amber-500">✎</span>;
    case 'transposicao':
      return <span className="text-blue-500">↔</span>;
    case 'regulamentacao':
      return <span className="text-green-500">§</span>;
    default:
      return <GitBranch className="h-4 w-4 text-muted-foreground" />;
  }
}
