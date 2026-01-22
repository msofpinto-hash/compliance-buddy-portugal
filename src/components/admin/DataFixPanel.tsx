import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Link, Calendar, Type, FileText, ListChecks, GitBranch, Layers,
  Loader2, Wrench, RefreshCw, Play, Pause, CheckCircle2, Activity,
  Zap, Settings2, ChevronRight, AlertCircle, Trash2
} from "lucide-react";
import { ActiveJobsBanner } from "./ActiveJobsBanner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface FixStats {
  duplicates: number;
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

type FixType = "duplicates" | "urls" | "dates" | "titles" | "summaries" | "requirements" | "relations" | "categories";

const FIX_LABELS: Record<FixType, string> = {
  duplicates: "0. Duplicados",
  urls: "1. URLs",
  dates: "2. Datas",
  titles: "2. Títulos",
  summaries: "2. Sumários",
  requirements: "3. Requisitos",
  relations: "4. Relações",
  categories: "5. Categorias",
};

const FIX_DESCRIPTIONS: Record<FixType, string> = {
  duplicates: "Consolida registos duplicados preservando dados mais completos",
  urls: "Base para tudo - sem URL não é possível obter os restantes dados",
  dates: "Obtido via scraping do URL",
  titles: "Obtido via scraping do URL",
  summaries: "Obtido via scraping do URL",
  requirements: "Extraídos do conteúdo do documento (requer URL)",
  relations: "Detetadas a partir de referências no texto (requer requisitos)",
  categories: "Atribuição automática via IA (requer sumário válido)",
};

// Dependency order: Duplicates first, then URLs, then metadata (dates/titles/summaries), then requirements, then relations, then categories
const FIX_PHASES: { name: string; types: FixType[]; description: string }[] = [
  { name: "Fase 0: Duplicados", types: ["duplicates"], description: "Consolidar registos duplicados" },
  { name: "Fase 1: URLs", types: ["urls"], description: "Obter links oficiais (base para tudo)" },
  { name: "Fase 2: Metadados", types: ["dates", "titles", "summaries"], description: "Scraping de datas, títulos e resumos" },
  { name: "Fase 3: Requisitos", types: ["requirements"], description: "Extração IA de obrigações legais" },
  { name: "Fase 4: Relações", types: ["relations"], description: "Deteção de referências entre diplomas" },
  { name: "Fase 5: Categorias", types: ["categories"], description: "Classificação temática via IA" },
];

const SYNC_TYPE_TO_FIX: Record<string, FixType> = {
  // Duplicate cleanup jobs
  "cleanup-duplicate-legislation": "duplicates",
  "cleanup_duplicates": "duplicates",
  "duplicate_cleanup": "duplicates",
  // URL jobs
  "fix-broken-urls": "urls",
  "fix_broken_urls": "urls",
  "find-missing-dre-urls": "urls",
  "find_dre_urls": "urls",
  "validate_urls": "urls",
  // Dates jobs
  "fix_missing_dates": "dates",
  "reimport-eurlex-dates": "dates",
  "reimport_eurlex_dates": "dates",
  // Title jobs
  "complete-auto-imported-legislation": "titles",
  "complete_auto_imported": "titles",
  "fix_generic_titles": "titles",
  "reimport-dre-metadata": "titles",
  "reimport_dre_metadata": "titles",
  "fix-eurlex-titles": "titles",
  "fix-generic-titles": "titles",
  // Summary jobs
  "fix_missing_summary": "summaries",
  "fix_short_summary": "summaries",
  // Requirements jobs
  "extract-requirements": "requirements",
  "extract-requirements-background": "requirements",
  "background-requirements-extraction": "requirements",
  "fix-incomplete-requirements": "requirements",
  "post-fix-requirements-extraction": "requirements",
  // Relations jobs
  "extract-legislation-relations": "relations",
  "extract_relations": "relations",
  // Categories jobs
  "bulk-suggest-categories": "categories",
  "suggest_categories": "categories",
  "auto-categorize-legislation": "categories",
};

export function DataFixPanel() {
  const [batchSize, setBatchSize] = useState(100);
  const [parallelJobs, setParallelJobs] = useState(3);
  const [showSettings, setShowSettings] = useState(false);
  const [activeFixType, setActiveFixType] = useState<FixType | null>(null);

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
  });

  const getRunningJobsForType = (type: FixType): RunningJob[] => {
    return runningJobs?.filter(job => SYNC_TYPE_TO_FIX[job.sync_type] === type) || [];
  };

  // Unified stats
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["data-fix-stats-unified"],
    queryFn: async (): Promise<FixStats> => {
      // For duplicates: check if there's a running/recent job with count info
      // If so, use that. Otherwise, do a quick sample-based estimate
      const { data: recentDupJob } = await supabase
        .from("sync_logs")
        .select("items_added, items_processed, status")
        .eq("sync_type", "duplicate_cleanup")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      let duplicateCount = 0;
      if (recentDupJob && recentDupJob.items_added) {
        // items_added = total groups found, items_processed = groups already merged
        const totalGroups = recentDupJob.items_added || 0;
        const processed = recentDupJob.items_processed || 0;
        duplicateCount = Math.max(0, totalGroups - processed);
      } else {
        // Do a quick sample-based count (fetch first 3000 records)
        const { data: legNumbers } = await supabase
          .from("legislation")
          .select("number")
          .limit(3000);
        
        const normalizeNumber = (num: string): string => {
          return num.toLowerCase().replace(/\s+/g, "").replace(/n\.?º?\s*/gi, "")
            .replace(/[–—−]/g, "-").replace(/,/g, "").trim();
        };
        
        const groups = new Map<string, number>();
        for (const item of legNumbers || []) {
          const normalized = normalizeNumber(item.number);
          groups.set(normalized, (groups.get(normalized) || 0) + 1);
        }
        
        for (const [, count] of groups) {
          if (count > 1) duplicateCount += count - 1;
        }
      }

      // URLs: document_url is null AND (no_digital_version is null OR no_digital_version is false)
      const urlsResult = await supabase
        .from("legislation")
        .select("id", { count: "exact", head: true })
        .is("document_url", null)
        .or("no_digital_version.is.null,no_digital_version.eq.false");

      const [datesResult, titlesResult, summariesResult, categoriesResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("publication_date", null),
        supabase.from("legislation").select("id, title, number").limit(2000),
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .or("summary.is.null,summary.eq."),
        // Legislation without categories
        supabase.rpc("get_legislation_without_categories_count"),
      ]);

      const genericTitles = (titlesResult.data || []).filter(leg => {
        const title = leg.title?.trim() || "";
        const number = leg.number?.trim() || "";
        return !title || title === number || title.length < 20;
      }).length;

      const [totalLegResult, processedRelationsResult, reqLegResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true }),
        supabase.from("legislation_relations_processed").select("id", { count: "exact", head: true }),
        supabase.from("legal_requirements").select("legislation_id").limit(15000),
      ]);

      const uniqueReqLeg = new Set((reqLegResult.data || []).map(r => r.legislation_id));

      return {
        duplicates: duplicateCount,
        urls: urlsResult.count || 0,
        dates: datesResult.count || 0,
        titles: genericTitles,
        summaries: summariesResult.count || 0,
        requirements: Math.max(0, (totalLegResult.count || 0) - uniqueReqLeg.size),
        relations: Math.max(0, (totalLegResult.count || 0) - (processedRelationsResult.count || 0)),
        categories: (categoriesResult.data as number) || 0,
      };
    },
    staleTime: 10000,
    refetchInterval: activeFixType || (runningJobs?.length ?? 0) > 0 ? 5000 : 30000,
  });

  const totalPending = Object.values(stats || {}).reduce((sum, val) => sum + val, 0);

  // Launch batch of parallel jobs for a fix type
  const launchBatch = useCallback(async (type: FixType, count: number) => {
    // Duplicates only allow 1 job at a time (enforced by edge function)
    const maxJobs = type === "duplicates" ? 1 : parallelJobs;
    const jobsToLaunch = Math.min(maxJobs, Math.ceil(count / batchSize));
    const promises: Promise<any>[] = [];

    for (let i = 0; i < jobsToLaunch; i++) {
      let functionName = "";
      let body = {};

      switch (type) {
        case "duplicates":
          functionName = "cleanup-duplicate-legislation";
          body = { batchSize: batchSize };
          break;
        case "urls":
          // For URLs we run both strategies:
          // 1) DRE search (better recovery for PT origin)
          // 2) Generic recovery/validation (covers other cases)
          functionName = i % 2 === 0 ? "find-missing-dre-urls" : "fix-broken-urls";
          body =
            functionName === "find-missing-dre-urls"
              ? { limit: batchSize, background: true, dryRun: false }
              : { limit: batchSize, mode: "recover", background: true };
          break;
        case "titles":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "generic_titles", limit: batchSize, dryRun: false };
          break;
        case "summaries":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "missing_summary", limit: batchSize, dryRun: false };
          break;
        case "dates":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "missing_dates", limit: batchSize, dryRun: false };
          break;
        case "requirements":
          functionName = "extract-requirements-background";
          body = { batchSize: batchSize, maxBatches: 5 };
          break;
        case "relations":
          functionName = "extract-legislation-relations";
          body = { limit: batchSize, background: true };
          break;
        case "categories":
          functionName = "bulk-suggest-categories";
          body = { limit: batchSize, background: true };
          break;
      }

      promises.push(supabase.functions.invoke(functionName, { body }));
    }

    await Promise.allSettled(promises);
  }, [batchSize, parallelJobs]);

  // Auto-fix loop for a single fix type
  useEffect(() => {
    if (!activeFixType || !stats) return;

    const runBatchFix = async () => {
      const currentRunning = runningJobs?.length ?? 0;
      const runningForType = getRunningJobsForType(activeFixType).length;
      
      // For duplicates, only 1 job allowed at a time - skip if already running
      if (activeFixType === "duplicates" && runningForType > 0) {
        return; // Wait for current job to finish
      }
      
      if (currentRunning >= parallelJobs) return;

      const count = stats[activeFixType];
      if (count === 0) {
        setActiveFixType(null);
        toast.success(`✅ ${FIX_LABELS[activeFixType]} - Correção concluída!`);
        return;
      }

      const slotsAvailable = parallelJobs - currentRunning;
      if (slotsAvailable > 0) {
        await launchBatch(activeFixType, count);
        refetchJobs();
        // Force immediate refresh of counters after launching jobs
        refetch();
      }
    };

    const interval = setInterval(runBatchFix, 5000);
    runBatchFix();

    return () => clearInterval(interval);
  }, [activeFixType, stats, runningJobs, parallelJobs, launchBatch, refetchJobs, refetch]);

  const toggleFixType = (type: FixType) => {
    if (activeFixType === type) {
      setActiveFixType(null);
      toast.info(`${FIX_LABELS[type]} - Correção pausada`);
    } else {
      setActiveFixType(type);
      toast.success(`${FIX_LABELS[type]} - Correção iniciada (${parallelJobs} jobs paralelos)`);
    }
  };

  const stopAllFixes = () => {
    setActiveFixType(null);
    toast.info("Correção pausada");
  };

  // Manual batch launch for a specific type
  const launchManualBatch = async (type: FixType) => {
    const count = stats?.[type] || 0;
    if (count === 0) return;
    
    toast.info(`A lançar ${Math.min(parallelJobs, Math.ceil(count / batchSize))} job(s) para ${FIX_LABELS[type]}...`);
    await launchBatch(type, count);
    refetchJobs();
    refetch();
  };

  // Check if a fix type is blocked by dependencies
  const isBlocked = (type: FixType): boolean => {
    const urlCount = stats?.urls || 0;
    const metadataCount = (stats?.dates || 0) + (stats?.titles || 0) + (stats?.summaries || 0);
    
    // Metadata fixes are blocked if there are many URLs missing
    if (["dates", "titles", "summaries"].includes(type) && urlCount > 50) {
      return true;
    }
    // Requirements are blocked if there are many URLs or metadata missing
    if (type === "requirements" && (urlCount > 20 || metadataCount > 100)) {
      return true;
    }
    // Relations are blocked if there are many requirements missing
    if (type === "relations" && (stats?.requirements || 0) > 50) {
      return true;
    }
    // Categories are blocked if there are many summaries missing (IA needs summaries)
    if (type === "categories" && (stats?.summaries || 0) > 50) {
      return true;
    }
    return false;
  };

  const getBlockReason = (type: FixType): string | null => {
    const urlCount = stats?.urls || 0;
    const metadataCount = (stats?.dates || 0) + (stats?.titles || 0) + (stats?.summaries || 0);
    
    if (["dates", "titles", "summaries"].includes(type) && urlCount > 50) {
      return `Corrija primeiro os URLs (${urlCount} em falta)`;
    }
    if (type === "requirements" && urlCount > 20) {
      return `Corrija primeiro os URLs (${urlCount} em falta)`;
    }
    if (type === "requirements" && metadataCount > 100) {
      return `Corrija primeiro os metadados (${metadataCount} em falta)`;
    }
    if (type === "relations" && (stats?.requirements || 0) > 50) {
      return `Extraia primeiro os requisitos (${stats?.requirements} em falta)`;
    }
    if (type === "categories" && (stats?.summaries || 0) > 50) {
      return `Corrija primeiro os sumários (${stats?.summaries} em falta)`;
    }
    return null;
  };

  // Fix Category Card with dependency awareness - Mobile optimized
  const FixCategory = ({ type, count, icon }: { type: FixType; count: number; icon: React.ReactNode }) => {
    const isDone = count === 0;
    const typeJobs = getRunningJobsForType(type);
    const hasRunningJobs = typeJobs.length > 0;
    const isActiveType = activeFixType === type;
    const totalProcessed = typeJobs.reduce((sum, j) => sum + (j.items_processed || 0), 0);
    const totalAdded = typeJobs.reduce((sum, j) => sum + (j.items_added || 0), 0);
    const blocked = isBlocked(type);
    const blockReason = getBlockReason(type);
    
    return (
      <div className={`relative overflow-hidden rounded-lg transition-all ${
        blocked ? "opacity-60 bg-muted/30" :
        isActiveType ? "ring-2 ring-green-500 bg-green-50 dark:bg-green-900/30" :
        hasRunningJobs ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30" :
        isDone ? "bg-green-50 dark:bg-green-900/20" :
        count > 100 ? "bg-red-50 dark:bg-red-900/20" :
        "bg-muted/50"
      }`}>
        {(hasRunningJobs || isActiveType) && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-200 dark:bg-blue-800 overflow-hidden">
            <div className={`h-full ${isActiveType ? "bg-green-500" : "bg-blue-500"} animate-pulse`} style={{ width: "100%" }} />
          </div>
        )}
        
        <div className="flex items-center justify-between p-2 sm:p-3 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${
              blocked ? "bg-muted text-muted-foreground" :
              isActiveType ? "bg-green-500 text-white" :
              hasRunningJobs ? "bg-blue-500 text-white animate-pulse" :
              isDone ? "bg-green-500 text-white" :
              count > 100 ? "bg-red-500 text-white" :
              "bg-muted"
            }`}>
              {hasRunningJobs ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                <span className="font-medium text-xs sm:text-sm truncate">{FIX_LABELS[type]}</span>
                {blocked && blockReason && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500 shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px]">
                        <p className="text-xs">{blockReason}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate hidden sm:block">{FIX_DESCRIPTIONS[type]}</p>
              {hasRunningJobs && (
                <div className="flex items-center gap-1 text-[10px] sm:text-xs text-blue-600 dark:text-blue-400">
                  <Activity className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                  <span className="truncate">
                    {typeJobs.length}× • {totalProcessed} proc.
                  </span>
                </div>
              )}
              {isActiveType && !hasRunningJobs && (
                <div className="flex items-center gap-1 text-[10px] sm:text-xs text-green-600 dark:text-green-400">
                  <Activity className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                  <span className="truncate">A aguardar...</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            ) : (
              <>
                <Button
                  variant={isActiveType ? "destructive" : "outline"}
                  size="sm"
                  className="h-6 sm:h-7 px-1.5 sm:px-2 gap-0.5 sm:gap-1 text-[10px] sm:text-xs"
                  onClick={() => toggleFixType(type)}
                  disabled={blocked && !isActiveType}
                >
                  {isActiveType ? (
                    <>
                      <Pause className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span className="hidden xs:inline">Parar</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span className="hidden xs:inline">Iniciar</span>
                    </>
                  )}
                </Button>
                {!isActiveType && !hasRunningJobs && !blocked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 sm:h-7 px-1.5 sm:px-2 hidden sm:flex"
                    onClick={() => launchManualBatch(type)}
                    title="Lançar um lote manualmente"
                  >
                    <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  </Button>
                )}
                <Badge variant={count > 100 ? "destructive" : "secondary"} className="text-[10px] sm:text-sm px-1 sm:px-2">
                  {count}
                </Badge>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Calculate phase completion
  const getPhaseStats = (types: FixType[]) => {
    const total = types.reduce((sum, t) => sum + (stats?.[t] || 0), 0);
    const hasRunning = types.some(t => getRunningJobsForType(t).length > 0);
    const isActive = types.includes(activeFixType as FixType);
    return { total, hasRunning, isActive, isDone: total === 0 };
  };

  const activeJobsCount = runningJobs?.length ?? 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      <ActiveJobsBanner />

      <Card className={`transition-all ${
        activeFixType ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-300 dark:border-green-700" : 
        activeJobsCount > 0 ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-300 dark:border-blue-700" :
        "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30"
      }`}>
        <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`p-1.5 sm:p-2 rounded-lg shrink-0 ${
                activeFixType ? "bg-green-500" : 
                activeJobsCount > 0 ? "bg-blue-500 animate-pulse" : 
                "bg-amber-500"
              }`}>
                <Wrench className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-lg flex items-center gap-1 sm:gap-2 flex-wrap">
                  <span>Correção</span>
                  {activeFixType && (
                    <Badge className="text-[10px] sm:text-xs bg-green-500 px-1 sm:px-2">
                      {FIX_LABELS[activeFixType]}
                    </Badge>
                  )}
                  {activeJobsCount > 0 && (
                    <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-2">
                      {activeJobsCount} job(s)
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-[10px] sm:text-sm text-muted-foreground hidden sm:block">
                  Escolha um tipo de problema para corrigir em segundo plano
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 self-end sm:self-auto">
              {activeFixType && (
                <Button 
                  variant="destructive"
                  size="sm"
                  onClick={stopAllFixes}
                  className="gap-0.5 sm:gap-1 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
                >
                  <Pause className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Parar</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 sm:h-9 sm:w-9"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7 sm:h-9 sm:w-9" onClick={() => { refetch(); refetchJobs(); }}>
                <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6">
          {/* Settings Collapsible */}
          <Collapsible open={showSettings} onOpenChange={setShowSettings}>
            <CollapsibleContent className="space-y-3 sm:space-y-4 pb-3 sm:pb-4 border-b">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Itens por lote: {batchSize}</Label>
                  <Slider
                    value={[batchSize]}
                    onValueChange={([v]) => setBatchSize(v)}
                    min={25}
                    max={200}
                    step={25}
                    disabled={!!activeFixType}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm">Jobs paralelos: {parallelJobs}</Label>
                  <Slider
                    value={[parallelJobs]}
                    onValueChange={([v]) => setParallelJobs(v)}
                    min={1}
                    max={10}
                    step={1}
                    disabled={!!activeFixType}
                  />
                </div>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                ⚡ Mais jobs = mais rápido, mas consome mais recursos
              </p>
            </CollapsibleContent>
          </Collapsible>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Global Progress */}
              {(activeFixType || activeJobsCount > 0) && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      {activeJobsCount} job(s) em execução
                    </span>
                    <span className="font-medium">{totalPending} pendentes</span>
                  </div>
                  <Progress value={Math.max(5, 100 - (totalPending / 10))} className="h-2" />
                </div>
              )}

              {/* Fix Categories organized by Phase - Mobile optimized */}
              <div className="space-y-3 sm:space-y-4">
                {FIX_PHASES.map((phase, idx) => {
                  const phaseStats = getPhaseStats(phase.types);
                  const isPhaseActive = phaseStats.isActive || phaseStats.hasRunning;
                  
                  return (
                    <div key={phase.name} className="space-y-1.5 sm:space-y-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <div className={`flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-bold shrink-0 ${
                          phaseStats.isDone ? "bg-green-500 text-white" :
                          isPhaseActive ? "bg-blue-500 text-white animate-pulse" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {phaseStats.isDone ? <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : idx + 1}
                        </div>
                        <span className="text-xs sm:text-sm font-medium">{phase.name}</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">— {phase.description}</span>
                        {phaseStats.total > 0 && (
                          <Badge variant="outline" className="ml-auto text-[10px] sm:text-xs px-1 sm:px-2">
                            {phaseStats.total}
                          </Badge>
                        )}
                        {idx < FIX_PHASES.length - 1 && (
                          <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground/50 hidden sm:block" />
                        )}
                      </div>
                      <div className={`grid gap-1.5 sm:gap-2 ${phase.types.length > 1 ? "grid-cols-1 sm:grid-cols-3" : ""}`}>
                        {phase.types.map(type => {
                          const iconMap: Record<FixType, React.ReactNode> = {
                            duplicates: <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
                            urls: <Link className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
                            dates: <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
                            titles: <Type className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
                            summaries: <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
                            requirements: <ListChecks className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
                            relations: <GitBranch className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
                            categories: <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />,
                          };
                          return (
                            <FixCategory 
                              key={type}
                              type={type} 
                              count={stats?.[type] || 0} 
                              icon={iconMap[type]} 
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All done */}
              {totalPending === 0 && activeJobsCount === 0 && (
                <div className="p-4 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Todos os dados estão corrigidos!
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
