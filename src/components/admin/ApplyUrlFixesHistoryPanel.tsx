import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronRight,
  RefreshCw, AlertTriangle, Clock, Eraser, RefreshCw as UpdateIcon
} from "lucide-react";

interface Log {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_added: number | null;   // updated count
  items_updated: number | null; // cleared count
  error_message: string | null;
}

interface ParsedLog extends Log {
  humanSummary: string;
  errors: { legislation_id: string; error: string }[];
}

function parseLog(l: Log): ParsedLog {
  let humanSummary = l.error_message || "";
  let errors: { legislation_id: string; error: string }[] = [];
  if (l.error_message?.includes("__ERRORS_JSON__")) {
    const [head, json] = l.error_message.split("__ERRORS_JSON__");
    humanSummary = head.trim();
    try { errors = JSON.parse(json); } catch { /* noop */ }
  }
  return { ...l, humanSummary, errors };
}

function statusBadge(status: string, hasFailures: boolean) {
  if (status === "running") {
    return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Em execução</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Falhado</Badge>;
  }
  if (status === "completed" && hasFailures) {
    return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600"><AlertTriangle className="h-3 w-3" />Parcial</Badge>;
  }
  return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Concluído</Badge>;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT");
}

function duration(start: string, end: string | null) {
  if (!end) return "…";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function ApplyUrlFixesHistoryPanel() {
  const [logs, setLogs] = useState<ParsedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sync_logs")
      .select("*")
      .eq("sync_type", "apply_url_fixes")
      .order("started_at", { ascending: false })
      .limit(30);
    setLogs((data || []).map((l: any) => parseLog(l as Log)));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("apply-url-fixes-logs")
      .on("postgres_changes", { event: "*", schema: "public", table: "sync_logs", filter: "sync_type=eq.apply_url_fixes" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const running = logs.find((l) => l.status === "running");
  const runningProgress = running
    ? Math.min(99, Math.round(((running.items_added || 0) + (running.items_updated || 0)) / Math.max(1, running.items_processed || 1) * 100))
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Histórico de correções aplicadas
            </CardTitle>
            <CardDescription>
              Estado, contagens e erros por execução do job de aplicar correções de URL.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {running && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                Job em execução · iniciado {fmtDate(running.started_at)}
              </div>
              <span className="text-xs text-muted-foreground">{runningProgress}%</span>
            </div>
            <Progress value={runningProgress} className="h-2" />
          </div>
        )}

        {logs.length === 0 && !loading && (
          <div className="text-sm text-muted-foreground text-center py-8">
            Ainda não há execuções registadas.
          </div>
        )}

        <ScrollArea className="max-h-[480px]">
          <div className="space-y-2">
            {logs.map((l) => {
              const hasFailures = l.errors.length > 0 || (l.error_message?.includes("Failed:") && !l.error_message.includes("Failed: 0"));
              const isOpen = openIds.has(l.id);
              const cleared = l.items_updated || 0;
              const updated = l.items_added || 0;
              const total = l.items_processed || 0;
              const failed = l.errors.length;
              return (
                <Collapsible key={l.id} open={isOpen} onOpenChange={() => toggle(l.id)}>
                  <div className="border rounded-md">
                    <CollapsibleTrigger className="w-full p-3 flex items-center gap-3 hover:bg-muted/30 text-left">
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(l.status, hasFailures)}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtDate(l.started_at)} · {duration(l.started_at, l.completed_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <span className="text-muted-foreground">Total: <strong className="text-foreground">{total}</strong></span>
                          <span className="flex items-center gap-1 text-destructive">
                            <Eraser className="h-3 w-3" /> {cleared} removidas
                          </span>
                          <span className="flex items-center gap-1 text-primary">
                            <UpdateIcon className="h-3 w-3" /> {updated} atualizadas
                          </span>
                          {failed > 0 && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> {failed} erros
                            </span>
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-0 space-y-2 border-t bg-muted/20">
                        {l.humanSummary && (
                          <div className="text-xs pt-2">
                            <span className="text-muted-foreground">Resumo: </span>
                            <span className="font-mono">{l.humanSummary}</span>
                          </div>
                        )}
                        {l.errors.length > 0 ? (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-destructive">Erros ({l.errors.length}):</div>
                            <ScrollArea className="max-h-[200px] rounded border bg-background">
                              <div className="divide-y">
                                {l.errors.map((e, i) => (
                                  <div key={i} className="p-2 text-xs">
                                    <div className="font-mono text-muted-foreground truncate">{e.legislation_id}</div>
                                    <div className="text-destructive break-words">{e.error}</div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground pt-1">Sem erros nesta execução.</div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
