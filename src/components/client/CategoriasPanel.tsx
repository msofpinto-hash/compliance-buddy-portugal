import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  MoveRight,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = { id: string; name: string };
type Category = { id: string; theme_id: string; parent_id: string | null; name: string };
type Mapping = { legislation_id: string; category_id: string };
type Diploma = { id: string; number: string | null; title: string; origin: string | null; summary?: string | null };

type PendingMove = { ids: string[]; sourceId: string | null; targetId: string };
type PendingRemove = { ids: string[]; categoryId: string };

async function fetchAll<T>(
  table: "theme_categories" | "legislation_category_mapping",
  columns: string,
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + size - 1);
    if (error) throw error;
    const rows = (data || []) as unknown as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

export function CategoriasPanel() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragCount, setDragCount] = useState(0);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: themes } = useQuery({
    queryKey: ["cat-themes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("themes").select("id,name").order("name");
      if (error) throw error;
      return data as Theme[];
    },
  });

  const { data: categories, isLoading: loadingCats } = useQuery({
    queryKey: ["cat-categories"],
    queryFn: () => fetchAll<Category>("theme_categories", "id,theme_id,parent_id,name"),
  });

  const { data: mappings, isLoading: loadingMaps } = useQuery({
    queryKey: ["cat-mappings"],
    queryFn: () => fetchAll<Mapping>("legislation_category_mapping", "legislation_id,category_id"),
  });

  const { data: diplomas, isLoading: loadingDiplomas } = useQuery({
    queryKey: ["cat-diplomas", activeCategoryId, mappings?.length],
    enabled: !!activeCategoryId && !!mappings,
    queryFn: async () => {
      const ids = (mappings || [])
        .filter((m) => m.category_id === activeCategoryId)
        .map((m) => m.legislation_id);
      if (ids.length === 0) return [] as Diploma[];
      const out: Diploma[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("legislation")
          .select("id,number,title,origin,summary")
          .in("id", ids.slice(i, i + 200));
        if (error) throw error;
        out.push(...((data || []) as Diploma[]));
      }
      return out.sort((a, b) => (a.number || "").localeCompare(b.number || "", "pt"));
    },
  });

  const childrenOf = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories || []) {
      const key = c.parent_id || `theme:${c.theme_id}`;
      const list = map.get(key) || [];
      list.push(c);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "pt"));
    return map;
  }, [categories]);

  const directCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of mappings || []) map.set(m.category_id, (map.get(m.category_id) || 0) + 1);
    return map;
  }, [mappings]);

  const totalCount = useMemo(() => {
    const memo = new Map<string, number>();
    const walk = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!;
      let total = directCount.get(id) || 0;
      for (const child of childrenOf.get(id) || []) total += walk(child.id);
      memo.set(id, total);
      return total;
    };
    for (const c of categories || []) walk(c.id);
    return memo;
  }, [categories, childrenOf, directCount]);

  const themeTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of themes || []) {
      let total = 0;
      for (const c of childrenOf.get(`theme:${t.id}`) || []) total += totalCount.get(c.id) || 0;
      map.set(t.id, total);
    }
    return map;
  }, [themes, childrenOf, totalCount]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories || []) map.set(c.id, c);
    return map;
  }, [categories]);

  const themeNameOf = (categoryId: string) => {
    const cat = categoryById.get(categoryId);
    return themes?.find((t) => t.id === cat?.theme_id)?.name || "";
  };

  const pathOf = (categoryId: string) => {
    const parts: string[] = [];
    let cur = categoryById.get(categoryId);
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? categoryById.get(cur.parent_id) : undefined;
    }
    return `${themeNameOf(categoryId)} › ${parts.join(" › ")}`;
  };

  const filteredDiplomas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return diplomas || [];
    return (diplomas || []).filter(
      (d) =>
        (d.number || "").toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        (d.summary || "").toLowerCase().includes(q),
    );
  }, [diplomas, search]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["cat-mappings"] });
    await queryClient.invalidateQueries({ queryKey: ["cat-categories"] });
    await queryClient.invalidateQueries({ queryKey: ["cat-diplomas"] });
  };

  const doMove = async ({ ids, sourceId, targetId }: PendingMove) => {
    setBusy(true);
    try {
      const existing = new Set(
        (mappings || [])
          .filter((m) => m.category_id === targetId && ids.includes(m.legislation_id))
          .map((m) => m.legislation_id),
      );
      const toInsert = ids.filter((id) => !existing.has(id));
      if (toInsert.length > 0) {
        const { error } = await supabase
          .from("legislation_category_mapping")
          .insert(toInsert.map((legislation_id) => ({ legislation_id, category_id: targetId })));
        if (error) throw error;
      }
      if (sourceId && sourceId !== targetId) {
        const { error } = await supabase
          .from("legislation_category_mapping")
          .delete()
          .eq("category_id", sourceId)
          .in("legislation_id", ids);
        if (error) throw error;
      }
      toast.success(`${ids.length} diploma(s) movido(s) para ${pathOf(targetId)}`);
      setSelected(new Set());
      await refresh();
    } catch (e) {
      toast.error(`Não foi possível mover: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setPendingMove(null);
    }
  };

  const doRemove = async ({ ids, categoryId }: PendingRemove) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("legislation_category_mapping")
        .delete()
        .eq("category_id", categoryId)
        .in("legislation_id", ids);
      if (error) throw error;
      toast.success(`${ids.length} diploma(s) retirado(s) do descritor`);
      setSelected(new Set());
      await refresh();
    } catch (e) {
      toast.error(`Não foi possível retirar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setPendingRemove(null);
    }
  };

  const doDeleteCategory = async (category: Category) => {
    setBusy(true);
    try {
      const kids = childrenOf.get(category.id) || [];
      if (kids.length > 0) {
        toast.error("Elimine primeiro os subdescritores.");
        return;
      }
      await supabase.from("legislation_category_mapping").delete().eq("category_id", category.id);
      const { error } = await supabase.from("theme_categories").delete().eq("id", category.id);
      if (error) throw error;
      toast.success(`Descritor "${category.name}" eliminado (diplomas mantidos na biblioteca)`);
      if (activeCategoryId === category.id) setActiveCategoryId(null);
      await refresh();
    } catch (e) {
      toast.error(`Não foi possível eliminar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setCategoryToDelete(null);
    }
  };

  const startDrag = (e: React.DragEvent, diplomaId: string) => {
    const ids = selected.has(diplomaId) ? Array.from(selected) : [diplomaId];
    if (!selected.has(diplomaId)) setSelected(new Set(ids));
    setDragCount(ids.length);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(ids));
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    setDragCount(0);
    let ids: string[] = [];
    try {
      ids = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      ids = [];
    }
    if (!Array.isArray(ids) || ids.length === 0) return;
    if (targetId === activeCategoryId) return;
    setPendingMove({ ids, sourceId: activeCategoryId, targetId });
  };

  const renderNode = (category: Category, depth: number) => {
    const kids = childrenOf.get(category.id) || [];
    const isOpen = expanded.has(category.id);
    const isActive = activeCategoryId === category.id;
    const isDragOver = dragOverId === category.id;
    return (
      <div key={category.id}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId(category.id);
          }}
          onDragLeave={() => setDragOverId((cur) => (cur === category.id ? null : cur))}
          onDrop={(e) => handleDrop(e, category.id)}
          className={cn(
            "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors",
            isActive && "bg-primary/10 font-medium",
            isDragOver && "ring-2 ring-primary bg-primary/15",
            !isActive && !isDragOver && "hover:bg-muted",
          )}
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleExpanded(category.id)}
              className="shrink-0 text-muted-foreground"
              aria-label={isOpen ? "Fechar" : "Abrir"}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => {
              setActiveCategoryId(category.id);
              setSelected(new Set());
            }}
            className="flex-1 truncate text-left"
            title={category.name}
          >
            {category.name}
          </button>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {totalCount.get(category.id) || 0}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            onClick={() => setCategoryToDelete(category)}
            aria-label={`Eliminar descritor ${category.name}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
        {isOpen && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  const loading = loadingCats || loadingMaps;

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Número de diplomas por tema e descritor. Arraste os diplomas selecionados para outro
        descritor ou tema — é sempre pedida confirmação.
      </p>

      <div className="grid w-full min-w-0 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Temas e descritores</CardTitle>
            <CardDescription>Largue aqui os diplomas para os mover</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[70vh] px-3 pb-3">
              {loading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full" />
                  ))}
                </div>
              ) : (
                (themes || []).map((theme) => {
                  const roots = childrenOf.get(`theme:${theme.id}`) || [];
                  const isOpen = expanded.has(`theme:${theme.id}`);
                  return (
                    <div key={theme.id} className="mb-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(`theme:${theme.id}`)}
                        className="flex w-full items-center gap-1 rounded-md bg-muted/60 px-2 py-2 text-left text-sm font-semibold hover:bg-muted"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="flex-1 truncate">{theme.name}</span>
                        <Badge className="tabular-nums">{themeTotals.get(theme.id) || 0}</Badge>
                      </button>
                      {isOpen && <div className="mt-1">{roots.map((c) => renderNode(c, 1))}</div>}
                    </div>
                  );
                })
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base leading-snug [overflow-wrap:anywhere]">
              {activeCategoryId ? pathOf(activeCategoryId) : "Selecione um descritor"}
            </CardTitle>

            <CardDescription>
              {activeCategoryId
                ? `${filteredDiplomas.length} diploma(s) neste descritor`
                : "Escolha um descritor à esquerda para ver e mover os diplomas."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeCategoryId && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Procurar palavra no número, título ou sumário…"
                      className="pl-8"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelected(
                        selected.size === filteredDiplomas.length
                          ? new Set()
                          : new Set(filteredDiplomas.map((d) => d.id)),
                      )
                    }
                  >
                    {selected.size === filteredDiplomas.length && filteredDiplomas.length > 0
                      ? "Limpar seleção"
                      : "Selecionar todos"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={selected.size === 0}
                    onClick={() =>
                      setPendingRemove({
                        ids: Array.from(selected),
                        categoryId: activeCategoryId,
                      })
                    }
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Retirar do descritor
                  </Button>
                </div>

                {selected.size > 0 && (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                    <MoveRight className="h-4 w-4 text-primary" />
                    {selected.size} selecionado(s) — arraste para o descritor de destino à
                    esquerda.
                  </div>
                )}

                <ScrollArea className="h-[58vh] pr-2">
                  {loadingDiplomas ? (
                    <div className="space-y-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : filteredDiplomas.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Sem diplomas neste descritor.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {filteredDiplomas.map((d) => (
                        <li
                          key={d.id}
                          draggable
                          onDragStart={(e) => startDrag(e, d.id)}
                          onDragEnd={() => {
                            setDragOverId(null);
                            setDragCount(0);
                          }}
                          className={cn(
                            "flex cursor-grab items-start gap-2 rounded-md border p-2.5 text-sm active:cursor-grabbing",
                            selected.has(d.id) ? "border-primary bg-primary/5" : "bg-card",
                          )}
                        >
                          <Checkbox
                            checked={selected.has(d.id)}
                            onCheckedChange={() => toggleSelected(d.id)}
                            className="mt-0.5"
                            aria-label={`Selecionar ${d.number || d.title}`}
                          />
                          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{d.number || "—"}</span>
                              {d.origin && (
                                <Badge variant="outline" className="text-[10px]">
                                  {d.origin}
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-muted-foreground">{d.title}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!pendingMove} onOpenChange={(o) => !o && setPendingMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar mudança de descritor</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove && (
                <>
                  Mover <strong>{pendingMove.ids.length}</strong> diploma(s)
                  {pendingMove.sourceId ? ` de "${pathOf(pendingMove.sourceId)}"` : ""} para{" "}
                  <strong>{pathOf(pendingMove.targetId)}</strong>?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (pendingMove) doMove(pendingMove);
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingRemove} onOpenChange={(o) => !o && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar do descritor</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove &&
                `Retirar ${pendingRemove.ids.length} diploma(s) de "${pathOf(
                  pendingRemove.categoryId,
                )}"? Os diplomas continuam na biblioteca.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (pendingRemove) doRemove(pendingRemove);
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retirar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!categoryToDelete} onOpenChange={(o) => !o && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar descritor</AlertDialogTitle>
            <AlertDialogDescription>
              {categoryToDelete &&
                `Eliminar "${categoryToDelete.name}" (${
                  totalCount.get(categoryToDelete.id) || 0
                } diploma(s) associados)? Os diplomas mantêm-se na biblioteca.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (categoryToDelete) doDeleteCategory(categoryToDelete);
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dragCount > 0 && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          A arrastar {dragCount} diploma(s)…
        </div>
      )}
    </>
  );
}
