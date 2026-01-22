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
  Link, Calendar, Type, FileText, ListChecks, GitBranch,
  Loader2, Wrench, RefreshCw, Play, Pause, CheckCircle2, Activity,
  Zap, Settings2
} from "lucide-react";
import { ActiveJobsBanner } from "./ActiveJobsBanner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface FixStats {
  urls: number;
  dates: number;
  titles: number;
  summaries: number;
  requirements: number;
  relations: number;
}

interface RunningJob {
  id: string;
  sync_type: string;
  status: string;
  items_processed: number;
  items_added: number;
  started_at: string;
}

type FixType = "urls" | "dates" | "titles" | "summaries" | "requirements" | "relations";

const FIX_LABELS: Record<FixType, string> = {
  urls: "URLs",
  dates: "Datas",
  titles: "Títulos",
  summaries: "Sumários",
  requirements: "Requisitos",
  relations: "Relações",
};

const SYNC_TYPE_TO_FIX: Record<string, FixType> = {
  "fix-broken-urls": "urls",
  "find-missing-dre-urls": "urls",
  "complete-auto-imported-legislation": "titles",
  "reimport-dre-metadata": "titles",
  "fix-eurlex-titles": "titles",
  "fix-generic-titles": "titles",
  "extract-requirements": "requirements",
  "extract-requirements-background": "requirements",
  "fix-incomplete-requirements": "requirements",
  "extract-legislation-relations": "relations",
};

export function DataFixPanel() {
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [batchSize, setBatchSize] = useState(100);
  const [parallelJobs, setParallelJobs] = useState(3);
  const [showSettings, setShowSettings] = useState(false);

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
      const [urlsResult, datesResult, titlesResult, summariesResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("document_url", null)
          .or("no_digital_version.is.null,no_digital_version.eq.false"),
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("publication_date", null),
        supabase.from("legislation").select("id, title, number").limit(2000),
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .or("summary.is.null,summary.eq."),
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
        urls: urlsResult.count || 0,
        dates: datesResult.count || 0,
        titles: genericTitles,
        summaries: summariesResult.count || 0,
        requirements: Math.max(0, (totalLegResult.count || 0) - uniqueReqLeg.size),
        relations: Math.max(0, (totalLegResult.count || 0) - (processedRelationsResult.count || 0)),
      };
    },
    staleTime: 10000,
    refetchInterval: isAutoFixing || (runningJobs?.length ?? 0) > 0 ? 5000 : 30000,
  });

  const totalPending = Object.values(stats || {}).reduce((sum, val) => sum + val, 0);

  // Launch batch of parallel jobs for a fix type
  const launchBatch = useCallback(async (type: FixType, count: number) => {
    const jobsToLaunch = Math.min(parallelJobs, Math.ceil(count / batchSize));
    const promises: Promise<any>[] = [];

    for (let i = 0; i < jobsToLaunch; i++) {
      let functionName = "";
      let body = {};

      switch (type) {
        case "urls":
          functionName = "fix-broken-urls";
          body = { limit: batchSize, mode: "recover", background: true };
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
      }

      promises.push(supabase.functions.invoke(functionName, { body }));
    }

    await Promise.allSettled(promises);
  }, [batchSize, parallelJobs]);

  // Auto-fix loop with batch processing
  useEffect(() => {
    if (!isAutoFixing || !stats) return;

    const runBatchFix = async () => {
      // Check how many jobs are already running
      const currentRunning = runningJobs?.length ?? 0;
      if (currentRunning >= parallelJobs) {
        // Wait for some jobs to finish
        return;
      }

      const fixes: { type: FixType; count: number }[] = [
        { type: "urls", count: stats.urls },
        { type: "dates", count: stats.dates },
        { type: "titles", count: stats.titles },
        { type: "summaries", count: stats.summaries },
        { type: "requirements", count: stats.requirements },
        { type: "relations", count: stats.relations },
      ];

      // Find categories with pending items
      const pendingFixes = fixes.filter(f => f.count > 0);

      if (pendingFixes.length === 0) {
        setIsAutoFixing(false);
        toast.success("✅ Todas as correções concluídas!");
        return;
      }

      // Launch jobs for the first pending category
      const slotsAvailable = parallelJobs - currentRunning;
      if (slotsAvailable > 0) {
        const fix = pendingFixes[0];
        await launchBatch(fix.type, fix.count);
        refetchJobs();
      }
    };

    const interval = setInterval(runBatchFix, 5000);
    runBatchFix();

    return () => clearInterval(interval);
  }, [isAutoFixing, stats, runningJobs, parallelJobs, launchBatch, refetchJobs]);

  const toggleAutoFix = () => {
    if (isAutoFixing) {
      setIsAutoFixing(false);
      toast.info("Correção pausada");
    } else {
      setIsAutoFixing(true);
      toast.success(`Correção em lotes iniciada (${parallelJobs} jobs paralelos)`);
    }
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

  // Fix Category Card
  const FixCategory = ({ type, count, icon }: { type: FixType; count: number; icon: React.ReactNode }) => {
    const isDone = count === 0;
    const typeJobs = getRunningJobsForType(type);
    const hasRunningJobs = typeJobs.length > 0;
    const totalProcessed = typeJobs.reduce((sum, j) => sum + (j.items_processed || 0), 0);
    const totalAdded = typeJobs.reduce((sum, j) => sum + (j.items_added || 0), 0);
    
    return (
      <div className={`relative overflow-hidden rounded-lg transition-all ${
        hasRunningJobs ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30" :
        isDone ? "bg-green-50 dark:bg-green-900/20" :
        count > 100 ? "bg-red-50 dark:bg-red-900/20" :
        "bg-muted/50"
      }`}>
        {hasRunningJobs && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-200 dark:bg-blue-800 overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse" style={{ width: "100%" }} />
          </div>
        )}
        
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`p-2 rounded-lg shrink-0 ${
              hasRunningJobs ? "bg-blue-500 text-white animate-pulse" :
              isDone ? "bg-green-500 text-white" :
              count > 100 ? "bg-red-500 text-white" :
              "bg-muted"
            }`}>
              {hasRunningJobs ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
            </div>
            <div className="min-w-0">
              <span className="font-medium block truncate">{FIX_LABELS[type]}</span>
              {hasRunningJobs && (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  <Activity className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {typeJobs.length} job(s) • {totalProcessed} proc. • {totalAdded} corr.
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {isDone ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <>
                {!hasRunningJobs && !isAutoFixing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => launchManualBatch(type)}
                  >
                    <Zap className="h-3 w-3" />
                  </Button>
                )}
                <Badge variant={count > 100 ? "destructive" : "secondary"} className="text-sm">
                  {count}
                </Badge>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const activeJobsCount = runningJobs?.length ?? 0;

  return (
    <div className="space-y-4">
      <ActiveJobsBanner />

      <Card className={`transition-all ${
        isAutoFixing ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-300 dark:border-green-700" : 
        activeJobsCount > 0 ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-300 dark:border-blue-700" :
        "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30"
      }`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                isAutoFixing ? "bg-green-500" : 
                activeJobsCount > 0 ? "bg-blue-500 animate-pulse" : 
                "bg-amber-500"
              }`}>
                <Wrench className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Correção em Lotes
                  {activeJobsCount > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {activeJobsCount}/{parallelJobs} jobs
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Processamento paralelo • Não bloqueia a interface
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button 
                variant={isAutoFixing ? "destructive" : "default"}
                onClick={toggleAutoFix}
                className="gap-2"
              >
                {isAutoFixing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isAutoFixing ? "Pausar" : "Iniciar"}
              </Button>
              <Button variant="outline" size="icon" onClick={() => { refetch(); refetchJobs(); }}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Settings Collapsible */}
          <Collapsible open={showSettings} onOpenChange={setShowSettings}>
            <CollapsibleContent className="space-y-4 pb-4 border-b">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm">Itens por lote: {batchSize}</Label>
                  <Slider
                    value={[batchSize]}
                    onValueChange={([v]) => setBatchSize(v)}
                    min={25}
                    max={200}
                    step={25}
                    disabled={isAutoFixing}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Jobs paralelos: {parallelJobs}</Label>
                  <Slider
                    value={[parallelJobs]}
                    onValueChange={([v]) => setParallelJobs(v)}
                    min={1}
                    max={10}
                    step={1}
                    disabled={isAutoFixing}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                ⚡ Mais jobs = mais rápido, mas consome mais recursos do servidor
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
              {(isAutoFixing || activeJobsCount > 0) && (
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

              {/* Fix Categories */}
              <div className="grid gap-2">
                <FixCategory type="urls" count={stats?.urls || 0} icon={<Link className="h-4 w-4" />} />
                <FixCategory type="dates" count={stats?.dates || 0} icon={<Calendar className="h-4 w-4" />} />
                <FixCategory type="titles" count={stats?.titles || 0} icon={<Type className="h-4 w-4" />} />
                <FixCategory type="summaries" count={stats?.summaries || 0} icon={<FileText className="h-4 w-4" />} />
                <FixCategory type="requirements" count={stats?.requirements || 0} icon={<ListChecks className="h-4 w-4" />} />
                <FixCategory type="relations" count={stats?.relations || 0} icon={<GitBranch className="h-4 w-4" />} />
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
