import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Loader2,
  Rocket,
  StopCircle,
  RefreshCw,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Settings2,
  TrendingDown,
  FileWarning,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface WaveHistoryEntry {
  wave: number;
  timestamp: string;
  status: "ok" | "fail" | "skipped";
  jobsLaunched: number;
  pendingBefore: number;
  message?: string;
}

export function PdfDataFixPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Counts - main metrics
  const [pendingPtCount, setPendingPtCount] = useState<number | null>(null);
  const [pendingEuCount, setPendingEuCount] = useState<number | null>(null);
  const [runningJobsCount, setRunningJobsCount] = useState<number | null>(null);
  const [stuckJobsCount, setStuckJobsCount] = useState<number | null>(null);

  // Settings
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(60);
  const [cooldownSeconds, setCooldownSeconds] = useState(30);
  const [stuckThresholdMinutes, setStuckThresholdMinutes] = useState(45);
  const [showSettings, setShowSettings] = useState(false);

  // Processing state
  const [isRunning, setIsRunning] = useState(false);
  const [currentWave, setCurrentWave] = useState<number | null>(null);
  const [maxWaves] = useState(6);
  const [cooldown, setCooldown] = useState<{ remaining: number; total: number } | null>(null);
  const [waveHistory, setWaveHistory] = useState<WaveHistoryEntry[]>([]);

  // Dialogs
  const [confirmTerminateStuck, setConfirmTerminateStuck] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);

  // Computed
  const totalPending = (pendingPtCount ?? 0) + (pendingEuCount ?? 0);
  const isBlocked = (runningJobsCount ?? 0) >= maxConcurrentJobs;
  const hasStuckJobs = (stuckJobsCount ?? 0) > 0;

  // Fetch functions
  const fetchPendingCounts = useCallback(async () => {
    try {
      const base = () =>
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .eq("source", "pdf-import")
          .or(
            "document_url.is.null,summary.is.null,publication_date.is.null,effective_date.is.null,origin.is.null"
          );

      const [{ count: pt }, { count: eu }] = await Promise.all([
        base().eq("origin", "PT"),
        base().eq("origin", "EU"),
      ]);

      setPendingPtCount(pt ?? 0);
      setPendingEuCount(eu ?? 0);
    } catch (e) {
      console.error("fetchPendingCounts error:", e);
    }
  }, []);

  const fetchRunningJobs = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from("sync_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running")
        .eq("sync_type", "fix_pdf_import");

      if (error) throw error;
      setRunningJobsCount(count ?? 0);
      return count ?? 0;
    } catch (e) {
      console.error("fetchRunningJobs error:", e);
      return 0;
    }
  }, []);

  const fetchStuckJobs = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - stuckThresholdMinutes * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("sync_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running")
        .eq("sync_type", "fix_pdf_import")
        .lt("started_at", cutoff);

      if (error) throw error;
      setStuckJobsCount(count ?? 0);
    } catch (e) {
      console.error("fetchStuckJobs error:", e);
    }
  }, [stuckThresholdMinutes]);

  const refreshAll = useCallback(() => {
    fetchPendingCounts();
    fetchRunningJobs();
    fetchStuckJobs();
  }, [fetchPendingCounts, fetchRunningJobs, fetchStuckJobs]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Realtime subscription for auto-refresh
  useEffect(() => {
    const channel = supabase
      .channel("pdf-fix-panel-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_logs" },
        (payload) => {
          // Refresh counts when sync_logs change
          if (
            payload.new &&
            (payload.new as any).sync_type === "fix_pdf_import"
          ) {
            fetchRunningJobs();
            fetchStuckJobs();
          }
          // Also refresh pending counts when jobs complete
          if (
            payload.new &&
            ["completed", "completed_with_errors", "completed_timeout"].includes(
              (payload.new as any).status
            )
          ) {
            fetchPendingCounts();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "legislation" },
        () => {
          // Debounce legislation updates
          fetchPendingCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPendingCounts, fetchRunningJobs, fetchStuckJobs]);

  // Periodic refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(refreshAll, 10000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Launch jobs
  const launchJobs = async (count: number) => {
    const running = await fetchRunningJobs();
    if (running >= maxConcurrentJobs) {
      toast({
        title: "Limite atingido",
        description: `${running} jobs ativos (máx: ${maxConcurrentJobs})`,
        variant: "destructive",
      });
      return { ok: 0, failed: count };
    }

    const results = await Promise.allSettled(
      Array.from({ length: count }).map(() =>
        supabase.functions.invoke("complete-auto-imported-legislation", {
          body: {
            mode: "pdf_import_fix",
            limit: 50,
            includePT: true,
            includeEU: true,
            fixDates: true,
            background: true,
          },
        })
      )
    );

    const ok = results.filter(
      (r) => r.status === "fulfilled" && !(r.value as any)?.error
    ).length;
    return { ok, failed: count - ok };
  };

  // Quick launch 20 jobs
  const handleQuickLaunch = async () => {
    setIsRunning(true);
    try {
      const { ok, failed } = await launchJobs(20);
      toast({
        title: ok > 0 ? "Jobs lançados" : "Falha ao lançar",
        description: `${ok} lançados${failed > 0 ? `, ${failed} falharam` : ""}`,
        variant: ok > 0 ? "default" : "destructive",
      });
      refreshAll();
    } finally {
      setIsRunning(false);
    }
  };

  // Auto-fix to zero
  const handleAutoFix = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setWaveHistory([]);

    const addHistory = (entry: Omit<WaveHistoryEntry, "timestamp">) => {
      setWaveHistory((prev) => [
        ...prev,
        { ...entry, timestamp: new Date().toLocaleTimeString("pt-PT") },
      ]);
    };

    try {
      toast({
        title: "Auto-correção iniciada",
        description: "A processar em vagas até zero pendentes...",
      });

      for (let wave = 1; wave <= maxWaves; wave++) {
        setCurrentWave(wave);
        await fetchPendingCounts();

        const current = (pendingPtCount ?? 0) + (pendingEuCount ?? 0);
        if (current === 0) {
          addHistory({
            wave,
            status: "skipped",
            jobsLaunched: 0,
            pendingBefore: 0,
            message: "Zero pendentes",
          });
          break;
        }

        // Check concurrency
        let running = await fetchRunningJobs();
        let attempts = 0;

        while (running >= maxConcurrentJobs && attempts < 5) {
          attempts++;
          toast({
            title: "Aguardando recursos",
            description: `${running}/${maxConcurrentJobs} jobs ativos. Cool-down ${cooldownSeconds}s...`,
          });

          for (let sec = cooldownSeconds; sec > 0; sec--) {
            setCooldown({ remaining: sec, total: cooldownSeconds });
            await new Promise((r) => setTimeout(r, 1000));
          }
          setCooldown(null);
          running = await fetchRunningJobs();
        }

        if (running >= maxConcurrentJobs) {
          addHistory({
            wave,
            status: "fail",
            jobsLaunched: 0,
            pendingBefore: current,
            message: "Limite não libertado",
          });
          continue;
        }

        const { ok, failed } = await launchJobs(20);
        addHistory({
          wave,
          status: ok > 0 ? "ok" : "fail",
          jobsLaunched: ok,
          pendingBefore: current,
          message: failed > 0 ? `${failed} falharam` : undefined,
        });

        // Wait between waves
        if (wave < maxWaves) {
          for (let sec = 12; sec > 0; sec--) {
            setCooldown({ remaining: sec, total: 12 });
            await new Promise((r) => setTimeout(r, 1000));
          }
          setCooldown(null);
        }
      }

      toast({
        title: "Auto-correção concluída",
        description: "Todas as vagas foram processadas.",
      });
    } catch (e) {
      console.error("Auto-fix error:", e);
      toast({
        title: "Erro na auto-correção",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
      setCurrentWave(null);
      setCooldown(null);
      refreshAll();
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
    }
  };

  // Terminate stuck jobs
  const handleTerminateStuck = async () => {
    setIsTerminating(true);
    try {
      const cutoff = new Date(
        Date.now() - stuckThresholdMinutes * 60 * 1000
      ).toISOString();

      const { data, error: fetchError } = await supabase
        .from("sync_logs")
        .select("id")
        .eq("status", "running")
        .eq("sync_type", "fix_pdf_import")
        .lt("started_at", cutoff)
        .limit(200);

      if (fetchError) throw fetchError;

      const ids = (data || []).map((r) => r.id);
      if (ids.length === 0) {
        toast({ title: "Sem jobs presos", description: "Nada a terminar." });
        return;
      }

      const { error: updateError } = await supabase
        .from("sync_logs")
        .update({
          status: "completed_timeout",
          completed_at: new Date().toISOString(),
          error_message: `Timeout manual (>${stuckThresholdMinutes}min)`,
        })
        .in("id", ids);

      if (updateError) throw updateError;

      toast({
        title: "Jobs terminados",
        description: `${ids.length} jobs marcados como timeout.`,
      });
      refreshAll();
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsTerminating(false);
      setConfirmTerminateStuck(false);
    }
  };

  return (
    <>
      <Card className="border-orange-200 bg-gradient-to-br from-orange-50/50 to-amber-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white">
                <FileWarning className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">Correção de Dados PDF</CardTitle>
                <CardDescription className="text-xs">
                  Corrige metadados incompletos da importação PDF
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={refreshAll}
                disabled={isRunning}
              >
                <RefreshCw className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Main Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Pending PT */}
            <div className="rounded-lg border bg-white p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">
                {pendingPtCount ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Badge variant="outline" className="text-[10px] px-1">PT</Badge>
                Pendentes
              </div>
            </div>

            {/* Pending EU */}
            <div className="rounded-lg border bg-white p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {pendingEuCount ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Badge variant="outline" className="text-[10px] px-1">EU</Badge>
                Pendentes
              </div>
            </div>

            {/* Running Jobs */}
            <div className="rounded-lg border bg-white p-3 text-center">
              <div className={`text-2xl font-bold ${isBlocked ? "text-red-600" : "text-green-600"}`}>
                {runningJobsCount ?? "—"}
                <span className="text-sm font-normal text-muted-foreground">/{maxConcurrentJobs}</span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                {isBlocked ? (
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                ) : (
                  <PlayCircle className="h-3 w-3 text-green-500" />
                )}
                Jobs Ativos
              </div>
            </div>

            {/* Stuck Jobs */}
            <div className="rounded-lg border bg-white p-3 text-center">
              <div className={`text-2xl font-bold ${hasStuckJobs ? "text-red-600" : "text-gray-400"}`}>
                {stuckJobsCount ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" />
                Presos (&gt;{stuckThresholdMinutes}m)
              </div>
            </div>
          </div>

          {/* Progress indicator when running */}
          {cooldown && (
            <div className="rounded-lg border bg-orange-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-orange-700 flex items-center gap-2">
                  <Clock className="h-4 w-4 animate-pulse" />
                  Aguardando... {cooldown.remaining}s
                </span>
                {currentWave && (
                  <Badge variant="outline" className="border-orange-300">
                    Vaga {currentWave}/{maxWaves}
                  </Badge>
                )}
              </div>
              <Progress
                value={((cooldown.total - cooldown.remaining) / cooldown.total) * 100}
                className="h-2"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleAutoFix}
              disabled={isRunning || totalPending === 0}
              className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            >
              {isRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-2 h-4 w-4" />
              )}
              {isRunning ? "A processar..." : "Corrigir Tudo"}
              {totalPending > 0 && !isRunning && (
                <Badge variant="secondary" className="ml-2 bg-white/20">
                  {totalPending}
                </Badge>
              )}
            </Button>

            <Button
              onClick={handleQuickLaunch}
              disabled={isRunning || totalPending === 0 || isBlocked}
              variant="outline"
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <Zap className="mr-2 h-4 w-4" />
              Lançar 20
            </Button>

            {hasStuckJobs && (
              <Button
                onClick={() => setConfirmTerminateStuck(true)}
                disabled={isTerminating}
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                {isTerminating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <StopCircle className="mr-2 h-4 w-4" />
                )}
                Terminar Presos ({stuckJobsCount})
              </Button>
            )}
          </div>

          {/* Settings */}
          <Collapsible open={showSettings} onOpenChange={setShowSettings}>
            <CollapsibleContent className="space-y-4 pt-2">
              <div className="rounded-lg border bg-white/80 p-4 space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Configurações
                </h4>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      Limite de Jobs Concorrentes
                    </label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[maxConcurrentJobs]}
                        onValueChange={([v]) => setMaxConcurrentJobs(v)}
                        min={10}
                        max={100}
                        step={10}
                        className="flex-1"
                        disabled={isRunning}
                      />
                      <span className="text-sm font-medium w-8">{maxConcurrentJobs}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      Cool-down entre vagas (s)
                    </label>
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      value={cooldownSeconds}
                      onChange={(e) => setCooldownSeconds(Number(e.target.value) || 30)}
                      disabled={isRunning}
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      Limiar "Preso" (min)
                    </label>
                    <Input
                      type="number"
                      min={5}
                      max={180}
                      value={stuckThresholdMinutes}
                      onChange={(e) => setStuckThresholdMinutes(Number(e.target.value) || 45)}
                      disabled={isRunning}
                      className="h-8"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Wave History */}
          {waveHistory.length > 0 && (
            <div className="rounded-lg border bg-white/80 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  Histórico de Vagas
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setWaveHistory([])}
                >
                  Limpar
                </Button>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {waveHistory.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between text-xs px-2 py-1.5 rounded ${
                      entry.status === "ok"
                        ? "bg-green-50 text-green-700"
                        : entry.status === "fail"
                        ? "bg-red-50 text-red-700"
                        : "bg-gray-50 text-gray-500"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {entry.status === "ok" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : entry.status === "fail" ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <PauseCircle className="h-3 w-3" />
                      )}
                      <span className="font-medium">Vaga {entry.wave}</span>
                      <span className="text-muted-foreground">• {entry.timestamp}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {entry.jobsLaunched > 0 && (
                        <span>{entry.jobsLaunched} jobs</span>
                      )}
                      {entry.message && (
                        <span className="truncate max-w-32">{entry.message}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm terminate dialog */}
      <AlertDialog open={confirmTerminateStuck} onOpenChange={setConfirmTerminateStuck}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminar jobs presos?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto irá marcar {stuckJobsCount} job(s) com mais de {stuckThresholdMinutes}{" "}
              minutos como "timeout". Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTerminateStuck}
              className="bg-red-600 hover:bg-red-700"
            >
              Terminar Jobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
