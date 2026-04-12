import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Zap, ChevronRight, AlertCircle, Trash2, Timer, XCircle, ChevronDown, Download
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { formatDistanceToNow, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { ExecutionHistoryPanel } from "./ExecutionHistoryPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExportMetadataIssuesDialog } from "./ExportMetadataIssuesDialog";

const isSourceUnavailable = (source?: { status: string; blocked_until: string | null } | null) =>
  source ? source.status === "offline" || Boolean(source.blocked_until && new Date(source.blocked_until) > new Date()) : false;

// Constants
const STALE_JOB_THRESHOLD_MINUTES = 10;
// Reduzido de 6 para 2 para evitar sobrecarga durante instabilidade
const MAX_CONCURRENT_JOBS = 2;
const MAX_JOBS_PER_TYPE = 1;

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

// Tipo mínimo para ler mudanças realtime em sync_logs
interface SyncLogRow {
  status: string;
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

const isFreshManagedRunningJob = (job: RunningJob) => {
  if (!SYNC_TYPE_TO_FIX[job.sync_type]) return false;

  const startedAtMs = new Date(job.started_at).getTime();
  if (!Number.isFinite(startedAtMs)) return false;

  return Date.now() - startedAtMs < STALE_JOB_THRESHOLD_MINUTES * 60 * 1000;
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
  const [fullAutoMode, setFullAutoMode] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const sinceIso = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);
  const realtimeRefetchTimerRef = useRef<number | null>(null);
  const aggressiveIntervalRef = useRef<number | null>(null);

  // Query for external source status (DRE, EUR-Lex, Firecrawl)
  const { data: sourceStatus } = useQuery({
    queryKey: ["external-source-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_source_status")
        .select("source_name, status, blocked_until, error_message, last_failure_at");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const dreOpenDataStatus = sourceStatus?.find((s) => s.source_name === "dre_opendata");
  const dreWebStatus = sourceStatus?.find((s) => s.source_name === "dre_website");
  const firecrawlStatus = sourceStatus?.find((s) => s.source_name === "firecrawl");

  const isDreOpenDataUnavailable = isSourceUnavailable(dreOpenDataStatus);
  const isDreWebUnavailable = isSourceUnavailable(dreWebStatus);
  const isFirecrawlUnavailable = isSourceUnavailable(firecrawlStatus);
  const canRunPtMetadata = !isDreOpenDataUnavailable || (!isDreWebUnavailable && !isFirecrawlUnavailable);
  const isPtMetadataBlocked = !canRunPtMetadata;
  const isPtMetadataFallbackMode = isDreOpenDataUnavailable && canRunPtMetadata;

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

  const freshRunningJobs = useMemo(
    () => (runningJobs ?? []).filter(isFreshManagedRunningJob),
    [runningJobs]
  );

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
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("revocation_date", null)
          .or(`summary.not.is.null,summary.gt.${" ".repeat(20)}`),
      ]);

      // Use RPCs for accurate server-side counting (avoids client-side LIMIT issues)
      const [totalLegResult, processedRelationsResult, legWithReqsResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true }),
        supabase.from("legislation_relations_processed").select("id", { count: "exact", head: true }),
        supabase.rpc("get_legislation_with_requirements_count"),
      ]);

      const totalLeg = totalLegResult.count || 0;
      const legWithReqs = (legWithReqsResult.data as number) || 0;

      const categoriesPendingEligible = Math.max(
        0,
        (categoriesResult.count || 0) - ((shortSummariesResult.data as number) || 0),
      );

      return {
        urls: urlsCount,
        dates: datesResult.count || 0,
        titles: (genericTitlesResult.data as number) || 0,
        summaries: (shortSummariesResult.data as number) || 0,
        requirements: Math.max(0, totalLeg - legWithReqs),
        relations: Math.max(0, totalLeg - (processedRelationsResult.count || 0)),
        categories: categoriesPendingEligible,
      };
    },
    staleTime: 1000,
    // As contagens precisam de refletir alterações em tabelas além de sync_logs.
    // Polling frequente (mas não agressivo) evita que pareça "congelado".
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  // Realtime updates
  // NOTA: os jobs atualizam `items_processed` muitas vezes enquanto estão "running".
  // Se refizermos contagens a cada UPDATE, podemos saturar pedidos e a UI parece "congelar".
  // Aqui só reagimos a mudanças de estado (ex.: running -> completed/failed) e aplicamos debounce.
  useEffect(() => {
    const scheduleRefetch = () => {
      if (realtimeRefetchTimerRef.current != null) return;
      realtimeRefetchTimerRef.current = window.setTimeout(() => {
        realtimeRefetchTimerRef.current = null;
        refetchStats();
        refetchJobs();
        refetch24h();
      }, 800);
    };

    const channel = supabase
      .channel("unified-quality-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_logs" },
        (payload) => {
          const eventType = (payload as any)?.eventType as string | undefined;
          const newRow = ((payload as any)?.new ?? {}) as Partial<SyncLogRow>;
          const oldRow = ((payload as any)?.old ?? {}) as Partial<SyncLogRow>;

          // Ignorar updates de progresso (items_processed/items_added) enquanto o status não mudou.
          if (eventType === "UPDATE" && newRow.status && oldRow.status && newRow.status === oldRow.status) {
            return;
          }

          scheduleRefetch();
        }
      )
      .subscribe();

    return () => {
      if (realtimeRefetchTimerRef.current != null) {
        window.clearTimeout(realtimeRefetchTimerRef.current);
        realtimeRefetchTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [refetchStats, refetchJobs, refetch24h]);

  // Modo de atualização agressiva: refresh a cada 2s enquanto houver jobs a correr
  const hasRunningJobs = freshRunningJobs.length > 0;
  useEffect(() => {
    if (hasRunningJobs) {
      // Se já tem intervalo ativo, não criar outro
      if (aggressiveIntervalRef.current != null) return;
      aggressiveIntervalRef.current = window.setInterval(() => {
        refetchStats();
        refetchJobs();
        refetch24h();
      }, 2000);
    } else {
      // Sem jobs a correr, limpar intervalo
      if (aggressiveIntervalRef.current != null) {
        window.clearInterval(aggressiveIntervalRef.current);
        aggressiveIntervalRef.current = null;
      }
    }

    return () => {
      if (aggressiveIntervalRef.current != null) {
        window.clearInterval(aggressiveIntervalRef.current);
        aggressiveIntervalRef.current = null;
      }
    };
  }, [hasRunningJobs, refetchStats, refetchJobs, refetch24h]);

  const getRunningJobsForType = useCallback((type: FixType): RunningJob[] => {
    return freshRunningJobs.filter((job) => SYNC_TYPE_TO_FIX[job.sync_type] === type);
  }, [freshRunningJobs]);

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
        if (isPtMetadataBlocked) {
          functionName = "fix-eurlex-titles";
          body = { limit: 50, background: true };
        } else {
          functionName = "complete-auto-imported-legislation";
          body = { mode: "generic_titles", limit: 20, dryRun: false, randomOffset: true };
        }
        break;
      case "summaries":
        if (isPtMetadataBlocked) {
          functionName = "fix-eurlex-titles";
          body = { limit: 50, background: true, mode: "summaries" };
        } else {
          functionName = "complete-auto-imported-legislation";
          body = { mode: "short_summary", limit: 20, dryRun: false, randomOffset: true };
        }
        break;
      case "dates":
        if (isPtMetadataBlocked) {
          functionName = "reimport-eurlex-dates";
          body = { limit: 50, background: true };
        } else {
          functionName = "complete-auto-imported-legislation";
          body = { mode: "missing_dates", limit: 20, dryRun: false, requireUrl: true, randomOffset: true };
        }
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
        {
          functionName = "bulk-suggest-categories";
          body = { autoAssign: true, limit: 50 };
        }
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
  }, [isPtMetadataBlocked, refetchJobs, refetchStats]);

  // Auto-fix loop for single type
  useEffect(() => {
    if (fullAutoMode || !activeFixType || !fixStats) return;

    const runBatchFix = async () => {
      const currentRunning = freshRunningJobs.length;
      if (currentRunning >= MAX_CONCURRENT_JOBS) return;

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
  }, [activeFixType, fixStats, freshRunningJobs, launchBatch, fullAutoMode]);

  // Full Auto-fix mode - runs ALL types in parallel until complete
  useEffect(() => {
    if (!fullAutoMode || !fixStats) return;

    const runFullAutoFix = async () => {
      const currentRunning = freshRunningJobs.length;
      
      // Check if all done
      const totalPendingNow = Object.values(fixStats).reduce((sum, val) => sum + val, 0);
      if (totalPendingNow === 0 && currentRunning === 0) {
        setFullAutoMode(false);
        toast.success("🎉 Auto-fix Completo - Todos os dados corrigidos!");
        return;
      }

      // Limit concurrent jobs (reduzido para estabilidade)
      if (currentRunning >= MAX_CONCURRENT_JOBS) return;

      // Find types with pending work and no running jobs
      const typesToLaunch: FixType[] = [];
      (Object.keys(fixStats) as FixType[]).forEach((type) => {
        if (fixStats[type] > 0) {
          const runningForType = getRunningJobsForType(type).length;
          // Allow max 1 concurrent job per type (reduzido)
          if (runningForType < MAX_JOBS_PER_TYPE) {
            typesToLaunch.push(type);
          }
        }
      });

      // Launch one batch per type that needs it (up to remaining slots)
      const slotsAvailable = MAX_CONCURRENT_JOBS - currentRunning;
      const toLaunch = typesToLaunch.slice(0, slotsAvailable);
      
      if (toLaunch.length > 0) {
        await Promise.allSettled(toLaunch.map(type => launchBatch(type)));
      }
    };

    const interval = setInterval(runFullAutoFix, 4000);
    runFullAutoFix();
    return () => clearInterval(interval);
  }, [fullAutoMode, fixStats, freshRunningJobs, launchBatch, getRunningJobsForType]);

  const toggleFullAutoMode = () => {
    if (fullAutoMode) {
      setFullAutoMode(false);
      toast.info("Auto-fix Completo parado");
    } else {
      setActiveFixType(null); // Clear single-type auto-fix
      setFullAutoMode(true);
      toast.success("🚀 Auto-fix Completo iniciado - a correr todos os tipos!");
    }
  };

  const toggleFixType = (type: FixType) => {
    if (activeFixType === type) {
      setActiveFixType(null);
      toast.info(`${FIX_LABELS[type]} - Parado`);
    } else {
      setActiveFixType(type);
      toast.success(`${FIX_LABELS[type]} - Iniciado`);
    }
  };

  // Launch all fix types in parallel
  const launchAllBatches = useCallback(async () => {
    if (!fixStats) return;
    
    const typesToLaunch: FixType[] = [];
    (Object.keys(fixStats) as FixType[]).forEach((type) => {
      if (fixStats[type] > 0) {
        typesToLaunch.push(type);
      }
    });

    if (typesToLaunch.length === 0) {
      toast.info("Não há pendências para corrigir.");
      return;
    }

    toast.success(`🚀 A lançar ${typesToLaunch.length} tipos de correção em paralelo...`);
    
    // Launch all in parallel
    await Promise.allSettled(typesToLaunch.map(type => launchBatch(type)));
    
    toast.success(`✅ ${typesToLaunch.length} lotes lançados!`);
  }, [fixStats, launchBatch]);

  const totalPending = Object.values(fixStats || {}).reduce((sum, val) => sum + val, 0);
  const activeJobsCount = freshRunningJobs.length;
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
              {activeJobsCount > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Atualizando a cada 2s...
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={fullAutoMode ? "destructive" : "default"}
                    size="sm"
                    onClick={toggleFullAutoMode}
                    disabled={totalPending === 0 && !fullAutoMode}
                    className={fullAutoMode 
                      ? "animate-pulse" 
                      : "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                    }
                  >
                    {fullAutoMode ? (
                      <>
                        <Pause className="h-4 w-4 mr-1" />
                        Parar Auto-fix
                      </>
                    ) : (
                      <>
                        <Activity className="h-4 w-4 mr-1" />
                        Auto-fix Completo
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{fullAutoMode ? "Para o modo automático" : "Corre todos os tipos automaticamente até terminar"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={launchAllBatches}
                    disabled={totalPending === 0 || activeJobsCount > 5 || fullAutoMode}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                  >
                    <Zap className="h-4 w-4 mr-1" />
                    Lançar Todos
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Lança todas as correções uma vez em paralelo</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExportDialog(true)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Exportar lista de diplomas para correção manual</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchStats(); refetchJobs(); statsQuery.refetch(); }}
              disabled={isLoadingStats}
            >
              {isLoadingStats ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">
        {/* External Sources Health Panel */}
        {sourceStatus && sourceStatus.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/30 rounded-lg border">
            <span className="text-xs font-medium text-muted-foreground mr-1">Fontes:</span>
            {sourceStatus.map((source) => {
              const isOffline = source.status === "offline";
              const isBlocked = source.blocked_until && new Date(source.blocked_until) > new Date();
              const isDegraded = source.status === "degraded";
              const isOnline = !isOffline && !isBlocked && !isDegraded;
              
              return (
                <TooltipProvider key={source.source_name}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          isOffline || isBlocked
                            ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : isDegraded
                            ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                        }`}
                      >
                        {isOnline ? (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        ) : isOffline || isBlocked ? (
                          <XCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <AlertCircle className="h-3 w-3 mr-1" />
                        )}
                        {source.source_name.replace("_", " ").replace("dre opendata", "DRE").replace("dre website", "DRE Web").replace("eurlex", "EUR-Lex").replace("firecrawl", "Firecrawl")}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium">
                        {source.source_name.replace("_", " ").toUpperCase()} - {source.status.toUpperCase()}
                      </p>
                      {source.error_message && (
                        <p className="text-xs text-muted-foreground mt-1">{source.error_message}</p>
                      )}
                      {isBlocked && source.blocked_until && (
                        <p className="text-xs text-red-500 mt-1">
                          Bloqueado até: {new Date(source.blocked_until).toLocaleString("pt-PT")}
                        </p>
                      )}
                      {source.last_failure_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Última falha: {new Date(source.last_failure_at).toLocaleString("pt-PT")}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        )}

        {/* Source Status Alert - Dynamic from DB */}
        {isPtMetadataBlocked && (
          <Alert className="border-red-500 bg-red-50 dark:bg-red-950/50">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800 dark:text-red-200">🚫 Correções PT bloqueadas</AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-300 text-xs">
              {dreOpenDataStatus?.error_message || "Fontes PT indisponíveis"}.
              {dreOpenDataStatus?.blocked_until && (
                <span className="ml-1">
                  Bloqueado até: {new Date(dreOpenDataStatus.blocked_until).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}
                </span>
              )}
              <br />
              <span className="font-medium">É preciso ter DRE OpenData online ou DRE Web + Firecrawl disponíveis para retomar as correções PT.</span>
            </AlertDescription>
          </Alert>
        )}

        {isPtMetadataFallbackMode && (
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">⚠️ DRE OpenData Offline</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
              {dreOpenDataStatus?.error_message || "API indisponível"}.
              {dreOpenDataStatus?.blocked_until && (
                <span className="ml-1">
                  Bloqueado até: {new Date(dreOpenDataStatus.blocked_until).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}
                </span>
              )}
              <br />
              <span className="font-medium">Fallback ativo via DRE Web + Firecrawl. As correções PT continuam a correr.</span>
            </AlertDescription>
          </Alert>
        )}
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

        {/* Execution History */}
        <ExecutionHistoryPanel />
      </CardContent>

      {/* Export Dialog */}
      <ExportMetadataIssuesDialog 
        open={showExportDialog} 
        onOpenChange={setShowExportDialog} 
      />
    </Card>
  );
}
