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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Globe, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Search, X, ChevronsUpDown } from "lucide-react";

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<FixResult[]>([]);
  const [summary, setSummary] = useState<{ updated: number; failed: number } | null>(null);
  const [selectedCelex, setSelectedCelex] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const successResults = results.filter(r => r.success);
  
  // Filter results based on search query
  const filteredResults = successResults.filter(r => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      r.celex.toLowerCase().includes(query) ||
      r.oldTitle.toLowerCase().includes(query) ||
      r.newTitle.toLowerCase().includes(query)
    );
  });

  const handleSimulate = async () => {
    setIsProcessing(true);
    setProgress(10);
    setResults([]);
    setSummary(null);
    setSelectedCelex(new Set());
    setExpandedItems(new Set());
    setAppliedCount(null);
    setSearchQuery("");

    try {
      setProgress(30);
      
      const { data, error } = await supabase.functions.invoke('fix-eurlex-titles', {
        body: { limit, dryRun: true }
      });

      setProgress(90);

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      const successItems = (data.results || []).filter((r: FixResult) => r.success);
      setResults(data.results || []);
      setSummary({ updated: data.updated, failed: data.failed });
      // Pre-select all successful items
      setSelectedCelex(new Set(successItems.map((r: FixResult) => r.celex)));
      setProgress(100);

      toast({
        title: "Simulação concluída",
        description: `${successItems.length} títulos podem ser corrigidos`,
      });
    } catch (error) {
      console.error("Error simulating EUR-Lex titles:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao simular correções",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplySelected = async () => {
    if (selectedCelex.size === 0) {
      toast({
        title: "Nenhum item selecionado",
        description: "Selecione pelo menos um diploma para aplicar a correção",
        variant: "destructive",
      });
      return;
    }

    setIsApplying(true);

    try {
      // Filter results to only selected ones and apply them
      const toApply = successResults.filter(r => selectedCelex.has(r.celex));
      
      let applied = 0;
      for (const item of toApply) {
        // Find legislation by external_id (celex)
        const { data: legData } = await supabase
          .from('legislation')
          .select('id')
          .eq('external_id', item.celex)
          .single();

        if (legData) {
          const { error } = await supabase
            .from('legislation')
            .update({ title: item.newTitle, updated_at: new Date().toISOString() })
            .eq('id', legData.id);

          if (!error) {
            applied++;
          }
        }
      }

      setAppliedCount(applied);
      
      toast({
        title: "Correções aplicadas",
        description: `${applied} de ${toApply.length} títulos corrigidos com sucesso`,
      });

      if (applied > 0) {
        queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
        queryClient.invalidateQueries({ queryKey: ["legislation"] });
      }
    } catch (error) {
      console.error("Error applying EUR-Lex titles:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao aplicar correções",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing && !isApplying) {
      setResults([]);
      setSummary(null);
      setProgress(0);
      setSelectedCelex(new Set());
      setExpandedItems(new Set());
      setAppliedCount(null);
      setSearchQuery("");
      onOpenChange(false);
    }
  };

  const toggleSelection = (celex: string) => {
    setSelectedCelex(prev => {
      const newSet = new Set(prev);
      if (newSet.has(celex)) {
        newSet.delete(celex);
      } else {
        newSet.add(celex);
      }
      return newSet;
    });
  };

  const toggleExpanded = (celex: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(celex)) {
        newSet.delete(celex);
      } else {
        newSet.add(celex);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    // Select all filtered results (visible ones)
    setSelectedCelex(prev => {
      const newSet = new Set(prev);
      filteredResults.forEach(r => newSet.add(r.celex));
      return newSet;
    });
  };

  const deselectAll = () => {
    // Deselect all filtered results (visible ones)
    setSelectedCelex(prev => {
      const newSet = new Set(prev);
      filteredResults.forEach(r => newSet.delete(r.celex));
      return newSet;
    });
  };

  const selectAllVisible = filteredResults.every(r => selectedCelex.has(r.celex));
  
  const allExpanded = filteredResults.length > 0 && filteredResults.every(r => expandedItems.has(r.celex));

  const expandAll = () => {
    setExpandedItems(new Set(filteredResults.map(r => r.celex)));
  };

  const collapseAll = () => {
    setExpandedItems(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
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

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Configuration - only show if no results yet */}
          {results.length === 0 && (
            <div className="space-y-2">
              <Label htmlFor="limit">Limite de diplomas a analisar</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={200}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                disabled={isProcessing}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Máximo de diplomas a processar (1-200)
              </p>
            </div>
          )}

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
                <span className="font-medium">{summary.updated} podem ser corrigidos</span>
              </div>
              {summary.failed > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <span className="font-medium">{summary.failed} sem alteração</span>
                </div>
              )}
              {appliedCount !== null && (
                <div className="flex items-center gap-2 ml-auto">
                  <Badge variant="default" className="bg-green-600">
                    {appliedCount} aplicados
                  </Badge>
                </div>
              )}
            </div>
          )}

          {/* Results with selection */}
          {successResults.length > 0 && (
            <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
              {/* Search and selection controls */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por CELEX ou título..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9"
                    disabled={isApplying}
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
                    <>Resultados: {filteredResults.length} de {successResults.length}</>
                  ) : (
                    <>Resultados ({successResults.length})</>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedCelex.size} selecionados
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={allExpanded ? collapseAll : expandAll} 
                    disabled={isApplying || filteredResults.length === 0}
                    title={allExpanded ? "Colapsar todos" : "Expandir todos"}
                  >
                    <ChevronsUpDown className="h-4 w-4 mr-1" />
                    {allExpanded ? "Colapsar" : "Expandir"}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={selectAllVisible ? deselectAll : selectAll} 
                    disabled={isApplying || filteredResults.length === 0}
                  >
                    {selectAllVisible ? "Desmarcar visíveis" : "Marcar visíveis"}
                  </Button>
                </div>
              </div>
              
              <ScrollArea className="flex-1 border rounded-lg">
                <div className="p-2 space-y-1">
                  {filteredResults.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhum resultado encontrado para "{searchQuery}"</p>
                    </div>
                  ) : (
                    filteredResults.map((result) => {
                      const isExpanded = expandedItems.has(result.celex);
                      const isSelected = selectedCelex.has(result.celex);
                      
                      return (
                        <Collapsible
                          key={result.celex}
                          open={isExpanded}
                          onOpenChange={() => toggleExpanded(result.celex)}
                        >
                          <div className={`rounded-lg border transition-colors ${
                            isSelected 
                              ? 'bg-green-500/10 border-green-500/30' 
                              : 'bg-muted/50 border-transparent'
                          }`}>
                            <div className="flex items-start gap-2 p-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelection(result.celex)}
                                disabled={isApplying}
                                className="mt-1"
                              />
                              
                              <CollapsibleTrigger asChild>
                                <button className="flex-1 text-left hover:bg-accent/50 rounded p-1 -m-1 transition-colors">
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <code className="text-xs font-mono text-muted-foreground">
                                          {result.celex}
                                        </code>
                                      </div>
                                      <div className="text-sm text-green-700 dark:text-green-400 truncate">
                                        {result.newTitle}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              </CollapsibleTrigger>
                            </div>
                            
                            <CollapsibleContent>
                              <div className="px-9 pb-3 space-y-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Título atual:</Label>
                                  <p className="text-sm line-through text-muted-foreground">
                                    {result.oldTitle}
                                  </p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Novo título:</Label>
                                  <p className="text-sm text-green-700 dark:text-green-400">
                                    {result.newTitle}
                                  </p>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={handleClose} disabled={isProcessing || isApplying}>
              {appliedCount !== null ? "Fechar" : "Cancelar"}
            </Button>
            
            {results.length === 0 ? (
              <Button onClick={handleSimulate} disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    A processar...
                  </>
                ) : (
                  "Simular"
                )}
              </Button>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setResults([]);
                    setSummary(null);
                    setAppliedCount(null);
                    setSearchQuery("");
                  }}
                  disabled={isApplying}
                >
                  Nova Simulação
                </Button>
                <Button 
                  onClick={handleApplySelected} 
                  disabled={isApplying || selectedCelex.size === 0 || appliedCount !== null}
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      A aplicar...
                    </>
                  ) : (
                    `Aplicar ${selectedCelex.size} Selecionados`
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
