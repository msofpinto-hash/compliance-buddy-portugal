import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface SuggestedCategory {
  id: string;
  name: string;
  theme: string;
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
  existingCategoryIds?: string[];
}

export function AISuggestCategoriesDialog({
  open,
  onOpenChange,
  legislation,
  existingCategoryIds = [],
}: AISuggestCategoriesDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedCategory[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const queryClient = useQueryClient();

  const fetchSuggestions = async () => {
    if (!legislation) return;

    setIsLoading(true);
    setError(null);
    setSuggestions([]);
    setSelectedIds(new Set());

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
      const newSuggestions = (data.suggestions || []).filter(
        (s: SuggestedCategory) => !existingCategoryIds.includes(s.id)
      );

      setSuggestions(newSuggestions);
      // Pre-select all suggestions
      setSelectedIds(new Set(newSuggestions.map((s: SuggestedCategory) => s.id)));
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

  const handleToggleCategory = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleAssign = async () => {
    if (!legislation || selectedIds.size === 0) return;

    setIsAssigning(true);
    try {
      const mappings = Array.from(selectedIds).map(categoryId => ({
        legislation_id: legislation.id,
        category_id: categoryId,
      }));

      const { error: insertError } = await supabase
        .from("legislation_category_mapping")
        .insert(mappings);

      if (insertError) throw insertError;

      toast.success(`${selectedIds.size} categoria(s) atribuída(s) com sucesso`);
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      onOpenChange(false);
    } catch (e) {
      console.error("Error assigning categories:", e);
      toast.error("Erro ao atribuir categorias");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setSuggestions([]);
      setSelectedIds(new Set());
      setError(null);
      setHasFetched(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Sugestões de Categorias (IA)
          </DialogTitle>
          <DialogDescription>
            {legislation?.number} - {legislation?.title?.substring(0, 80)}
            {(legislation?.title?.length || 0) > 80 ? "..." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!hasFetched && !isLoading && (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                A IA irá analisar o título e sumário para sugerir categorias relevantes.
              </p>
              <Button onClick={fetchSuggestions} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Obter Sugestões
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
              <p className="text-sm text-muted-foreground">A analisar legislação...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-4" />
              <p className="text-sm text-destructive mb-4">{error}</p>
              <Button variant="outline" onClick={fetchSuggestions}>
                Tentar novamente
              </Button>
            </div>
          )}

          {hasFetched && !isLoading && !error && suggestions.length === 0 && (
            <div className="text-center py-8">
              <Check className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Não foram encontradas novas categorias para sugerir.
              </p>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Selecione as categorias que pretende atribuir:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {suggestions.map((cat, index) => (
                  <div
                    key={cat.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      id={cat.id}
                      checked={selectedIds.has(cat.id)}
                      onCheckedChange={() => handleToggleCategory(cat.id)}
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          {suggestions.length > 0 && (
            <Button
              onClick={handleAssign}
              disabled={selectedIds.size === 0 || isAssigning}
              className="gap-2"
            >
              {isAssigning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Atribuir ({selectedIds.size})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
