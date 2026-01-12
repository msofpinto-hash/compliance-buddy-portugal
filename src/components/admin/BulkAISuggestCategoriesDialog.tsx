import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Check, AlertCircle, Server, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

interface LegislationItem {
  id: string;
  number: string;
  title: string;
  summary?: string | null;
  categories?: Array<{ id: string }>;
}

interface BulkAISuggestCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legislationList: LegislationItem[];
}

interface SyncLog {
  id: string;
  status: string;
  items_processed: number | null;
  items_added: number | null;
  error_message: string | null;
  completed_at: string | null;
}

export function BulkAISuggestCategoriesDialog({
  open,
  onOpenChange,
  legislationList,
}: BulkAISuggestCategoriesDialogProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [syncLogId, setSyncLogId] = useState<string | null>(null);
  const [syncLog, setSyncLog] = useState<SyncLog | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const queryClient = useQueryClient();

  // Use realtime subscription for sync log updates
  useEffect(() => {
    if (!syncLogId) return;

    // Initial fetch
    const fetchSyncLog = async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("id, status, items_processed, items_added, error_message, completed_at")
        .eq("id", syncLogId)
        .single();
      
      if (data) {
        setSyncLog(data);
        if (data.status === "completed") {
          queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
          toast.success(`Processamento concluído! ${data.items_added || 0} categorias atribuídas.`, {
            duration: 10000,
          });
        }
      }
    };

    fetchSyncLog();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`sync-log-${syncLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sync_logs',
          filter: `id=eq.${syncLogId}`,
        },
        (payload) => {
          const data = payload.new as SyncLog;
          setSyncLog(data);
          
          if (data.status === "completed") {
            queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
            toast.success(`Processamento concluído! ${data.items_added || 0} categorias atribuídas.`, {
              duration: 10000,
            });
          }
        }
      )
      .subscribe();

    // Fallback polling in case realtime doesn't work
    const interval = setInterval(fetchSyncLog, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [syncLogId, queryClient]);

  const handleStartBackgroundProcess = async () => {
    setIsStarting(true);
    
    try {
      const ids = legislationList.map(leg => leg.id);
      
      const { data, error } = await supabase.functions.invoke("bulk-suggest-categories", {
        body: {
          legislationIds: ids,
          autoAssign: true,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setSyncLogId(data.syncLogId);
      setTotalItems(data.total);
      toast.success(data.message);
    } catch (e) {
      console.error("Error starting bulk process:", e);
      toast.error("Erro ao iniciar processamento");
    } finally {
      setIsStarting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Don't reset if still processing - just close
      if (syncLog?.status !== "running") {
        setSyncLogId(null);
        setSyncLog(null);
        setTotalItems(0);
      }
    }
    onOpenChange(open);
  };

  const progress = totalItems > 0 && syncLog 
    ? ((syncLog.items_processed || 0) / totalItems) * 100 
    : 0;

  const isRunning = syncLog?.status === "running";
  const isCompleted = syncLog?.status === "completed";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Sugestões de Categorias em Lote (IA)
          </DialogTitle>
          <DialogDescription>
            Processar {legislationList.length} diploma(s) selecionado(s)
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {!syncLogId && !isStarting && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                <Server className="h-8 w-8 text-amber-600" />
              </div>
              <div>
                <h4 className="font-medium mb-1">Processamento em Segundo Plano</h4>
                <p className="text-sm text-muted-foreground">
                  A IA irá analisar cada diploma e atribuir automaticamente as categorias sugeridas.
                  <br />
                  <span className="text-amber-600 font-medium">Pode fechar esta janela - o processo continua no servidor.</span>
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-left space-y-1">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Apenas subcategorias (sem filhos) serão sugeridas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Categorias já atribuídas serão ignoradas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Atribuição automática das sugestões</span>
                </div>
              </div>
              <Button onClick={handleStartBackgroundProcess} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Iniciar Processamento
              </Button>
            </div>
          )}

          {isStarting && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
              <p className="text-sm text-muted-foreground">A iniciar processamento...</p>
            </div>
          )}

          {syncLogId && !isStarting && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Progresso: {syncLog?.items_processed || 0} / {totalItems}
                </span>
                <div className="flex items-center gap-2">
                  {isRunning && (
                    <Badge variant="secondary" className="gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      A processar...
                    </Badge>
                  )}
                  {isCompleted && (
                    <Badge className="bg-green-100 text-green-700 gap-1">
                      <Check className="h-3 w-3" />
                      Concluído
                    </Badge>
                  )}
                </div>
              </div>
              
              <Progress value={progress} className="h-3" />

              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-primary">
                    {syncLog?.items_processed || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Processados</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-600">
                    {syncLog?.items_added || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Categorias Atribuídas</div>
                </div>
              </div>

              {syncLog?.error_message && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{syncLog.error_message}</span>
                </div>
              )}

              {isRunning && (
                <p className="text-sm text-center text-muted-foreground">
                  Pode fechar esta janela. O processamento continua em segundo plano.
                </p>
              )}

              {isCompleted && (
                <div className="text-center pt-2">
                  <p className="text-sm text-green-600 font-medium mb-3">
                    Processamento concluído com sucesso!
                  </p>
                  <Button onClick={() => handleOpenChange(false)}>
                    Fechar
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!isCompleted && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {isRunning ? "Fechar (continua em segundo plano)" : "Cancelar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
