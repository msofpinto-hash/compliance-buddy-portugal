import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  FolderTree,
  Loader2,
  MoveRight,
  Trash2,
  Check,
  ArrowLeftRight,
} from "lucide-react";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { IDTopNav } from "@/components/client/IDTopNav";

type Category = {
  id: string;
  theme_id: string;
  parent_id: string | null;
  name: string;
};

type Diploma = {
  id: string;
  number: string | null;
  title: string;
  origin: string | null;
  category_id: string;
};

const APPLICABILITY_OPTIONS = [
  { value: "aplicavel_direto", label: "Aplicável (direto)" },
  { value: "aplicavel_indireto", label: "Aplicável (indireto)" },
  { value: "informativo", label: "Informativo" },
  { value: "nao_aplicavel", label: "Não aplicável" },
];

export default function GestaoTemas() {
  const queryClient = useQueryClient();
  const [themeId, setThemeId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [applicability, setApplicability] = useState("aplicavel_direto");
  const [checkedCategories, setCheckedCategories] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [selectedDiplomas, setSelectedDiplomas] = useState<Set<string>>(new Set());
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [categoryToMove, setCategoryToMove] = useState<Category | null>(null);
  const [moveThemeId, setMoveThemeId] = useState<string>("");


  const { data: themes } = useQuery({
    queryKey: ["gt-themes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("themes").select("id,name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: organizations } = useQuery({
    queryKey: ["gt-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id,name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: categories, isLoading: loadingCats } = useQuery({
    queryKey: ["gt-categories", themeId],
    enabled: !!themeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_categories")
        .select("id,theme_id,parent_id,name")
        .eq("theme_id", themeId!)
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  // All diplomas mapped to the categories of this theme
  const { data: diplomas } = useQuery({
    queryKey: ["gt-diplomas", themeId, categories?.length],
    enabled: !!categories && categories.length > 0,
    queryFn: async () => {
      const ids = categories!.map((c) => c.id);
      const chunks: Diploma[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from("legislation_category_mapping")
          .select("category_id, legislation:legislation_id (id, number, title, origin)")
          .in("category_id", ids.slice(i, i + 100));
        if (error) throw error;
        for (const row of data as unknown as {
          category_id: string;
          legislation: { id: string; number: string | null; title: string; origin: string | null } | null;
        }[]) {
          if (row.legislation) chunks.push({ ...row.legislation, category_id: row.category_id });
        }
      }
      return chunks;
    },
  });

  const byCategory = useMemo(() => {
    const map = new Map<string, Diploma[]>();
    for (const d of diplomas || []) {
      const list = map.get(d.category_id) || [];
      list.push(d);
      map.set(d.category_id, list);
    }
    return map;
  }, [diplomas]);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    for (const c of categories || []) {
      const list = map.get(c.parent_id) || [];
      list.push(c);
      map.set(c.parent_id, list);
    }
    return map;
  }, [categories]);

  const descendantIds = (id: string): string[] => {
    const out = [id];
    for (const child of childrenOf.get(id) || []) out.push(...descendantIds(child.id));
    return out;
  };

  const countDeep = (id: string) =>
    descendantIds(id).reduce((sum, cid) => sum + (byCategory.get(cid)?.length || 0), 0);

  const toggleCategoryCheck = (cat: Category, checked: boolean) => {
    setCheckedCategories((prev) => {
      const next = new Set(prev);
      for (const id of descendantIds(cat.id)) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const checkAll = (checked: boolean) => {
    setCheckedCategories(checked ? new Set((categories || []).map((c) => c.id)) : new Set());
  };

  const activeDiplomas = useMemo(() => {
    if (!activeCategoryId) return [];
    const ids = descendantIds(activeCategoryId);
    const list = ids.flatMap((id) => byCategory.get(id) || []);
    const term = search.trim().toLowerCase();
    return term
      ? list.filter((d) => `${d.number || ""} ${d.title}`.toLowerCase().includes(term))
      : list;
  }, [activeCategoryId, byCategory, search, childrenOf]);

  /** Assign every diploma inside the checked descriptors to the organization */
  const applyToOrg = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Selecione um cliente");
      const catIds = Array.from(checkedCategories);
      const legIds = Array.from(
        new Set(catIds.flatMap((id) => (byCategory.get(id) || []).map((d) => d.id)))
      );
      if (legIds.length === 0) throw new Error("Nenhum diploma nos descritores selecionados");

      for (let i = 0; i < legIds.length; i += 200) {
        const rows = legIds.slice(i, i + 200).map((legislation_id) => ({
          organization_id: orgId,
          legislation_id,
          applicability_type: applicability,
        }));
        const { error } = await supabase
          .from("organization_legislation")
          .upsert(rows, { onConflict: "organization_id,legislation_id" });
        if (error) throw error;
      }
      return legIds.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} diplomas associados ao cliente`);
      queryClient.invalidateQueries({ queryKey: ["organization-legislation"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Move the selected diplomas to another descriptor */
  const moveDiplomas = useMutation({
    mutationFn: async () => {
      if (!moveTargetId) throw new Error("Escolha o descritor de destino");
      const ids = Array.from(selectedDiplomas);
      if (ids.length === 0) throw new Error("Nenhum diploma selecionado");
      const sourceIds = activeCategoryId ? descendantIds(activeCategoryId) : [];

      // Remove current mappings inside this theme branch, then map to the target
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { error: delError } = await supabase
          .from("legislation_category_mapping")
          .delete()
          .in("legislation_id", chunk)
          .in("category_id", sourceIds);
        if (delError) throw delError;

        const { error: insError } = await supabase
          .from("legislation_category_mapping")
          .upsert(
            chunk.map((legislation_id) => ({ legislation_id, category_id: moveTargetId })),
            { onConflict: "legislation_id,category_id" }
          );
        if (insError) throw insError;
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} diplomas movidos`);
      setSelectedDiplomas(new Set());
      queryClient.invalidateQueries({ queryKey: ["gt-diplomas"] });
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Remove the selected diplomas from the organization (they stay in the library) */
  const removeFromOrg = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Selecione um cliente");
      const ids = Array.from(selectedDiplomas);
      if (ids.length === 0) throw new Error("Nenhum diploma selecionado");
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase
          .from("organization_legislation")
          .delete()
          .eq("organization_id", orgId)
          .in("legislation_id", ids.slice(i, i + 100));
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} diplomas retirados do cliente`);
      setSelectedDiplomas(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Change applicability for the selected diplomas */
  const setApplicabilityForSelected = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Selecione um cliente");
      const ids = Array.from(selectedDiplomas);
      if (ids.length === 0) throw new Error("Nenhum diploma selecionado");
      for (let i = 0; i < ids.length; i += 200) {
        const rows = ids.slice(i, i + 200).map((legislation_id) => ({
          organization_id: orgId,
          legislation_id,
          applicability_type: applicability,
        }));
        const { error } = await supabase
          .from("organization_legislation")
          .upsert(rows, { onConflict: "organization_id,legislation_id" });
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (count) => toast.success(`Aplicabilidade atualizada em ${count} diplomas`),
    onError: (e: Error) => toast.error(e.message),
  });

  /** Delete a descriptor (and its sub-descriptors); diplomas are kept in the library */
  const deleteCategory = useMutation({
    mutationFn: async (cat: Category) => {
      const ids = descendantIds(cat.id);
      const { error: mapError } = await supabase
        .from("legislation_category_mapping")
        .delete()
        .in("category_id", ids);
      if (mapError) throw mapError;
      const { error: linkError } = await supabase
        .from("category_theme_links")
        .delete()
        .in("category_id", ids);
      if (linkError) throw linkError;
      // delete deepest first so parents never break
      for (const id of ids.reverse()) {
        const { error } = await supabase.from("theme_categories").delete().eq("id", id);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} descritor(es) eliminado(s)`);
      setActiveCategoryId(null);
      queryClient.invalidateQueries({ queryKey: ["gt-categories"] });
      queryClient.invalidateQueries({ queryKey: ["gt-diplomas"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Move a descriptor (and its sub-descriptors) to another theme */
  const moveCategoryToTheme = useMutation({
    mutationFn: async ({ cat, targetThemeId }: { cat: Category; targetThemeId: string }) => {
      const ids = descendantIds(cat.id);
      const { error } = await supabase
        .from("theme_categories")
        .update({ theme_id: targetThemeId })
        .in("id", ids);
      if (error) throw error;
      // the moved descriptor becomes a top-level descriptor of the target theme
      const { error: rootError } = await supabase
        .from("theme_categories")
        .update({ parent_id: null })
        .eq("id", cat.id);
      if (rootError) throw rootError;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} descritor(es) movido(s) de tema`);
      setActiveCategoryId(null);
      queryClient.invalidateQueries({ queryKey: ["gt-categories"] });
      queryClient.invalidateQueries({ queryKey: ["gt-diplomas"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renderNode = (cat: Category, level = 0) => {
    const kids = childrenOf.get(cat.id) || [];
    const isOpen = expanded.has(cat.id);
    const isActive = activeCategoryId === cat.id;
    const count = countDeep(cat.id);

    return (
      <div key={cat.id}>
        <div
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
            isActive ? "bg-primary/10" : "hover:bg-accent/50"
          }`}
          style={{ paddingLeft: `${level * 14 + 8}px` }}
        >
          <Checkbox
            checked={checkedCategories.has(cat.id)}
            onCheckedChange={(v) => toggleCategoryCheck(cat, v === true)}
          />
          {kids.length > 0 ? (
            <button
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                  return next;
                })
              }
              className="p-0.5"
              aria-label={isOpen ? "Fechar" : "Abrir"}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <button
            className="flex-1 truncate text-left text-sm"
            onClick={() => {
              setActiveCategoryId(cat.id);
              setSelectedDiplomas(new Set());
            }}
            title={cat.name}
          >
            {cat.name}
          </button>
          {count > 0 && (
            <Badge variant="secondary" className="h-5 shrink-0 px-2 text-xs">
              {count}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
            title="Mover descritor para outro tema"
            onClick={() => {
              setCategoryToMove(cat);
              setMoveThemeId("");
            }}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0 text-destructive"
            title="Eliminar descritor"
            onClick={() => setCategoryToDelete(cat)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {isOpen && kids.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  const flatCategories = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    const walk = (parent: string | null, prefix: string) => {
      for (const c of childrenOf.get(parent) || []) {
        out.push({ id: c.id, label: prefix + c.name });
        walk(c.id, prefix + "— ");
      }
    };
    walk(null, "");
    return out;
  }, [childrenOf]);

  const checkedCount = Array.from(checkedCategories).reduce(
    (sum, id) => sum + (byCategory.get(id)?.length || 0),
    0
  );

  return (
    <div className="min-h-screen bg-background">
      <RouteSeo />

      <IDTopNav />

      <main className="container mx-auto space-y-4 px-4 py-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <FolderTree className="h-6 w-6 text-primary" />
            Gestão de Temas e Descritores
          </h1>
          <p className="text-sm text-muted-foreground">
            Escolha um tema, confirme os descritores que quer usar e o sistema associa automaticamente
            todos os diplomas que estão lá dentro ao cliente. Depois é só corrigir aplicabilidades,
            mover diplomas entre descritores ou retirar os que não interessam.
          </p>
        </header>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <div className="space-y-1">
              <Label className="text-xs">Tema</Label>
              <Select value={themeId ?? undefined} onValueChange={(v) => { setThemeId(v); setActiveCategoryId(null); setCheckedCategories(new Set()); }}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Selecionar tema" />
                </SelectTrigger>
                <SelectContent>
                  {(themes || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Select value={orgId ?? undefined} onValueChange={setOrgId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Selecionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {(organizations || []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Aplicabilidade a atribuir</Label>
              <Select value={applicability} onValueChange={setApplicability}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPLICABILITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!orgId || checkedCategories.size === 0 || applyToOrg.isPending}
              onClick={() => applyToOrg.mutate()}
              className="gap-2"
            >
              {applyToOrg.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Aplicar aos descritores confirmados ({checkedCount})
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Descritores e subdescritores</CardTitle>
              <CardDescription className="flex items-center gap-2 text-xs">
                <button className="underline" onClick={() => checkAll(true)}>
                  Selecionar todos
                </button>
                <span>·</span>
                <button className="underline" onClick={() => checkAll(false)}>
                  Limpar
                </button>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2">
              {!themeId ? (
                <p className="p-4 text-sm text-muted-foreground">Selecione um tema para começar.</p>
              ) : loadingCats ? (
                <p className="p-4 text-sm text-muted-foreground">A carregar…</p>
              ) : (
                <ScrollArea className="h-[calc(100vh-360px)]">
                  <div className="pr-2">{(childrenOf.get(null) || []).map((c) => renderNode(c))}</div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Diplomas {activeCategoryId ? `(${activeDiplomas.length})` : ""}
              </CardTitle>
              <CardDescription className="text-xs">
                Selecione vários diplomas para mover de descritor, alterar aplicabilidade ou retirar do cliente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-3">
              {activeCategoryId && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Pesquisar diploma…"
                      className="h-9 w-56"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSelectedDiplomas(
                          selectedDiplomas.size === activeDiplomas.length
                            ? new Set()
                            : new Set(activeDiplomas.map((d) => d.id))
                        )
                      }
                    >
                      {selectedDiplomas.size === activeDiplomas.length && activeDiplomas.length > 0
                        ? "Limpar seleção"
                        : "Selecionar todos"}
                    </Button>
                    <Select value={moveTargetId} onValueChange={setMoveTargetId}>
                      <SelectTrigger className="h-9 w-64">
                        <SelectValue placeholder="Mover para descritor…" />
                      </SelectTrigger>
                      <SelectContent>
                        {flatCategories
                          .filter((c) => c.id !== activeCategoryId)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="gap-2"
                      disabled={selectedDiplomas.size === 0 || !moveTargetId || moveDiplomas.isPending}
                      onClick={() => moveDiplomas.mutate()}
                    >
                      {moveDiplomas.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoveRight className="h-4 w-4" />
                      )}
                      Mover ({selectedDiplomas.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!orgId || selectedDiplomas.size === 0 || setApplicabilityForSelected.isPending}
                      onClick={() => setApplicabilityForSelected.mutate()}
                    >
                      Aplicar aplicabilidade
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!orgId || selectedDiplomas.size === 0 || removeFromOrg.isPending}
                      onClick={() => removeFromOrg.mutate()}
                    >
                      Retirar do cliente
                    </Button>
                  </div>

                  <ScrollArea className="h-[calc(100vh-430px)]">
                    <div className="space-y-1 pr-2">
                      {activeDiplomas.map((d) => (
                        <label
                          key={`${d.category_id}-${d.id}`}
                          className="flex cursor-pointer items-start gap-3 rounded-md border p-2 hover:bg-accent/40"
                        >
                          <Checkbox
                            checked={selectedDiplomas.has(d.id)}
                            onCheckedChange={(v) =>
                              setSelectedDiplomas((prev) => {
                                const next = new Set(prev);
                                v === true ? next.add(d.id) : next.delete(d.id);
                                return next;
                              })
                            }
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{d.number || d.title}</p>
                            <p className="line-clamp-2 text-xs text-muted-foreground">{d.title}</p>
                          </div>
                          <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                            {d.origin === "EU" || d.origin === "eurlex" ? "UE" : "PT"}
                          </Badge>
                        </label>
                      ))}
                      {activeDiplomas.length === 0 && (
                        <p className="p-4 text-sm text-muted-foreground">Sem diplomas neste descritor.</p>
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}
              {!activeCategoryId && (
                <p className="p-4 text-sm text-muted-foreground">
                  Clique num descritor à esquerda para ver e gerir os seus diplomas.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <AlertDialog open={!!categoryToDelete} onOpenChange={(o) => !o && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar descritor?</AlertDialogTitle>
            <AlertDialogDescription>
              O descritor "{categoryToDelete?.name}" e os seus subdescritores serão eliminados. Os
              diplomas continuam na biblioteca, apenas deixam de estar associados a este descritor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (categoryToDelete) deleteCategory.mutate(categoryToDelete);
                setCategoryToDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>

        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!categoryToMove} onOpenChange={(o) => !o && setCategoryToMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover descritor para outro tema</AlertDialogTitle>
            <AlertDialogDescription>
              "{categoryToMove?.name}" e os seus subdescritores passam para o tema escolhido,
              mantendo os diplomas associados. Fica como descritor de topo no tema de destino.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Tema de destino</Label>
            <Select value={moveThemeId} onValueChange={setMoveThemeId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher tema…" />
              </SelectTrigger>
              <SelectContent>
                {(themes || [])
                  .filter((t) => t.id !== categoryToMove?.theme_id)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!moveThemeId || moveCategoryToTheme.isPending}
              onClick={() => {
                if (categoryToMove && moveThemeId) {
                  moveCategoryToTheme.mutate({ cat: categoryToMove, targetThemeId: moveThemeId });
                }
                setCategoryToMove(null);
              }}
            >
              Mover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
