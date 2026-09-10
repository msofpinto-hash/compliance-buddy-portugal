import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legislationId: string | null;
  legislationLabel?: string;
  onChanged?: () => void;
}

type CategoryOption = {
  id: string;
  name: string;
  themeName: string;
};

export function DiplomaCategoriesDialog({
  open,
  onOpenChange,
  legislationId,
  legislationLabel,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const { data: options } = useQuery({
    queryKey: ["all-theme-categories"],
    enabled: open,
    queryFn: async (): Promise<CategoryOption[]> => {
      const { data, error } = await supabase
        .from("theme_categories")
        .select("id, name, themes(name)")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        themeName: c.themes?.name ?? "Sem tema",
      }));
    },
  });

  const { data: current, refetch } = useQuery({
    queryKey: ["diploma-categories", legislationId],
    enabled: open && !!legislationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select("id, category_id, theme_categories(name, themes(name))")
        .eq("legislation_id", legislationId!);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        mappingId: m.id,
        categoryId: m.category_id as string,
        name: m.theme_categories?.name ?? "—",
        themeName: m.theme_categories?.themes?.name ?? "Sem tema",
      }));
    },
  });

  const assigned = useMemo(() => new Set((current ?? []).map((c) => c.categoryId)), [current]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (options ?? []).filter((o) => !assigned.has(o.id));
    if (!term) return list.slice(0, 40);
    return list
      .filter((o) => `${o.themeName} ${o.name}`.toLowerCase().includes(term))
      .slice(0, 40);
  }, [options, assigned, search]);

  const invalidate = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["diplomas-overview"] });
    onChanged?.();
  };

  const addCategory = async (categoryId: string) => {
    if (!legislationId) return;
    setSaving(categoryId);
    const { error } = await supabase
      .from("legislation_category_mapping")
      .insert({ legislation_id: legislationId, category_id: categoryId });
    setSaving(null);
    if (error) {
      toast.error("Não foi possível associar", { description: error.message });
      return;
    }
    toast.success("Categoria associada");
    invalidate();
  };

  const removeCategory = async (mappingId: string) => {
    setSaving(mappingId);
    const { error } = await supabase
      .from("legislation_category_mapping")
      .delete()
      .eq("id", mappingId);
    setSaving(null);
    if (error) {
      toast.error("Não foi possível remover", { description: error.message });
      return;
    }
    toast.success("Categoria removida");
    invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Categorizações</DialogTitle>
          <DialogDescription className="line-clamp-2">{legislationLabel}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <div>
            <p className="mb-2 text-sm font-medium">Descritores atuais</p>
            {current && current.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {current.map((c) => (
                  <Badge key={c.mappingId} variant="secondary" className="gap-1 py-1">
                    <span className="text-muted-foreground">{c.themeName} ·</span> {c.name}
                    <button
                      type="button"
                      aria-label={`Remover ${c.name}`}
                      className="ml-1 rounded-sm hover:text-destructive"
                      disabled={saving === c.mappingId}
                      onClick={() => removeCategory(c.mappingId)}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem descritores atribuídos.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Adicionar descritor</p>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar descritor ou tema..."
              aria-label="Pesquisar descritor"
            />
            <ul className="mt-2 divide-y rounded-md border">
              {filtered.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">Sem resultados.</li>
              )}
              {filtered.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 p-2">
                  <span className="min-w-0 text-sm">
                    <span className="text-muted-foreground">{o.themeName} · </span>
                    {o.name}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving === o.id}
                    onClick={() => addCategory(o.id)}
                  >
                    {saving === o.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="h-3 w-3" aria-hidden="true" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
