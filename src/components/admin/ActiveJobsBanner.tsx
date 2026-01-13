import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Loader2, XCircle, Zap } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Labels for different sync types
const SYNC_TYPE_LABELS: Record<string, string> = {
  "fix-incomplete-requirements": "Correção de Requisitos Incompletos",
  "reimport-dre-metadata": "Reimportação de Metadados DRE",
  "extract_relations": "Extração de Relações",
  "extract-requirements": "Extração de Requisitos",
  "extract-requirements-background": "Extração de Requisitos (Background)",
  "complete-auto-imported": "Completar Diplomas Auto-importados",
  "sync-dre": "Sincronização DRE",
  "sync-eurlex": "Sincronização EUR-Lex",
  "bulk-suggest-categories": "Sugestão de Categorias (IA)",
  "suggest-categories": "Sugestão de Categorias",
  "auto-categorize": "Auto-categorização",
  "validate-urls": "Validação de URLs",
  "fix-metadata": "Correção de Metadados",
  "fix-eurlex-titles": "Correção de Títulos EUR-Lex",
  "fix-generic-titles": "Correção de Títulos Genéricos",
  "import-eurlex-summaries": "Importação de Sumários EUR-Lex",
};

type SyncJob = {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_added: number | null;
  items_updated: number | null;
  error_message: string | null;
};

export function ActiveJobsBanner() {
  const queryClient = useQueryClient();
  const [elapsedByJob, setElapsedByJob] = useState<Record<string, number>>({});

  // Fetch all recent jobs (running + completed in last 2 minutes)
  const { data: jobs } = useQuery({
    queryKey: ["active-jobs-banner"],
    queryFn: async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .or(`status.eq.running,completed_at.gte.${twoMinutesAgo}`)
        .order("started_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return (data as SyncJob[]) || [];
    },
    refetchInterval: 3000, // Poll every 3 seconds when jobs are active
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("realtime-active-jobs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_logs",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["active-jobs-banner"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Update elapsed time for running jobs
  useEffect(() => {
    const runningJobs = jobs?.filter(j => j.status === "running") || [];
    if (runningJobs.length === 0) {
      setElapsedByJob({});
      return;
    }

    const interval = setInterval(() => {
      const newElapsed: Record<string, number> = {};
      runningJobs.forEach(job => {
        const startTime = new Date(job.started_at).getTime();
        newElapsed[job.id] = Math.floor((Date.now() - startTime) / 1000);
      });
      setElapsedByJob(newElapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [jobs]);

  // Filter to show only relevant jobs
  const visibleJobs = useMemo(() => {
    if (!jobs) return [];
    
    return jobs.filter(job => {
      // Always show running jobs
      if (job.status === "running") return true;
      
      // Show completed jobs from last 2 minutes
      if (job.completed_at) {
        const completedAt = new Date(job.completed_at).getTime();
        const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
        return completedAt > twoMinutesAgo;
      }
      
      return false;
    });
  }, [jobs]);

  if (visibleJobs.length === 0) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getJobLabel = (syncType: string) => {
    return SYNC_TYPE_LABELS[syncType] || syncType.replace(/-/g, " ");
  };

  return (
    <div className="space-y-2 mb-4">
      {visibleJobs.map(job => {
        const isRunning = job.status === "running";
        const isCompleted = job.status === "completed";
        const isError = job.status === "error";
        const elapsed = elapsedByJob[job.id] || 0;
        const speed = isRunning && elapsed > 0 && (job.items_processed || 0) > 0
          ? Math.round(((job.items_processed || 0) / elapsed) * 60 * 10) / 10
          : 0;

        return (
          <div key={job.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                {isRunning ? (
                  <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
                ) : isCompleted ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-foreground" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
                )}

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">
                      {getJobLabel(job.sync_type)}
                      {isRunning && " em progresso"}
                      {isCompleted && " concluído"}
                      {isError && " com erro"}
                    </p>
                    {isRunning && <Badge variant="secondary">Em curso</Badge>}
                    {isCompleted && <Badge variant="outline">Concluído</Badge>}
                    {isError && <Badge variant="destructive">Erro</Badge>}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Iniciado: {format(new Date(job.started_at), "HH:mm:ss", { locale: pt })}
                    {job.completed_at && (
                      <> • Concluído: {format(new Date(job.completed_at), "HH:mm:ss", { locale: pt })}</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {job.items_processed !== null && (
                  <Badge variant="secondary" className="gap-1">
                    <Zap className="h-3 w-3" />
                    {job.items_processed} processados
                  </Badge>
                )}

                {job.items_updated !== null && job.items_updated > 0 && (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {job.items_updated} atualizados
                  </Badge>
                )}

                {job.items_added !== null && job.items_added > 0 && (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {job.items_added} adicionados
                  </Badge>
                )}

                {isRunning && elapsed > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(elapsed)}
                  </Badge>
                )}

                {isRunning && speed > 0 && <Badge variant="outline">{speed} itens/min</Badge>}
              </div>
            </div>

            {isRunning && (
              <div className="mt-3">
                <Progress value={100} className="h-2" />
              </div>
            )}

            {isError && job.error_message && (
              <p className="mt-2 text-sm text-destructive">{job.error_message}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
