import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Plus, Trash2, FileDown, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  VclReport,
  emptyVclReport,
  parseVclReport,
  buildVclPdf,
  generateAndAttachVclPdf,
  vclPeriodLabel,
  VclDiploma,
} from "@/lib/vclReport";

type Audit = {
  id: string;
  title: string;
  audit_date?: string | null;
  executed_at?: string | null;
  organization_id: string;
  vcl_report?: unknown;
};

interface Props {
  audit: Audit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit?: boolean;
  onSaved?: () => void;
}

export function VclReportDialog({
  audit,
  open,
  onOpenChange,
  canEdit = false,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [report, setReport] = useState<VclReport>(emptyVclReport());
  const [saving, setSaving] = useState(false);
  const [pool, setPool] = useState<VclDiploma[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyPeriod, setOnlyPeriod] = useState(true);

  useEffect(() => {
    if (!audit) return;
    const parsed = parseVclReport(audit.vcl_report);
    setReport(parsed);
    // Prefill from the audit plan whenever the report is still empty
    (async () => {
      const isEmpty =
        !parsed.participants &&
        !parsed.description &&
        !parsed.conclusions &&
        parsed.actions.length === 0;
      if (!isEmpty) return;
      const { data } = await supabase
        .from("audits")
        .select(
          "interlocutors, methodology, scope, objectives, description, findings, conclusion_note, executive_summary, audit_date, executed_at",
        )
        .eq("id", audit.id)
        .maybeSingle();
      if (!data) return;
      const { data: plans } = await supabase
        .from("action_plans")
        .select("title, description, responsible, due_date")
        .eq("organization_id", audit.organization_id)
        .ilike("title", `%${audit.title}%`);
      setReport((r) => ({
        ...r,
        participants: r.participants || data.interlocutors || "",
        description:
          r.description ||
          [data.description, data.objectives, data.methodology, data.scope]
            .filter(Boolean)
            .join("\n\n"),
        conclusions:
          r.conclusions ||
          data.conclusion_note ||
          data.executive_summary ||
          data.findings ||
          "",
        actions: r.actions.length
          ? r.actions
          : (plans || []).map((p: any) => ({
              description: p.description || p.title || "",
              responsible: p.responsible || "",
              deadline: p.due_date
                ? new Date(p.due_date).toLocaleDateString("pt-PT")
                : "",
            })),
      }));
    })();
  }, [audit]);

  useEffect(() => {
    if (!audit || !open) return;
    let cancelled = false;
    (async () => {
      setPoolLoading(true);
      const ref = new Date(audit.executed_at || audit.audit_date || Date.now());
      // período analisado = mês anterior ao da verificação
      const start = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      const end = new Date(ref.getFullYear(), ref.getMonth(), 0);
      const { data } = await supabase
        .from("organization_legislation")
        .select(
          "applicability_type, legislation:legislation(id, number, title, publication_date)",
        )
        .eq("organization_id", audit.organization_id)
        .in("applicability_type", ["aplicavel_direto", "aplicavel_indireto"]);
      if (cancelled) return;
      const rows: VclDiploma[] = (data || [])
        .filter((r: any) => r.legislation)
        .map((r: any) => ({
          id: r.legislation.id,
          number: r.legislation.number,
          title: r.legislation.title,
          applicability: r.applicability_type,
          publication_date: r.legislation.publication_date,
        }));
      rows.sort((a, b) =>
        (b.publication_date || "").localeCompare(a.publication_date || ""),
      );
      setPool(rows);
      (rows as any).periodStart = start;
      setPoolLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [audit, open]);

  if (!audit) return null;

  const ref = new Date(audit.executed_at || audit.audit_date || Date.now());
  const periodStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 10);
  const periodEnd = new Date(ref.getFullYear(), ref.getMonth(), 0)
    .toISOString()
    .slice(0, 10);
  const periodName = new Date(periodStart).toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
  });

  const filteredPool = pool.filter((d) => {
    if (
      onlyPeriod &&
      !(
        d.publication_date &&
        d.publication_date >= periodStart &&
        d.publication_date <= periodEnd
      )
    )
      return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (d.number || "").toLowerCase().includes(q) ||
      (d.title || "").toLowerCase().includes(q)
    );
  });

  const toggleDiploma = (d: VclDiploma, checked: boolean) =>
    setReport((r) => ({
      ...r,
      diplomas: checked
        ? [...r.diplomas.filter((x) => x.id !== d.id), d]
        : r.diplomas.filter((x) => x.id !== d.id),
    }));

  const ro = !canEdit;

  const set = (patch: Partial<VclReport>) =>
    setReport((r) => ({ ...r, ...patch }));

  const setAction = (idx: number, patch: Partial<VclReport["actions"][0]>) =>
    setReport((r) => ({
      ...r,
      actions: r.actions.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));

  const save = async (alsoPdf: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from("audits")
      .update({ vcl_report: report as any })
      .eq("id", audit.id);
    if (error) {
      setSaving(false);
      toast({
        title: "Não foi possível guardar",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    if (alsoPdf) {
      try {
        const name = await generateAndAttachVclPdf(audit, report);
        toast({
          title: "Relatório gerado e anexado",
          description: name,
        });
      } catch (e: any) {
        toast({
          title: "Guardado, mas o PDF falhou",
          description: e?.message || String(e),
          variant: "destructive",
        });
      }
    } else {
      toast({ title: "Relatório guardado" });
    }
    setSaving(false);
    onSaved?.();
    if (alsoPdf) onOpenChange(false);
  };

  const preview = () => {
    try {
      const blob = buildVclPdf(audit, report);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Relatorio VCL ${vclPeriodLabel(audit).replace(/[^\w]+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast({ title: "PDF gerado", description: "Transferência iniciada." });
    } catch (e: any) {
      toast({
        title: "Não foi possível gerar o PDF",
        description: e?.message || String(e),
        variant: "destructive",
      });
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Relatório VCL Mensal — {vclPeriodLabel(audit)}
          </DialogTitle>
          <DialogDescription>
            Os campos do plano (interlocutores, objetivos, metodologia,
            âmbito e conclusões) são transportados automaticamente. Ao encerrar a
            verificação, o PDF é gerado e anexado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <Textarea
                rows={3}
                readOnly={ro}
                value={report.participants}
                onChange={(e) => set({ participants: e.target.value })}
                placeholder="Nome – função / entidade (um por linha)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de reunião</Label>
              <Input
                readOnly={ro}
                value={report.meeting_type}
                onChange={(e) => set({ meeting_type: e.target.value })}
                placeholder="Remota / Presencial"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição da reunião</Label>
            <Textarea
              rows={5}
              readOnly={ro}
              value={report.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Conclusões</Label>
            <Textarea
              rows={8}
              readOnly={ro}
              value={report.conclusions}
              onChange={(e) => set({ conclusions: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ações a desenvolver</Label>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1"
                  onClick={() =>
                    set({
                      actions: [
                        ...report.actions,
                        { description: "", responsible: "", deadline: "" },
                      ],
                    })
                  }
                >
                  <Plus className="h-3 w-3" />
                  Adicionar ação
                </Button>
              )}
            </div>
            {report.actions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sem ações registadas.
              </p>
            )}
            {report.actions.map((a, i) => (
              <Card key={i} className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold mt-2 w-5">
                    {i + 1}.
                  </span>
                  <Textarea
                    rows={3}
                    readOnly={ro}
                    className="flex-1"
                    placeholder="Ação a desenvolver"
                    value={a.description}
                    onChange={(e) =>
                      setAction(i, { description: e.target.value })
                    }
                  />
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Remover ação"
                      onClick={() =>
                        set({
                          actions: report.actions.filter((_, x) => x !== i),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 pl-7">
                  <Input
                    readOnly={ro}
                    placeholder="Responsabilidade"
                    value={a.responsible}
                    onChange={(e) =>
                      setAction(i, { responsible: e.target.value })
                    }
                  />
                  <Input
                    readOnly={ro}
                    placeholder="Prazo"
                    value={a.deadline}
                    onChange={(e) => setAction(i, { deadline: e.target.value })}
                  />
                </div>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label>
                Diplomas analisados{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({report.diplomas.length} selecionados)
                </span>
              </Label>
              <Button
                size="sm"
                variant={onlyPeriod ? "default" : "outline"}
                className="h-7 text-[11px]"
                onClick={() => setOnlyPeriod((v) => !v)}
              >
                {onlyPeriod ? `Só ${periodName}` : "Todos os aplicáveis"}
              </Button>
            </div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Procurar diploma por número ou título"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
              {poolLoading && (
                <p className="text-xs text-muted-foreground p-3">A carregar…</p>
              )}
              {!poolLoading && filteredPool.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">
                  Sem diplomas aplicáveis publicados em {periodName}. Desligue o
                  filtro para ver todos.
                </p>
              )}
              {filteredPool.slice(0, 200).map((d) => {
                const checked = report.diplomas.some((x) => x.id === d.id);
                return (
                  <label
                    key={d.id}
                    className="flex items-start gap-2 p-2.5 text-xs cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={ro}
                      onCheckedChange={(v) => toggleDiploma(d, !!v)}
                    />
                    <span className="flex-1">
                      <span className="font-medium">{d.number}</span>{" "}
                      <span className="text-muted-foreground">{d.title}</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {d.applicability === "aplicavel_direto"
                        ? "Direto"
                        : "Indireto"}
                    </Badge>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas especiais</Label>
            <Textarea
              rows={3}
              readOnly={ro}
              value={report.special_notes}
              onChange={(e) => set({ special_notes: e.target.value })}
              placeholder="Nada a relevar."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data da próxima reunião</Label>
              <Input
                readOnly={ro}
                value={report.next_meeting_date}
                onChange={(e) => set({ next_meeting_date: e.target.value })}
                placeholder="31/07/2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input
                readOnly={ro}
                value={report.next_meeting_time}
                onChange={(e) => set({ next_meeting_time: e.target.value })}
                placeholder="9h00 – 12h30"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={preview} className="gap-1">
            <FileDown className="h-4 w-4" />
            Pré-visualizar PDF
          </Button>
          {canEdit && (
            <>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => save(false)}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Guardar
              </Button>
              <Button disabled={saving} onClick={() => save(true)}>
                Guardar e anexar PDF
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
