import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  RefreshCw,
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Loader2,
  RotateCcw,
  Clock,
  Zap,
  TrendingUp,
  Activity,
  Timer,
  Play,
  Pause,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import { format, formatDistanceToNow, parseISO, subHours, startOfDay } from "date-fns";
import { pt } from "date-fns/locale";

interface RetryStats {
  totalRetries: number;
  retriesLastHour: number;
  successfulRetries: number;
  failedRetries: number;
  timeoutsDetected: number;
  activeJobs: number;
  recoveredJobs: number;
}

interface JobTypeStats {
  type: string;
  running: number;
  completed: number;
  failed: number;
  timeouts: number;
  avgDuration: number;
}

export function JobRetryMonitorPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all sync logs with realtime updates
  const { data: syncLogs, isLoading, refetch } = useQuery({
    queryKey: ["retry-monitor-logs"],
    queryFn: async () => {
      const since = subHours(new Date(), 24).toISOString();
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .gte("started_at", since)
        .order("started_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000, // Faster refresh for monitoring
  });

  // Calculate retry statistics
  const stats = useMemo<RetryStats>(() => {
    if (!syncLogs) return {
      totalRetries: 0,
      retriesLastHour: 0,
      successfulRetries: 0,
      failedRetries: 0,
      timeoutsDetected: 0,
      activeJobs: 0,
      recoveredJobs: 0,
    };

    const oneHourAgo = subHours(new Date(), 1);
    const retryLogs = syncLogs.filter(log => log.sync_type === "auto-retry-failed-jobs");
    const timeoutLogs = syncLogs.filter(log => log.status === "completed_timeout");
    const runningLogs = syncLogs.filter(log => log.status === "running" || log.status === "pending");
    
    // Recovered = jobs that completed after a timeout was logged
    const recoveredCount = syncLogs.filter(log => 
      log.status === "completed" && 
      log.error_message?.includes("retry")
    ).length;

    return {
      totalRetries: retryLogs.length,
      retriesLastHour: retryLogs.filter(log => 
        new Date(log.started_at) > oneHourAgo
      ).length,
      successfulRetries: retryLogs.filter(log => log.status === "completed").length,
      failedRetries: retryLogs.filter(log => log.status === "failed").length,
      timeoutsDetected: timeoutLogs.length,
      activeJobs: runningLogs.length,
      recoveredJobs: recoveredCount,
    };
  }, [syncLogs]);

  // Calculate per-job-type statistics
  const jobTypeStats = useMemo<JobTypeStats[]>(() => {
    if (!syncLogs) return [];

    const typeMap = new Map<string, JobTypeStats>();
    
    syncLogs.forEach(log => {
      if (log.sync_type === "auto-retry-failed-jobs") return; // Skip retry logs
      
      const existing = typeMap.get(log.sync_type) || {
        type: log.sync_type,
        running: 0,
        completed: 0,
        failed: 0,
        timeouts: 0,
        avgDuration: 0,
      };

      if (log.status === "running" || log.status === "pending") {
        existing.running++;
      } else if (log.status === "completed") {
        existing.completed++;
      } else if (log.status === "failed") {
        existing.failed++;
      } else if (log.status === "completed_timeout") {
        existing.timeouts++;
      }

      // Calculate duration if completed
      if (log.completed_at && log.started_at) {
        const duration = (new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000;
        existing.avgDuration = (existing.avgDuration + duration) / 2;
      }

      typeMap.set(log.sync_type, existing);
    });

    return Array.from(typeMap.values())
      .sort((a, b) => (b.running + b.completed + b.failed) - (a.running + a.completed + a.failed))
      .slice(0, 10);
  }, [syncLogs]);

  // Get running jobs
  const runningJobs = useMemo(() => {
    if (!syncLogs) return [];
    return syncLogs
      .filter(log => log.status === "running" || log.status === "pending")
      .slice(0, 20);
  }, [syncLogs]);

  // Get timeout/failed jobs (last 24h)
  const problemJobs = useMemo(() => {
    if (!syncLogs) return [];
    return syncLogs
      .filter(log => log.status === "failed" || log.status === "completed_timeout" || log.status === "completed_with_errors")
      .slice(0, 20);
  }, [syncLogs]);

  // Trigger manual retry check
  const handleManualRetryCheck = async () => {
    try {
      const { error } = await supabase.functions.invoke("auto-retry-failed-jobs", {
        body: { manual: true },
      });

      if (error) throw error;

      toast({
        title: "Verificação de retry iniciada",
        description: "A verificar jobs estagnados...",
      });

      setTimeout(() => refetch(), 3000);
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "completed_with_errors":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "completed_timeout":
        return <Clock className="h-4 w-4 text-orange-500" />;
      case "pending":
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500 text-white">Sucesso</Badge>;
      case "completed_with_errors":
        return <Badge className="bg-amber-500 text-white">Parcial</Badge>;
      case "failed":
        return <Badge variant="destructive">Falhou</Badge>;
      case "completed_timeout":
        return <Badge className="bg-orange-500 text-white">Timeout</Badge>;
      case "pending":
      case "running":
        return <Badge variant="secondary" className="animate-pulse">A executar</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (startedAt: string, completedAt?: string | null) => {
    if (!completedAt) {
      const elapsed = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
      return `${elapsed}s (a correr)`;
    }
    const duration = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    if (duration >= 60) {
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    }
    return `${duration}s`;
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

  return (
    <div className="space-y-6">
      {/* Header with manual trigger */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-500" />
            Monitor de Retry Automático
          </h3>
          <p className="text-sm text-muted-foreground">
            Estatísticas em tempo real do sistema de recuperação automática
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button 
            size="sm" 
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white"
            onClick={handleManualRetryCheck}
          >
            <Zap className="h-4 w-4 mr-2" />
            Verificar Agora
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-500/10">
                <Activity className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.activeJobs}</p>
                <p className="text-xs text-muted-foreground">Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10">
                <RotateCcw className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.totalRetries}</p>
                <p className="text-xs text-muted-foreground">Retries (24h)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-500/10">
                <Clock className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.timeoutsDetected}</p>
                <p className="text-xs text-muted-foreground">Timeouts</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.successfulRetries}</p>
                <p className="text-xs text-muted-foreground">Recuperados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-500/10">
                <XCircle className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.failedRetries}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10">
                <Timer className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <p className="text-xl font-bold">{stats.retriesLastHour}</p>
                <p className="text-xs text-muted-foreground">Última hora</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xl font-bold">
                  {stats.retriesLastHour < 50 ? "OK" : "⚠️"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.retriesLastHour}/50 limite
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rate Limit Warning */}
      {stats.retriesLastHour >= 40 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Aproximando limite de segurança
                </p>
                <p className="text-sm text-muted-foreground">
                  {stats.retriesLastHour}/50 retries na última hora. O sistema pode pausar novas tentativas.
                </p>
              </div>
            </div>
            <Progress 
              value={(stats.retriesLastHour / 50) * 100} 
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Running Jobs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              Jobs em Execução
              {runningJobs.length > 0 && (
                <Badge variant="secondary">{runningJobs.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              {runningJobs.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <p className="text-sm">Nenhum job em execução</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {runningJobs.map((job) => (
                    <div 
                      key={job.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-mono text-xs truncate">{job.sync_type}</p>
                          <p className="text-xs text-muted-foreground">
                            Iniciado {formatDistanceToNow(parseISO(job.started_at), { addSuffix: true, locale: pt })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium">
                          {formatDuration(job.started_at)}
                        </p>
                        {job.items_processed != null && (
                          <p className="text-xs text-muted-foreground">
                            {job.items_processed} proc.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Problem Jobs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Jobs com Problemas
              {problemJobs.length > 0 && (
                <Badge variant="destructive">{problemJobs.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              {problemJobs.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
                  <p className="text-sm">Nenhum problema nas últimas 24h</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {problemJobs.map((job) => (
                    <div 
                      key={job.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {getStatusIcon(job.status)}
                        <div className="min-w-0">
                          <p className="font-mono text-xs truncate">{job.sync_type}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {job.error_message?.substring(0, 50) || "Sem mensagem de erro"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {getStatusBadge(job.status)}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(parseISO(job.started_at), "HH:mm", { locale: pt })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Job Type Statistics Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Estatísticas por Tipo de Job
          </CardTitle>
          <CardDescription>
            Visão geral do desempenho por tipo de tarefa (últimas 24h)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">A Correr</TableHead>
                <TableHead className="text-center">Completos</TableHead>
                <TableHead className="text-center">Falhas</TableHead>
                <TableHead className="text-center">Timeouts</TableHead>
                <TableHead className="text-center">Taxa Sucesso</TableHead>
                <TableHead className="text-right">Duração Média</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobTypeStats.map((stat) => {
                const total = stat.completed + stat.failed + stat.timeouts;
                const successRate = total > 0 ? Math.round((stat.completed / total) * 100) : 0;
                
                return (
                  <TableRow key={stat.type}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {stat.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {stat.running > 0 ? (
                        <Badge variant="secondary" className="animate-pulse">
                          {stat.running}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-green-600">
                      {stat.completed}
                    </TableCell>
                    <TableCell className="text-center text-red-600">
                      {stat.failed}
                    </TableCell>
                    <TableCell className="text-center text-orange-600">
                      {stat.timeouts}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Progress 
                          value={successRate} 
                          className="w-16 h-2"
                        />
                        <span className="text-xs text-muted-foreground w-8">
                          {successRate}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {stat.avgDuration > 0 
                        ? `${Math.round(stat.avgDuration)}s` 
                        : "-"
                      }
                    </TableCell>
                  </TableRow>
                );
              })}
              {jobTypeStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhuma estatística disponível
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
