import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { IDTopNav } from "@/components/client/IDTopNav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/openExternalUrl";

type Row = {
  id: string;
  number: string;
  title: string;
  origin: string | null;
  document_type: string | null;
  publication_date: string | null;
  effective_date: string | null;
  revocation_date: string | null;
  document_url: string | null;
};

type Status = "futuro" | "vigor" | "cessa" | "revogado" | "indefinido";

const STATUS_META: Record<Status, { label: string; icon: React.ElementType; className: string }> = {
  futuro: { label: "Entra em vigor", icon: Clock, className: "bg-blue-50 text-blue-700 border-blue-200" },
  vigor: { label: "Em vigor", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cessa: { label: "Cessa em breve", icon: AlertTriangle, className: "bg-amber-50 text-amber-700 border-amber-200" },
  revogado: { label: "Revogado", icon: Ban, className: "bg-rose-50 text-rose-700 border-rose-200" },
  indefinido: { label: "Sem data", icon: HelpCircle, className: "bg-muted text-muted-foreground border-border" },
};

const fmt = (d: string | null) => (d ? format(parseISO(d), "dd/MM/yyyy", { locale: pt }) : "—");

function classify(row: Row, today: Date): { status: Status; days: number | null } {
  const eff = row.effective_date ? parseISO(row.effective_date) : null;
  const rev = row.revocation_date ? parseISO(row.revocation_date) : null;

  if (rev) {
    const d = differenceInCalendarDays(rev, today);
    if (d < 0) return { status: "revogado", days: d };
    return { status: "cessa", days: d };
  }
  if (eff) {
    const d = differenceInCalendarDays(eff, today);
    if (d > 0) return { status: "futuro", days: d };
    return { status: "vigor", days: d };
  }
  return { status: "indefinido", days: null };
}

export default function Vigencia() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [originFilter, setOriginFilter] = useState<"all" | "PT" | "EU">("all");
  const [horizon, setHorizon] = useState("90");

  const today = useMemo(() => new Date(), []);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["vigencia-legislation"],
    queryFn: async () => {
      const all: Row[] = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await supabase
          .from("legislation")
          .select("id, number, title, origin, document_type, publication_date, effective_date, revocation_date, document_url")
          .order("effective_date", { ascending: false, nullsFirst: false })
          .range(from, from + size - 1);
        if (error) throw error;
        all.push(...((data ?? []) as Row[]));
        if (!data || data.length < size) break;
      }
      return all;
    },
  });

  const enriched = useMemo(() => {
    return (rows ?? []).map((r) => ({ ...r, ...classify(r, today) }));
  }, [rows, today]);

  const horizonDays = Number(horizon);

  const upcoming = useMemo(() => {
    return enriched
      .filter(
        (r) =>
          (r.status === "futuro" || r.status === "cessa") &&
          r.days !== null &&
          r.days >= 0 &&
          r.days <= horizonDays,
      )
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  }, [enriched, horizonDays]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { futuro: 0, vigor: 0, cessa: 0, revogado: 0, indefinido: 0 };
    enriched.forEach((r) => { c[r.status] += 1; });
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
      .filter((r) => {
        if (originFilter === "all") return true;
        const eu = r.origin === "EU" || r.origin === "eurlex";
        return originFilter === "EU" ? eu : !eu;
      })
      .filter((r) =>
        !q ? true : `${r.number} ${r.title}`.toLowerCase().includes(q),
      )
      .sort((a, b) => (b.effective_date ?? "").localeCompare(a.effective_date ?? ""))
      .slice(0, 300);
  }, [enriched, search, statusFilter, originFilter]);

  return (
    <div className="min-h-screen bg-background">
      <IDTopNav />

      <main className="container mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <CalendarClock className="h-6 w-6 text-primary" />
            Vigência dos diplomas
          </h1>
          <p className="text-sm text-muted-foreground">
            Quando cada diploma entra em vigor, quando cessa e o que está para acontecer nos próximos dias.
          </p>
        </header>

        {/* Resumo */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(Object.keys(STATUS_META) as Status[]).map((s) => {
            const meta = STATUS_META[s];
            const Icon = meta.icon;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  meta.className,
                  statusFilter === s && "ring-2 ring-primary/40",
                )}
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </div>
                <div className="mt-1 text-2xl font-bold">{counts[s]}</div>
              </button>
            );
          })}
        </div>

        {/* Alertas */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Próximas alterações
              </h2>
              <Select value={horizon} onValueChange={setHorizon}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Próximos 30 dias</SelectItem>
                  <SelectItem value="90">Próximos 90 dias</SelectItem>
                  <SelectItem value="180">Próximos 6 meses</SelectItem>
                  <SelectItem value="365">Próximo ano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nada previsto neste período.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 20).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2"
                  >
                    <Badge variant="outline" className={STATUS_META[r.status].className}>
                      {r.status === "futuro" ? "Entra em vigor" : "Cessa"}
                    </Badge>
                    <Link
                      to={`/legislacao/${r.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {r.number}
                    </Link>
                    <span className="text-sm text-muted-foreground truncate max-w-[38rem]">
                      {r.title}
                    </span>
                    <span className="ml-auto text-xs font-medium text-amber-800">
                      {r.days === 0 ? "hoje" : `daqui a ${r.days} dia(s)`} ·{" "}
                      {fmt(r.status === "futuro" ? r.effective_date : r.revocation_date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar diploma..."
              className="pl-9"
            />
          </div>
          <Select value={originFilter} onValueChange={(v) => setOriginFilter(v as typeof originFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="PT">Nacional</SelectItem>
              <SelectItem value="EU">Europeia</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              <SelectItem value="vigor">Em vigor</SelectItem>
              <SelectItem value="futuro">Entra em vigor</SelectItem>
              <SelectItem value="cessa">Cessa em breve</SelectItem>
              <SelectItem value="revogado">Revogado</SelectItem>
              <SelectItem value="indefinido">Sem data</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Diploma</th>
                      <th className="px-4 py-3 whitespace-nowrap">Publicação</th>
                      <th className="px-4 py-3 whitespace-nowrap">Entra em vigor</th>
                      <th className="px-4 py-3 whitespace-nowrap">Cessa / Revogado</th>
                      <th className="px-4 py-3 whitespace-nowrap">Estado</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const meta = STATUS_META[r.status];
                      return (
                        <tr key={r.id} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <Link to={`/legislacao/${r.id}`} className="font-medium hover:underline">
                              {r.number}
                            </Link>
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[34rem]">
                              {r.title}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{fmt(r.publication_date)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{fmt(r.effective_date)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{fmt(r.revocation_date)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant="outline" className={meta.className}>
                              {meta.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.document_url && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Abrir fonte oficial de ${r.number}`}
                                onClick={() => openExternalUrl(r.document_url!)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                          Nenhum diploma corresponde aos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
