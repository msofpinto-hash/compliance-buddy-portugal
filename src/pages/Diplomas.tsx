import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Flag,
  Link2,
  Tags,
  ExternalLink,
} from "lucide-react";

const PAGE_SIZE = 25;

type MissingFilter = "all" | "category" | "eu" | "relations" | "any";

interface Row {
  id: string;
  number: string;
  title: string;
  origin: string | null;
  publication_date: string | null;
  categories: string[];
  relationsCount: number;
  hasEuLink: boolean;
  isEu: boolean;
}

function StatusChip({ ok, label, icon: Icon }: { ok: boolean; label: string; icon: typeof Tags }) {
  return (
    <Badge
      variant="outline"
      className={
        ok
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }
    >
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {label}
      {ok ? (
        <CheckCircle2 className="ml-1 h-3 w-3" aria-hidden="true" />
      ) : (
        <AlertTriangle className="ml-1 h-3 w-3" aria-hidden="true" />
      )}
    </Badge>
  );
}

export default function Diplomas() {
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<"all" | "PT" | "EU">("all");
  const [missing, setMissing] = useState<MissingFilter>("all");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["diplomas-overview", search, origin, page],
    queryFn: async () => {
      let q = supabase
        .from("legislation")
        .select("id, number, title, origin, publication_date", { count: "exact" })
        .order("publication_date", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`title.ilike.${term},number.ilike.${term}`);
      }
      if (origin === "PT") q = q.in("origin", ["PT", "dre"]);
      if (origin === "EU") q = q.in("origin", ["EU", "eurlex"]);

      const { data: legis, error, count } = await q;
      if (error) throw error;
      const ids = (legis ?? []).map((l) => l.id);
      if (ids.length === 0) return { rows: [] as Row[], total: count ?? 0 };

      const [mapsRes, relSrcRes, relTgtRes] = await Promise.all([
        supabase
          .from("legislation_category_mapping")
          .select("legislation_id, theme_categories(name)")
          .in("legislation_id", ids),
        supabase
          .from("legislation_relations")
          .select("source_legislation_id, target_legislation_id, legislation!legislation_relations_target_legislation_id_fkey(origin)")
          .in("source_legislation_id", ids),
        supabase
          .from("legislation_relations")
          .select("target_legislation_id, source_legislation_id, legislation!legislation_relations_source_legislation_id_fkey(origin)")
          .in("target_legislation_id", ids),
      ]);

      const catMap = new Map<string, string[]>();
      for (const m of mapsRes.data ?? []) {
        const name = (m as any).theme_categories?.name;
        if (!name) continue;
        catMap.set(m.legislation_id, [...(catMap.get(m.legislation_id) ?? []), name]);
      }

      const relCount = new Map<string, number>();
      const euLink = new Set<string>();
      const isEuOrigin = (o?: string | null) => o === "EU" || o === "eurlex";

      for (const r of (relSrcRes.data ?? []) as any[]) {
        const id = r.source_legislation_id;
        relCount.set(id, (relCount.get(id) ?? 0) + 1);
        if (isEuOrigin(r.legislation?.origin)) euLink.add(id);
      }
      for (const r of (relTgtRes.data ?? []) as any[]) {
        const id = r.target_legislation_id;
        relCount.set(id, (relCount.get(id) ?? 0) + 1);
        if (isEuOrigin(r.legislation?.origin)) euLink.add(id);
      }

      const rows: Row[] = (legis ?? []).map((l) => ({
        id: l.id,
        number: l.number,
        title: l.title,
        origin: l.origin,
        publication_date: l.publication_date,
        categories: catMap.get(l.id) ?? [],
        relationsCount: relCount.get(l.id) ?? 0,
        hasEuLink: euLink.has(l.id),
        isEu: isEuOrigin(l.origin),
      }));

      return { rows, total: count ?? 0 };
    },
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    switch (missing) {
      case "category":
        return all.filter((r) => r.categories.length === 0);
      case "eu":
        return all.filter((r) => !r.isEu && !r.hasEuLink);
      case "relations":
        return all.filter((r) => r.relationsCount === 0);
      case "any":
        return all.filter(
          (r) => r.categories.length === 0 || r.relationsCount === 0 || (!r.isEu && !r.hasEuLink),
        );
      default:
        return all;
    }
  }, [data, missing]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-dvh bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin">
              <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Voltar
            </Link>
          </Button>
        </div>

        <header className="mb-6">
          <h1 className="font-heading text-3xl font-bold text-foreground">Diplomas</h1>
          <p className="mt-1 text-muted-foreground">
            Título, categoria e o que ainda falta em cada diploma: categoria, ligação EU e relações.
          </p>
        </header>

        <Card className="mb-6">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Pesquisar por título ou número..."
                className="pl-9"
                aria-label="Pesquisar diplomas"
              />
            </div>
            <Select
              value={origin}
              onValueChange={(v) => {
                setOrigin(v as typeof origin);
                setPage(0);
              }}
            >
              <SelectTrigger className="sm:w-40" aria-label="Filtrar por origem">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                <SelectItem value="PT">Nacional (PT)</SelectItem>
                <SelectItem value="EU">Europeia (EU)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={missing} onValueChange={(v) => setMissing(v as MissingFilter)}>
              <SelectTrigger className="sm:w-52" aria-label="Filtrar por dados em falta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mostrar todos</SelectItem>
                <SelectItem value="any">Com algo em falta</SelectItem>
                <SelectItem value="category">Sem categoria</SelectItem>
                <SelectItem value="eu">Sem ligação EU</SelectItem>
                <SelectItem value="relations">Sem relações</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              Nenhum diploma encontrado com estes filtros.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="secondary">
                            {r.isEu ? (
                              <Globe className="mr-1 h-3 w-3" aria-hidden="true" />
                            ) : (
                              <Flag className="mr-1 h-3 w-3" aria-hidden="true" />
                            )}
                            {r.isEu ? "EU" : "PT"}
                          </Badge>
                          <span className="text-sm font-medium text-muted-foreground">{r.number}</span>
                          {r.publication_date && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.publication_date).toLocaleDateString("pt-PT")}
                            </span>
                          )}
                        </div>
                        <CardTitle className="text-base leading-snug">{r.title}</CardTitle>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/legislacao/${r.id}`}>
                          Abrir
                          <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                        </Link>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Categorias
                      </span>
                      {r.categories.length > 0 ? (
                        r.categories.map((c) => (
                          <Badge key={c} variant="secondary">
                            {c}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-destructive">Sem categoria atribuída</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusChip
                        ok={r.categories.length > 0}
                        label={r.categories.length > 0 ? "Categoria" : "Falta categoria"}
                        icon={Tags}
                      />
                      <StatusChip
                        ok={r.isEu || r.hasEuLink}
                        label={r.isEu ? "Diploma EU" : r.hasEuLink ? "Ligação EU" : "Falta ligação EU"}
                        icon={Globe}
                      />
                      <StatusChip
                        ok={r.relationsCount > 0}
                        label={r.relationsCount > 0 ? `${r.relationsCount} relações` : "Faltam relações"}
                        icon={Link2}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <nav className="mt-6 flex items-center justify-between" aria-label="Paginação de diplomas">
          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages} · {total} diplomas
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Seguinte
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      </main>
    </div>
  );
}
