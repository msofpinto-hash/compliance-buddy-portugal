import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2, Layers } from "lucide-react";

type Cat = { id: string; name: string; theme_id: string; keywords: string[] | null };
type Row = {
  legislationId: string;
  number: string;
  title: string;
  categoryId: string;
  categoryName: string;
  themeName: string;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table as any).select(select).range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

export function CategoryReviewPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["category-review"],
    queryFn: async () => {
      const [themes, cats, maps, legs] = await Promise.all([
        fetchAll<{ id: string; name: string }>("themes", "id, name"),
        fetchAll<Cat>("theme_categories", "id, name, theme_id, keywords"),
        fetchAll<{ legislation_id: string; category_id: string }>(
          "legislation_category_mapping",
          "legislation_id, category_id",
        ),
        fetchAll<{ id: string; number: string | null; title: string | null; summary: string | null }>(
          "legislation",
          "id, number, title, summary",
        ),
      ]);

      const themeName = new Map(themes.map((t) => [t.id, t.name]));
      const catById = new Map(cats.map((c) => [c.id, c]));
      const legById = new Map(legs.map((l) => [l.id, l]));

      const suspect: Row[] = [];
      const perLeg = new Map<string, Row[]>();

      for (const m of maps) {
        const c = catById.get(m.category_id);
        const l = legById.get(m.legislation_id);
        if (!c || !l) continue;
        const row: Row = {
          legislationId: l.id,
          number: l.number ?? "",
          title: l.title ?? "",
          categoryId: c.id,
          categoryName: c.name,
          themeName: themeName.get(c.theme_id) ?? "",
        };
        perLeg.set(l.id, [...(perLeg.get(l.id) ?? []), row]);

        const kws = (c.keywords ?? []).filter(Boolean);
        if (kws.length === 0) continue;
        const text = norm(`${l.title ?? ""} ${l.summary ?? ""} ${l.number ?? ""}`);
        const hit = kws.some((k) => text.includes(norm(k)));
        if (!hit) suspect.push(row);
      }

      const overloaded = [...perLeg.entries()]
        .filter(([, rows]) => rows.length > 3)
        .map(([, rows]) => rows)
        .sort((a, b) => b.length - a.length);

      return { suspect, overloaded, totalMaps: maps.length };
    },
    staleTime: 60_000,
  });

  const filter = (rows: Row[]) => {
    if (!search.trim()) return rows;
    const q = norm(search);
    return rows.filter(
      (r) => norm(r.number).includes(q) || norm(r.title).includes(q) || norm(r.categoryName).includes(q),
    );
  };

  const suspect = useMemo(() => filter(data?.suspect ?? []), [data, search]);
  const overloaded = useMemo(
    () => (data?.overloaded ?? []).filter((rows) => filter(rows).length > 0),
    [data, search],
  );

  const remove = async (r: Row) => {
    const key = `${r.legislationId}|${r.categoryId}`;
    setRemoving(key);
    const { error } = await supabase
      .from("legislation_category_mapping")
      .delete()
      .eq("legislation_id", r.legislationId)
      .eq("category_id", r.categoryId);
    setRemoving(null);
    if (error) {
      toast.error("Não foi possível remover: " + error.message);
      return;
    }
    toast.success("Associação removida");
    queryClient.invalidateQueries({ queryKey: ["category-review"] });
    queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
    queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
  };

  const RowItem = ({ r }: { r: Row }) => (
    <div className="flex items-start justify-between gap-3 rounded-md border p-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{r.number}</p>
        <p className="truncate text-xs text-muted-foreground">{r.title}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px]">
            {r.themeName}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {r.categoryName}
          </Badge>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 text-destructive"
        disabled={removing === `${r.legislationId}|${r.categoryId}`}
        onClick={() => remove(r)}
      >
        {removing === `${r.legislationId}|${r.categoryId}` ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Revisão de categorias
        </CardTitle>
        <CardDescription className="text-xs">
          Diplomas cuja classificação não corresponde às palavras-chave do descritor, ou que estão em demasiados
          descritores ao mesmo tempo. Remova as associações erradas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Pesquisar diploma ou descritor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9"
        />
        {isLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A analisar classificações…
          </div>
        ) : (
          <Tabs defaultValue="suspeitas">
            <TabsList>
              <TabsTrigger value="suspeitas" className="gap-1 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                Suspeitas ({suspect.length})
              </TabsTrigger>
              <TabsTrigger value="excesso" className="gap-1 text-xs">
                <Layers className="h-3.5 w-3.5" />
                Em muitos descritores ({overloaded.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="suspeitas" className="mt-3">
              <ScrollArea className="h-[480px] pr-2">
                <div className="space-y-2">
                  {suspect.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Sem classificações suspeitas.</p>
                  ) : (
                    suspect.map((r) => <RowItem key={`${r.legislationId}|${r.categoryId}`} r={r} />)
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="excesso" className="mt-3">
              <ScrollArea className="h-[480px] pr-2">
                <div className="space-y-3">
                  {overloaded.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Nenhum diploma com excesso de descritores.</p>
                  ) : (
                    overloaded.map((rows) => (
                      <div key={rows[0].legislationId} className="space-y-1 rounded-lg border p-2">
                        <p className="text-sm font-medium">{rows[0].number}</p>
                        <p className="text-xs text-muted-foreground">{rows[0].title}</p>
                        <div className="mt-2 space-y-1">
                          {rows.map((r) => (
                            <div
                              key={r.categoryId}
                              className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                            >
                              <span className="truncate text-xs">
                                {r.themeName} · {r.categoryName}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 shrink-0 text-destructive"
                                disabled={removing === `${r.legislationId}|${r.categoryId}`}
                                onClick={() => remove(r)}
                              >
                                {removing === `${r.legislationId}|${r.categoryId}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
