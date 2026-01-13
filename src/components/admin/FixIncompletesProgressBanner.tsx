import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock, Zap } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_added: number | null;
  items_updated: number | null;
  error_message: string | null;
}

export function FixIncompletesProgressBanner() {
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Query for the latest fix-incomplete-requirements job
  const { data: activeJob, isLoading } = useQuery({
    queryKey: ["fix-incompletes-job"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .eq("sync_type", "fix-incomplete-requirements")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as SyncLog | null;
    },
    refetchInterval: (query) => {
      // Poll every 3 seconds if job is running
      const job = query.state.data;
      return job?.status === "running" ? 3000 : false;
    },
  });

  // Update elapsed time counter
  useEffect(() => {
    if (activeJob?.status === "running" && activeJob.started_at) {
      setStartTime(new Date(activeJob.started_at));
    } else {
      setStartTime(null);
    }
  }, [activeJob?.status, activeJob?.started_at]);

  useEffect(() => {
    if (!startTime || activeJob?.status !== "running") {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, activeJob?.status]);

  // Don't show anything if no job exists or still loading
  if (isLoading || !activeJob) {
    return null;
  }

  const isRunning = activeJob.status === "running";
  const isCompleted = activeJob.status === "completed";
  const isError = activeJob.status === "error";

  // Only show for recent jobs (last 5 minutes if not running)
  if (!isRunning) {
    const completedAt = activeJob.completed_at ? new Date(activeJob.completed_at) : null;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (!completedAt || completedAt < fiveMinutesAgo) {
      return null;
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Calculate speed (items per minute)
  const speed = elapsedSeconds > 0 && activeJob.items_processed
    ? Math.round((activeJob.items_processed / elapsedSeconds) * 60 * 10) / 10
    : 0;

  return (
    <div
      className={`rounded-lg border p-4 mb-4 ${
        isRunning
          ? "bg-blue-50 border-blue-200"
          : isCompleted
          ? "bg-green-50 border-green-200"
          : "bg-red-50 border-red-200"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isRunning ? (
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <XCircle className="h-5 w-5 text-red-600" />
          )}
          <div>
            <p className={`font-medium ${isRunning ? "text-blue-900" : isCompleted ? "text-green-900" : "text-red-900"}`}>
              Correção de Requisitos Incompletos
              {isRunning && " em progresso..."}
              {isCompleted && " concluída"}
              {isError && " com erro"}
            </p>
            <p className="text-sm text-muted-foreground">
              Iniciado: {format(new Date(activeJob.started_at), "HH:mm:ss", { locale: pt })}
              {activeJob.completed_at && (
                <> • Concluído: {format(new Date(activeJob.completed_at), "HH:mm:ss", { locale: pt })}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex items-center gap-3 text-sm">
            {activeJob.items_processed !== null && (
              <Badge variant="secondary" className="gap-1">
                <Zap className="h-3 w-3" />
                {activeJob.items_processed} processados
              </Badge>
            )}
            {activeJob.items_updated !== null && activeJob.items_updated > 0 && (
              <Badge variant="secondary" className="bg-green-100 text-green-800 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {activeJob.items_updated} corrigidos
              </Badge>
            )}
            {isRunning && elapsedSeconds > 0 && (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(elapsedSeconds)}
              </Badge>
            )}
            {isRunning && speed > 0 && (
              <Badge variant="outline" className="gap-1 text-blue-700">
                {speed} itens/min
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar for running jobs */}
      {isRunning && activeJob.items_processed !== null && (
        <div className="mt-3">
          <Progress value={undefined} className="h-2 animate-pulse" />
        </div>
      )}

      {/* Error message */}
      {isError && activeJob.error_message && (
        <p className="mt-2 text-sm text-red-700">{activeJob.error_message}</p>
      )}
    </div>
  );
}
