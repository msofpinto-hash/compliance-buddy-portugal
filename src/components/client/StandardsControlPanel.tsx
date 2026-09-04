import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookMarked,
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Download,
  Upload,
  History,
  Link2,
} from "lucide-react";
import { StandardsHistoryDialog } from "./StandardsHistoryDialog";
import { StandardsImportDialog } from "./StandardsImportDialog";


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
  impact_iso_14001: boolean;
  impact_iso_45001: boolean;
  applicability_informative: boolean;
  applicability_direct: boolean;
  applicability_indirect: boolean;
  descriptive: string | null;
  actions: string | null;
  responsible: string | null;
  implementation_deadline: string | null;
  implementation_status: string | null;
  display_order: number | null;
};

const emptyRow = (
  organization_id: string,
  reference_period: string,
): Partial<StandardRow> => ({
  organization_id,
  reference_period,
  document_type: "",
  document_ref: "",
  document_name: "",
  publication_date: "",
  modification_date: "",
  issuer: "",
  impact_iso_14001: false,
  impact_iso_45001: false,
  applicability_informative: false,
  applicability_direct: false,
  applicability_indirect: false,
  descriptive: "",
  actions: "",
  responsible: "",
  implementation_deadline: "",
  implementation_status: "",
});

type AuditLite = {
  id: string;
  title: string;
  audit_date: string | null;
  audit_type: string | null;
  status: string;
};

type AuditLink = { id: string; standard_id: string; audit_id: string };

interface Props {
  organizationId?: string;
  canEdit?: boolean;
}


export function StandardsControlPanel({
  organizationId,
  canEdit = false,
}: Props) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<string>("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [applicabilityFilter, setApplicabilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<Partial<StandardRow> | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [linkingRow, setLinkingRow] = useState<StandardRow | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["standards-control", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as StandardRow[];
      const { data, error } = await supabase
        .from("standards_control")
        .select("*")
        .eq("organization_id", organizationId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as StandardRow[];
    },
    enabled: !!organizationId,
  });

  const { data: orgAudits } = useQuery({
    queryKey: ["standards-org-audits", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as AuditLite[];
      const { data, error } = await supabase
        .from("audits")
        .select("id, title, audit_date, audit_type, status")
        .eq("organization_id", organizationId)
        .order("audit_date", { ascending: false });
      if (error) throw error;
      return (data || []) as AuditLite[];
    },
    enabled: !!organizationId,
  });

  const standardIds = useMemo(() => (rows || []).map((r) => r.id), [rows]);

  const { data: manualLinks } = useQuery({
    queryKey: ["standards-audit-links", organizationId, standardIds.length],
    queryFn: async () => {
      if (!standardIds.length) return [] as AuditLink[];
      const out: AuditLink[] = [];
      for (let i = 0; i < standardIds.length; i += 200) {
        const { data, error } = await supabase
          .from("standards_control_audits")
          .select("id, standard_id, audit_id")
          .in("standard_id", standardIds.slice(i, i + 200));
        if (error) throw error;
        out.push(...((data || []) as AuditLink[]));
      }
      return out;
    },
    enabled: standardIds.length > 0,
  });

  const auditsForRow = (r: StandardRow): AuditLite[] => {
    const list = orgAudits || [];
    const manual = (manualLinks || [])
      .filter((l) => l.standard_id === r.id)
      .map((l) => list.find((a) => a.id === l.audit_id))
      .filter(Boolean) as AuditLite[];
    const auto = list.filter((a) => {
      if (manual.some((m) => m.id === a.id)) return false;
      if (!a.audit_date) return false;
      const title = (a.title || "").toLowerCase();
      if (title.includes(r.reference_period.toLowerCase())) return true;
      if (!r.period_date) return false;
      return a.audit_date.slice(0, 7) === r.period_date.slice(0, 7);
    });
    return [...manual, ...auto];
  };

  const toggleLink = useMutation({
    mutationFn: async ({
      standardId,
      auditId,
      linked,
    }: {
      standardId: string;
      auditId: string;
      linked: boolean;
    }) => {
      if (linked) {
        const { error } = await supabase
          .from("standards_control_audits")
          .delete()
          .eq("standard_id", standardId)
          .eq("audit_id", auditId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("standards_control_audits")
          .insert({ standard_id: standardId, audit_id: auditId });
        if (error) throw error;
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["standards-audit-links"] }),
    onError: () => toast.error("Não foi possível atualizar a ligação"),
  });


  const periods = useMemo(
    () => Array.from(new Set((rows || []).map((r) => r.reference_period))),
    [rows],
  );
  const activePeriod = period || periods[0] || "";

  const types = useMemo(
    () =>
      Array.from(
        new Set(
          (rows || [])
            .filter((r) => r.reference_period === activePeriod)
            .map((r) => r.document_type)
            .filter(Boolean) as string[],
        ),
      ),
    [rows, activePeriod],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (activePeriod && r.reference_period !== activePeriod) return false;
      if (typeFilter !== "all" && r.document_type !== typeFilter) return false;
      if (applicabilityFilter === "direta" && !r.applicability_direct)
        return false;
      if (applicabilityFilter === "indireta" && !r.applicability_indirect)
        return false;
      if (applicabilityFilter === "informativo" && !r.applicability_informative)
        return false;
      if (
        statusFilter === "implementado" &&
        (r.implementation_status || "").toLowerCase() !== "implementado"
      )
        return false;
      if (statusFilter === "pendente" && r.implementation_status) return false;
      if (!term) return true;
      return [
        r.document_ref,
        r.document_name,
        r.document_type,
        r.issuer,
        r.descriptive,
        r.actions,
        r.responsible,
      ]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term));
    });
  }, [rows, activePeriod, typeFilter, applicabilityFilter, statusFilter, search]);

  const saveRow = useMutation({
    mutationFn: async (row: Partial<StandardRow>) => {
      const payload = {
        organization_id: row.organization_id || organizationId,
        reference_period: row.reference_period || activePeriod || "Sem período",
        document_type: row.document_type || null,
        document_ref: row.document_ref || null,
        document_name: row.document_name || null,
        publication_date: row.publication_date || null,
        modification_date: row.modification_date || null,
        issuer: row.issuer || null,
        impact_iso_14001: !!row.impact_iso_14001,
        impact_iso_45001: !!row.impact_iso_45001,
        applicability_informative: !!row.applicability_informative,
        applicability_direct: !!row.applicability_direct,
        applicability_indirect: !!row.applicability_indirect,
        descriptive: row.descriptive || null,
        actions: row.actions || null,
        responsible: row.responsible || null,
        implementation_deadline: row.implementation_deadline || null,
        implementation_status: row.implementation_status || null,
      };
      if (row.id) {
        const { data, error } = await supabase
          .from("standards_control")
          .update(payload)
          .eq("id", row.id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Sem permissão para guardar este registo.");
      } else {
        const { error } = await supabase
          .from("standards_control")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Registo guardado");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["standards-control"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível guardar"),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("standards_control")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registo eliminado");
      queryClient.invalidateQueries({ queryKey: ["standards-control"] });
    },
    onError: () => toast.error("Não foi possível eliminar"),
  });

  const exportCsv = () => {
    const headers = [
      "Tipo de documento",
      "Refª Documento",
      "Nome do documento",
      "Data de publicação",
      "Data modificação",
      "Emissor",
      "ISO 14001",
      "ISO 45001",
      "Informativo",
      "Aplicabilidade Direta",
      "Aplicabilidade Indireta",
      "Descritivo",
      "Ações a implementar",
      "Responsável",
      "Prazo/Data de Implementação",
      "Estado de Implementação",
    ];
    const escape = (v: unknown) =>
      `"${String(v ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
    const csv = [
      headers.join(";"),
      ...filtered.map((r) =>
        [
          r.document_type,
          r.document_ref,
          r.document_name,
          r.publication_date,
          r.modification_date,
          r.issuer,
          r.impact_iso_14001 ? "x" : "",
          r.impact_iso_45001 ? "x" : "",
          r.applicability_informative ? "x" : "",
          r.applicability_direct ? "x" : "",
          r.applicability_indirect ? "x" : "",
          r.descriptive,
          r.actions,
          r.responsible,
          r.implementation_deadline,
          r.implementation_status,
        ]
          .map(escape)
          .join(";"),
      ),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Controlo de normas - ${activePeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const implemented = filtered.filter(
    (r) => (r.implementation_status || "").toLowerCase() === "implementado",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BookMarked className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">
              Controlo de Normas, Despachos e Notas Técnicas
            </h2>
            <p className="text-sm text-muted-foreground">
              {filtered.length} registos · {implemented} implementados
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setHistoryFor(null);
              setHistoryOpen(true);
            }}
          >
            <History className="h-4 w-4" />
            Histórico
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          {canEdit && organizationId && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="h-4 w-4" />
                Carregar Excel
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={() =>
                  setEditing(emptyRow(organizationId, activePeriod || "Junho 2026"))
                }
              >
                <Plus className="h-4 w-4" />
                Novo registo
              </Button>
            </>
          )}

        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Pesquisar norma, emissor, ação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={activePeriod} onValueChange={setPeriod}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Tipo de documento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t.length > 45 ? `${t.slice(0, 45)}…` : t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={applicabilityFilter} onValueChange={setApplicabilityFilter}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Aplicabilidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda a aplicabilidade</SelectItem>
            <SelectItem value="direta">Aplicabilidade direta</SelectItem>
            <SelectItem value="indireta">Aplicabilidade indireta</SelectItem>
            <SelectItem value="informativo">Informativo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="implementado">Implementado</SelectItem>
            <SelectItem value="pendente">Sem estado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Sem registos para os filtros selecionados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[170px]">Tipo</TableHead>
                    <TableHead className="min-w-[150px]">Refª</TableHead>
                    <TableHead className="min-w-[260px]">Documento</TableHead>
                    <TableHead>Publicação</TableHead>
                    <TableHead>Modificação</TableHead>
                    <TableHead>Emissor</TableHead>
                    <TableHead className="text-center">14001</TableHead>
                    <TableHead className="text-center">45001</TableHead>
                    <TableHead className="min-w-[130px]">Aplicabilidade</TableHead>
                    <TableHead className="min-w-[220px]">Descritivo</TableHead>
                    <TableHead className="min-w-[220px]">Ações</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead className="min-w-[120px]">Estado</TableHead>
                    {canEdit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} className="align-top">
                      <TableCell className="text-xs">{r.document_type}</TableCell>
                      <TableCell className="text-xs font-medium">
                        {r.document_ref}
                      </TableCell>
                      <TableCell className="text-xs">{r.document_name}</TableCell>
                      <TableCell className="text-xs">
                        {r.publication_date}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.modification_date}
                      </TableCell>
                      <TableCell className="text-xs">{r.issuer}</TableCell>
                      <TableCell className="text-center text-xs">
                        {r.impact_iso_14001 ? "x" : ""}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {r.impact_iso_45001 ? "x" : ""}
                      </TableCell>
                      <TableCell className="space-y-1">
                        {r.applicability_direct && (
                          <Badge variant="outline" className="text-[10px]">
                            Direta
                          </Badge>
                        )}
                        {r.applicability_indirect && (
                          <Badge variant="outline" className="text-[10px]">
                            Indireta
                          </Badge>
                        )}
                        {r.applicability_informative && (
                          <Badge variant="outline" className="text-[10px]">
                            Informativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-pre-wrap">
                        {r.descriptive}
                      </TableCell>
                      <TableCell className="text-xs whitespace-pre-wrap">
                        {r.actions}
                      </TableCell>
                      <TableCell className="text-xs">{r.responsible}</TableCell>
                      <TableCell className="text-xs">
                        {r.implementation_deadline}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.implementation_status && (
                          <Badge className="bg-green-500 text-white border-0 text-[10px]">
                            {r.implementation_status}
                          </Badge>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditing(r)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteRow.mutate(r.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Editar registo" : "Novo registo"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["document_type", "Tipo de documento"],
                  ["document_ref", "Refª Documento"],
                  ["publication_date", "Data de publicação"],
                  ["modification_date", "Data modificação"],
                  ["issuer", "Emissor"],
                  ["responsible", "Responsável"],
                  ["implementation_deadline", "Prazo / Data de implementação"],
                  ["implementation_status", "Estado de implementação"],
                ] as [keyof StandardRow, string][]
              ).map(([key, label]) => (
                <div key={key as string} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <Input
                    value={(editing[key] as string) || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: e.target.value })
                    }
                  />
                </div>
              ))}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">
                  Nome do documento
                </label>
                <Textarea
                  rows={2}
                  value={editing.document_name || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, document_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Descritivo</label>
                <Textarea
                  rows={3}
                  value={editing.descriptive || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, descriptive: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">
                  Ações a implementar
                </label>
                <Textarea
                  rows={3}
                  value={editing.actions || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, actions: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-4 pt-2">
                {(
                  [
                    ["impact_iso_14001", "ISO 14001"],
                    ["impact_iso_45001", "ISO 45001"],
                    ["applicability_informative", "Informativo"],
                    ["applicability_direct", "Aplicabilidade direta"],
                    ["applicability_indirect", "Aplicabilidade indireta"],
                  ] as [keyof StandardRow, string][]
                ).map(([key, label]) => (
                  <label
                    key={key as string}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={!!editing[key]}
                      onCheckedChange={(v) =>
                        setEditing({ ...editing, [key]: !!v })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => editing && saveRow.mutate(editing)}
              disabled={saveRow.isPending}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
