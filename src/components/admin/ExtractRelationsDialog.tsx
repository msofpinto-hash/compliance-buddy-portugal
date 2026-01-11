import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Link2,
  ArrowRight,
  Globe,
  Flag,
  Zap
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OriginFilter = "all" | "PT" | "EU";

interface RelationDetail {
  type: string;
  targetNumber: string;
  targetId?: string;
  matched: boolean;
}

interface RelationResult {
  legislationId: string;
  legislationNumber: string;
  relationsFound: number;
  relationsMatched: number;
  relationsCreated: number;
  relations: RelationDetail[];
  error?: string;
}

interface ExtractRelationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BackgroundJob {
  id: string;
  status: string;
  items_processed: number;
  items_added: number;
  items_updated: number;
  toProcess: number;
}

const relationTypeLabels: Record<string, { label: string; color: string }> = {
  revoga: { label: "Revoga", color: "bg-red-100 text-red-800" },
  revogado: { label: "Revoga", color: "bg-red-100 text-red-800" },
  revogacao_parcial: { label: "Revoga parcialmente", color: "bg-red-100/70 text-red-700" },
  altera: { label: "Altera", color: "bg-amber-100 text-amber-800" },
  alteracao: { label: "Altera", color: "bg-amber-100 text-amber-800" },
  alterado_por: { label: "Alterado por", color: "bg-orange-100 text-orange-800" },
  regulamenta: { label: "Regulamenta", color: "bg-blue-100 text-blue-800" },
  regulamentacao: { label: "Regulamenta", color: "bg-blue-100 text-blue-800" },
  regulamentado_por: { label: "Regulamentado por", color: "bg-cyan-100 text-cyan-800" },
  transpoe: { label: "Transpõe", color: "bg-purple-100 text-purple-800" },
  transposicao: { label: "Transpõe", color: "bg-purple-100 text-purple-800" },
  transposto_por: { label: "Transposto por", color: "bg-violet-100 text-violet-800" },
  complementa: { label: "Complementa", color: "bg-green-100 text-green-800" },
};

export function ExtractRelationsDialog({ open, onOpenChange }: ExtractRelationsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isExtracting, setIsExtracting] = useState(false);
  const [limit, setLimit] = useState(10);
  const [dryRun, setDryRun] = useState(true);
  const [useBackground, setUseBackground] = useState(true);
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [results, setResults] = useState<RelationResult[] | null>(null);
  const [stats, setStats] = useState<{
    processed: number;
    successful: number;
    failed: number;
    totalRelationsFound: number;
    totalRelationsMatched: number;
    totalRelationsCreated: number;
  } | null>(null);
  const [backgroundJob, setBackgroundJob] = useState<BackgroundJob | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for background job progress
  useEffect(() => {
    if (!backgroundJob || backgroundJob.status === 'completed') {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(async () => {
      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('id', backgroundJob.id)
        .single();

      if (error) {
        console.error('Error polling job status:', error);
        return;
      }

      if (data) {
        setBackgroundJob(prev => prev ? {
          ...prev,
          status: data.status,
          items_processed: data.items_processed || 0,
          items_added: data.items_added || 0,
          items_updated: data.items_updated || 0,
        } : null);

        if (data.status === 'completed') {
          setIsExtracting(false);
          toast({
            title: "Extração concluída em background",
            description: `${data.items_processed} diplomas processados, ${data.items_added} relações criadas`,
          });
          queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
          queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
        }
      }
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [backgroundJob, toast, queryClient]);

  // Cleanup on close
  useEffect(() => {
    if (!open && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [open]);

  const handleExtract = async () => {
    setIsExtracting(true);
    setResults(null);
    setStats(null);
    setBackgroundJob(null);

    try {
      const { data, error } = await supabase.functions.invoke("extract-legislation-relations", {
        body: { 
          limit, 
          dryRun,
          origin: originFilter === "all" ? undefined : originFilter,
          background: useBackground && !dryRun,
        },
      });

      if (error) throw error;

      if (data.background) {
        // Background mode started
        setBackgroundJob({
          id: data.jobId,
          status: 'running',
          items_processed: 0,
          items_added: 0,
          items_updated: 0,
          toProcess: data.toProcess,
        });
        
        toast({
          title: "Extração iniciada em background",
          description: data.message,
        });
        
        queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
        
      } else if (data.success) {
        setResults(data.results);
        setStats({
          processed: data.processed,
          successful: data.successful,
          failed: data.failed,
          totalRelationsFound: data.totalRelationsFound,
          totalRelationsMatched: data.totalRelationsMatched,
          totalRelationsCreated: data.totalRelationsCreated,
        });

        toast({
          title: dryRun ? "Simulação concluída" : "Extração de relações concluída",
          description: `${data.totalRelationsFound} relações encontradas, ${data.totalRelationsMatched} correspondidas, ${data.totalRelationsCreated} ${dryRun ? "a criar" : "criadas"}`,
        });

        if (!dryRun) {
          queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
        }
        
        setIsExtracting(false);
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Extract relations error:", error);
      toast({
        title: "Erro na extração de relações",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      setIsExtracting(false);
    }
  };

  const progressPercentage = backgroundJob 
    ? Math.round((backgroundJob.items_processed / backgroundJob.toProcess) * 100) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Extrair Relações entre Diplomas
          </DialogTitle>
          <DialogDescription>
            Analisa as páginas do DRE/EUR-Lex e identifica automaticamente relações como "revoga", "altera", "transpõe", etc.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Filtrar por origem</Label>
              <Select
                value={originFilter}
                onValueChange={(v) => setOriginFilter(v as OriginFilter)}
                disabled={isExtracting}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Todos
                    </span>
                  </SelectItem>
                  <SelectItem value="PT">
                    <span className="flex items-center gap-2">
                      <Flag className="h-4 w-4" />
                      🇵🇹 Portugal (DRE)
                    </span>
                  </SelectItem>
                  <SelectItem value="EU">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      🇪🇺 EUR-Lex
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="limit">Diplomas</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-20"
                disabled={isExtracting}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="dry-run-rel"
                checked={dryRun}
                onCheckedChange={setDryRun}
                disabled={isExtracting}
              />
              <Label htmlFor="dry-run-rel" className="cursor-pointer">
                Modo simulação
              </Label>
            </div>

            {!dryRun && (
              <div className="flex items-center gap-2">
                <Switch
                  id="background-mode"
                  checked={useBackground}
                  onCheckedChange={setUseBackground}
                  disabled={isExtracting}
                />
                <Label htmlFor="background-mode" className="cursor-pointer flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Background
                </Label>
              </div>
            )}

            <Button
              onClick={handleExtract}
              disabled={isExtracting}
              className="gap-2"
            >
              {isExtracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : useBackground && !dryRun ? (
                <Zap className="h-4 w-4" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {isExtracting 
                ? "A extrair..." 
                : dryRun 
                  ? "Simular" 
                  : useBackground 
                    ? `Extrair ${limit} em Background` 
                    : "Extrair Relações"}
            </Button>
          </div>

          {/* Background mode info */}
          {useBackground && !dryRun && !isExtracting && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
              <Zap className="h-4 w-4 flex-shrink-0" />
              <span>
                Modo background: pode processar muitos diplomas sem timeout. A extração continua mesmo se fechar este diálogo.
              </span>
            </div>
          )}

          {!dryRun && !useBackground && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <Link2 className="h-4 w-4 flex-shrink-0" />
              <span>
                As relações serão criadas na base de dados. Relações duplicadas são ignoradas automaticamente.
              </span>
            </div>
          )}

          {/* Background Job Progress */}
          {backgroundJob && (
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {backgroundJob.status === 'running' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  <span className="font-medium">
                    {backgroundJob.status === 'running' ? 'A processar em background...' : 'Concluído'}
                  </span>
                </div>
                <Badge variant={backgroundJob.status === 'completed' ? 'default' : 'secondary'}>
                  {backgroundJob.items_processed} / {backgroundJob.toProcess}
                </Badge>
              </div>
              
              <Progress value={progressPercentage} className="h-2" />
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Diplomas processados:</span>{' '}
                  <span className="font-medium">{backgroundJob.items_processed}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Relações criadas:</span>{' '}
                  <span className="font-medium text-green-600">{backgroundJob.items_added}</span>
                </div>
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
              <div className="text-center">
                <p className="text-2xl font-bold">{stats.totalRelationsFound}</p>
                <p className="text-sm text-muted-foreground">Relações encontradas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.totalRelationsMatched}</p>
                <p className="text-sm text-muted-foreground">Com match na BD</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.totalRelationsCreated}</p>
                <p className="text-sm text-muted-foreground">{dryRun ? "A criar" : "Criadas"}</p>
              </div>
            </div>
          )}

          {/* Results */}
          {results && results.length > 0 && (
            <ScrollArea className="flex-1 rounded border">
              <div className="p-4 space-y-4">
                {results.map((result, index) => (
                  <div 
                    key={index}
                    className="p-4 rounded-lg bg-background border"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {result.error ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                        <span className="font-medium">{result.legislationNumber}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.error ? (
                          <Badge variant="destructive">{result.error}</Badge>
                        ) : (
                          <>
                            <Badge variant="outline">{result.relationsFound} encontradas</Badge>
                            <Badge className="bg-green-100 text-green-800">{result.relationsMatched} matched</Badge>
                            {result.relationsCreated > 0 && (
                              <Badge className="bg-blue-100 text-blue-800">+{result.relationsCreated}</Badge>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    
                    {result.relations.length > 0 && (
                      <div className="space-y-2 pl-6 border-l-2 border-muted">
                        {result.relations.map((rel, relIdx) => (
                          <div 
                            key={relIdx} 
                            className="flex items-center gap-2 text-sm"
                          >
                            <Badge 
                              className={relationTypeLabels[rel.type]?.color || "bg-gray-100 text-gray-800"}
                              variant="secondary"
                            >
                              {relationTypeLabels[rel.type]?.label || rel.type}
                            </Badge>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className={rel.matched ? "text-foreground" : "text-muted-foreground"}>
                              {rel.targetNumber}
                            </span>
                            {rel.matched ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            ) : (
                              <span className="text-xs text-muted-foreground">(não encontrado na BD)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
