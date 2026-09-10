import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { IDTopNav } from "@/components/client/IDTopNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Copy, ExternalLink, Loader2, Search, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  number: string;
  title: string;
  origin: string | null;
  source: string | null;
  document_type: string | null;
  publication_date: string | null;
  effective_date: string | null;
  document_url: string | null;
  created_at: string;
};

type GroupKind = "number" | "title" | "url";

type Group = {
  key: string;
  kind: GroupKind;
  label: string;
  rows: Row[];
};

const normalizeNumber = (n: string) =>
  (n || "")
    .toLowerCase()
    .replace(/n\.?[ºo°]?/g, " ")
    .replace(/[.,;:_-]/g, " ")
    .replace(/\s+/g, "")
    .trim();

const normalizeTitle = (t: string) =>
  (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeUrl = (u: string) => {
  try {
    const url = new URL(u.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
};

async function fetchAllLegislation(): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  let all: Row[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("legislation")
      .select(
        "id, number, title, origin, source, document_type, publication_date, effective_date, document_url, created_at",
      )
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all = all.concat(data as Row[]);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function buildGroups(rows: Row[]): Record<GroupKind, Group[]> {
  const make = (
    kind: GroupKind,
    keyFn: (r: Row) => string | null,
    labelFn: (rows: Row[]) => string,
  ): Group[] => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const k = keyFn(r);
      if (!k) continue;
      const list = map.get(k);
      if (list) list.push(r);
      else map.set(k, [r]);
    }
    return Array.from(map.entries())
      .filter(([, list]) => list.length > 1)
      .map(([key, list]) => ({ key: `${kind}:${key}`, kind, label: labelFn(list), rows: list }))
      .sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  };

  return {
    number: make("number", (r) => normalizeNumber(r.number) || null, (l) => l[0].number),
    title: make("title", (r) => normalizeTitle(r.title) || null, (l) => l[0].title),
    url: make(
      "url",
      (r) => (r.document_url ? normalizeUrl(r.document_url) : null),
      (l) => l[0].document_url || "",
    ),
  };
}

const KIND_LABEL: Record<GroupKind, string> = {
  number: "Mesmo número",
  title: "Mesmo título",
  url: "Mesmo documento oficial",
};

export default function Duplicados() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<GroupKind>("number");
  const [search, setSearch] = useState("");
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<Record<string, Set<string>>>({});
  const [pending, setPending] = useState<Group | null>(null);
  const [working, setWorking] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["duplicados-legislation"],
    queryFn: fetchAllLegislation,
  });

  const groups = useMemo(() => (rows ? buildGroups(rows) : null), [rows]);

  const dupIds = useMemo(() => {
    if (!groups) return [];
    const s = new Set<string>();
    (["number", "title", "url"] as GroupKind[]).forEach((k) =>
      groups[k].forEach((g) => g.rows.forEach((r) => s.add(r.id))),
    );
    return Array.from(s);
  }, [groups]);

  // Contagens de trabalho associado a cada cópia
  const { data: usage } = useQuery({
    queryKey: ["duplicados-usage", dupIds.length],
    enabled: dupIds.length > 0,
    queryFn: async () => {
      const chunk = <T,>(arr: T[], n: number) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

      const counters: Record<string, { req: number; cat: number; org: number }> = {};
      const bump = (id: string, field: "req" | "cat" | "org") => {
        counters[id] = counters[id] || { req: 0, cat: 0, org: 0 };
        counters[id][field] += 1;
      };

      for (const ids of chunk(dupIds, 200)) {
        const [req, cat, org] = await Promise.all([
          supabase.from("legal_requirements").select("legislation_id").in("legislation_id", ids),
          supabase
            .from("legislation_category_mapping")
            .select("legislation_id")
            .in("legislation_id", ids),
          supabase
            .from("organization_legislation")
            .select("legislation_id")
            .in("legislation_id", ids),
        ]);
        req.data?.forEach((r: any) => bump(r.legislation_id, "req"));
        cat.data?.forEach((r: any) => bump(r.legislation_id, "cat"));
        org.data?.forEach((r: any) => bump(r.legislation_id, "org"));
      }
      return counters;
    },
  });

  const score = (r: Row) => {
    const u = usage?.[r.id];
    return (u?.req ?? 0) * 10 + (u?.cat ?? 0) * 3 + (u?.org ?? 0) * 3 + (r.document_url ? 2 : 0);
  };

  const keeperOf = (g: Group) => {
    if (keep[g.key]) return keep[g.key];
    return [...g.rows].sort((a, b) => score(b) - score(a))[0].id;
  };

  const removalsOf = (g: Group) => {
    const k = keeperOf(g);
    const set = remove[g.key];
    if (set) return g.rows.filter((r) => r.id !== k && set.has(r.id)).map((r) => r.id);
    return [];
  };

  const toggleRemove = (g: Group, id: string) => {
    setRemove((prev) => {
      const next = new Set(prev[g.key] ?? []);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...prev, [g.key]: next };
    });
  };

  const selectAllOthers = (g: Group) => {
    const k = keeperOf(g);
    setRemove((prev) => ({
      ...prev,
      [g.key]: new Set(g.rows.filter((r) => r.id !== k).map((r) => r.id)),
    }));
  };

  const applyMerge = async (g: Group) => {
    const keep_id = keeperOf(g);
    const remove_ids = removalsOf(g);
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke("merge-duplicate-legislation", {
        body: { keep_id, remove_ids },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(
        `Ficou 1 diploma. ${remove_ids.length} cópia(s) eliminada(s) e o trabalho associado passou para a que manteve.`,
      );
      setPending(null);
      setRemove((prev) => ({ ...prev, [g.key]: new Set() }));
      await queryClient.invalidateQueries({ queryKey: ["duplicados-legislation"] });
      await queryClient.invalidateQueries({ queryKey: ["duplicados-usage"] });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível juntar estes diplomas.");
    } finally {
      setWorking(false);
    }
  };

  const visibleGroups = useMemo(() => {
    if (!groups) return [];
    const term = search.trim().toLowerCase();
    const list = groups[tab];
    if (!term) return list;
    return list.filter(
      (g) =>
        g.label.toLowerCase().includes(term) ||
        g.rows.some(
          (r) =>
            r.number.toLowerCase().includes(term) || r.title.toLowerCase().includes(term),
        ),
    );
  }, [groups, tab, search]);

  return (
    <div className="min-h-screen bg-background">
      <IDTopNav />
      <main className="container mx-auto px-4 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <Copy className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Diplomas duplicados</h1>
          </div>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Escolha, em cada grupo, o diploma que fica. Os requisitos, temas e clientes ligados às
            cópias passam para o diploma que mantiver antes de as eliminar.
          </p>
        </header>

        <div className="mb-4 flex items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar por número ou título…"
              className="pl-9"
            />
          </div>
        </div>

        {isLoading || !groups ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as GroupKind)}>
            <TabsList>
              {(["number", "title", "url"] as GroupKind[]).map((k) => (
                <TabsTrigger key={k} value={k}>
                  {KIND_LABEL[k]}
                  <Badge variant="secondary" className="ml-2">
                    {groups[k].length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {(["number", "title", "url"] as GroupKind[]).map((k) => (
              <TabsContent key={k} value={k} className="mt-4 space-y-4">
                {visibleGroups.length === 0 && (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      Sem repetições nesta vista.
                    </CardContent>
                  </Card>
                )}

                {visibleGroups.map((g) => {
                  const keeper = keeperOf(g);
                  const toRemove = removalsOf(g);
                  return (
                    <Card key={g.key}>
                      <CardContent className="p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{g.label}</p>
                            <p className="text-sm text-muted-foreground">
                              {g.rows.length} cópias · {KIND_LABEL[g.kind].toLowerCase()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => selectAllOthers(g)}>
                              Marcar todas menos a escolhida
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={toRemove.length === 0}
                              onClick={() => setPending(g)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar {toRemove.length || ""}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {g.rows.map((r) => {
                            const isKeeper = r.id === keeper;
                            const marked = (remove[g.key] ?? new Set()).has(r.id) && !isKeeper;
                            const u = usage?.[r.id];
                            return (
                              <div
                                key={r.id}
                                className={cn(
                                  "flex flex-wrap items-start gap-3 rounded-lg border p-3",
                                  isKeeper && "border-primary/50 bg-primary/5",
                                  marked && "border-destructive/50 bg-destructive/5",
                                )}
                              >
                                <div className="flex items-center gap-3 pt-0.5">
                                  <input
                                    type="radio"
                                    name={`keep-${g.key}`}
                                    checked={isKeeper}
                                    onChange={() => {
                                      setKeep((p) => ({ ...p, [g.key]: r.id }));
                                      setRemove((p) => {
                                        const next = new Set(p[g.key] ?? []);
                                        next.delete(r.id);
                                        return { ...p, [g.key]: next };
                                      });
                                    }}
                                    aria-label={`Manter ${r.number}`}
                                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                                  />
                                  <Checkbox
                                    checked={marked}
                                    disabled={isKeeper}
                                    onCheckedChange={() => toggleRemove(g, r.id)}
                                    aria-label={`Eliminar ${r.number}`}
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      to={`/legislacao/${r.id}`}
                                      className="font-medium hover:underline"
                                    >
                                      {r.number}
                                    </Link>
                                    {isKeeper && (
                                      <Badge className="gap-1">
                                        <Star className="h-3 w-3" /> Fica
                                      </Badge>
                                    )}
                                    {r.origin && <Badge variant="outline">{r.origin}</Badge>}
                                    {r.source && (
                                      <Badge variant="secondary">{r.source}</Badge>
                                    )}
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                    {r.title}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {u?.req ?? 0} requisitos · {u?.cat ?? 0} temas · {u?.org ?? 0}{" "}
                                    clientes · publicado {r.publication_date || "—"}
                                  </p>
                                </div>

                                {r.document_url && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openExternalUrl(r.document_url!)}
                                  >
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Documento
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar as cópias marcadas?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  Fica <strong>{pending.rows.find((r) => r.id === keeperOf(pending))?.number}</strong>{" "}
                  e são eliminadas {removalsOf(pending).length} cópia(s). Tudo o que estiver ligado
                  às cópias (requisitos, temas, clientes, auditorias) passa primeiro para o diploma
                  que fica. Esta ação não pode ser anulada.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={working}
              onClick={(e) => {
                e.preventDefault();
                if (pending) applyMerge(pending);
              }}
            >
              {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
