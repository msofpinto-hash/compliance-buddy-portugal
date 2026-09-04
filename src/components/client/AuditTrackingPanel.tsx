import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { attachStandardsSnapshotIfMonthly } from "@/lib/standardsSnapshot";
import { attachVclReportIfMonthly, parseVclReport } from "@/lib/vclReport";
import { syncVclActionsToPlans } from "@/lib/vclAutomation";
import { VclReportDialog } from "@/components/client/VclReportDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PlayCircle,
  ListChecks,
  Paperclip,
  RotateCcw,
  FileText,
  ChevronDown,
  ChevronUp,

} from "lucide-react";
import { AuditDocumentsList } from "@/components/client/AuditDocumentsList";

type AuditRow = {
  id: string;
  title: string;
  audit_type: string | null;
  audit_date: string | null;
  executed_at: string | null;
  status: string;
  approved_at: string | null;
  findings: string | null;
  recommendations: string | null;
  conclusion_note: string | null;
  vcl_report: unknown | null;
  no_action_required: boolean | null;
  organization_id: string;
};

interface Props {
  organizationIds: string[];
  organizations?: { id: string; name: string }[];
  typeFilter?: "all" | "anual" | "mensal";
}

const STAGES = [
  { key: "agendada", label: "Agendada" },
  { key: "executada", label: "Executada" },
  { key: "concluida", label: "Concluída" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

function stageOf(a: AuditRow): StageKey {
  if (a.status === "closed" || a.approved_at) return "concluida";
  if (a.status === "in_progress" || a.executed_at) return "executada";
  return "agendada";
}

/** Acompanhamento das auditorias: agendado, executado, concluído e saída para planos de ação. */
export function AuditTrackingPanel({
  organizationIds,
  organizations = [],
  typeFilter = "all",
}: Props) {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stageFilter, setStageFilter] = useState<"all" | StageKey>("all");

  const { data: audits, isLoading } = useQuery({
    queryKey: ["audit-tracking", organizationIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select(
          "id, title, audit_type, audit_date, executed_at, status, approved_at, findings, recommendations, conclusion_note, no_action_required, organization_id, vcl_report",
        )
        .in("organization_id", organizationIds)
        .order("audit_date", { ascending: false });
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
    enabled: organizationIds.length > 0,
  });

  const rows = useMemo(() => {
    return (audits || []).filter((a) => {
      if (typeFilter !== "all" && (a.audit_type || "anual") !== typeFilter)
        return false;
      if (stageFilter !== "all" && stageOf(a) !== stageFilter) return false;
      return true;
    });
  }, [audits, typeFilter, stageFilter]);

  const counts = useMemo(() => {
    const base = { agendada: 0, executada: 0, concluida: 0 };
    (audits || [])
      .filter(
        (a) => typeFilter === "all" || (a.audit_type || "anual") === typeFilter,
      )
      .forEach((a) => {
        base[stageOf(a)] += 1;
      });
    return base;
  }, [audits, typeFilter]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["audit-tracking"] });
    queryClient.invalidateQueries({ queryKey: ["audit-tracking-linkage"] });
    queryClient.invalidateQueries({ queryKey: ["audits-all"] });
    queryClient.invalidateQueries({ queryKey: ["audits"] });
    queryClient.invalidateQueries({ queryKey: ["action-plans"] });
  };

  const [expanded, setExpanded] = useState<string | null>(null);
  const [vclFor, setVclFor] = useState<AuditRow | null>(null);

  const orgName = (id: string) =>
    organizations.find((o) => o.id === id)?.name || "";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {STAGES.map((s) => (
          <Card
            key={s.key}
            className={`cursor-pointer transition-shadow ${
              stageFilter === s.key ? "ring-2 ring-primary" : "hover:shadow-md"
            }`}
            onClick={() =>
              setStageFilter(stageFilter === s.key ? "all" : s.key)
            }
          >
            <CardContent className="p-4 flex items-center gap-3">
              {s.key === "agendada" && (
                <CalendarCheck className="h-5 w-5 text-blue-600" />
              )}
              {s.key === "executada" && (
                <PlayCircle className="h-5 w-5 text-amber-600" />
              )}
              {s.key === "concluida" && (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              <div>
                <p className="text-2xl font-bold">{counts[s.key]}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={stageFilter}
          onValueChange={(v) => setStageFilter(v as any)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="agendada">Agendadas</SelectItem>
            <SelectItem value="executada">Executadas</SelectItem>
            <SelectItem value="concluida">Concluídas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Sem auditorias para os filtros selecionados.
            </p>
          ) : (
            <div className="max-h-[70vh] overflow-auto scrollbar-thin">
              <Table className="min-w-[900px]">
                <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
                  <TableRow className="bg-background">
                    <TableHead className="w-[280px]">Auditoria</TableHead>
                    <TableHead className="w-[130px]">Tipo</TableHead>
                    <TableHead className="w-[100px]">Agendada</TableHead>
                    <TableHead className="w-[100px]">Executada</TableHead>
                    <TableHead className="w-[120px]">Concluída</TableHead>
                    <TableHead className="w-[150px]">Documentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => {
                      <Fragment key={a.id}>
                        <TableRow className="align-top">
                        <TableCell className="text-sm font-medium">
                          {a.title}
                          {organizations.length > 1 && (
                            <p className="text-[11px] text-muted-foreground">
                              {orgName(a.organization_id)}
                            </p>
                          )}
                          {(a.audit_type || "anual") === "mensal" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[11px] gap-1 px-1 mt-1 text-primary"
                              onClick={() => setVclFor(a)}
                            >
                              <FileText className="h-3 w-3" />
                              Relatório
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(a.audit_type || "anual") === "mensal"
                            ? "Verificação mensal"
                            : "Auditoria anual"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.audit_date || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.executed_at ||
                            (stage !== "agendada" ? a.audit_date : "—")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {stage === "concluida" ? (
                            <Badge className="bg-green-600 text-white border-0 text-[10px]">
                              {a.approved_at?.slice(0, 10) || "Concluída"}
                            </Badge>
                          ) : stage === "executada" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-300 text-amber-700"
                            >
                              Em curso
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-blue-300 text-blue-700"
                            >
                              Planeada
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={expanded === a.id ? "secondary" : "outline"}
                            className="h-7 text-[11px] gap-1"
                            onClick={() =>
                              setExpanded(expanded === a.id ? null : a.id)
                            }
                          >
                            <Paperclip className="h-3 w-3" />
                            Documentos
                            {expanded === a.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </Button>
                        </TableCell>
                        </TableRow>
                        {expanded === a.id && (
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={6} className="p-4">
                              <AuditDocumentsList
                                auditId={a.id}
                                variant="plain"
                                allowUpload={isAdmin}
                                uploadLabel="Anexar ata / documentos"
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );

                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        audit={vclFor as any}
        open={!!vclFor}
        onOpenChange={(o) => !o && setVclFor(null)}
        canEdit={isAdmin}
        onSaved={refresh}
      />

    </div>
  );
}
