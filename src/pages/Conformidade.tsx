import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  ClipboardCheck,
  Download,
  FileText,
  Paperclip,
  Search,
} from "lucide-react";

interface EvidenceFile {
  name: string;
  path: string;
  uploadedAt?: string;
}

interface Row {
  id: string;
  compliance_status: string | null;
  applicability_type: string | null;
  is_applicable: boolean;
  notes: string | null;
  evidence: EvidenceFile[];
  requirementText: string;
  article: string | null;
  legislationId: string | null;
  legislationTitle: string;
  legislationNumber: string;
}

const STATUS_STYLES: Record<string, string> = {
  conforme: "border-primary/40 bg-primary/10 text-primary",
  nao_conforme: "border-destructive/40 bg-destructive/10 text-destructive",
  "não conforme": "border-destructive/40 bg-destructive/10 text-destructive",
  parcial: "border-accent/50 bg-accent/15 text-accent-foreground",
  nao_aplicavel: "border-muted-foreground/30 bg-muted text-muted-foreground",
  pendente: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  conforme: "Conforme",
  nao_conforme: "Não conforme",
  parcial: "Parcialmente conforme",
  nao_aplicavel: "Não aplicável",
  pendente: "Por avaliar",
};

function statusKey(value: string | null) {
  return (value || "pendente").toLowerCase();
}

function parseEvidence(files: string[] | null): EvidenceFile[] {
  if (!files) return [];
  return files.map((f) => {
    try {
      const parsed = typeof f === "string" ? JSON.parse(f) : f;
      return { name: parsed.name ?? f, path: parsed.path ?? f, uploadedAt: parsed.uploadedAt };
    } catch {
      return { name: f, path: f };
    }
  });
}

export default function Conformidade() {
  const { user, isAdmin } = useAuth();
  const [orgId, setOrgId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data: organizations, isLoading: loadingOrgs } = useQuery({
    queryKey: ["conformidade-orgs", user?.id, isAdmin],
    enabled: !!user,
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.from("organizations").select("id, name").order("name");
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("organization_id, organizations(id, name)")
        .eq("user_id", user!.id)
        .not("organization_id", "is", null);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.organizations as { id: string; name: string } | null)
        .filter((o): o is { id: string; name: string } => !!o);
    },
  });

  useEffect(() => {
    if (!orgId && organizations?.length) setOrgId(organizations[0].id);
  }, [organizations, orgId]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["conformidade-rows", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applicabilities")
        .select(
          `id, compliance_status, applicability_type, is_applicable, notes, evidence_files,
           legal_requirements(id, article, requirement_text, legislation(id, number, title))`,
        )
        .eq("organization_id", orgId)
        .limit(2000);
      if (error) throw error;

      return (data ?? []).map((item) => {
        const req = item.legal_requirements as {
          article: string | null;
          requirement_text: string;
          legislation: { id: string; number: string; title: string } | null;
        } | null;
        return {
          id: item.id,
          compliance_status: item.compliance_status,
          applicability_type: item.applicability_type,
          is_applicable: item.is_applicable,
          notes: item.notes,
          evidence: parseEvidence(item.evidence_files as string[] | null),
          requirementText: req?.requirement_text ?? "—",
          article: req?.article ?? null,
          legislationId: req?.legislation?.id ?? null,
          legislationTitle: req?.legislation?.title ?? "Diploma sem título",
          legislationNumber: req?.legislation?.number ?? "—",
        } as Row;
      });
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (status !== "all" && statusKey(r.compliance_status) !== status) return false;
      if (!term) return true;
      return (
        r.requirementText.toLowerCase().includes(term) ||
        r.legislationTitle.toLowerCase().includes(term) ||
        r.legislationNumber.toLowerCase().includes(term)
      );
    });
  }, [rows, search, status]);

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; number: string; id: string | null; items: Row[] }>();
    filtered.forEach((r) => {
      const key = r.legislationId ?? r.legislationNumber;
      if (!map.has(key)) {
        map.set(key, { title: r.legislationTitle, number: r.legislationNumber, id: r.legislationId, items: [] });
      }
      map.get(key)!.items.push(r);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    const total = rows?.length ?? 0;
    const count = (k: string) => (rows ?? []).filter((r) => statusKey(r.compliance_status) === k).length;
    return {
      total,
      conforme: count("conforme"),
      naoConforme: count("nao_conforme"),
      pendente: total - count("conforme") - count("nao_conforme"),
      evidencias: (rows ?? []).reduce((acc, r) => acc + r.evidence.length, 0),
    };
  }, [rows]);

  const downloadEvidence = async (file: EvidenceFile) => {
    const { data, error } = await supabase.storage
      .from("requirement-documents")
      .createSignedUrl(file.path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir a evidência");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to={isAdmin ? "/admin" : "/cliente"}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Voltar
          </Link>
        </Button>

        <header className="mb-6">
          <h1 className="flex items-center gap-2 font-heading text-3xl font-bold text-foreground">
            <ClipboardCheck className="h-7 w-7 text-primary" aria-hidden="true" />
            Conformidade por cliente
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Estado de cada requisito legal aplicável e evidências anexadas. Visível apenas à equipa ID Compliance
            e à própria organização.
          </p>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Requisitos", value: stats.total },
            { label: "Conformes", value: stats.conforme },
            { label: "Não conformes", value: stats.naoConforme },
            { label: "Evidências anexadas", value: stats.evidencias },
          ].map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="org" className="sr-only">
              Organização
            </label>
            <Select value={orgId} onValueChange={setOrgId} disabled={loadingOrgs}>
              <SelectTrigger id="org">
                <SelectValue placeholder="Selecionar organização" />
              </SelectTrigger>
              <SelectContent>
                {organizations?.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar requisito ou diploma"
              className="pl-9"
              aria-label="Pesquisar requisito ou diploma"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              <SelectItem value="conforme">Conforme</SelectItem>
              <SelectItem value="nao_conforme">Não conforme</SelectItem>
              <SelectItem value="parcial">Parcialmente conforme</SelectItem>
              <SelectItem value="nao_aplicavel">Não aplicável</SelectItem>
              <SelectItem value="pendente">Por avaliar</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !grouped.length ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Sem requisitos para os filtros selecionados.
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {grouped.map(([key, group]) => (
              <AccordionItem key={key} value={key} className="rounded-lg border bg-card px-4">
                <AccordionTrigger className="text-left">
                  <div className="flex flex-1 flex-wrap items-center gap-2 pr-2">
                    <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="font-medium">{group.title}</span>
                    <Badge variant="outline">{group.number}</Badge>
                    <Badge variant="secondary">{group.items.length} requisitos</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-3">
                    {group.items.map((r) => {
                      const k = statusKey(r.compliance_status);
                      return (
                        <li key={r.id} className="rounded-md border bg-background p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {r.article && <Badge variant="outline">{r.article}</Badge>}
                            <Badge
                              variant="outline"
                              className={STATUS_STYLES[k] ?? STATUS_STYLES.pendente}
                            >
                              {STATUS_LABELS[k] ?? r.compliance_status}
                            </Badge>
                            {r.applicability_type && (
                              <Badge variant="secondary">{r.applicability_type}</Badge>
                            )}
                            {!r.is_applicable && <Badge variant="outline">Não aplicável</Badge>}
                          </div>
                          <p className="whitespace-pre-line text-sm text-foreground">{r.requirementText}</p>
                          {r.notes && (
                            <p className="mt-2 rounded bg-muted p-2 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">Notas: </span>
                              {r.notes}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Paperclip className="h-3 w-3" aria-hidden="true" />
                              {r.evidence.length} evidência(s)
                            </span>
                            {r.evidence.map((file) => (
                              <Button
                                key={file.path}
                                size="sm"
                                variant="outline"
                                onClick={() => downloadEvidence(file)}
                              >
                                <Download className="mr-1 h-3 w-3" aria-hidden="true" />
                                {file.name}
                              </Button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}
