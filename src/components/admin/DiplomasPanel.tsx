import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
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
  FileText,
  Copy,
  Plus,
} from "lucide-react";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { ImportLegislationByUrlDialog } from "@/components/admin/ImportLegislationByUrlDialog";
import { DiplomaCategoriesDialog } from "@/components/legislation/DiplomaCategoriesDialog";
import {
  DiplomaDuplicatesDialog,
  type DuplicateRow,
} from "@/components/legislation/DiplomaDuplicatesDialog";

const PAGE_SIZE = 25;

type MissingFilter = "all" | "category" | "eu" | "relations" | "duplicates" | "any";

interface Row {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  document_url: string | null;
  origin: string | null;
  publication_date: string | null;
  categories: string[];
  relationsCount: number;
  hasEuLink: boolean;
  isEu: boolean;
}

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

type DupInfo = { rows: DuplicateRow[]; reason: string };

async function fetchDuplicateIndex(): Promise<Map<string, DupInfo>> {
  const pageSize = 1000;
  let from = 0;
  const all: DuplicateRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("legislation")
      .select("id, number, title, origin, publication_date, document_url")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as DuplicateRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const index = new Map<string, DupInfo>();
  const collect = (keyFn: (r: DuplicateRow) => string | null, reason: string) => {
    const map = new Map<string, DuplicateRow[]>();
    for (const r of all) {
      const k = keyFn(r);
      if (!k) continue;
      const list = map.get(k);
      if (list) list.push(r);
      else map.set(k, [r]);
    }
    for (const list of map.values()) {
      if (list.length < 2) continue;
      for (const r of list) {
        if (!index.has(r.id)) index.set(r.id, { rows: list, reason });
      }
    }
  };

  collect((r) => normalizeNumber(r.number) || null, "Mesmo número");
  collect((r) => normalizeTitle(r.title) || null, "Mesmo título");
  collect((r) => (r.document_url ? normalizeUrl(r.document_url) : null), "Mesmo documento oficial");
  return index;
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

export function DiplomasPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<"all" | "PT" | "EU">("all");
  const [missing, setMissing] = useState<MissingFilter>("all");
  const [page, setPage] = useState(0);
  const [categoryTarget, setCategoryTarget] = useState<Row | null>(null);
  const [dupTarget, setDupTarget] = useState<{ rows: DuplicateRow[]; reason: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: dupIndex } = useQuery({
    queryKey: ["diplomas-duplicate-index"],
    queryFn: fetchDuplicateIndex,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["diplomas-overview", search, origin, page],
    queryFn: async () => {
      let q = supabase
        .from("legislation")
        .select("id, number, title, summary, document_url, origin, publication_date", {
          count: "exact",
        })
        .order("publication_date", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`title.ilike.${term},number.ilike.${term},summary.ilike.${term}`);
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
        summary: (l as any).summary ?? null,
        document_url: (l as any).document_url ?? null,
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
      case "duplicates":
        return all.filter((r) => dupIndex?.has(r.id));
      case "any":
        return all.filter(
          (r) =>
            r.categories.length === 0 ||
            r.relationsCount === 0 ||
            (!r.isEu && !r.hasEuLink) ||
            dupIndex?.has(r.id),
        );
      default:
        return all;
    }
  }, [data, missing, dupIndex]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["diplomas-overview"] });
    queryClient.invalidateQueries({ queryKey: ["diplomas-duplicate-index"] });
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div>
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">Diplomas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sumário, documento oficial e estado de cada diploma. Importe novos diplomas por endereço,
            edite categorizações e elimine cópias repetidas sem sair desta página.
          </p>
          </div>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Importar diploma
          </Button>
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
                placeholder="Pesquisar por título, número ou sumário..."
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
                <SelectItem value="duplicates">Repetidos</SelectItem>
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
            {rows.map((r) => {
              const dup = dupIndex?.get(r.id);
              return (
                <li key={r.id}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
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
                            {dup && (
                              <Badge variant="destructive">
                                {dup.rows.length} cópias · {dup.reason}
                              </Badge>
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
                      <p className="text-sm text-muted-foreground">
                        {r.summary?.trim() ? r.summary : "Sem sumário disponível."}
                      </p>

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

                      <div className="flex flex-wrap gap-2 border-t pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!r.document_url}
                          onClick={() => r.document_url && openExternalUrl(r.document_url)}
                        >
                          <FileText className="mr-1 h-3 w-3" aria-hidden="true" />
                          {r.document_url ? "Documento oficial" : "Sem documento oficial"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setCategoryTarget(r)}>
                          <Tags className="mr-1 h-3 w-3" aria-hidden="true" />
                          Editar categorizações
                        </Button>
                        {dup && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDupTarget({ rows: dup.rows, reason: dup.reason })}
                          >
                            <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
                            Resolver duplicados ({dup.rows.length})
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
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
      </div>

      <DiplomaCategoriesDialog
        open={!!categoryTarget}
        onOpenChange={(o) => !o && setCategoryTarget(null)}
        legislationId={categoryTarget?.id ?? null}
        legislationLabel={categoryTarget ? `${categoryTarget.number} — ${categoryTarget.title}` : ""}
        onChanged={refreshAll}
      />

      <DiplomaDuplicatesDialog
        open={!!dupTarget}
        onOpenChange={(o) => !o && setDupTarget(null)}
        rows={dupTarget?.rows ?? []}
        reason={dupTarget?.reason ?? ""}
        onMerged={refreshAll}
      />

      <ImportLegislationByUrlDialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) refreshAll();
        }}
      />

    </div>
  );
}
