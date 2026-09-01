import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  FolderTree,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { IDTopNav } from "@/components/client/IDTopNav";
import { useAuth } from "@/contexts/AuthContext";

const APPLICABILITY_OPTIONS = [
  { value: "aplicavel_direto", label: "Aplicável (direto)" },
  { value: "aplicavel_indireto", label: "Aplicável (indireto)" },
  { value: "aplicavel_condicionado", label: "Aplicável (condicionado)" },
  { value: "informativo", label: "Informativo" },
  { value: "nao_aplicavel", label: "Não aplicável" },
];

const APPLICABILITY_STYLES: Record<string, string> = {
  aplicavel_direto: "bg-primary/10 text-primary border-primary/30",
  aplicavel_indireto: "bg-primary/10 text-primary border-primary/30",
  aplicavel_condicionado: "bg-amber-500/10 text-amber-700 border-amber-300",
  informativo: "bg-muted text-muted-foreground border-border",
  nao_aplicavel: "bg-destructive/10 text-destructive border-destructive/30",
};

type Category = { id: string; name: string; parent_id: string | null; theme_id: string };
type Diploma = { id: string; number: string | null; title: string; origin: string | null };

export default function RequisitosTema() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [themeId, setThemeId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [extracting, setExtracting] = useState(false);

  const { data: themes } = useQuery({
    queryKey: ["req-themes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("themes").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: organizations } = useQuery({
    queryKey: ["req-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const activeThemeId = themeId ?? themes?.[0]?.id ?? null;
  const activeOrgId = orgId ?? organizations?.[0]?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["req-by-descriptor", activeThemeId, activeOrgId],
    enabled: !!activeThemeId,
    queryFn: async () => {
      const { data: cats, error: catError } = await supabase
        .from("theme_categories")
        .select("id, name, parent_id, theme_id")
        .eq("theme_id", activeThemeId!)
        .order("name");
      if (catError) throw catError;
      const categories = (cats || []) as Category[];
      const catIds = categories.map((c) => c.id);
      if (catIds.length === 0) return { categories, byCategory: {}, counts: {}, applicability: {} };

      const { data: maps, error: mapError } = await supabase
        .from("legislation_category_mapping")
        .select("category_id, legislation:legislation_id (id, number, title, origin)")
        .in("category_id", catIds)
        .range(0, 9999);
      if (mapError) throw mapError;

      const byCategory: Record<string, Diploma[]> = {};
      const legIds = new Set<string>();
      for (const row of (maps || []) as any[]) {
        const leg = row.legislation as Diploma | null;
        if (!leg) continue;
        legIds.add(leg.id);
        (byCategory[row.category_id] ||= []).push(leg);
      }

      const ids = Array.from(legIds);
      const counts: Record<string, number> = {};
      const applicability: Record<string, string> = {};

      for (let i = 0; i < ids.length; i += 300) {
        const slice = ids.slice(i, i + 300);
        const { data: reqs, error: reqError } = await supabase
          .from("legal_requirements")
          .select("legislation_id")
          .in("legislation_id", slice)
          .range(0, 49999);
        if (reqError) throw reqError;
        for (const r of reqs || []) counts[r.legislation_id] = (counts[r.legislation_id] || 0) + 1;

        if (activeOrgId) {
          const { data: apps, error: appError } = await supabase
            .from("organization_legislation")
            .select("legislation_id, applicability_type")
            .eq("organization_id", activeOrgId)
            .in("legislation_id", slice);
          if (appError) throw appError;
          for (const a of apps || []) {
            if (a.applicability_type) applicability[a.legislation_id] = a.applicability_type;
          }
        }
      }

      return { categories, byCategory, counts, applicability };
    },
  });

  const setApplicability = useMutation({
    mutationFn: async ({ legislationIds, value }: { legislationIds: string[]; value: string }) => {
      if (!activeOrgId || !user) throw new Error("Selecione um cliente");
      const { data: existing, error: fetchError } = await supabase
        .from("organization_legislation")
        .select("id, legislation_id")
        .eq("organization_id", activeOrgId)
        .in("legislation_id", legislationIds);
      if (fetchError) throw fetchError;

      const existingIds = new Set((existing || []).map((r) => r.legislation_id));
      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from("organization_legislation")
          .update({ applicability_type: value })
          .in("id", existing.map((r) => r.id));
        if (error) throw error;
      }
      const toInsert = legislationIds
        .filter((id) => !existingIds.has(id))
        .map((id) => ({
          legislation_id: id,
          organization_id: activeOrgId,
          applicability_type: value,
          assigned_by: user.id,
        }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("organization_legislation").insert(toInsert);
        if (error) throw error;
      }
      return legislationIds.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} diploma(s) atualizado(s)`);
      queryClient.invalidateQueries({ queryKey: ["req-by-descriptor"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-applicability"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runExtraction = async () => {
    setExtracting(true);
    try {
      const { error } = await supabase.functions.invoke("extract-requirements-background", {
        body: { limit: 40, force: true },
      });
      if (error) throw error;
      toast.success("Extração de requisitos lançada em segundo plano");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível lançar a extração");
    } finally {
      setExtracting(false);
    }
  };

  const roots = useMemo(
    () => (data?.categories || []).filter((c) => !c.parent_id),
    [data],
  );

  const childrenOf = (id: string) => (data?.categories || []).filter((c) => c.parent_id === id);

  const diplomasOf = (categoryId: string): Diploma[] => {
    const direct = data?.byCategory?.[categoryId] || [];
    const nested = childrenOf(categoryId).flatMap((c) => diplomasOf(c.id));
    const all = [...direct, ...nested];
    const seen = new Set<string>();
    return all.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  };

  const matches = (d: Diploma) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${d.number || ""} ${d.title}`.toLowerCase().includes(q);
  };

  const totals = useMemo(() => {
    const all = roots.flatMap((r) => diplomasOf(r.id));
    const seen = new Set<string>();
    const unique = all.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
    const withReq = unique.filter((d) => (data?.counts?.[d.id] || 0) > 0).length;
    const requisitos = unique.reduce((sum, d) => sum + (data?.counts?.[d.id] || 0), 0);
    const semAplicabilidade = unique.filter((d) => !data?.applicability?.[d.id]).length;
    return { diplomas: unique.length, withReq, requisitos, semAplicabilidade };
  }, [roots, data]);

  const pct = totals.diplomas ? Math.round((totals.withReq / totals.diplomas) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <RouteSeo />
      <IDTopNav />

      <main className="container mx-auto space-y-4 px-4 py-6">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Requisitos por descritor</h1>
          <p className="text-sm text-muted-foreground">
            Estado da extração de requisitos e aplicabilidade do cliente, tema a tema.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={activeThemeId || undefined} onValueChange={setThemeId}>
                <SelectTrigger className="h-9 w-[220px]">
                  <SelectValue placeholder="Tema" />
                </SelectTrigger>
                <SelectContent>
                  {(themes || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={activeOrgId || undefined} onValueChange={setOrgId}>
                <SelectTrigger className="h-9 w-[260px]">
                  <SelectValue placeholder="Cliente" />
                </SelectTrigger>
                <SelectContent>
                  {(organizations || []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar diploma…"
                  className="h-9 w-[240px] pl-8"
                />
              </div>

              <Button size="sm" variant="outline" className="h-9" onClick={runExtraction} disabled={extracting}>
                {extracting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Extrair requisitos em falta
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>
                <strong>{totals.diplomas}</strong> diplomas
              </span>
              <span>
                <strong>{totals.requisitos}</strong> requisitos extraídos
              </span>
              <span className="text-muted-foreground">
                {totals.withReq}/{totals.diplomas} com requisitos ({pct}%)
              </span>
              {totals.semAplicabilidade > 0 && (
                <Badge variant="outline" className="border-amber-300 bg-amber-500/10 text-amber-700">
                  {totals.semAplicabilidade} sem aplicabilidade
                </Badge>
              )}
            </div>
            <Progress value={pct} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderTree className="h-4 w-4 text-primary" />
              Descritores
            </CardTitle>
            <CardDescription>
              Expanda um descritor para ver os diplomas, os requisitos extraídos e corrigir a
              aplicabilidade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-420px)] pr-2">
                <Accordion type="multiple" className="space-y-1">
                  {roots.map((root) => {
                    const diplomas = diplomasOf(root.id).filter(matches);
                    const withReq = diplomas.filter((d) => (data?.counts?.[d.id] || 0) > 0).length;
                    return (
                      <AccordionItem key={root.id} value={root.id} className="rounded-lg border px-3">
                        <AccordionTrigger className="py-2 text-sm hover:no-underline">
                          <div className="flex flex-1 flex-wrap items-center gap-2 pr-2 text-left">
                            <span className="font-medium">{root.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {diplomas.length} diplomas
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                withReq === diplomas.length && diplomas.length > 0
                                  ? "border-primary/30 bg-primary/10 text-primary"
                                  : "border-amber-300 bg-amber-500/10 text-amber-700"
                              }`}
                            >
                              {withReq}/{diplomas.length} com requisitos
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          {activeOrgId && diplomas.length > 0 && (
                            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs">
                              <span className="font-medium">Corrigir todos ({diplomas.length}):</span>
                              {APPLICABILITY_OPTIONS.map((o) => (
                                <Button
                                  key={o.value}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={setApplicability.isPending}
                                  onClick={() =>
                                    setApplicability.mutate({
                                      legislationIds: diplomas.map((d) => d.id),
                                      value: o.value,
                                    })
                                  }
                                >
                                  {o.label}
                                </Button>
                              ))}
                            </div>
                          )}

                          <div className="space-y-1">
                            {diplomas.map((d) => (
                              <DiplomaRow
                                key={d.id}
                                diploma={d}
                                count={data?.counts?.[d.id] || 0}
                                applicability={data?.applicability?.[d.id]}
                                orgId={activeOrgId}
                                onApplicabilityChange={(value) =>
                                  setApplicability.mutate({ legislationIds: [d.id], value })
                                }
                              />
                            ))}
                            {diplomas.length === 0 && (
                              <p className="py-2 text-xs text-muted-foreground">Sem diplomas.</p>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

type DiplomaRowProps = {
  diploma: Diploma;
  count: number;
  applicability?: string;
  orgId: string | null;
  onApplicabilityChange: (value: string) => void;
};

function DiplomaRow({
  diploma,
  count,
  applicability,
  orgId,
  onApplicabilityChange,
}: DiplomaRowProps) {
  const [open, setOpen] = useState(false);

  const { data: requisitos, isLoading } = useQuery({
    queryKey: ["req-list", diploma.id, orgId],
    enabled: open,
    queryFn: async () => {
      const { data: reqs, error } = await supabase
        .from("legal_requirements")
        .select("id, article, requirement_text, display_order")
        .eq("legislation_id", diploma.id)
        .order("display_order", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;

      const status: Record<string, { applicability_type: string | null; compliance_status: string | null }> = {};
      if (orgId && reqs && reqs.length > 0) {
        const { data: apps, error: appError } = await supabase
          .from("applicabilities")
          .select("requirement_id, applicability_type, compliance_status")
          .eq("organization_id", orgId)
          .in("requirement_id", reqs.map((r) => r.id));
        if (appError) throw appError;
        for (const a of apps || []) {
          status[a.requirement_id] = {
            applicability_type: a.applicability_type,
            compliance_status: a.compliance_status,
          };
        }
      }
      return { reqs: reqs || [], status };
    },
  });

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-2 p-2 text-xs">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 shrink-0 p-0"
          onClick={() => setOpen((v) => !v)}
          disabled={count === 0}
          aria-label={open ? "Fechar requisitos" : "Ver requisitos"}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <Badge variant="outline" className="shrink-0 text-[11px]">
          {diploma.origin === "EU" || diploma.origin === "eurlex" ? "UE" : "PT"}
        </Badge>
        <span className="font-medium">{diploma.number}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{diploma.title}</span>
        {count > 0 ? (
          <Badge variant="outline" className="shrink-0 border-primary/30 bg-primary/10 text-primary">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {count} requisitos
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 border-amber-300 bg-amber-500/10 text-amber-700"
          >
            <AlertTriangle className="mr-1 h-3 w-3" />
            Sem requisitos
          </Badge>
        )}
        {orgId && (
          <Select value={applicability || undefined} onValueChange={onApplicabilityChange}>
            <SelectTrigger
              className={`h-7 w-[190px] text-xs ${
                applicability ? APPLICABILITY_STYLES[applicability] || "" : "border-dashed"
              }`}
            >
              <SelectValue placeholder="Sem aplicabilidade" />
            </SelectTrigger>
            <SelectContent>
              {APPLICABILITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {open && (
        <div className="space-y-1 border-t bg-muted/30 p-2">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> A carregar requisitos…
            </div>
          ) : (
            (requisitos?.reqs || []).map((r) => {
              const st = requisitos?.status?.[r.id];
              return (
                <div key={r.id} className="rounded-md border bg-card p-2 text-xs">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[11px]">
                      {r.article || "Requisito"}
                    </Badge>
                    {st?.applicability_type && (
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${APPLICABILITY_STYLES[st.applicability_type] || ""}`}
                      >
                        {APPLICABILITY_OPTIONS.find((o) => o.value === st.applicability_type)?.label ||
                          st.applicability_type}
                      </Badge>
                    )}
                    {st?.compliance_status && (
                      <Badge variant="outline" className="text-[11px]">
                        {st.compliance_status.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {!st && (
                      <Badge
                        variant="outline"
                        className="border-dashed text-[11px] text-muted-foreground"
                      >
                        Por avaliar
                      </Badge>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-muted-foreground">{r.requirement_text}</p>
                </div>
              );
            })
          )}
          {!isLoading && (requisitos?.reqs || []).length === 0 && (
            <p className="py-1 text-xs text-muted-foreground">Sem requisitos extraídos.</p>
          )}
        </div>
      )}
    </div>
  );
}
