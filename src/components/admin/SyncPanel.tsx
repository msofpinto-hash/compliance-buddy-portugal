import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { useSyncLogs, useTriggerSync } from "@/hooks/useSyncLogs";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

export function SyncPanel() {
  const { data: syncLogs, isLoading: logsLoading } = useSyncLogs();
  const triggerSync = useTriggerSync();
  const { toast } = useToast();

  const handleSync = async (syncType: string) => {
    try {
      const result = await triggerSync.mutateAsync({ syncType });
      toast({
        title: "Sincronização concluída",
        description: result.message || `${result.itemsAdded} adicionados, ${result.itemsUpdated} atualizados`,
      });
    } catch (error) {
      toast({
        title: "Erro na sincronização",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20"><CheckCircle2 className="mr-1 h-3 w-3" />Concluído</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Em progresso</Badge>;
      case "failed":
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20"><XCircle className="mr-1 h-3 w-3" />Falhou</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Sync Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sincronização com DRE
          </CardTitle>
          <CardDescription>
            Sincronize legislação do Diário da República Eletrónico
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={() => handleSync("daily")}
            disabled={triggerSync.isPending}
          >
            {triggerSync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sincronização Diária
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSync("monthly")}
            disabled={triggerSync.isPending}
          >
            {triggerSync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Últimos 30 dias
          </Button>
        </CardContent>
      </Card>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Sincronizações</CardTitle>
          <CardDescription>
            Últimas sincronizações realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : syncLogs && syncLogs.length > 0 ? (
            <div className="space-y-3">
              {syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(log.status)}
                      <span className="text-sm font-medium capitalize">
                        {log.sync_type === "daily" ? "Diária" : log.sync_type === "monthly" ? "Mensal" : log.sync_type}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(log.started_at), { addSuffix: true, locale: pt })}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    {log.status === "completed" && (
                      <>
                        <p className="text-green-600">+{log.items_added} adicionados</p>
                        <p className="text-blue-600">{log.items_updated} atualizados</p>
                      </>
                    )}
                    {log.error_message && (
                      <p className="text-destructive">{log.error_message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <RefreshCw className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Nenhuma sincronização realizada ainda</p>
              <p className="text-sm">Execute uma sincronização para ver o histórico</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
