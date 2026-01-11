import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Globe, CheckCircle2, AlertCircle } from "lucide-react";

interface FixEurlexTitlesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genericTitlesCount: number;
}

interface FixResult {
  celex: string;
  oldTitle: string;
  newTitle: string;
  success: boolean;
}

export function FixEurlexTitlesDialog({
  open,
  onOpenChange,
  genericTitlesCount,
}: FixEurlexTitlesDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [limit, setLimit] = useState(50);
  const [dryRun, setDryRun] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<FixResult[]>([]);
  const [summary, setSummary] = useState<{ updated: number; failed: number } | null>(null);

  const handleFix = async () => {
    setIsProcessing(true);
    setProgress(10);
    setResults([]);
    setSummary(null);

    try {
      setProgress(30);
      
      const { data, error } = await supabase.functions.invoke('fix-eurlex-titles', {
        body: { limit, dryRun }
      });

      setProgress(90);

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      setResults(data.results || []);
      setSummary({ updated: data.updated, failed: data.failed });
      setProgress(100);

      toast({
        title: dryRun ? "Simulação concluída" : "Correção concluída",
        description: data.message,
      });

      if (!dryRun && data.updated > 0) {
        queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
        queryClient.invalidateQueries({ queryKey: ["legislation"] });
      }
    } catch (error) {
      console.error("Error fixing EUR-Lex titles:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao corrigir títulos",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      setResults([]);
      setSummary(null);
      setProgress(0);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            Corrigir Títulos EU (EUR-Lex)
          </DialogTitle>
          <DialogDescription>
            Usa a API SPARQL do EUR-Lex para obter títulos corretos dos diplomas europeus.
            {genericTitlesCount > 0 && (
              <Badge variant="outline" className="ml-2">
                ~{genericTitlesCount} com títulos genéricos
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="limit">Limite de diplomas</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={200}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground">
                Máximo de diplomas a processar
              </p>
            </div>

            <div className="space-y-2">
              <Label>Modo de execução</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="dryRun"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                  disabled={isProcessing}
                />
                <Label htmlFor="dryRun" className="cursor-pointer">
                  Apenas simular
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {dryRun ? "Não faz alterações" : "Aplica as correções"}
              </p>
            </div>
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">A processar via SPARQL API...</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium">{summary.updated} corrigidos</span>
              </div>
              {summary.failed > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <span className="font-medium">{summary.failed} sem alteração</span>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2">
              <Label>Resultados ({results.length})</Label>
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                <div className="space-y-2">
                  {results.map((result, idx) => (
                    <div key={idx} className="text-xs p-2 rounded bg-green-500/10">
                      <div className="font-mono text-muted-foreground">{result.celex}</div>
                      <div className="line-through text-muted-foreground truncate">
                        {result.oldTitle}
                      </div>
                      <div className="text-green-700 dark:text-green-400 truncate">
                        {result.newTitle}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
              {summary ? "Fechar" : "Cancelar"}
            </Button>
            <Button onClick={handleFix} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A processar...
                </>
              ) : (
                dryRun ? "Simular" : "Iniciar Correção"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
