import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useFixIncompletesJob } from "@/hooks/useFixIncompletesJob";
import { CheckCircle2, Clock, Loader2, XCircle, Zap } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

export function FixIncompletesProgressBanner() {
  const { data: activeJob } = useFixIncompletesJob();
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const isRunning = activeJob?.status === "running";
  const isCompleted = activeJob?.status === "completed";
  const isError = activeJob?.status === "error";

  // Update elapsed time counter
  useEffect(() => {
    if (isRunning && activeJob?.started_at) {
      setStartTime(new Date(activeJob.started_at));
    } else {
      setStartTime(null);
    }
  }, [isRunning, activeJob?.started_at]);

  useEffect(() => {
    if (!startTime || !isRunning) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, isRunning]);

  // Don't show anything if no job exists
  if (!activeJob) return null;

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

  const speed = useMemo(() => {
    if (!isRunning || elapsedSeconds <= 0) return 0;
    const processed = activeJob.items_processed ?? 0;
    return processed > 0 ? Math.round((processed / elapsedSeconds) * 60 * 10) / 10 : 0;
  }, [activeJob.items_processed, elapsedSeconds, isRunning]);

  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
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
                Correção de Requisitos Incompletos
                {isRunning && " em progresso"}
                {isCompleted && " concluída"}
                {isError && " com erro"}
              </p>
              {isRunning && <Badge variant="secondary">Em curso</Badge>}
              {isCompleted && <Badge variant="outline">Concluído</Badge>}
              {isError && <Badge variant="destructive">Erro</Badge>}
            </div>

            <p className="text-sm text-muted-foreground">
              Iniciado: {format(new Date(activeJob.started_at), "HH:mm:ss", { locale: pt })}
              {activeJob.completed_at && (
                <> • Concluído: {format(new Date(activeJob.completed_at), "HH:mm:ss", { locale: pt })}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeJob.items_processed !== null && (
            <Badge variant="secondary" className="gap-1">
              <Zap className="h-3 w-3" />
              {activeJob.items_processed} processados
            </Badge>
          )}

          {activeJob.items_updated !== null && activeJob.items_updated > 0 && (
            <Badge variant="default" className="gap-1">
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

          {isRunning && speed > 0 && <Badge variant="outline">{speed} itens/min</Badge>}
        </div>
      </div>

      {isRunning && (
        <div className="mt-3">
          {/* Indeterminate bar (full bar + pulse) just to show activity */}
          <Progress value={100} className="h-2" />
        </div>
      )}

      {isError && activeJob.error_message && (
        <p className="mt-2 text-sm text-destructive">{activeJob.error_message}</p>
      )}
    </div>
  );
}
