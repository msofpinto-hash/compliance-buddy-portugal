import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Link, Calendar, Type, FileText, ListChecks, GitBranch, Layers,
  Loader2, RefreshCw, Play, Pause, CheckCircle2, Activity,
  Zap, ChevronRight, AlertCircle, Trash2, Timer, XCircle, ChevronDown
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatDistanceToNow, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

// Constants
const STALE_JOB_THRESHOLD_MINUTES = 10;

// NOTE: Supabase query builder overwrites the `or` filter if `.or()` is called multiple times.
// Keep URL-related OR conditions in a single `.or(...)` call, and combine other constraints via
// separate filters (eq/is) or via multiple queries.
const URL_NEEDS_FIX_OR =
  "document_url.is.null," +
  "document_url.like.%dre.pt/dre/detalhe%," +
  "document_url.like.%data.dre.pt/eli%," +
  "document_url.like.%dre.pt/web/guest%," +
  "document_url.like.%dre.pt/application/file%," +
  "document_url.like.%dre.pt/home%," +
  "document_url.like.%dre.pt/util/getdiplomas%";

const URL_MISSING_OR = "document_url.is.null,document_url.eq.";

interface FixStats {
  urls: number;
  dates: number;
  titles: number;
  summaries: number;
  requirements: number;
  relations: number;
  categories: number;
}

interface RunningJob {
  id: string;
  sync_type: string;
  status: string;
  items_processed: number;
  items_added: number;
  started_at: string;
}

type FixType = "urls" | "dates" | "titles" | "summaries" | "requirements" | "relations" | "categories";

const FIX_LABELS: Record<FixType, string> = {
  urls: "URLs",
  dates: "Datas",
  titles: "Títulos",
  summaries: "Sumários",
  requirements: "Requisitos",
  relations: "Relações",
  categories: "Categorias",
};

const SYNC_TYPE_TO_FIX: Record<string, FixType> = {
  "fix-broken-urls": "urls",
  "fix_broken_urls": "urls",
  "find-missing-dre-urls": "urls",
  "find_dre_urls": "urls",
  "validate_urls": "urls",
  "fix_legacy_urls": "urls",
  "fix_missing_urls_eu": "urls",
  "fix_missing_dates": "dates",
  "reimport-eurlex-dates": "dates",
  "reimport_eurlex_dates": "dates",
  "complete-auto-imported-legislation": "titles",
  "complete_auto_imported": "titles",
  "fix_generic_titles": "titles",
  "reimport-dre-metadata": "titles",
  "reimport_dre_metadata": "titles",
  "fix-eurlex-titles": "titles",
  "fix-generic-titles": "titles",
  "fix_missing_summary": "summaries",
  "fix_short_summary": "summaries",
  "extract-requirements": "requirements",
  "extract-requirements-background": "requirements",
  "background-requirements-extraction": "requirements",
  "fix-incomplete-requirements": "requirements",
  "post-fix-requirements-extraction": "requirements",
  "extract-legislation-relations": "relations",
  "extract_relations": "relations",
  "bulk-suggest-categories": "categories",
  "suggest_categories": "categories",
  "auto-categorize-legislation": "categories",
};

const FIX_PHASES: { name: string; types: FixType[]; icon: React.ReactNode }[] = [
  { name: "URLs", types: ["urls"], icon: <Link className="h-4 w-4" /> },
  { name: "Metadados", types: ["dates", "titles", "summaries"], icon: <Calendar className="h-4 w-4" /> },
  { name: "Requisitos", types: ["requirements"], icon: <ListChecks className="h-4 w-4" /> },
  { name: "Relações", types: ["relations"], icon: <GitBranch className="h-4 w-4" /> },
  { name: "Categorias", types: ["categories"], icon: <Layers className="h-4 w-4" /> },
];

export function UnifiedDataQualityPanel() {
  const queryClient = useQueryClient();
  const [activeFixType, setActiveFixType] = useState<FixType | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  const sinceIso = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);

  // Query for 24h stats
  const statsQuery = useQuery({
    queryKey: ["unified-jobs-stats", { sinceIso }],
    queryFn: async () => {
      const [runningRes, completedRes, failedRes] = await Promise.all([
        supabase.from("sync_logs").select("id", { count: "exact", head: true }).eq("status", "running"),
        supabase.from("sync_logs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("started_at", sinceIso),
        supabase.from("sync_logs").select("id", { count: "exact", head: true }).in("status", ["failed", "completed_with_errors", "completed_timeout"]).gte("started_at", sinceIso),
      ]);

      if (runningRes.error) throw runningRes.error;
      if (completedRes.error) throw completedRes.error;
      if (failedRes.error) throw failedRes.error;

      return {
        runningNow: runningRes.count ?? 0,
        completed24h: completedRes.count ?? 0,
        failed24h: failedRes.count ?? 0,
      };
    },
    refetchInterval: (q) => {
      const d = q.state.data as { runningNow: number } | undefined;
      return (d?.runningNow ?? 0) > 0 ? 5000 : 30000;
    },
    // Mantém o painel a atualizar mesmo se a aba perder foco.
    refetchIntervalInBackground: true,
  });

  const refetch24h = statsQuery.refetch;

  // Query for running jobs
  const { data: runningJobs, refetch: refetchJobs } = useQuery({
    queryKey: ["running-fix-jobs"],
    queryFn: async (): Promise<RunningJob[]> => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("id, sync_type, status, items_processed, items_added, started_at")
        .eq("status", "running")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  // Query for pending counts
  const { data: fixStats, isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ["data-fix-stats-compact"],
    queryFn: async (): Promise<FixStats> => {
      // URL pending count: treat `no_digital_version = null` as equivalent to false.
      // We do this via 2 head-count queries (null + false) to avoid calling `.or()` twice.
      const [urlsFalseRes, urlsNullRes] = await Promise.all([
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .eq("no_digital_version", false)
          .or(URL_NEEDS_FIX_OR),
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .is("no_digital_version", null)
          .or(URL_NEEDS_FIX_OR),
      ]);

      if (urlsFalseRes.error) throw urlsFalseRes.error;
      if (urlsNullRes.error) throw urlsNullRes.error;

      const urlsCount = (urlsFalseRes.count ?? 0) + (urlsNullRes.count ?? 0);

      const [datesResult, genericTitlesResult, shortSummariesResult, categoriesResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .not("document_url", "is", null)
          .or("publication_date.is.null,effective_date.is.null"),
        supabase.rpc("count_generic_titles"),
        supabase.rpc("count_short_summaries"),
        supabase.rpc("get_legislation_without_categories_count"),
      ]);

      const [totalLegResult, processedRelationsResult, reqLegResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true }),
        supabase.from("legislation_relations_processed").select("id", { count: "exact", head: true }),
        supabase.from("legal_requirements").select("legislation_id").limit(15000),
      ]);

      const uniqueReqLeg = new Set((reqLegResult.data || []).map(r => r.legislation_id));

      return {
        urls: urlsCount,
        dates: datesResult.count || 0,
        titles: (genericTitlesResult.data as number) || 0,
        summaries: (shortSummariesResult.data as number) || 0,
        requirements: Math.max(0, (totalLegResult.count || 0) - uniqueReqLeg.size),
        relations: Math.max(0, (totalLegResult.count || 0) - (processedRelationsResult.count || 0)),
        categories: (categoriesResult.data as number) || 0,
      };
    },
    staleTime: 1000,
    // As contagens precisam de refletir alterações em tabelas além de sync_logs.
    // Polling frequente (mas não agressivo) evita que pareça "congelado".
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('unified-quality-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_logs' }, () => {
        refetchStats();
        refetchJobs();
        refetch24h();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refetchStats, refetchJobs, refetch24h]);

  const getRunningJobsForType = (type: FixType): RunningJob[] => {
    return runningJobs?.filter(job => SYNC_TYPE_TO_FIX[job.sync_type] === type) || [];
  };

  // Launch batch
  const launchBatch = useCallback(async (type: FixType) => {
    let functionName = "";
    let body = {};

    switch (type) {
      case "urls":
        {
          // Decide based on pending work:
          // - EU missing URLs => fix-broken-urls (generates CELEX URLs)
          // - PT missing URLs => find-missing-dre-urls (Firecrawl search)
          const [euMissingFalseRes, euMissingNullRes] = await Promise.all([
            supabase
              .from("legislation")
              .select("id", { count: "exact", head: true })
              .in("origin", ["EU", "eurlex"])
              .eq("no_digital_version", false)
              .or(URL_MISSING_OR),
            supabase
              .from("legislation")
              .select("id", { count: "exact", head: true })
              .in("origin", ["EU", "eurlex"])
              .is("no_digital_version", null)
              .or(URL_MISSING_OR),
          ]);

          if (euMissingFalseRes.error) throw euMissingFalseRes.error;
          if (euMissingNullRes.error) throw euMissingNullRes.error;

          const euMissing = (euMissingFalseRes.count ?? 0) + (euMissingNullRes.count ?? 0);

          if (euMissing > 0) {
            functionName = "fix-broken-urls";
            body = { syncType: "fix_missing_urls_eu", limit: 50, origin: "EU", mode: "recover", background: true };
          } else {
            functionName = "find-missing-dre-urls";
            body = { limit: 50, background: true, dryRun: false };
          }
        }
        break;
      case "titles":
        functionName = "complete-auto-imported-legislation";
        body = { mode: "generic_titles", limit: 20, dryRun: false, requireUrl: true };
        break;
      case "summaries":
        functionName = "complete-auto-imported-legislation";
        body = { mode: "short_summary", limit: 20, dryRun: false, requireUrl: true };
        break;
      case "dates":
        functionName = "complete-auto-imported-legislation";
        body = { mode: "missing_dates", limit: 20, dryRun: false, requireUrl: true };
        break;
      case "requirements":
        functionName = "extract-requirements-background";
        body = { batchSize: 20, maxBatches: 5 };
        break;
      case "relations":
        functionName = "extract-legislation-relations";
        body = { limit: 50, background: true };
        break;
      case "categories":
        functionName = "bulk-suggest-categories";
        body = { limit: 50, background: true };
        break;
    }

    try {
      const { error } = await supabase.functions.invoke(functionName, { body });
      if (error) throw error;

      refetchJobs();
      refetchStats();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Falha ao lançar "${functionName}": ${msg}`);
      throw e;
    }
  }, [refetchJobs, refetchStats]);

  // Auto-fix loop
  useEffect(() => {
    if (!activeFixType || !fixStats) return;

    const runBatchFix = async () => {
      const currentRunning = runningJobs?.length ?? 0;
      if (currentRunning >= 3) return;

      const count = fixStats[activeFixType];
      if (count === 0) {
        setActiveFixType(null);
        toast.success(`✅ ${FIX_LABELS[activeFixType]} - Correção concluída!`);
        return;
      }

      await launchBatch(activeFixType);
    };

    const interval = setInterval(runBatchFix, 5000);
    runBatchFix();
    return () => clearInterval(interval);
  }, [activeFixType, fixStats, runningJobs, launchBatch]);

  const toggleFixType = (type: FixType) => {
    if (activeFixType === type) {
      setActiveFixType(null);
      toast.info(`${FIX_LABELS[type]} - Parado`);
    } else {
      setActiveFixType(type);
      toast.success(`${FIX_LABELS[type]} - Iniciado`);
    }
  };

  const totalPending = Object.values(fixStats || {}).reduce((sum, val) => sum + val, 0);
  const activeJobsCount = runningJobs?.length ?? 0;
  const stats24h = statsQuery.data;

  const getPhaseStats = (types: FixType[]) => {
    const total = types.reduce((sum, t) => sum + (fixStats?.[t] || 0), 0);
    const hasRunning = types.some(t => getRunningJobsForType(t).length > 0);
    const isActive = types.includes(activeFixType as FixType);
    return { total, hasRunning, isActive, isDone: total === 0 };
  };

  return (
    <Card className="bg-gradient-to-r from-amber-50/80 to-orange-50/60 dark:from-amber-950/40 dark:to-orange-950/30 border-amber-200/60 dark:border-amber-800/40">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              activeJobsCount > 0 ? "bg-blue-500 animate-pulse" : "bg-amber-500"
            }`}>
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                Qualidade de Dados
                {activeJobsCount > 0 && (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {activeJobsCount} a correr
                  </Badge>
                )}
              </CardTitle>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchStats(); refetchJobs(); statsQuery.refetch(); }}
            disabled={isLoadingStats}
            className="shrink-0"
          >
            {isLoadingStats ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">
        {/* Mini stats row */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-2">
            <div className="text-lg font-semibold tabular-nums text-blue-600">
              {stats24h?.runningNow ?? "…"}
            </div>
            <div className="text-[10px] text-muted-foreground">A correr</div>
          </div>
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-2">
            <div className="text-lg font-semibold tabular-nums text-green-600">
              {stats24h?.completed24h ?? "…"}
            </div>
            <div className="text-[10px] text-muted-foreground">Completos 24h</div>
          </div>
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-2">
            <div className="text-lg font-semibold tabular-nums text-red-600">
              {stats24h?.failed24h ?? "…"}
            </div>
            <div className="text-[10px] text-muted-foreground">Falhas 24h</div>
          </div>
          <div className="rounded-lg bg-white/60 dark:bg-white/5 p-2">
            <div className="text-lg font-semibold tabular-nums text-amber-600">
              {totalPending}
            </div>
            <div className="text-[10px] text-muted-foreground">Pendentes</div>
          </div>
        </div>

        {/* Phases compact */}
        <div className="space-y-2">
          {FIX_PHASES.map((phase) => {
            const phaseStats = getPhaseStats(phase.types);
            const isExpanded = expandedPhase === phase.name;

            return (
              <Collapsible key={phase.name} open={isExpanded} onOpenChange={() => setExpandedPhase(isExpanded ? null : phase.name)}>
                <CollapsibleTrigger asChild>
                  <div className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                    phaseStats.isDone ? "bg-green-100/80 dark:bg-green-900/30" :
                    phaseStats.isActive ? "bg-blue-100/80 dark:bg-blue-900/30 ring-2 ring-blue-400" :
                    phaseStats.hasRunning ? "bg-blue-50/80 dark:bg-blue-900/20" :
                    "bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10"
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${
                        phaseStats.isDone ? "bg-green-500 text-white" :
                        phaseStats.hasRunning ? "bg-blue-500 text-white animate-pulse" :
                        "bg-muted"
                      }`}>
                        {phaseStats.hasRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : phase.icon}
                      </div>
                      <span className="font-medium text-sm">{phase.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {phaseStats.isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <Badge variant={phaseStats.total > 100 ? "destructive" : "secondary"} className="text-xs">
                          {phaseStats.total}
                        </Badge>
                      )}
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 pl-4 space-y-1">
                  {phase.types.map(type => {
                    const count = fixStats?.[type] || 0;
                    const isActive = activeFixType === type;
                    const hasJobs = getRunningJobsForType(type).length > 0;

                    return (
                      <div key={type} className="flex items-center justify-between p-2 rounded bg-muted/30">
                        <div className="flex items-center gap-2">
                          {hasJobs && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                          <span className="text-sm">{FIX_LABELS[type]}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => { e.stopPropagation(); launchBatch(type); }}
                            disabled={count === 0 || isActive}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            Lançar
                          </Button>
                          <Button
                            variant={isActive ? "destructive" : "outline"}
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => { e.stopPropagation(); toggleFixType(type); }}
                            disabled={count === 0 && !isActive}
                          >
                            {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </Button>
                          <Badge variant={count > 100 ? "destructive" : "secondary"} className="text-xs min-w-[40px] justify-center">
                            {count}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>

        {/* All done message */}
        {totalPending === 0 && activeJobsCount === 0 && (
          <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Todos os dados estão corrigidos!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
