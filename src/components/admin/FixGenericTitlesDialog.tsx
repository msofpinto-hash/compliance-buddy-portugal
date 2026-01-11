import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText,
  Play,
  Square
} from "lucide-react";

interface ProgressItem {
  id: string;
  number: string;
  success: boolean;
  updates?: {
    title?: string;
    summary?: string;
    entity?: string;
  };
  error?: string;
}

interface FixGenericTitlesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genericTitlesCount: number;
}

export function FixGenericTitlesDialog({ open, onOpenChange, genericTitlesCount }: FixGenericTitlesDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [limit, setLimit] = useState(20);
  const [dryRun, setDryRun] = useState(true);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [summary, setSummary] = useState<{ fixed: number; failed: number; processed: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStart = async () => {
    setIsRunning(true);
    setItems([]);
    setSummary(null);
    setProgress({ current: 0, total: 0 });

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fix-generic-titles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ limit, dryRun, stream: true }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok || !response.body) {
        throw new Error("Failed to start stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "start") {
              setProgress({ current: 0, total: event.total });
            } else if (event.type === "progress") {
              setProgress({ current: event.current, total: event.total });
              if (event.item) {
                setItems(prev => [...prev, event.item]);
              }
            } else if (event.type === "complete") {
              setSummary(event.summary);
              if (!dryRun) {
                queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
              }
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          } catch (e) {
            console.error("Failed to parse SSE event:", e);
          }
        }
      }

      toast({
        title: "Processo concluído",
        description: `${summary?.fixed || items.filter(i => i.success).length} títulos ${dryRun ? "seriam corrigidos" : "corrigidos"}.`,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        toast({
          title: "Processo cancelado",
          description: "A correção foi interrompida pelo utilizador.",
        });
      } else {
        console.error("Error:", error);
        toast({
          title: "Erro",
          description: error instanceof Error ? error.message : "Erro ao corrigir títulos",
          variant: "destructive",
        });
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleClose = () => {
    if (isRunning) {
      handleStop();
    }
    onOpenChange(false);
  };

  const progressPercentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const successCount = items.filter(i => i.success).length;
  const failedCount = items.filter(i => !i.success).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Corrigir Títulos Genéricos
          </DialogTitle>
          <DialogDescription>
            Pesquisa e extrai títulos descritivos do DRE para diplomas com títulos genéricos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Limite</Label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 20)}
                min={1}
                max={100}
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground">
                {genericTitlesCount} títulos genéricos detectados
              </p>
            </div>

            <div className="space-y-2">
              <Label>Modo</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch
                  id="dryRun"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                  disabled={isRunning}
                />
                <Label htmlFor="dryRun" className="text-sm">
                  {dryRun ? "Apenas simular" : "Aplicar correções"}
                </Label>
              </div>
            </div>
          </div>

          {!dryRun && !isRunning && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                As alterações serão aplicadas diretamente na base de dados.
              </AlertDescription>
            </Alert>
          )}

          {/* Progress */}
          {(isRunning || items.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Progresso: {progress.current} / {progress.total}
                </span>
                <span className="font-medium">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
              
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded bg-muted text-center">
                  <div className="text-lg font-bold">{progress.current}</div>
                  <div className="text-xs text-muted-foreground">Processados</div>
                </div>
                <div className="p-2 rounded bg-green-500/10 text-center">
                  <div className="text-lg font-bold text-green-600">{successCount}</div>
                  <div className="text-xs text-muted-foreground">Corrigidos</div>
                </div>
                <div className="p-2 rounded bg-red-500/10 text-center">
                  <div className="text-lg font-bold text-red-600">{failedCount}</div>
                  <div className="text-xs text-muted-foreground">Falhados</div>
                </div>
              </div>
            </div>
          )}

          {/* Results List */}
          {items.length > 0 && (
            <ScrollArea className="h-[300px] border rounded-lg">
              <div className="p-2 space-y-1">
                {items.map((item, index) => (
                  <div
                    key={`${item.id}-${index}`}
                    className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 text-sm"
                  >
                    {item.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{item.number}</div>
                      {item.success && item.updates?.title && (
                        <div className="text-xs text-green-600 truncate">
                          → {item.updates.title}
                        </div>
                      )}
                      {!item.success && item.error && (
                        <div className="text-xs text-red-600">
                          {item.error}
                        </div>
                      )}
                    </div>
                    <Badge variant={item.success ? "default" : "destructive"} className="flex-shrink-0">
                      {item.success ? "OK" : "Erro"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Summary */}
          {summary && !isRunning && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Processo concluído: {summary.fixed} {dryRun ? "seriam corrigidos" : "corrigidos"}, {summary.failed} falharam de {summary.processed} processados.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {isRunning ? "Cancelar" : "Fechar"}
          </Button>
          {!isRunning ? (
            <Button onClick={handleStart} disabled={genericTitlesCount === 0}>
              <Play className="h-4 w-4 mr-2" />
              {dryRun ? "Simular" : "Iniciar Correção"}
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4 mr-2" />
              Parar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
