import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Plus, Loader2, X, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  categoryId: string;
  categoryName: string;
  onAdded?: () => void;
}

export function AddLegislationToCategoryDialog({ categoryId, categoryName, onAdded }: Props) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  // Fetch already assigned legislation IDs
  const { data: assignedIds = [] } = useQuery({
    queryKey: ["category-assigned-legislation", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select("legislation_id")
        .eq("category_id", categoryId);
      if (error) throw error;
      return data.map(d => d.legislation_id);
    },
    enabled: isOpen,
  });

  // Search legislation
  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ["search-legislation-for-category", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, origin, publication_date")
        .is("revocation_date", null)
        .or(`number.ilike.%${searchTerm}%,title.ilike.%${searchTerm}%`)
        .order("publication_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: searchTerm.length >= 2 && isOpen,
  });

  const handleAdd = async (legislationId: string) => {
    if (assignedIds.includes(legislationId)) {
      toast.info("Este diploma já está nesta categoria");
      return;
    }

    setAddingIds(prev => new Set(prev).add(legislationId));
    try {
      const { error } = await supabase
        .from("legislation_category_mapping")
        .insert({ legislation_id: legislationId, category_id: categoryId });

      if (error) throw error;
      toast.success("Diploma adicionado à categoria");
      queryClient.invalidateQueries({ queryKey: ["category-assigned-legislation", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation-counts-manual"] });
      onAdded?.();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setAddingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(legislationId);
        return newSet;
      });
    }
  };

  const isAssigned = (id: string) => assignedIds.includes(id);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-3 w-3 mr-1" />
          Adicionar Diploma
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Adicionar a: {categoryName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por número ou título..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              autoFocus
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {searching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum diploma encontrado</p>
              <p className="text-xs mt-1">Tenta outro termo de pesquisa</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <ScrollArea className="h-[350px]">
              <div className="space-y-1 pr-4">
                {searchResults.map((leg: any) => {
                  const assigned = isAssigned(leg.id);
                  const adding = addingIds.has(leg.id);
                  
                  return (
                    <div
                      key={leg.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        assigned 
                          ? "bg-muted/50 opacity-60" 
                          : "hover:bg-muted cursor-pointer"
                      }`}
                      onClick={() => !assigned && !adding && handleAdd(leg.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{leg.number}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {leg.origin || "PT"}
                          </Badge>
                          {leg.publication_date && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(leg.publication_date).getFullYear()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                          {leg.title}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {assigned ? (
                          <Badge variant="secondary" className="text-xs">
                            ✓ Adicionado
                          </Badge>
                        ) : adding ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {searchTerm.length < 2 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Escreve pelo menos 2 caracteres para pesquisar</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
