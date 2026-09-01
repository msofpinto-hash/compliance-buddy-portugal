import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { IDCard } from "@/components/client/IDBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Target, CalendarClock, Pencil, Trash2 } from "lucide-react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

export interface Goal {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  area: string | null;
  unit: string | null;
  target_value: number;
  current_value: number;
  start_date: string | null;
  due_date: string | null;
  status: string;
  auto_metric?: string | null;
}

const AUTO_METRIC_LABELS: Record<string, string> = {
  conformidade_requisitos: "Conformidade dos requisitos",
  requisitos_avaliados: "Requisitos avaliados",
  acoes_concluidas: "Planos de ação concluídos",
  acoes_no_prazo: "Ações dentro do prazo",
  verificacoes_mensais: "Verificações mensais encerradas",
  evidencias_respondidas: "Pedidos de evidência respondidos",
};


const STATUS_LABELS: Record<string, string> = {
  em_curso: "Em curso",
  concluida: "Concluída",
  atrasada: "Atrasada",
  suspensa: "Suspensa",
};

const AREAS = ["Ambiente", "Segurança", "Qualidade", "Energia", "Sustentabilidade", "Geral"];

const emptyForm = {
  title: "",
  description: "",
  area: "Geral",
  unit: "%",
  target_value: "100",
  current_value: "0",
  start_date: "",
  due_date: "",
  status: "em_curso",
};

export function GoalsPanel({ organizationId }: { organizationId?: string | null }) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: goals, isLoading } = useQuery({
    queryKey: ["organization-goals", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as Goal[];
      const { data, error } = await supabase
        .from("organization_goals")
        .select("*")
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Goal[];
    },
    enabled: !!organizationId,
  });

  // Live metrics computed from real audits, action plans, compliance and evidence data
  const { data: metrics } = useQuery({
    queryKey: ["organization-goal-metrics", organizationId],
    queryFn: async () => {
      if (!organizationId) return {} as Record<string, number>;
      const year = new Date().getFullYear();
      const [apps, plans, auditsRes, evidences] = await Promise.all([
        supabase
          .from("applicabilities")
          .select("is_applicable, compliance_status")
          .eq("organization_id", organizationId),
        supabase
          .from("action_plans")
          .select("status, due_date")
          .eq("organization_id", organizationId),
        supabase
          .from("audits")
          .select("status, audit_type, audit_date")
          .eq("organization_id", organizationId),
        supabase
          .from("organization_evidence_requests")
          .select("status")
          .eq("organization_id", organizationId),
      ]);

      const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

      const applicable = (apps.data || []).filter(
        (a) => a.is_applicable && a.compliance_status !== "nao_aplicavel",
      );
      const evaluated = applicable.filter((a) => !!a.compliance_status);
      const conformes = applicable.filter((a) => a.compliance_status === "conforme");

      const allPlans = plans.data || [];
      const activePlans = allPlans.filter((p) => p.status !== "cancelado");
      const donePlans = allPlans.filter((p) => p.status === "concluido");
      const today = new Date().toISOString().slice(0, 10);
      const overdue = activePlans.filter(
        (p) => p.status !== "concluido" && p.due_date && p.due_date < today,
      );

      const monthly = (auditsRes.data || []).filter(
        (a) =>
          (a.audit_type || "anual") === "mensal" &&
          a.status === "closed" &&
          a.audit_date &&
          new Date(a.audit_date).getFullYear() === year,
      );

      const allEvidence = evidences.data || [];
      const answered = allEvidence.filter((e) =>
        ["submetido", "submitted", "aprovado", "approved", "concluido"].includes(
          e.status,
        ),
      );

      return {
        conformidade_requisitos: pct(conformes.length, applicable.length),
        requisitos_avaliados: pct(evaluated.length, applicable.length),
        acoes_concluidas: pct(donePlans.length, activePlans.length),
        acoes_no_prazo: pct(activePlans.length - overdue.length, activePlans.length),
        verificacoes_mensais: pct(monthly.length, 12),
        evidencias_respondidas: pct(answered.length, allEvidence.length),
      } as Record<string, number>;
    },
    enabled: !!organizationId,
    refetchInterval: 60000,
  });

  const valueOf = (g: Goal) =>
    g.auto_metric && metrics && metrics[g.auto_metric] !== undefined
      ? metrics[g.auto_metric]
      : g.current_value;



  const saveGoal = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Sem organização selecionada");
      const payload = {
        organization_id: organizationId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        area: form.area || null,
        unit: form.unit || null,
        target_value: Number(form.target_value) || 0,
        current_value: Number(form.current_value) || 0,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        status: form.status,
      };
      if (editing) {
        const { error } = await supabase
          .from("organization_goals")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("organization_goals").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-goals", organizationId] });
      toast({ title: editing ? "Meta atualizada" : "Meta criada" });
      setOpen(false);
      setEditing(null);
      setForm({ ...emptyForm });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao guardar meta", description: e.message, variant: "destructive" }),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-goals", organizationId] });
      toast({ title: "Meta removida" });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });

  const startEdit = (goal: Goal) => {
    setEditing(goal);
    setForm({
      title: goal.title,
      description: goal.description || "",
      area: goal.area || "Geral",
      unit: goal.unit || "",
      target_value: String(goal.target_value),
      current_value: String(goal.current_value),
      start_date: goal.start_date || "",
      due_date: goal.due_date || "",
      status: goal.status,
    });
    setOpen(true);
  };

  const progressOf = (g: Goal) =>
    g.target_value > 0
      ? Math.min(100, Math.round((g.current_value / g.target_value) * 100))
      : 0;

  const deadlineInfo = (g: Goal) => {
    if (!g.due_date) return null;
    const days = differenceInCalendarDays(parseISO(g.due_date), new Date());
    if (g.status === "concluida") return { text: "Concluída", tone: "text-primary" };
    if (days < 0) return { text: `${Math.abs(days)} dias em atraso`, tone: "text-destructive" };
    if (days <= 30) return { text: `${days} dias restantes`, tone: "text-terracotta" };
    return { text: `${days} dias restantes`, tone: "text-muted-foreground" };
  };

  return (
    <IDCard className="p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <Target className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Metas e Objetivos</h2>
            <p className="text-sm text-muted-foreground">
              Objetivos definidos, prazos e progresso alcançado
            </p>
          </div>
        </div>

        {isAdmin && (
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) {
                setEditing(null);
                setForm({ ...emptyForm });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Nova meta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar meta" : "Nova meta"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="goal-title">Objetivo</Label>
                  <Input
                    id="goal-title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Ex.: Reduzir consumo de energia em 10%"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="goal-desc">Descrição</Label>
                  <Textarea
                    id="goal-desc"
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Área</Label>
                    <Select
                      value={form.area}
                      onValueChange={(v) => setForm({ ...form, area: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AREAS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Estado</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm({ ...form, status: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="goal-current">Atual</Label>
                    <Input
                      id="goal-current"
                      type="number"
                      value={form.current_value}
                      onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="goal-target">Meta</Label>
                    <Input
                      id="goal-target"
                      type="number"
                      value={form.target_value}
                      onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="goal-unit">Unidade</Label>
                    <Input
                      id="goal-unit"
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      placeholder="%, kWh…"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="goal-start">Início</Label>
                    <Input
                      id="goal-start"
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="goal-due">Prazo</Label>
                    <Input
                      id="goal-due"
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => saveGoal.mutate()}
                  disabled={!form.title.trim() || saveGoal.isPending}
                >
                  {editing ? "Guardar" : "Criar meta"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">A carregar metas…</p>}

        {!isLoading && !goals?.length && (
          <p className="text-sm text-muted-foreground">
            Ainda não existem metas definidas para esta organização.
          </p>
        )}

        {goals?.map((goal) => {
          const pct = progressOf(goal);
          const deadline = deadlineInfo(goal);
          return (
            <div
              key={goal.id}
              className="rounded-xl border border-border/60 bg-card/70 p-4 backdrop-blur-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{goal.title}</h3>
                    {goal.area && (
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        {goal.area}
                      </Badge>
                    )}
                    <Badge variant="secondary">{STATUS_LABELS[goal.status] || goal.status}</Badge>
                  </div>
                  {goal.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{goal.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {goal.due_date && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      {format(parseISO(goal.due_date), "dd MMM yyyy", { locale: pt })}
                    </span>
                  )}
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar meta"
                        onClick={() => startEdit(goal)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover meta"
                        onClick={() => deleteGoal.mutate(goal.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {goal.current_value} / {goal.target_value} {goal.unit || ""}
                  </span>
                  <span className="font-semibold text-foreground">{pct}%</span>
                </div>
                <Progress value={pct} className="mt-1.5 h-2" />
                {deadline && (
                  <p className={`mt-1.5 text-xs font-medium ${deadline.tone}`}>{deadline.text}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </IDCard>
  );
}
