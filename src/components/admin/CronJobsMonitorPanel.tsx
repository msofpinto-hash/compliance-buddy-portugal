import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  Clock, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Play,
  Calendar,
  Timer,
  TrendingUp,
  Activity,
  Bell
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  description: string;
  functionName: string;
  syncType: string; // Maps to sync_logs.sync_type
  lastRun?: {
    status: string;
    startedAt: string;
    completedAt?: string;
    itemsProcessed?: number;
    itemsAdded?: number;
    error?: string;
  };
}

const CRON_JOBS: CronJob[] = [
  {
    id: "daily-data-quality-fix",
    name: "Correção de Qualidade de Dados",
    schedule: "0 3 * * *",
    description: "Corrige títulos, categoriza diplomas e gera URLs diariamente às 3:00 AM",
    functionName: "scheduled-data-quality-fix",
    syncType: "scheduled-quality-fix", // Matches sync_logs.sync_type
  },
  {
    id: "sync-dre",
    name: "Sincronização DRE",
    schedule: "0 7 * * *",
    description: "Sincroniza novos diplomas do Diário da República às 7:00 AM",
    functionName: "sync-dre",
    syncType: "dre-daily",
  },
  {
    id: "sync-eurlex",
    name: "Sincronização EUR-Lex",
    schedule: "0 6 * * *",
    description: "Sincroniza novos diplomas do EUR-Lex às 6:00 AM",
    functionName: "sync-eurlex",
    syncType: "eurlex-daily",
  },
  {
    id: "check-deadlines",
    name: "Verificar Prazos",
    schedule: "0 8 * * *",
    description: "Verifica prazos de planos de ação e cria alertas às 8:00 AM",
    functionName: "check-action-plan-deadlines",
    syncType: "check-deadlines",
  },
  {
    id: "reimport-dre-metadata",
    name: "Reimportar Metadados DRE",
    schedule: "0 */2 * * *",
    description: "Completa sumários e entidades em falta de diplomas PT a cada 2 horas",
    functionName: "reimport-dre-metadata",
    syncType: "reimport-dre-metadata",
  },
];

export function CronJobsMonitorPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Fetch execution history from sync_logs
  const { data: executionHistory, isLoading, refetch } = useQuery({
    queryKey: ["cron-execution-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get stats
  const stats = {
    totalExecutions: executionHistory?.length || 0,
    successfulToday: executionHistory?.filter(
      (e) => e.status === "completed" && 
        new Date(e.started_at).toDateString() === new Date().toDateString()
    ).length || 0,
    failedToday: executionHistory?.filter(
      (e) => (e.status === "failed" || e.status === "completed_with_errors") && 
        new Date(e.started_at).toDateString() === new Date().toDateString()
    ).length || 0,
    lastExecution: executionHistory?.[0],
  };

  // Get last run for each cron job using exact syncType match
  const getLastRun = (syncType: string) => {
    return executionHistory?.find((e) => e.sync_type === syncType);
  };

  // Trigger manual run
  const handleManualRun = async (job: CronJob) => {
    setRunningJob(job.id);
    try {
      const { error } = await supabase.functions.invoke(job.functionName, {
        body: { manual: true },
      });

      if (error) throw error;

      toast({
        title: "Job iniciado",
        description: `${job.name} foi executado manualmente.`,
      });

      // Refresh after a delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["cron-execution-history"] });
        refetch();
      }, 2000);
    } catch (err) {
      toast({
        title: "Erro ao executar job",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setRunningJob(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Sucesso</Badge>;
      case "completed_with_errors":
        return <Badge className="bg-amber-500">Parcial</Badge>;
      case "failed":
        return <Badge variant="destructive">Falhou</Badge>;
      case "pending":
      case "running":
        return <Badge variant="secondary">A executar</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
      case "pending":
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatSchedule = (cron: string) => {
    const parts = cron.split(" ");
    if (parts.length >= 5) {
      const [minute, hour] = parts;
      return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC`;
    }
    return cron;
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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalExecutions}</p>
                <p className="text-sm text-muted-foreground">Execuções totais</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.successfulToday}</p>
                <p className="text-sm text-muted-foreground">Sucesso hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.failedToday}</p>
                <p className="text-sm text-muted-foreground">Falhas hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Timer className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {stats.lastExecution
                    ? formatDistanceToNow(parseISO(stats.lastExecution.started_at), {
                        addSuffix: true,
                        locale: pt,
                      })
                    : "N/A"}
                </p>
                <p className="text-sm text-muted-foreground">Última execução</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scheduled Jobs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Jobs Agendados
              </CardTitle>
              <CardDescription>
                Tarefas automáticas executadas diariamente
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {CRON_JOBS.map((job) => {
              const lastRun = getLastRun(job.syncType);
              
              return (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-muted">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{job.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {formatSchedule(job.schedule)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {job.description}
                      </p>
                      {lastRun && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {getStatusIcon(lastRun.status)}
                          <span>
                            Última execução:{" "}
                            {formatDistanceToNow(parseISO(lastRun.started_at), {
                              addSuffix: true,
                              locale: pt,
                            })}
                          </span>
                          {lastRun.items_added !== null && lastRun.items_added > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              +{lastRun.items_added} items
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleManualRun(job)}
                          disabled={runningJob === job.id}
                        >
                          {runningJob === job.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Executar manualmente</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Execution History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Histórico de Execuções
          </CardTitle>
          <CardDescription>
            Últimas 100 execuções de jobs agendados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Processados</TableHead>
                  <TableHead>Adicionados</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executionHistory?.map((execution) => {
                  const duration = execution.completed_at
                    ? Math.round(
                        (new Date(execution.completed_at).getTime() -
                          new Date(execution.started_at).getTime()) /
                          1000
                      )
                    : null;

                  return (
                    <TableRow key={execution.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {execution.sync_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(execution.status)}</TableCell>
                      <TableCell className="text-sm">
                        {format(parseISO(execution.started_at), "dd/MM HH:mm", {
                          locale: pt,
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {duration !== null ? `${duration}s` : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {execution.items_processed ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {execution.items_added ?? "-"}
                      </TableCell>
                      <TableCell>
                        {execution.error_message && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="destructive" className="text-xs">
                                  <Bell className="h-3 w-3 mr-1" />
                                  Ver erro
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <p className="text-xs whitespace-pre-wrap">
                                  {execution.error_message}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!executionHistory || executionHistory.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma execução registada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Alerts for Recent Failures */}
      {stats.failedToday > 0 && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Alertas de Falha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {executionHistory
                ?.filter(
                  (e) =>
                    (e.status === "failed" || e.status === "completed_with_errors") &&
                    new Date(e.started_at).toDateString() === new Date().toDateString()
                )
                .map((failure) => (
                  <div
                    key={failure.id}
                    className="p-3 rounded-lg border border-red-500/30 bg-background"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="font-medium">{failure.sync_type}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(failure.started_at), "HH:mm", { locale: pt })}
                      </span>
                    </div>
                    {failure.error_message && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {failure.error_message.substring(0, 200)}
                        {failure.error_message.length > 200 ? "..." : ""}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
