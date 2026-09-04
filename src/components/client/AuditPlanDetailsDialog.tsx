import { useEffect, useState } from "react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AuditDocumentsList } from "@/components/client/AuditDocumentsList";
import {
  Calendar,
  User,
  FileText,
  Target,
  Users,
  CheckCircle2,
  Building2,
  AlertCircle,
  Crosshair,
  Save,
} from "lucide-react";

type AuditPlan = {
  id: string;
  title: string;
  description?: string | null;
  auditor?: string | null;
  audit_date?: string | null;
  status?: string | null;
  methodology?: string | null;
  interlocutors?: string | null;
  scope?: string | null;
  objectives?: string | null;
  executive_summary?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  plan_approved_at?: string | null;
};

interface AuditPlanDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: AuditPlan | null;
  /** Admins can fill in the plan directly here; clients only read. */
  canEdit?: boolean;
}

const EDITABLE_FIELDS: {
  key: keyof AuditPlan;
  title: string;
  icon: typeof Target;
  description: string;
  required?: boolean;
}[] = [
  {
    key: "objectives",
    title: "Objetivos da Auditoria",
    icon: Crosshair,
    description: "Objetivos e metas da auditoria",
    required: true,
  },
  {
    key: "methodology",
    title: "Metodologia",
    icon: Target,
    description: "Metodologia a aplicar na auditoria",
    required: true,
  },
  {
    key: "scope",
    title: "Estabelecimentos Abrangidos",
    icon: Building2,
    description: "Locais e instalações incluídos no âmbito",
    required: true,
  },
  {
    key: "interlocutors",
    title: "Interlocutores",
    icon: Users,
    description: "Pessoas a contactar durante a auditoria",
    required: true,
  },
  {
    key: "executive_summary",
    title: "Resumo Executivo",
    icon: FileText,
    description: "Síntese dos resultados",
  },
  {
    key: "strengths",
    title: "Pontos Fortes",
    icon: CheckCircle2,
    description: "Aspetos positivos identificados",
  },
  {
    key: "weaknesses",
    title: "Pontos a Melhorar",
    icon: CheckCircle2,
    description: "Aspetos a corrigir",
  },
];

export function AuditPlanDetailsDialog({
  open,
  onOpenChange,
  audit,
  canEdit = false,
}: AuditPlanDetailsDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!audit) return;
    const initial = {
      description: audit.description ?? "",
      auditor: audit.auditor ?? "",
      audit_date: audit.audit_date ?? "",
      objectives: audit.objectives ?? "",
      methodology: audit.methodology ?? "",
      scope: audit.scope ?? "",
      interlocutors: audit.interlocutors ?? "",
      executive_summary: audit.executive_summary ?? "",
      strengths: audit.strengths ?? "",
      weaknesses: audit.weaknesses ?? "",
    };
    setForm(initial);
    setSaved(initial);
  }, [audit?.id, open]);


  const save = useMutation({
    mutationFn: async () => {
      if (!audit) return null;
      const payload = {
        description: form.description || null,
        auditor: form.auditor || null,
        audit_date: form.audit_date || null,
        objectives: form.objectives || null,
        methodology: form.methodology || null,
        scope: form.scope || null,
        interlocutors: form.interlocutors || null,
        executive_summary: form.executive_summary || null,
        strengths: form.strengths || null,
        weaknesses: form.weaknesses || null,
      };
      const { data, error } = await supabase
        .from("audits")
        .update(payload)
        .eq("id", audit.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          "Sem permissão para guardar este plano (nenhum registo atualizado).",
        );
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Plano de auditoria guardado");
      setSaved({ ...form });
      queryClient.invalidateQueries({ queryKey: ["audits-all"] });
      queryClient.invalidateQueries({ queryKey: ["audits"] });
      queryClient.invalidateQueries({ queryKey: ["audit-plans"] });
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error ? e.message : "Não foi possível guardar o plano",
      ),
  });

  if (!audit) return null;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const currentValue = (key: string) =>
    (saved[key] ?? ((audit[key as keyof AuditPlan] as string | null) || "")) ||
    "";


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">{audit.title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-140px)] pr-4">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-4 text-sm">
              <Badge
                variant="outline"
                className={`gap-1 ${
                  audit.status === "in_progress"
                    ? "bg-yellow-500 text-white border-0"
                    : audit.status === "planned"
                      ? "bg-blue-500 text-white border-0"
                      : "bg-gray-500 text-white border-0"
                }`}
              >
                {audit.status === "in_progress"
                  ? "Em Curso"
                  : audit.status === "planned"
                    ? "Planeada"
                    : audit.status === "closed"
                      ? "Executada"
                      : audit.status}
              </Badge>

              {audit.plan_approved_at && (
                <Badge
                  variant="outline"
                  className="gap-1 bg-green-500 text-white border-0"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Plano Aprovado
                </Badge>
              )}
            </div>

            {/* Basic info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Data:</span>
                {canEdit ? (
                  <Input
                    type="date"
                    className="h-8 w-[170px]"
                    value={form.audit_date || ""}
                    onChange={(e) => set("audit_date", e.target.value)}
                  />
                ) : (
                  <span className="font-medium">
                    {currentValue("audit_date")
                      ? format(
                          new Date(currentValue("audit_date")),
                          "d 'de' MMMM 'de' yyyy",
                          { locale: pt },
                        )
                      : "—"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Auditor:</span>
                {canEdit ? (
                  <Input
                    className="h-8 flex-1"
                    value={form.auditor || ""}
                    onChange={(e) => set("auditor", e.target.value)}
                  />
                ) : (
                  <span className="font-medium">
                    {currentValue("auditor") || "—"}
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Descrição / Âmbito
              </h3>
              {canEdit ? (
                <Textarea
                  rows={3}
                  value={form.description || ""}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Descrição da auditoria"
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">
                  {currentValue("description") || "—"}
                </p>
              )}
            </div>

            {!isMonthly && <Separator />}

            {/* Plan fields — as VCL mensais não têm plano de auditoria */}
            {!isMonthly && (
              <div className="space-y-1">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">
                  Informação do Plano de Auditoria
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {EDITABLE_FIELDS.map((field) => {
                    const value = currentValue(field.key as string);

                    if (!canEdit && !value && !field.required) return null;
                    return (
                      <div
                        key={field.key as string}
                        className={`rounded-lg border p-4 ${
                          value
                            ? "bg-card border-border"
                            : "bg-muted/30 border-dashed border-muted-foreground/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <field.icon
                            className={`h-4 w-4 ${value ? "text-primary" : "text-muted-foreground"}`}
                          />
                          <h4 className="font-medium text-sm">
                            {field.title}
                            {field.required && (
                              <span className="text-destructive ml-1">*</span>
                            )}
                          </h4>
                        </div>
                        {canEdit ? (
                          <Textarea
                            rows={3}
                            placeholder={field.description}
                            value={form[field.key as string] || ""}
                            onChange={(e) =>
                              set(field.key as string, e.target.value)
                            }
                          />
                        ) : value ? (
                          <p className="text-sm whitespace-pre-wrap">{value}</p>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <AlertCircle className="h-3 w-3" />
                            <span className="text-xs italic">
                              {field.description}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Separator />


            {/* Documentation */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Documentação associada
              </h3>
              <AuditDocumentsList auditId={audit.id} variant="plain" />
            </div>
          </div>
        </ScrollArea>

        {canEdit && (
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Fechar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-1 h-4 w-4" />
              Guardar plano
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
