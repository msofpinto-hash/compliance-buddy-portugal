import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, ChevronRight, ExternalLink, Filter, Layers, List, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type ValidationStatus = "valid" | "redirect" | "timeout" | "error" | "invalid";

const STATUS_OPTIONS: { value: ValidationStatus; label: string; color: string }[] = [
  { value: "valid", label: "Válidas", color: "text-primary" },
  { value: "redirect", label: "Redirect", color: "text-amber-600" },
  { value: "invalid", label: "Inválidas", color: "text-destructive" },
  { value: "timeout", label: "Timeout", color: "text-muted-foreground" },
  { value: "error", label: "Erro", color: "text-destructive" },
];

interface Row {
  id: string;
  legislation_id: string;
  number: string | null;
  title: string | null;
  document_url: string;
  status: string;
  status_code: number | null;
  error_message: string | null;
  cleared: boolean;
  checked_at: string;
  job_id: string;
}

const PAGE_SIZE = 100;

export function DreUrlValidationExplorer() {
  const [statuses, setStatuses] = useState<ValidationStatus[]>([
    "invalid",
    "timeout",
    "error",
  ]);
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [grouped, setGrouped] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const queryKey = useMemo(
    () => [
      "dre-url-validation-explorer",
      statuses.join(","),
      from?.toISOString() ?? null,
      to?.toISOString() ?? null,
      search.trim().toLowerCase(),
      page,
    ],
    [statuses, from, to, search, page],
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("url_validation_results")
        .select(
          "id,legislation_id,number,title,document_url,status,status_code,error_message,cleared,checked_at,job_id",
          { count: "exact" },
        )
        .order("checked_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (statuses.length > 0 && statuses.length < STATUS_OPTIONS.length) {
        q = q.in("status", statuses);
      }
      if (from) q = q.gte("checked_at", from.toISOString());
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("checked_at", end.toISOString());
      }
      const term = search.trim();
      if (term.length >= 2) {
        q = q.or(
          `number.ilike.%${term}%,title.ilike.%${term}%,document_url.ilike.%${term}%`,
        );
      }

      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data || []) as Row[], total: count ?? 0 };
    },
  });

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  type Group = {
    legislation_id: string;
    number: string | null;
    title: string | null;
    document_url: string;
    counts: Record<string, number>;
    total: number;
    latest: string;
    rows: Row[];
    countsAll?: Record<string, number>;
    totalAll?: number;
    latestAll?: string;
  };

  const groups = useMemo<Group[]>(() => {
    if (!grouped) return [];
    const map = new Map<string, Group>();
    for (const r of rows) {
      let g = map.get(r.legislation_id);
      if (!g) {
        g = {
          legislation_id: r.legislation_id,
          number: r.number,
          title: r.title,
          document_url: r.document_url,
          counts: {},
          total: 0,
          latest: r.checked_at,
          rows: [],
        };
        map.set(r.legislation_id, g);
      }
      g.counts[r.status] = (g.counts[r.status] ?? 0) + 1;
      g.total += 1;
      if (r.checked_at > g.latest) g.latest = r.checked_at;
      g.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.latest < b.latest ? 1 : -1,
    );
  }, [grouped, rows]);

  // Fetch unfiltered totals for the diplomas in view, so the header can show
  // both the filtered counts and the global counts side by side.
  const groupIds = useMemo(
    () => groups.map((g) => g.legislation_id),
    [groups],
  );

  const { data: groupTotals } = useQuery({
    queryKey: ["dre-url-validation-group-totals", groupIds.join(",")],
    enabled: grouped && groupIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("url_validation_results")
        .select("legislation_id,status,checked_at")
        .in("legislation_id", groupIds);
      if (error) throw error;
      const acc = new Map<
        string,
        { counts: Record<string, number>; total: number; latest: string }
      >();
      for (const r of data || []) {
        const id = r.legislation_id as string;
        let a = acc.get(id);
        if (!a) {
          a = { counts: {}, total: 0, latest: r.checked_at as string };
          acc.set(id, a);
        }
        a.counts[r.status as string] = (a.counts[r.status as string] ?? 0) + 1;
        a.total += 1;
        if ((r.checked_at as string) > a.latest)
          a.latest = r.checked_at as string;
      }
      return acc;
    },
  });

  const groupsWithTotals = useMemo<Group[]>(() => {
    if (!grouped) return [];
    if (!groupTotals) return groups;
    return groups.map((g) => {
      const a = groupTotals.get(g.legislation_id);
      return a
        ? {
            ...g,
            countsAll: a.counts,
            totalAll: a.total,
            latestAll: a.latest,
          }
        : g;
    });
  }, [grouped, groups, groupTotals]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStatus = (s: ValidationStatus) => {
    setPage(0);
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const clearFilters = () => {
    setStatuses(["invalid", "timeout", "error"]);
    setFrom(undefined);
    setTo(undefined);
    setSearch("");
    setPage(0);
  };

  const statusBadge = (s: string, code: number | null) => {
    const variant: "default" | "secondary" | "destructive" | "outline" =
      s === "valid"
        ? "default"
        : s === "redirect"
          ? "secondary"
          : s === "invalid" || s === "error" || s === "timeout"
            ? "destructive"
            : "outline";
    return (
      <Badge variant={variant} className="text-[10px] uppercase">
        {s}
        {code ? ` · ${code}` : ""}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Explorador de validações DRE
            </CardTitle>
            <CardDescription>
              Filtra resultados de validação por status, intervalo de datas e
              pesquisa por nº, título ou URL.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status filters */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <ToggleGroup
            type="multiple"
            value={statuses}
            onValueChange={(v) => {
              setPage(0);
              setStatuses(v as ValidationStatus[]);
            }}
            className="flex flex-wrap justify-start gap-1.5"
          >
            {STATUS_OPTIONS.map((opt) => (
              <ToggleGroupItem
                key={opt.value}
                value={opt.value}
                size="sm"
                className={cn(
                  "h-7 px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
                )}
                onClick={() => toggleStatus(opt.value)}
              >
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Date range + search */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-9 justify-start text-left font-normal",
                    !from && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {from ? format(from, "dd/MM/yyyy") : "Início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={from}
                  onSelect={(d) => {
                    setPage(0);
                    setFrom(d ?? undefined);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-9 justify-start text-left font-normal",
                    !to && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {to ? format(to, "dd/MM/yyyy") : "Fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={to}
                  onSelect={(d) => {
                    setPage(0);
                    setTo(d ?? undefined);
                  }}
                  disabled={(d) => (from ? d < from : false)}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Pesquisa</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="nº, título ou URL"
                value={search}
                onChange={(e) => {
                  setPage(0);
                  setSearch(e.target.value);
                }}
                className="pl-8 h-9"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground">
            {isLoading ? (
              "A carregar…"
            ) : (
              <>
                <span className="font-semibold text-foreground">
                  {total.toLocaleString("pt-PT")}
                </span>{" "}
                resultado{total === 1 ? "" : "s"}
                {grouped && (
                  <>
                    {" · "}
                    <span className="font-semibold text-foreground">
                      {groups.length.toLocaleString("pt-PT")}
                    </span>{" "}
                    diploma{groups.length === 1 ? "" : "s"}
                  </>
                )}
                {(from || to || search.trim() || statuses.length < STATUS_OPTIONS.length) && (
                  <> · filtros aplicados</>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant={grouped ? "default" : "outline"}
              size="sm"
              onClick={() => setGrouped((g) => !g)}
              className="h-7 text-xs"
              title="Agrupar por diploma"
            >
              {grouped ? (
                <Layers className="h-3.5 w-3.5 mr-1" />
              ) : (
                <List className="h-3.5 w-3.5 mr-1" />
              )}
              {grouped ? "Agrupado" : "Lista"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-7 text-xs"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Limpar filtros
            </Button>
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="h-[460px] rounded border">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
              A carregar…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Sem resultados para os filtros atuais.
            </div>
          ) : grouped ? (
            <div className="divide-y">
              {groups.map((g) => {
                const isOpen = expanded.has(g.legislation_id);
                return (
                  <Collapsible
                    key={g.legislation_id}
                    open={isOpen}
                    onOpenChange={() => toggleExpanded(g.legislation_id)}
                  >
                    <CollapsibleTrigger className="w-full text-left p-2.5 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="font-medium truncate">
                          {g.number || "—"}
                        </span>
                        <span className="text-muted-foreground truncate flex-1">
                          {g.title || ""}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {g.total} chk
                        </Badge>
                        {STATUS_OPTIONS.filter((o) => g.counts[o.value]).map(
                          (o) => (
                            <Badge
                              key={o.value}
                              variant={
                                o.value === "valid"
                                  ? "default"
                                  : o.value === "redirect"
                                    ? "secondary"
                                    : "destructive"
                              }
                              className="text-[10px] uppercase"
                            >
                              {o.label}: {g.counts[o.value]}
                            </Badge>
                          ),
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {new Date(g.latest).toLocaleString("pt-PT")}
                        </span>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="bg-muted/20 divide-y border-t">
                        {g.rows.map((r) => (
                          <div
                            key={r.id}
                            className="p-2.5 pl-8 text-xs space-y-1"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              {statusBadge(r.status, r.status_code)}
                              {r.cleared && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  Removido
                                </Badge>
                              )}
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {new Date(r.checked_at).toLocaleString("pt-PT")}
                              </span>
                            </div>
                            <a
                              href={r.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline break-all flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              {r.document_url}
                            </a>
                            {r.error_message && (
                              <div className="text-destructive break-words">
                                {r.error_message}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="p-2.5 text-xs space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge(r.status, r.status_code)}
                    {r.cleared && (
                      <Badge variant="outline" className="text-[10px]">
                        Removido
                      </Badge>
                    )}
                    <span className="font-medium truncate">
                      {r.number || "—"}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {r.title || ""}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(r.checked_at).toLocaleString("pt-PT")}
                    </span>
                  </div>
                  <a
                    href={r.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {r.document_url}
                  </a>
                  {r.error_message && (
                    <div className="text-destructive break-words">
                      {r.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || isFetching}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setPage((p) => (p + 1 < totalPages ? p + 1 : p))
                }
                disabled={page + 1 >= totalPages || isFetching}
              >
                Seguinte
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
