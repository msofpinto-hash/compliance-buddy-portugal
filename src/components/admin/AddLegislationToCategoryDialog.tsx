import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

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

  // Search legislation by number, title AND summary
  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ["search-legislation-for-category", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const term = searchTerm.replace(/[%,]/g, " ").trim();
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, summary, origin, publication_date")
        .is("revocation_date", null)
        .or(`number.ilike.%${term}%,title.ilike.%${term}%,summary.ilike.%${term}%`)
        .order("publication_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: searchTerm.length >= 2 && isOpen,
  });

  const isAssigned = (id: string) => assignedIds.includes(id);
  const selectable = searchResults.filter((l: any) => !isAssigned(l.id));

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectable.every((l: any) => selected.has(l.id)) && selectable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((l: any) => l.id)));
    }
  };

  const handleAddSelected = async () => {
    const ids = Array.from(selected).filter(id => !isAssigned(id));
    if (ids.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("legislation_category_mapping")
        .insert(ids.map(id => ({ legislation_id: id, category_id: categoryId })));
      if (error) throw error;
      toast.success(`${ids.length} diploma(s) adicionado(s) a ${categoryName}`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["category-assigned-legislation", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation-counts-manual"] });
      onAdded?.();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) { setSelected(new Set()); setSearchTerm(""); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-3 w-3 mr-1" />
          Adicionar Diploma
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Adicionar a: {categoryName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar palavra no número, título ou sumário..."
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
              <p className="text-xs mt-1">Tenta outra palavra</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {searchResults.length} resultado(s) · {selected.size} selecionado(s)
                </span>
                <Button variant="ghost" size="sm" onClick={toggleAll} disabled={selectable.length === 0}>
                  {selectable.length > 0 && selectable.every((l: any) => selected.has(l.id))
                    ? "Limpar seleção"
                    : "Selecionar todos"}
                </Button>
              </div>

              <ScrollArea className="flex-1 min-h-0 h-[340px]">
                <div className="space-y-1 pr-4">
                  {searchResults.map((leg: any) => {
                    const assigned = isAssigned(leg.id);
                    return (
                      <div
                        key={leg.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          assigned ? "bg-muted/50 opacity-60" : "hover:bg-muted cursor-pointer"
                        }`}
                        onClick={() => !assigned && toggle(leg.id)}
                      >
                        <Checkbox
                          checked={assigned || selected.has(leg.id)}
                          disabled={assigned}
                          onCheckedChange={() => !assigned && toggle(leg.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-medium">{leg.number}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {leg.origin || "PT"}
                            </Badge>
                            {leg.publication_date && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(leg.publication_date).getFullYear()}
                              </span>
                            )}
                            {assigned && (
                              <Badge variant="secondary" className="text-[10px]">Já nesta categoria</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                            {leg.title}
                          </p>
                          {leg.summary && leg.summary !== leg.title && (
                            <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1 italic">
                              {leg.summary}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="outline" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
                  Limpar
                </Button>
                <Button onClick={handleAddSelected} disabled={selected.size === 0 || saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Adicionar {selected.size > 0 ? `(${selected.size})` : ""}
                </Button>
              </div>
            </>
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
