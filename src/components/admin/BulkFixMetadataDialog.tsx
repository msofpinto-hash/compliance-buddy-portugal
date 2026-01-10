import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Wrench, CheckCircle2, XCircle, AlertTriangle, Flag, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface BulkFixMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problemsCount: number;
}

interface FixResult {
  id: string;
  number: string;
  problems: string[];
  updated?: string[];
  wouldUpdate?: Record<string, any>;
  error?: string;
  message?: string;
}

export function BulkFixMetadataDialog({
  open,
  onOpenChange,
  problemsCount,
}: BulkFixMetadataDialogProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [fixType, setFixType] = useState<string>("all");
  const [limit, setLimit] = useState(50);
  const [dryRun, setDryRun] = useState(true);
  const [results, setResults] = useState<{
    total: number;
    fixed: number;
    failed: number;
    skipped: number;
    details: FixResult[];
  } | null>(null);

  const handleFix = async () => {
    setIsLoading(true);
    setResults(null);

    try {
      const response = await supabase.functions.invoke('fix-legislation-metadata', {
        body: { fixType, limit, dryRun }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      
      if (data.success) {
        setResults(data.results);
        toast.success(data.message);
        
        if (!dryRun) {
          queryClient.invalidateQueries({ queryKey: ["legislation"] });
        }
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (error: any) {
      console.error("Error fixing metadata:", error);
      toast.error("Erro ao corrigir metadados: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getProblemLabel = (problem: string) => {
    switch (problem) {
      case 'generic_title': return 'Título genérico';
      case 'missing_origin': return 'Origem em falta';
      case 'missing_url': return 'URL em falta';
      case 'missing_summary': return 'Resumo em falta';
      default: return problem;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Correção em Massa de Metadados
          </DialogTitle>
          <DialogDescription>
            Corrige automaticamente títulos, URLs e resumos usando dados oficiais do EUR-Lex e DRE.
            {problemsCount > 0 && (
              <span className="text-amber-600 font-medium ml-1">
                ({problemsCount} diplomas com problemas detectados)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Legislação</Label>
              <Select value={fixType} onValueChange={setFixType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda a legislação</SelectItem>
                  <SelectItem value="eurlex">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-600" />
                      Apenas EUR-Lex (UE)
                    </div>
                  </SelectItem>
                  <SelectItem value="dre">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-green-600" />
                      Apenas DRE (Portugal)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Limite de Itens</Label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                min={1}
                max={500}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="dry-run">Modo de Teste (Dry Run)</Label>
              <p className="text-xs text-muted-foreground">
                Simula a correção sem alterar dados. Recomendado para verificar antes de aplicar.
              </p>
            </div>
            <Switch
              id="dry-run"
              checked={dryRun}
              onCheckedChange={setDryRun}
            />
          </div>

          {!dryRun && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Atenção:</span>
              </div>
              <p className="mt-1">
                O modo de teste está desativado. As alterações serão aplicadas permanentemente à base de dados.
              </p>
            </div>
          )}

          {results && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline" className="gap-1">
                  Total: {results.total}
                </Badge>
                {!dryRun ? (
                  <>
                    <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Corrigidos: {results.fixed}
                    </Badge>
                    <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-700">
                      <XCircle className="h-3 w-3" />
                      Falharam: {results.failed}
                    </Badge>
                  </>
                ) : (
                  <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-700">
                    Simulados: {results.skipped}
                  </Badge>
                )}
              </div>

              <ScrollArea className="h-60 rounded-lg border">
                <div className="p-3 space-y-2">
                  {results.details.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex items-start justify-between text-xs rounded border p-2 bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-muted-foreground truncate">
                          {item.number}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.problems.map((p) => (
                            <Badge key={p} variant="secondary" className="text-[10px]">
                              {getProblemLabel(p)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {item.updated && (
                          <span className="text-green-600">
                            ✓ {item.updated.join(', ')}
                          </span>
                        )}
                        {item.wouldUpdate && (
                          <span className="text-blue-600">
                            → {Object.keys(item.wouldUpdate).join(', ')}
                          </span>
                        )}
                        {item.error && (
                          <span className="text-red-600">
                            ✗ {item.error}
                          </span>
                        )}
                        {item.message && (
                          <span className="text-muted-foreground">
                            {item.message}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handleFix} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dryRun ? "Simular Correção" : "Aplicar Correção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
