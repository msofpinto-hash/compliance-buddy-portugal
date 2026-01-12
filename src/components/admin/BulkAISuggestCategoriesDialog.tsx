import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Check, AlertCircle, ChevronDown, ChevronRight, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SuggestedCategory {
  id: string;
  name: string;
  theme: string;
}

interface LegislationItem {
  id: string;
  number: string;
  title: string;
  summary?: string | null;
  categories?: Array<{ id: string }>;
}

interface LegislationSuggestion {
  legislation: LegislationItem;
  suggestions: SuggestedCategory[];
  selectedIds: Set<string>;
  status: "pending" | "loading" | "done" | "error";
  error?: string;
}

interface BulkAISuggestCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legislationList: LegislationItem[];
}

export function BulkAISuggestCategoriesDialog({
  open,
  onOpenChange,
  legislationList,
}: BulkAISuggestCategoriesDialogProps) {
  const [items, setItems] = useState<LegislationSuggestion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAssigning, setIsAssigning] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const initializeItems = () => {
    setItems(legislationList.map(leg => ({
      legislation: leg,
      suggestions: [],
      selectedIds: new Set(),
      status: "pending",
    })));
    setCurrentIndex(0);
    setIsPaused(false);
  };

  const fetchSuggestionsForItem = async (index: number): Promise<boolean> => {
    const item = items[index];
    if (!item) return false;

    setItems(prev => prev.map((it, i) => 
      i === index ? { ...it, status: "loading" } : it
    ));

    try {
      const existingCategoryIds = item.legislation.categories?.map(c => c.id) || [];
      
      const { data, error: funcError } = await supabase.functions.invoke("suggest-categories", {
        body: {
          legislationId: item.legislation.id,
          title: item.legislation.title,
          summary: item.legislation.summary,
          number: item.legislation.number,
        },
      });

      if (funcError) throw funcError;

      if (data.error) {
        setItems(prev => prev.map((it, i) => 
          i === index ? { ...it, status: "error", error: data.error } : it
        ));
        return false;
      }

      // Filter out already assigned categories
      const newSuggestions = (data.suggestions || []).filter(
        (s: SuggestedCategory) => !existingCategoryIds.includes(s.id)
      );

      setItems(prev => prev.map((it, i) => 
        i === index ? { 
          ...it, 
          status: "done", 
          suggestions: newSuggestions,
          selectedIds: new Set(newSuggestions.map((s: SuggestedCategory) => s.id))
        } : it
      ));

      // Auto-expand if has suggestions
      if (newSuggestions.length > 0) {
        setExpandedItems(prev => new Set([...prev, item.legislation.id]));
      }

      return true;
    } catch (e) {
      console.error("Error fetching suggestions:", e);
      setItems(prev => prev.map((it, i) => 
        i === index ? { ...it, status: "error", error: "Erro ao obter sugestões" } : it
      ));
      return false;
    }
  };

  const processAll = async () => {
    setIsProcessing(true);
    setIsPaused(false);

    for (let i = currentIndex; i < items.length; i++) {
      // Check if paused
      if (isPaused) {
        setCurrentIndex(i);
        setIsProcessing(false);
        return;
      }

      await fetchSuggestionsForItem(i);
      setCurrentIndex(i + 1);

      // Small delay to avoid rate limiting
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsProcessing(false);
  };

  const handlePauseResume = () => {
    if (isPaused) {
      setIsPaused(false);
      processAll();
    } else {
      setIsPaused(true);
    }
  };

  const handleStart = () => {
    initializeItems();
    setTimeout(() => processAll(), 100);
  };

  const toggleCategory = (legislationId: string, categoryId: string) => {
    setItems(prev => prev.map(item => {
      if (item.legislation.id !== legislationId) return item;
      const newSelected = new Set(item.selectedIds);
      if (newSelected.has(categoryId)) {
        newSelected.delete(categoryId);
      } else {
        newSelected.add(categoryId);
      }
      return { ...item, selectedIds: newSelected };
    }));
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getTotalSelectedCount = () => {
    return items.reduce((acc, item) => acc + item.selectedIds.size, 0);
  };

  const getItemsWithSuggestions = () => {
    return items.filter(item => item.suggestions.length > 0);
  };

  const handleAssignAll = async () => {
    const itemsToAssign = items.filter(item => item.selectedIds.size > 0);
    if (itemsToAssign.length === 0) return;

    setIsAssigning(true);
    let successCount = 0;
    let errorCount = 0;

    for (const item of itemsToAssign) {
      try {
        const mappings = Array.from(item.selectedIds).map(categoryId => ({
          legislation_id: item.legislation.id,
          category_id: categoryId,
        }));

        const { error: insertError } = await supabase
          .from("legislation_category_mapping")
          .insert(mappings);

        if (insertError) throw insertError;
        successCount++;
      } catch (e) {
        console.error("Error assigning categories:", e);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Categorias atribuídas a ${successCount} diploma(s)`);
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
    }
    if (errorCount > 0) {
      toast.error(`Erro ao atribuir categorias a ${errorCount} diploma(s)`);
    }

    setIsAssigning(false);
    onOpenChange(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setItems([]);
      setCurrentIndex(0);
      setIsProcessing(false);
      setIsPaused(false);
      setExpandedItems(new Set());
    }
    onOpenChange(open);
  };

  const progress = items.length > 0 ? (currentIndex / items.length) * 100 : 0;
  const doneCount = items.filter(it => it.status === "done").length;
  const errorCount = items.filter(it => it.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Sugestões de Categorias em Lote (IA)
          </DialogTitle>
          <DialogDescription>
            Processar {legislationList.length} diploma(s) selecionado(s)
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col py-4">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                A IA irá analisar cada diploma e sugerir categorias relevantes.
                <br />
                <span className="text-amber-600 font-medium">Apenas subcategorias (sem filhos) serão sugeridas.</span>
              </p>
              <Button onClick={handleStart} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Iniciar Processamento
              </Button>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Progresso: {currentIndex} / {items.length}
                  </span>
                  <div className="flex items-center gap-2">
                    {doneCount > 0 && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        {doneCount} concluído(s)
                      </Badge>
                    )}
                    {errorCount > 0 && (
                      <Badge variant="destructive">
                        {errorCount} erro(s)
                      </Badge>
                    )}
                  </div>
                </div>
                <Progress value={progress} className="h-2" />
                
                {isProcessing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePauseResume}
                    className="w-full gap-2"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-4 w-4" />
                        Retomar
                      </>
                    ) : (
                      <>
                        <Pause className="h-4 w-4" />
                        Pausar
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Results list */}
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-4">
                  {items.map((item, index) => (
                    <Collapsible
                      key={item.legislation.id}
                      open={expandedItems.has(item.legislation.id)}
                      onOpenChange={() => toggleExpanded(item.legislation.id)}
                    >
                      <div className="border rounded-lg overflow-hidden">
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center gap-3 p-3 bg-card hover:bg-accent/50 cursor-pointer transition-colors">
                            {expandedItems.has(item.legislation.id) ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="shrink-0 text-xs">
                                  {item.legislation.number}
                                </Badge>
                                <span className="text-sm truncate">
                                  {item.legislation.title.substring(0, 60)}
                                  {item.legislation.title.length > 60 ? "..." : ""}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.status === "pending" && (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Pendente
                                </Badge>
                              )}
                              {item.status === "loading" && (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              )}
                              {item.status === "done" && item.suggestions.length > 0 && (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                  {item.selectedIds.size}/{item.suggestions.length}
                                </Badge>
                              )}
                              {item.status === "done" && item.suggestions.length === 0 && (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Sem sugestões
                                </Badge>
                              )}
                              {item.status === "error" && (
                                <Badge variant="destructive">Erro</Badge>
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="px-3 pb-3 border-t bg-muted/30">
                            {item.status === "error" && (
                              <p className="text-sm text-destructive py-2">{item.error}</p>
                            )}
                            {item.status === "done" && item.suggestions.length === 0 && (
                              <p className="text-sm text-muted-foreground py-2">
                                Nenhuma nova categoria sugerida.
                              </p>
                            )}
                            {item.suggestions.length > 0 && (
                              <div className="space-y-2 pt-3">
                                {item.suggestions.map((cat, idx) => (
                                  <div
                                    key={cat.id}
                                    className="flex items-center gap-3 p-2 rounded bg-card"
                                  >
                                    <Checkbox
                                      id={`${item.legislation.id}-${cat.id}`}
                                      checked={item.selectedIds.has(cat.id)}
                                      onCheckedChange={() => toggleCategory(item.legislation.id, cat.id)}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          #{idx + 1}
                                        </Badge>
                                        <span className="text-sm font-medium truncate">{cat.name}</span>
                                      </div>
                                      <span className="text-xs text-muted-foreground">{cat.theme}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          {items.length > 0 && !isProcessing && getTotalSelectedCount() > 0 && (
            <Button
              onClick={handleAssignAll}
              disabled={isAssigning}
              className="gap-2"
            >
              {isAssigning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Atribuir Todas ({getTotalSelectedCount()})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
