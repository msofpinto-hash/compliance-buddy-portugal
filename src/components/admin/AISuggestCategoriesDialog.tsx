import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Check, AlertCircle, X, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface SuggestedCategory {
  id: string;
  name: string;
  theme: string;
}

interface ExistingCategory {
  id: string;
  name: string;
  theme_name: string;
  full_path?: string;
}

interface AISuggestCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legislation: {
    id: string;
    number: string;
    title: string;
    summary?: string | null;
  } | null;
  existingCategories?: ExistingCategory[];
}

export function AISuggestCategoriesDialog({
  open,
  onOpenChange,
  legislation,
  existingCategories = [],
}: AISuggestCategoriesDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedCategory[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [selectedToRemove, setSelectedToRemove] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const queryClient = useQueryClient();

  // Reset selectedToRemove when existingCategories change
  useEffect(() => {
    setSelectedToRemove(new Set());
  }, [existingCategories]);

  const fetchSuggestions = async () => {
    if (!legislation) return;

    setIsLoading(true);
    setError(null);
    setSuggestions([]);
    setSelectedToAdd(new Set());

    try {
      const { data, error: funcError } = await supabase.functions.invoke("suggest-categories", {
        body: {
          legislationId: legislation.id,
          title: legislation.title,
          summary: legislation.summary,
          number: legislation.number,
        },
      });

      if (funcError) throw funcError;

      if (data.error) {
        setError(data.error);
        return;
      }

      // Filter out already assigned categories
      const existingIds = existingCategories.map(c => c.id);
      const newSuggestions = (data.suggestions || []).filter(
        (s: SuggestedCategory) => !existingIds.includes(s.id)
      );

      setSuggestions(newSuggestions);
      // Pre-select all suggestions
      setSelectedToAdd(new Set(newSuggestions.map((s: SuggestedCategory) => s.id)));
      setHasFetched(true);

      if (newSuggestions.length === 0 && data.suggestions?.length > 0) {
        toast.info("Todas as categorias sugeridas já estão atribuídas");
      }
    } catch (e) {
      console.error("Error fetching suggestions:", e);
      setError("Erro ao obter sugestões. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAdd = (id: string) => {
    const newSelected = new Set(selectedToAdd);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedToAdd(newSelected);
  };

  const handleToggleRemove = (id: string) => {
    const newSelected = new Set(selectedToRemove);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedToRemove(newSelected);
  };

  const handleRequestApply = () => {
    // If there are categories to remove, show confirmation first
    if (selectedToRemove.size > 0) {
      setShowConfirmRemove(true);
    } else {
      handleApplyChanges();
    }
  };

  const handleApplyChanges = async () => {
    if (!legislation) return;
    if (selectedToAdd.size === 0 && selectedToRemove.size === 0) return;

    setShowConfirmRemove(false);
    setIsAssigning(true);
    try {
      // Remove selected categories
      if (selectedToRemove.size > 0) {
        const { error: deleteError } = await supabase
          .from("legislation_category_mapping")
          .delete()
          .eq("legislation_id", legislation.id)
          .in("category_id", Array.from(selectedToRemove));

        if (deleteError) throw deleteError;
      }

      // Add selected categories
      if (selectedToAdd.size > 0) {
        const mappings = Array.from(selectedToAdd).map(categoryId => ({
          legislation_id: legislation.id,
          category_id: categoryId,
        }));

        const { error: insertError } = await supabase
          .from("legislation_category_mapping")
          .insert(mappings);

        if (insertError) throw insertError;
      }

      const actions = [];
      if (selectedToRemove.size > 0) actions.push(`${selectedToRemove.size} removida(s)`);
      if (selectedToAdd.size > 0) actions.push(`${selectedToAdd.size} adicionada(s)`);
      
      toast.success(`Categorias atualizadas: ${actions.join(", ")}`);
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      onOpenChange(false);
    } catch (e) {
      console.error("Error updating categories:", e);
      toast.error("Erro ao atualizar categorias");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setSuggestions([]);
      setSelectedToAdd(new Set());
      setSelectedToRemove(new Set());
      setError(null);
      setHasFetched(false);
    }
    onOpenChange(open);
  };

  const hasChanges = selectedToAdd.size > 0 || selectedToRemove.size > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Gerir Categorias (IA)
          </DialogTitle>
          <DialogDescription>
            {legislation?.number} - {legislation?.title?.substring(0, 80)}
            {(legislation?.title?.length || 0) > 80 ? "..." : ""}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 max-h-[calc(85vh-180px)] -mx-6 px-6">
          <div className="py-4 space-y-4">
            {/* Existing Categories Section */}
            {existingCategories.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    Categorias Atuais
                    <Badge variant="secondary">{existingCategories.length}</Badge>
                  </h4>
                  <div className="flex items-center gap-2">
                    {selectedToRemove.size > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <Trash2 className="h-3 w-3" />
                        {selectedToRemove.size} para remover
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (selectedToRemove.size === existingCategories.length) {
                          setSelectedToRemove(new Set());
                        } else {
                          setSelectedToRemove(new Set(existingCategories.map(c => c.id)));
                        }
                      }}
                    >
                      {selectedToRemove.size === existingCategories.length ? "Desmarcar todas" : "Selecionar todas"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {existingCategories.map((cat) => (
                    <div
                      key={cat.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        selectedToRemove.has(cat.id) 
                          ? "bg-destructive/10 border-destructive/30" 
                          : "bg-card hover:bg-accent/50"
                      }`}
                    >
                      <Checkbox
                        id={`remove-${cat.id}`}
                        checked={selectedToRemove.has(cat.id)}
                        onCheckedChange={() => handleToggleRemove(cat.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium text-sm ${selectedToRemove.has(cat.id) ? "line-through text-muted-foreground" : ""}`}>
                          {cat.full_path || cat.name}
                        </span>
                        <div className="text-xs text-muted-foreground">{cat.theme_name}</div>
                      </div>
                      {selectedToRemove.has(cat.id) && (
                        <X className="h-4 w-4 text-destructive shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecione as categorias que pretende remover
                </p>
              </div>
            )}

            {existingCategories.length > 0 && (hasFetched || !isLoading) && (
              <Separator />
            )}

            {/* AI Suggestions Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Sugestões da IA
              </h4>

              {!hasFetched && !isLoading && (
                <div className="text-center py-6 bg-muted/30 rounded-lg">
                  <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">
                    A IA irá analisar o título e sumário para sugerir categorias.
                  </p>
                  <Button onClick={fetchSuggestions} size="sm" className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Obter Sugestões
                  </Button>
                </div>
              )}

              {isLoading && (
                <div className="text-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">A analisar legislação...</p>
                </div>
              )}

              {error && (
                <div className="text-center py-6">
                  <AlertCircle className="h-6 w-6 mx-auto text-destructive mb-2" />
                  <p className="text-sm text-destructive mb-3">{error}</p>
                  <Button variant="outline" size="sm" onClick={fetchSuggestions}>
                    Tentar novamente
                  </Button>
                </div>
              )}

              {hasFetched && !isLoading && !error && suggestions.length === 0 && (
                <div className="text-center py-6 bg-muted/30 rounded-lg">
                  <Check className="h-6 w-6 mx-auto text-green-600 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Não foram encontradas novas categorias para sugerir.
                  </p>
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-xs text-muted-foreground">
                      Selecione as categorias para adicionar
                    </p>
                    <div className="flex items-center gap-2">
                      {selectedToAdd.size > 0 && (
                        <Badge className="bg-green-100 text-green-700 gap-1">
                          <Check className="h-3 w-3" />
                          {selectedToAdd.size} para adicionar
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          if (selectedToAdd.size === suggestions.length) {
                            setSelectedToAdd(new Set());
                          } else {
                            setSelectedToAdd(new Set(suggestions.map(s => s.id)));
                          }
                        }}
                      >
                        {selectedToAdd.size === suggestions.length ? "Desmarcar todas" : "Selecionar todas"}
                      </Button>
                    </div>
                  </div>
                  {suggestions.map((cat, index) => (
                    <div
                      key={cat.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        selectedToAdd.has(cat.id) 
                          ? "bg-green-50 border-green-200" 
                          : "bg-card hover:bg-accent/50"
                      }`}
                    >
                      <Checkbox
                        id={`add-${cat.id}`}
                        checked={selectedToAdd.has(cat.id)}
                        onCheckedChange={() => handleToggleAdd(cat.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs shrink-0">
                            #{index + 1}
                          </Badge>
                          <span className="font-medium text-sm truncate">{cat.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{cat.theme}</span>
                      </div>
                      {selectedToAdd.has(cat.id) && (
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          {hasChanges && (
            <Button
              onClick={handleRequestApply}
              disabled={isAssigning}
              className="gap-2"
            >
              {isAssigning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Aplicar Alterações
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Confirmation Dialog for Removing Categories */}
      <AlertDialog open={showConfirmRemove} onOpenChange={setShowConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Confirmar Remoção de Categorias
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Tem a certeza que pretende remover {selectedToRemove.size} categoria(s) deste diploma?
                </p>
                <div className="max-h-40 overflow-y-auto border rounded-lg p-2 bg-muted/50">
                  <ul className="space-y-2 text-sm">
                    {existingCategories
                      .filter(c => selectedToRemove.has(c.id))
                      .map(cat => (
                        <li key={cat.id} className="flex items-start gap-2">
                          <X className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                          <span className="break-words">{cat.full_path || cat.name}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                {selectedToAdd.size > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Serão também adicionadas {selectedToAdd.size} nova(s) categoria(s).
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApplyChanges}
              className="bg-destructive hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Confirmar Remoção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
