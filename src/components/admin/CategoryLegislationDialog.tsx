import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Search, FileText, X, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ThemeCategory } from "@/hooks/useThemes";
import { cn } from "@/lib/utils";

interface CategoryLegislationDialogProps {
  category: ThemeCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LegislationItem {
  id: string;
  number: string;
  title: string;
  isAssigned: boolean;
}

export function CategoryLegislationDialog({ category, open, onOpenChange }: CategoryLegislationDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialIds, setInitialIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all legislation with their assignment status for this category
  const { data: legislation, isLoading } = useQuery({
    queryKey: ["category-legislation", category?.id],
    queryFn: async () => {
      if (!category) return [];

      // Get all legislation (paginated)
      const allLegislation: { id: string; number: string; title: string }[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from("legislation")
          .select("id, number, title")
          .order("number")
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allLegislation.push(...data);
        if (data.length < pageSize) break;
        page++;
      }

      // Get assigned legislation for this category
      const { data: mappings, error: mappingsError } = await supabase
        .from("legislation_category_mapping")
        .select("legislation_id")
        .eq("category_id", category.id);

      if (mappingsError) throw mappingsError;

      const assignedIds = new Set(mappings?.map(m => m.legislation_id) || []);
      
      // Initialize selected with currently assigned
      setSelectedIds(new Set(assignedIds));
      setInitialIds(new Set(assignedIds));

      return allLegislation.map(leg => ({
        ...leg,
        isAssigned: assignedIds.has(leg.id),
      }));
    },
    enabled: open && !!category,
  });

  // Filter legislation based on search
  const filteredLegislation = useMemo(() => {
    if (!legislation) return [];
    if (!searchTerm.trim()) return legislation;
    
    const term = searchTerm.toLowerCase();
    return legislation.filter(
      leg =>
        leg.number.toLowerCase().includes(term) ||
        leg.title.toLowerCase().includes(term)
    );
  }, [legislation, searchTerm]);

  // Count changes
  const addedCount = [...selectedIds].filter(id => !initialIds.has(id)).length;
  const removedCount = [...initialIds].filter(id => !selectedIds.has(id)).length;
  const hasChanges = addedCount > 0 || removedCount > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!category) return;

      // Get IDs to add and remove
      const toAdd = [...selectedIds].filter(id => !initialIds.has(id));
      const toRemove = [...initialIds].filter(id => !selectedIds.has(id));

      // Remove unselected mappings
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from("legislation_category_mapping")
          .delete()
          .eq("category_id", category.id)
          .in("legislation_id", toRemove);

        if (deleteError) throw deleteError;
      }

      // Add new mappings
      if (toAdd.length > 0) {
        const mappings = toAdd.map(legislationId => ({
          legislation_id: legislationId,
          category_id: category.id,
        }));

        const { error: insertError } = await supabase
          .from("legislation_category_mapping")
          .insert(mappings);

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-legislation"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation-counts"] });
      toast({
        title: "Diplomas atualizados",
        description: `${addedCount} adicionado(s), ${removedCount} removido(s)`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar",
        variant: "destructive",
      });
    },
  });

  const toggleLegislation = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      filteredLegislation.forEach(leg => next.add(leg.id));
      return next;
    });
  };

  const deselectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      filteredLegislation.forEach(leg => next.delete(leg.id));
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Diplomas da Categoria
          </DialogTitle>
          <DialogDescription>
            Associe diplomas à categoria "{category?.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 space-y-4">
          {/* Search and bulk actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por número ou título..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={selectAllFiltered}>
              Selecionar Todos
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAllFiltered}>
              Limpar
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary">{selectedIds.size} selecionados</Badge>
            {hasChanges && (
              <>
                {addedCount > 0 && (
                  <Badge variant="default" className="bg-green-600">+{addedCount} novos</Badge>
                )}
                {removedCount > 0 && (
                  <Badge variant="destructive">-{removedCount} removidos</Badge>
                )}
              </>
            )}
            <span className="ml-auto">
              {filteredLegislation.length} de {legislation?.length || 0} diplomas
            </span>
          </div>

          {/* Legislation list */}
          <ScrollArea className="flex-1 border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLegislation.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchTerm ? "Nenhum diploma encontrado" : "Nenhum diploma disponível"}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredLegislation.map((leg) => {
                  const isSelected = selectedIds.has(leg.id);
                  const wasOriginallyAssigned = initialIds.has(leg.id);
                  const isNew = isSelected && !wasOriginallyAssigned;
                  const isRemoved = !isSelected && wasOriginallyAssigned;

                  return (
                    <div
                      key={leg.id}
                      className={cn(
                        "flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-all border",
                        isSelected
                          ? "bg-primary/10 border-primary/40"
                          : "hover:bg-accent/50 border-transparent",
                        isNew && "ring-2 ring-green-500/30",
                        isRemoved && "ring-2 ring-red-500/30 opacity-60"
                      )}
                      onClick={() => toggleLegislation(leg.id)}
                    >
                      <div className={cn(
                        "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                        isSelected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{leg.number}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{leg.title}</p>
                      </div>
                      {isNew && (
                        <Badge variant="outline" className="text-green-600 border-green-600 shrink-0">Novo</Badge>
                      )}
                      {isRemoved && (
                        <Badge variant="outline" className="text-red-600 border-red-600 shrink-0">Remover</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Guardar Alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
