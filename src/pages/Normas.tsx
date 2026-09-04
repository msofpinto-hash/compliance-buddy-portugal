import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { IDTopNav } from "@/components/client/IDTopNav";
import { OrganizationSelector } from "@/components/OrganizationSelector";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BookMarked,
  Search,
  ExternalLink,
  Link2,
  FileText,
  ScrollText,
  Mail,
  Zap,
  HeartPulse,
  Flame,
  StickyNote,
  Folder,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StandardRow = {
  id: string;
  organization_id: string;
  reference_period: string;
  period_date: string | null;
  document_type: string | null;
  document_ref: string | null;
  document_name: string | null;
  publication_date: string | null;
  modification_date: string | null;
  issuer: string | null;
  descriptive: string | null;
  actions: string | null;
  responsible: string | null;
  implementation_deadline: string | null;
  implementation_status: string | null;
  impact_iso_14001: boolean;
  impact_iso_45001: boolean;
  applicability_direct: boolean;
  applicability_indirect: boolean;
  applicability_informative: boolean;
  document_url: string | null;
};


type GroupKey =
  | "normas"
  | "despachos"
  | "circulares"
  | "dgeg"
  | "dgs"
  | "anepc"
  | "notas"
  | "outros";

const GROUPS: {
  key: GroupKey;
  label: string;
  icon: React.ElementType;
  hint: string;
}[] = [
  {
    key: "normas",
    label: "Normas",
    icon: BookMarked,
    hint: "Normas portuguesas e europeias (NP, EN, ISO)",
  },
  {
    key: "despachos",
    label: "Despachos",
    icon: ScrollText,
    hint: "Despachos e orientações de entidades",
  },
  {
    key: "circulares",
    label: "Circulares APA",
    icon: Mail,
    hint: "Circulares informativas da APA",
  },
  {
    key: "dgeg",
    label: "DGEG",
    icon: Zap,
    hint: "Despachos e orientações da DGEG (energia)",
  },
  {
    key: "dgs",
    label: "DGS",
    icon: HeartPulse,
    hint: "Orientações e normas da DGS (saúde)",
  },
  {
    key: "anepc",
    label: "ANEPC",
    icon: Flame,
    hint: "Documentos da ANEPC (proteção civil)",
  },
  {
    key: "notas",
    label: "Notas técnicas",
    icon: StickyNote,
    hint: "Notas técnicas, guias e cadernos técnicos",
  },
  { key: "outros", label: "Outros documentos", icon: Folder, hint: "Restantes documentos" },
];

function groupOf(row: StandardRow): GroupKey {
  const ref = (row.document_ref || "").trim().toLowerCase();
  const hay = `${row.document_type || ""} ${row.document_ref || ""} ${
    row.document_name || ""
  }`.toLowerCase();
  // Entidades com pasta própria
  if (hay.includes("circular")) return "circulares";
  if (hay.includes("dgeg")) return "dgeg";
  if (/\bdgs\b/.test(hay)) return "dgs";
  if (hay.includes("anepc") || hay.includes("proteção civil")) return "anepc";
  // Despachos e orientações de entidades
  if (
    hay.includes("despacho") ||
    hay.includes("orienta") ||
    hay.includes("faq") ||
    hay.includes("requisitos de qualificação") ||
    hay.includes("isenção")
  )
    return "despachos";
  // Notas técnicas, guias e cadernos técnicos
  if (
    hay.includes("nota") ||
    hay.includes("guia") ||
    hay.includes("caderno") ||
    hay.includes("informação técnica") ||
    hay.includes("manual")
  )
    return "notas";
  // Normas: referências que começam por NP, EN, ISO, CEN, DNP, CT
  if (
    /^(pr)?(np|en|iso|cen|dnp|ct)\b/.test(ref) ||
    hay.includes("norma") ||
    hay.includes("dnorcol")
  )
    return "normas";
  return "outros";
}

/** Converte datas em texto ("2024", "2024-09-01", "09/2024") num valor ordenável. */
function dateSortKey(value: string | null): string {
  if (!value) return "0000-00-00";
  const iso = value.match(/(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3] || "01"}`;
  const slash = value.match(/(\d{2})[/.](\d{4})/);
  if (slash) return `${slash[2]}-${slash[1]}-01`;
  const year = value.match(/(19|20)\d{2}/);
  if (year) return `${year[0]}-01-01`;
  return "0000-00-00";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const key = dateSortKey(value);
  if (key === "0000-00-00") return value;
  const [y, m, d] = key.split("-");
  return value.length <= 4 ? y : `${d}/${m}/${y}`;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value && value.trim() ? value : "—"}</p>
    </div>
  );
}

export default function Normas() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupKey | "todos">("todos");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"pub-desc" | "pub-asc" | "name-asc">("pub-desc");
  const [detailRow, setDetailRow] = useState<StandardRow | null>(null);
  const [linkRow, setLinkRow] = useState<StandardRow | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: userRoles } = useQuery({
    queryKey: ["user-roles-normas", user?.id, isAdmin],
    queryFn: async () => {
      if (!user?.id) return [];
      if (isAdmin) {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, logo_url")
          .order("name");
        if (error) throw error;
        return (data || []).map((o) => ({ organization_id: o.id, organizations: o }));
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("*, organizations(*)")
        .eq("user_id", user.id)
        .eq("role", "client");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const organizations =
    (userRoles as any[])
      ?.map((r) => ({
        id: r.organization_id as string,
        name: (r.organizations as any)?.name as string,
        logo_url: (r.organizations as any)?.logo_url as string | undefined,
      }))
      .filter((o) => o.id && o.name) || [];

  const currentOrg =
    organizations.find((o) => o.id === selectedOrgId) || organizations[0];

  const { data: rows, isLoading } = useQuery({
    queryKey: ["normas-standards", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg?.id) return [] as StandardRow[];
      // Paginação: o limite padrão (1000) cortaria os registos mais recentes.
      const all: StandardRow[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("standards_control")
          .select("*")
          .eq("organization_id", currentOrg.id)
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all.push(...((data || []) as unknown as StandardRow[]));
        if (!data || data.length < pageSize) break;
      }
      return all;
    },
    enabled: !!currentOrg?.id,
  });

  // Mantém apenas a versão mais recente de cada documento (o histórico
  // completo por mês continua disponível em Auditorias > Controlo de normas).
  const latestRows = useMemo(() => {
    const map = new Map<string, StandardRow>();
    for (const r of rows || []) {
      const key = (r.document_ref || r.document_name || r.id).trim().toLowerCase();
      const prev = map.get(key);
      const keyOf = (x: StandardRow) => x.period_date || x.reference_period || "";
      if (!prev || keyOf(r) > keyOf(prev)) map.set(key, r);
    }
    return Array.from(map.values());
  }, [rows]);

  const latestPeriod = useMemo(() => {
    let best: StandardRow | null = null;
    for (const r of latestRows) {
      if (!best || (r.period_date || "") > (best.period_date || "")) best = r;
    }
    return best?.reference_period || "";
  }, [latestRows]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { todos: latestRows.length };
    for (const r of latestRows) {
      const g = groupOf(r);
      base[g] = (base[g] || 0) + 1;
    }
    return base;
  }, [latestRows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return latestRows
      .filter((r) => (group === "todos" ? true : groupOf(r) === group))
      .filter((r) =>
        !term
          ? true
          : `${r.document_ref || ""} ${r.document_name || ""} ${r.issuer || ""} ${
              r.document_type || ""
            }`
              .toLowerCase()
              .includes(term),
      )
      .sort((a, b) => {
        if (sortMode === "name-asc") {
          const na = (a.document_name || a.document_ref || "").toLowerCase();
          const nb = (b.document_name || b.document_ref || "").toLowerCase();
          if (na !== nb) return na.localeCompare(nb);
        }
        const ka = dateSortKey(a.publication_date || a.period_date);
        const kb = dateSortKey(b.publication_date || b.period_date);
        if (ka !== kb) return sortMode === "pub-asc" ? ka.localeCompare(kb) : kb.localeCompare(ka);
        return (a.document_ref || "").localeCompare(b.document_ref || "");
      });
  }, [latestRows, group, search, sortMode]);


  const applicabilityLabel = (r: StandardRow) => {
    if (r.applicability_direct) return { label: "Aplicável direta", cls: "bg-primary/15 text-primary" };
    if (r.applicability_indirect)
      return { label: "Aplicável indireta", cls: "bg-amber-100 text-amber-800" };
    if (r.applicability_informative)
      return { label: "Informativo", cls: "bg-muted text-muted-foreground" };
    return { label: "Por classificar", cls: "bg-red-100 text-red-700" };
  };

  const implementationStatusBadge = (
    r: StandardRow,
  ): { label: string; cls: string } | null => {
    if (r.applicability_informative) return null;
    const s = (r.implementation_status || "").trim().toLowerCase();
    if (s.includes("implementad"))
      return { label: "Implementado", cls: "bg-green-100 text-green-800 border-0" };
    if (s.includes("em curso") || s.includes("curso"))
      return { label: "Em curso", cls: "bg-amber-100 text-amber-800 border-0" };
    return { label: "Por analisar", cls: "bg-red-100 text-red-700 border-0" };
  };

  const saveLink = async () => {
    if (!linkRow) return;
    setSaving(true);
    const value = linkValue.trim();
    const { error } = await supabase
      .from("standards_control")
      .update({ document_url: value || null } as any)
      .eq("id", linkRow.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível guardar a ligação");
      return;
    }
    toast.success("Ligação guardada");
    setLinkRow(null);
    queryClient.invalidateQueries({ queryKey: ["normas-standards", currentOrg?.id] });
  };

  return (
    <div className="min-h-screen bg-background">
      <IDTopNav
        currentOrg={currentOrg}
        actions={
          organizations.length > 1 ? (
            <OrganizationSelector
              organizations={organizations}
              selectedOrgId={currentOrg?.id || null}
              onSelect={setSelectedOrgId}
            />
          ) : null
        }
      />

      <main className="px-4 lg:px-8 py-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookMarked className="h-6 w-6 text-primary" />
            Normas, Despachos e Notas Técnicas
          </h1>
          <p className="text-sm text-muted-foreground">
            Documentação normativa aplicável, organizada por tipo e ordenada por data de
            publicação.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Navegação por tipo */}
          <aside className="space-y-2">
            <button
              onClick={() => setGroup("todos")}
              className={cn(
                "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                group === "todos"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/40",
              )}
            >
              <span className="flex items-center justify-between text-sm font-medium">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Todos
                </span>
                <Badge variant="secondary">{counts.todos || 0}</Badge>
              </span>
            </button>
            {GROUPS.map((g) => (
              <button
                key={g.key}
                onClick={() => setGroup(g.key)}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border transition-colors",
                  group === g.key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/40",
                )}
              >
                <span className="flex items-center justify-between text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <g.icon className="h-4 w-4 text-primary" /> {g.label}
                  </span>
                  <Badge variant="secondary">{counts[g.key] || 0}</Badge>
                </span>
                <span className="block mt-1 text-xs text-muted-foreground">{g.hint}</span>
              </button>
            ))}
          </aside>

          {/* Lista */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar por referência, título ou emissor…"
                  className="pl-9"
                />
              </div>
              <Badge variant="outline" className="self-center whitespace-nowrap">
                Última versão{latestPeriod ? ` · ${latestPeriod}` : ""}
              </Badge>

              <Select
                value={sortMode}
                onValueChange={(v) => setSortMode(v as typeof sortMode)}
              >
                <SelectTrigger className="w-[200px]">
                  <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Ordenar por…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pub-desc">Data: mais recentes</SelectItem>
                  <SelectItem value="pub-asc">Data: mais antigos</SelectItem>
                  <SelectItem value="name-asc">Título: A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Sem documentos para os filtros escolhidos.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => {
                  const ap = applicabilityLabel(r);
                  const st = implementationStatusBadge(r);
                  return (
                    <Card
                      key={r.id}
                      onClick={() => setDetailRow(r)}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <CardContent className="p-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-primary/10 text-primary border-0">
                            {r.document_ref || "Sem referência"}
                          </Badge>
                          <Badge variant="outline">{r.reference_period}</Badge>
                          <Badge className={cn("border-0", ap.cls)}>{ap.label}</Badge>
                          {st && <Badge className={cn("border-0", st.cls)}>{st.label}</Badge>}
                          <span className="ml-auto text-xs text-muted-foreground">
                            Publicação: {formatDate(r.publication_date)}
                            {r.modification_date
                              ? ` · Modificação: ${formatDate(r.modification_date)}`
                              : ""}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {r.document_name || r.document_type || "Documento sem título"}
                        </p>
                        {r.issuer && (
                          <p className="text-xs text-muted-foreground">Emissor: {r.issuer}</p>
                        )}
                        {r.descriptive && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {r.descriptive}
                          </p>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          {r.document_url ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(
                                  r.document_url as string,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              }}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" /> Abrir documento
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Sem ligação associada
                            </span>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLinkRow(r);
                                setLinkValue(r.document_url || "");
                              }}
                            >
                              <Link2 className="h-4 w-4 mr-2" />
                              {r.document_url ? "Editar ligação" : "Adicionar ligação"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detailRow?.document_ref || "Documento"}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-4 text-sm">
              <p className="font-medium">{detailRow.document_name || "—"}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Tipo" value={detailRow.document_type} />
                <Field label="Emissor" value={detailRow.issuer} />
                <Field label="Período de referência" value={detailRow.reference_period} />
                <Field label="Publicação" value={formatDate(detailRow.publication_date)} />
                <Field label="Modificação" value={formatDate(detailRow.modification_date)} />
                <Field
                  label="Impacto nas normas"
                  value={
                    [
                      detailRow.impact_iso_14001 ? "ISO 14001" : null,
                      detailRow.impact_iso_45001 ? "ISO 45001" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sem impacto assinalado"
                  }
                />
                <Field label="Aplicabilidade" value={applicabilityLabel(detailRow).label} />
                <Field label="Responsável" value={detailRow.responsible} />
                <Field label="Prazo de implementação" value={detailRow.implementation_deadline} />
                {(() => {
                  const st = implementationStatusBadge(detailRow);
                  if (!st) return null;
                  return (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Estado</p>
                      <Badge className={cn("mt-1 border-0", st.cls)}>{st.label}</Badge>
                    </div>
                  );
                })()}
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Descritivo</p>
                <p className="whitespace-pre-wrap rounded-md border border-border p-3 bg-muted/30">
                  {detailRow.descriptive || "—"}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  Ações / comentários
                </p>
                <p className="whitespace-pre-wrap rounded-md border border-border p-3 bg-muted/30">
                  {detailRow.actions || "—"}
                </p>
              </div>

              <div className="flex gap-2">
                {detailRow.document_url && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        detailRow.document_url as string,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <ExternalLink className="h-4 w-4 mr-2" /> Abrir documento
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setLinkValue(detailRow.document_url || "");
                      setLinkRow(detailRow);
                    }}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    {detailRow.document_url ? "Editar ligação" : "Adicionar ligação"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkRow} onOpenChange={(o) => !o && setLinkRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ligação do documento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {linkRow?.document_ref} — {linkRow?.document_name}
          </p>
          <Input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="https://…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkRow(null)}>
              Cancelar
            </Button>
            <Button onClick={saveLink} disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
