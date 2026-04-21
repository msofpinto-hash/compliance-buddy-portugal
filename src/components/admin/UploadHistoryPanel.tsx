import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  History,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

type SyncLog = {
  id: string;
  sync_type: string;
  status: string;
  items_processed: number | null;
  items_added: number | null;
  items_updated: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type RecentLeg = {
  id: string;
  number: string;
  title: string;
  origin: string | null;
  source: string | null;
  created_at: string;
  document_url: string | null;
};

const statusBadge = (s: string) => {
  switch (s) {
    case "completed":
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Concluído
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> A correr
        </Badge>
      );
    case "failed":
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" /> Erro
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" /> {s}
        </Badge>
      );
  }
};

export function UploadHistoryPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bulkOrigin, setBulkOrigin] = useState<"PT" | "EU" | "ALL">("ALL");
  const [bulkLimit, setBulkLimit] = useState("10");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Live sync_logs
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["upload-history-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as SyncLog[];
    },
    refetchInterval: 5000,
  });

  // Recent manually-uploaded legislation (for re-extraction button)
  const { data: recent = [], isLoading: recentLoading } = useQuery({
    queryKey: ["upload-history-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, origin, source, created_at, document_url")
        .in("source", ["manual", "manual_upload", "dre", "eurlex"])
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as RecentLeg[];
    },
    refetchInterval: 10000,
  });

  // Realtime subscription on sync_logs
  useEffect(() => {
    const channel = supabase
      .channel("upload-history-syncs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["upload-history-logs"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleRetryOne = async (legId: string, number: string) => {
    setRetryingId(legId);
    try {
      const { error } = await supabase.functions.invoke("scrape-requirements-from-url", {
        body: { legislationIds: [legId], replaceExisting: true },
      });
      if (error) throw error;
      toast({
        title: "Re-extração agendada",
        description: `${number} — extração lançada em segundo plano.`,
      });
      queryClient.invalidateQueries({ queryKey: ["upload-history-logs"] });
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleBulkRetry = async () => {
    setBulkRunning(true);
    try {
      const body: Record<string, unknown> = {
        limit: Math.min(parseInt(bulkLimit) || 10, 50),
        replaceExisting: false,
      };
      if (bulkOrigin !== "ALL") body.origin = bulkOrigin;

      const { error } = await supabase.functions.invoke("scrape-requirements-from-url", {
        body,
      });
      if (error) throw error;
      toast({
        title: "Re-extração em massa lançada",
        description: `Origem: ${bulkOrigin} · até ${bulkLimit} diplomas. Acompanha no histórico.`,
      });
      queryClient.invalidateQueries({ queryKey: ["upload-history-logs"] });
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBulkRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Bulk re-extraction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <Zap className="h-5 w-5 text-primary" /> Reagendar extração em massa
          </CardTitle>
          <CardDescription>
            Lança extração de requisitos para diplomas sem requisitos, filtrando por origem.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Origem</label>
            <Select value={bulkOrigin} onValueChange={(v) => setBulkOrigin(v as typeof bulkOrigin)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                <SelectItem value="EU">🇪🇺 UE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Limite (máx. 50)</label>
            <Select value={bulkLimit} onValueChange={setBulkLimit}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 20, 30, 50].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleBulkRetry} disabled={bulkRunning} className="gap-2">
            {bulkRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> A lançar…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Lançar
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Recent uploads with re-extract per row */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <RefreshCw className="h-5 w-5 text-primary" /> Diplomas recentes
          </CardTitle>
          <CardDescription>
            Reagendar extração individual para cada diploma carregado recentemente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem diplomas recentes.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Carregado</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {r.number.slice(0, 30)}
                      </TableCell>
                      <TableCell className="text-xs max-w-md truncate" title={r.title}>
                        {r.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.origin === "EU" || r.origin === "eurlex" ? "🇪🇺" : "🇵🇹"} {r.origin || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: pt })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryingId === r.id}
                          onClick={() => handleRetryOne(r.id, r.number)}
                          className="gap-1"
                        >
                          {retryingId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Re-extrair
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync logs history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <History className="h-5 w-5 text-primary" /> Histórico de jobs
          </CardTitle>
          <CardDescription>
            Importações, sincronizações e extrações em segundo plano (atualizado em tempo real).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem jobs registados.</p>
          ) : (
            <ScrollArea className="h-[400px] pr-2">
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{log.sync_type}</span>
                        {statusBadge(log.status)}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span>
                          Iniciado{" "}
                          {formatDistanceToNow(new Date(log.started_at), {
                            addSuffix: true,
                            locale: pt,
                          })}
                        </span>
                        {log.items_processed != null && (
                          <span>📊 {log.items_processed} processado(s)</span>
                        )}
                        {(log.items_added ?? 0) > 0 && (
                          <span className="text-primary">+{log.items_added} novo(s)</span>
                        )}
                        {(log.items_updated ?? 0) > 0 && (
                          <span className="text-muted-foreground">~{log.items_updated} atualizado(s)</span>
                        )}
                      </div>
                      {log.error_message && (
                        <div className="text-xs text-destructive line-clamp-2">{log.error_message}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          <Separator className="my-3" />
          <p className="text-xs text-muted-foreground">
            Mostrando os 30 jobs mais recentes. Atualização em tempo real ativa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
