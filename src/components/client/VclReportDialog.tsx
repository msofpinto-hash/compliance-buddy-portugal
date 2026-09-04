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
import { Loader2, Plus, Trash2, FileDown } from "lucide-react";
import {
  VclReport,
  emptyVclReport,
  parseVclReport,
  buildVclPdf,
  generateAndAttachVclPdf,
  vclPeriodLabel,
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

  useEffect(() => {
    if (audit) setReport(parseVclReport(audit.vcl_report));
  }, [audit]);

  if (!audit) return null;

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
      toast({ title: "Não foi possível guardar", variant: "destructive" });
      return;
    }
    if (alsoPdf) {
      try {
        await generateAndAttachVclPdf(audit, report);
        toast({ title: "Relatório gerado e anexado à verificação" });
      } catch {
        toast({ title: "Guardado, mas o PDF falhou", variant: "destructive" });
      }
    } else {
      toast({ title: "Relatório guardado" });
    }
    setSaving(false);
    onSaved?.();
    if (alsoPdf) onOpenChange(false);
  };

  const preview = () => {
    const blob = buildVclPdf(audit, report);
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  };

  const ro = !canEdit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Relatório VCL Mensal — {vclPeriodLabel(audit)}
          </DialogTitle>
          <DialogDescription>
            Preencha os mesmos campos do relatório mensal. Ao encerrar a
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
