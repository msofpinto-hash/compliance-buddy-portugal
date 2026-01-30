import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  History, ChevronDown, CheckCircle2, XCircle, Clock, AlertTriangle,
  Link, Calendar, Type, FileText, ListChecks, GitBranch, Layers, Loader2
} from "lucide-react";
import { formatDistanceToNow, differenceInSeconds, parseISO, format } from "date-fns";
import { pt } from "date-fns/locale";

const SYNC_TYPE_LABELS: Record<string, string> = {
  "fix-broken-urls": "URLs",
  "find-missing-dre-urls": "URLs DRE",
  "find-dre-urls-direct": "URLs DRE Direct",
  "reimport-dre-metadata": "Metadados DRE",
  "reimport-eurlex-dates": "Datas EUR-Lex",
  "fix-eurlex-titles": "Títulos EUR-Lex",
  "fix-generic-titles": "Títulos Genéricos",
  "complete-auto-imported": "Metadados Auto",
  "extract-requirements-background": "Requisitos",
  "extract-legislation-relations": "Relações",
  "bulk-suggest-categories": "Categorias IA",
  "auto-categorize": "Categorização",
  "cleanup-duplicate-legislation": "Duplicados",
  "dre-sync": "Sync DRE",
  "eurlex-sync": "Sync EUR-Lex",
};

const SYNC_TYPE_ICONS: Record<string, typeof Link> = {
  "fix-broken-urls": Link,
  "find-missing-dre-urls": Link,
  "find-dre-urls-direct": Link,
  "reimport-dre-metadata": Calendar,
  "reimport-eurlex-dates": Calendar,
  "fix-eurlex-titles": Type,
  "fix-generic-titles": Type,
  "complete-auto-imported": FileText,
  "extract-requirements-background": ListChecks,
  "extract-legislation-relations": GitBranch,
  "bulk-suggest-categories": Layers,
  "auto-categorize": Layers,
};

interface ExecutionLog {
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

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "em curso...";
  const seconds = differenceInSeconds(parseISO(completedAt), parseISO(startedAt));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "completed_timeout":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">Concluído</Badge>;
    case "failed":
      return <Badge variant="destructive" className="text-xs">Falhou</Badge>;
    case "running":
      return <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">A correr</Badge>;
    case "completed_timeout":
      return <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800">Timeout</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

export function ExecutionHistoryPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [limit, setLimit] = useState(20);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["execution-history", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as ExecutionLog[];
    },
    refetchInterval: 10000, // Refresh every 10s
  });

  const stats = logs?.reduce((acc, log) => {
    if (log.status === "completed") acc.completed++;
    else if (log.status === "failed") acc.failed++;
    else if (log.status === "running") acc.running++;
    acc.totalProcessed += log.items_processed || 0;
    acc.totalAdded += log.items_added || 0;
    return acc;
  }, { completed: 0, failed: 0, running: 0, totalProcessed: 0, totalAdded: 0 });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between p-3 h-auto hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium">Histórico de Execuções</span>
            {stats && (
              <div className="flex items-center gap-1.5 ml-2">
                {stats.running > 0 && (
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {stats.running} a correr
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {stats.completed} ✓
                </Badge>
                {stats.failed > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {stats.failed} ✗
                  </Badge>
                )}
              </div>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs && logs.length > 0 ? (
            <>
              <ScrollArea className="h-[300px] pr-2">
                <div className="space-y-2">
                  {logs.map((log) => {
                    const Icon = SYNC_TYPE_ICONS[log.sync_type] || FileText;
                    const label = SYNC_TYPE_LABELS[log.sync_type] || log.sync_type;
                    
                    return (
                      <div
                        key={log.id}
                        className={`p-2.5 rounded-lg border transition-colors ${
                          log.status === "failed" 
                            ? "bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900" 
                            : log.status === "running"
                            ? "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900"
                            : "bg-card/50 border-border/50 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <div className="mt-0.5">
                              {getStatusIcon(log.status)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium truncate">{label}</span>
                                {getStatusBadge(log.status)}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(parseISO(log.started_at), { addSuffix: true, locale: pt })}
                                </span>
                                <span>⏱ {formatDuration(log.started_at, log.completed_at)}</span>
                              </div>
                              {(log.items_processed || log.items_added || log.items_updated) && (
                                <div className="flex items-center gap-2 mt-1.5 text-xs">
                                  {log.items_processed != null && log.items_processed > 0 && (
                                    <span className="text-muted-foreground">
                                      Processados: <span className="font-medium text-foreground">{log.items_processed}</span>
                                    </span>
                                  )}
                                  {log.items_added != null && log.items_added > 0 && (
                                    <span className="text-green-600 dark:text-green-400">
                                      +{log.items_added} adicionados
                                    </span>
                                  )}
                                  {log.items_updated != null && log.items_updated > 0 && (
                                    <span className="text-blue-600 dark:text-blue-400">
                                      ~{log.items_updated} atualizados
                                    </span>
                                  )}
                                </div>
                              )}
                              {log.error_message && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 line-clamp-2">
                                  {log.error_message}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                            {format(parseISO(log.started_at), "HH:mm")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              {logs.length >= limit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs"
                  onClick={() => setLimit(prev => prev + 20)}
                >
                  Carregar mais...
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma execução registada.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
