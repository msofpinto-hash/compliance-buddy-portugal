import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Link, Calendar, Type, FileText, ListChecks, GitBranch,
  Loader2, Wrench, RefreshCw, Play, Pause, CheckCircle2, Activity
} from "lucide-react";
import { ActiveJobsBanner } from "./ActiveJobsBanner";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

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
  urls: "URLs em falta",
  dates: "Datas em falta",
  titles: "Títulos genéricos",
  summaries: "Sumários em falta",
  requirements: "Requisitos pendentes",
  relations: "Relações pendentes",
};

// Map sync_type to fix category
const SYNC_TYPE_TO_FIX: Record<string, FixType> = {
  "fix-broken-urls": "urls",
  "find-missing-dre-urls": "urls",
  "complete-auto-imported-legislation": "titles", // Can be titles, dates, or summaries
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
  const [currentFix, setCurrentFix] = useState<FixType | null>(null);

  // Query for running jobs
  const { data: runningJobs } = useQuery({
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
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  // Get running job for a specific fix type
  const getRunningJobForType = (type: FixType): RunningJob | undefined => {
    return runningJobs?.find(job => {
      const mappedType = SYNC_TYPE_TO_FIX[job.sync_type];
      return mappedType === type;
    });
  };

  // Unified stats - independent of origin
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

  // Execute fix
  const executeFix = useCallback(async (type: FixType): Promise<boolean> => {
    try {
      let functionName = "";
      let body = {};

      switch (type) {
        case "urls":
          functionName = "fix-broken-urls";
          body = { limit: 50, mode: "recover", background: true };
          break;
        case "titles":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "generic_titles", limit: 50, dryRun: false };
          break;
        case "summaries":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "missing_summary", limit: 50, dryRun: false };
          break;
        case "dates":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "missing_dates", limit: 50, dryRun: false };
          break;
        case "requirements":
          functionName = "extract-requirements-background";
          body = { batchSize: 50, maxBatches: 3 };
          break;
        case "relations":
          functionName = "extract-legislation-relations";
          body = { limit: 100, background: true };
          break;
      }

      const { error } = await supabase.functions.invoke(functionName, { body });
      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error(`Fix ${type} failed:`, err);
      return false;
    }
  }, []);

  // Auto-fix loop
  useEffect(() => {
    if (!isAutoFixing || !stats) return;

    const runNextFix = async () => {
      const fixes: { type: FixType; count: number }[] = [
        { type: "urls", count: stats.urls },
        { type: "dates", count: stats.dates },
        { type: "titles", count: stats.titles },
        { type: "summaries", count: stats.summaries },
        { type: "requirements", count: stats.requirements },
        { type: "relations", count: stats.relations },
      ];

      const nextFix = fixes.find(f => f.count > 0);

      if (!nextFix) {
        setIsAutoFixing(false);
        setCurrentFix(null);
        toast.success("✅ Todas as correções concluídas!");
        return;
      }

      setCurrentFix(nextFix.type);
      await executeFix(nextFix.type);
      await new Promise(resolve => setTimeout(resolve, 3000));
      refetch();
    };

    const interval = setInterval(runNextFix, 10000);
    runNextFix();

    return () => clearInterval(interval);
  }, [isAutoFixing, stats, executeFix, refetch]);

  const toggleAutoFix = () => {
    if (isAutoFixing) {
      setIsAutoFixing(false);
      setCurrentFix(null);
      toast.info("Correção pausada");
    } else {
      setIsAutoFixing(true);
      toast.success("Correção automática iniciada");
    }
  };

  // Fix Category Card with progress indicator
  const FixCategory = ({ type, count, icon }: { type: FixType; count: number; icon: React.ReactNode }) => {
    const isActive = currentFix === type;
    const isDone = count === 0;
    const runningJob = getRunningJobForType(type);
    const hasRunningJob = !!runningJob;
    
    return (
      <div className={`relative overflow-hidden rounded-lg transition-all ${
        hasRunningJob || isActive ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30" :
        isDone ? "bg-green-50 dark:bg-green-900/20" :
        count > 100 ? "bg-red-50 dark:bg-red-900/20" :
        "bg-muted/50"
      }`}>
        {/* Animated progress bar at bottom when job is running */}
        {hasRunningJob && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-200 dark:bg-blue-800 overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse" style={{ width: "100%" }} />
          </div>
        )}
        
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg transition-all ${
              hasRunningJob || isActive ? "bg-blue-500 text-white animate-pulse" :
              isDone ? "bg-green-500 text-white" :
              count > 100 ? "bg-red-500 text-white" :
              "bg-muted"
            }`}>
              {hasRunningJob || isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
            </div>
            <div>
              <span className="font-medium block">{FIX_LABELS[type]}</span>
              {/* Show job progress when running */}
              {hasRunningJob && (
                <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  <Activity className="h-3 w-3" />
                  <span>
                    {runningJob.items_processed} processados
                    {runningJob.items_added > 0 && ` • ${runningJob.items_added} corrigidos`}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDone ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : hasRunningJob ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 animate-pulse">
                  A processar...
                </Badge>
                <Badge variant="secondary" className="text-sm">{count}</Badge>
              </div>
            ) : (
              <Badge variant={count > 100 ? "destructive" : "secondary"} className="text-sm">
                {count}
              </Badge>
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

      <Card className={`transition-all ${isAutoFixing 
        ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-300 dark:border-green-700" 
        : activeJobsCount > 0
        ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-300 dark:border-blue-700"
        : "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30"}`}>
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
                  Correção Automática de Dados
                  {activeJobsCount > 0 && !isAutoFixing && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {activeJobsCount} job(s) ativo(s)
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Independente da origem (PDF, DRE, EUR-Lex)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant={isAutoFixing ? "destructive" : "default"}
                onClick={toggleAutoFix}
                className="gap-2"
              >
                {isAutoFixing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isAutoFixing ? "Pausar" : "Iniciar"}
              </Button>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Progress Bar when auto-fixing */}
              {isAutoFixing && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      A processar: <strong>{currentFix ? FIX_LABELS[currentFix] : "..."}</strong>
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

              {/* All done message */}
              {totalPending === 0 && !isAutoFixing && activeJobsCount === 0 && (
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
