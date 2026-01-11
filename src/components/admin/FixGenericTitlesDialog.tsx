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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Search,
  X
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
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Filter items based on search query
  const filteredItems = items.filter(item => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.number.toLowerCase().includes(query) ||
      item.updates?.title?.toLowerCase().includes(query) ||
      item.updates?.summary?.toLowerCase().includes(query) ||
      item.error?.toLowerCase().includes(query)
    );
  });

  const successItems = filteredItems.filter(i => i.success);
  const failedItems = filteredItems.filter(i => !i.success);
  const allExpanded = filteredItems.length > 0 && filteredItems.every(item => expandedItems.has(item.id));

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedItems(new Set(filteredItems.map(item => item.id)));
  };

  const collapseAll = () => {
    setExpandedItems(new Set());
  };

  const handleStart = async () => {
    setIsRunning(true);
    setItems([]);
    setSummary(null);
    setProgress({ current: 0, total: 0 });
    setExpandedItems(new Set());
    setSearchQuery("");

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
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Corrigir Títulos Genéricos (PT)
          </DialogTitle>
          <DialogDescription>
            Pesquisa e extrai títulos descritivos do DRE para diplomas com títulos genéricos
            {genericTitlesCount > 0 && (
              <Badge variant="outline" className="ml-2">
                ~{genericTitlesCount} com títulos genéricos
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Configuration */}
          {items.length === 0 && (
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
          )}

          {!dryRun && !isRunning && items.length === 0 && (
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

          {/* Search and controls */}
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por número ou título..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9"
                    disabled={isRunning}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <Label>
                  {searchQuery ? (
                    <>Resultados: {filteredItems.length} de {items.length}</>
                  ) : (
                    <>Resultados ({items.length})</>
                  )}
                </Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={allExpanded ? collapseAll : expandAll} 
                  disabled={isRunning || filteredItems.length === 0}
                  title={allExpanded ? "Colapsar todos" : "Expandir todos"}
                >
                  <ChevronsUpDown className="h-4 w-4 mr-1" />
                  {allExpanded ? "Colapsar" : "Expandir"}
                </Button>
              </div>
            </div>
          )}

          {/* Results List */}
          {items.length > 0 && (
            <ScrollArea className="flex-1 border rounded-lg min-h-0">
              <div className="p-2 space-y-1">
                {filteredItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum resultado encontrado para "{searchQuery}"</p>
                  </div>
                ) : (
                  filteredItems.map((item, index) => {
                    const isExpanded = expandedItems.has(item.id);
                    
                    return (
                      <Collapsible
                        key={`${item.id}-${index}`}
                        open={isExpanded}
                        onOpenChange={() => toggleExpanded(item.id)}
                      >
                        <div className={`rounded-lg border transition-colors ${
                          item.success 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-red-500/10 border-red-500/30'
                        }`}>
                          <CollapsibleTrigger asChild>
                            <button className="w-full flex items-start gap-2 p-2 text-left hover:bg-accent/50 rounded-lg transition-colors">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              )}
                              
                              {item.success ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                              )}
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{item.number}</span>
                                  {isExpanded && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                      Detalhes
                                    </Badge>
                                  )}
                                </div>
                                {item.success && item.updates?.title && (
                                  <div className="text-xs text-green-600 truncate">
                                    → {item.updates.title}
                                  </div>
                                )}
                                {!item.success && item.error && !isExpanded && (
                                  <div className="text-xs text-red-600 truncate">
                                    {item.error}
                                  </div>
                                )}
                              </div>
                              
                              <Badge variant={item.success ? "default" : "destructive"} className="flex-shrink-0">
                                {item.success ? "OK" : "Erro"}
                              </Badge>
                            </button>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="px-10 pb-3 space-y-2">
                              {item.success && item.updates && (
                                <>
                                  {item.updates.title && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Novo título:</Label>
                                      <p className="text-sm text-green-700 dark:text-green-400">
                                        {item.updates.title}
                                      </p>
                                    </div>
                                  )}
                                  {item.updates.summary && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Sumário:</Label>
                                      <p className="text-sm text-muted-foreground">
                                        {item.updates.summary}
                                      </p>
                                    </div>
                                  )}
                                  {item.updates.entity && (
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Emissor:</Label>
                                      <p className="text-sm text-muted-foreground">
                                        {item.updates.entity}
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}
                              {!item.success && item.error && (
                                <div>
                                  <Label className="text-xs text-muted-foreground">Erro:</Label>
                                  <p className="text-sm text-red-600">
                                    {item.error}
                                  </p>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })
                )}
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
