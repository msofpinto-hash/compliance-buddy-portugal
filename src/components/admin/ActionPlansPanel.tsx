import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  ListTodo, 
  Plus, 
  Calendar, 
  User, 
  Building,
  Loader2,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  ArrowRight,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

const statusConfig = {
  pendente: { label: "Pendente", color: "bg-gray-100 text-gray-700 border-gray-300", icon: Clock },
  em_curso: { label: "Em Curso", color: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertCircle },
  concluido: { label: "Concluído", color: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", color: "bg-gray-100 text-gray-700 border-gray-300", icon: XCircle },
};

interface CreateActionPlanDialogProps {
  organizations: any[];
  onCreated: () => void;
}

function CreateActionPlanDialog({ organizations, onCreated }: CreateActionPlanDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    organization_id: "",
    title: "",
    description: "",
    responsible: "",
    due_date: "",
  });

  const handleCreate = async () => {
    if (!form.organization_id || !form.title) {
      toast({ title: "Erro", description: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.from("action_plans").insert({
        organization_id: form.organization_id,
        title: form.title,
        description: form.description || null,
        responsible: form.responsible || null,
        due_date: form.due_date || null,
        created_by: user?.id,
        status: "pendente",
      });

      if (error) throw error;

      toast({ title: "Plano de ação criado" });
      setForm({ organization_id: "", title: "", description: "", responsible: "", due_date: "" });
      setOpen(false);
      onCreated();
    } catch (error) {
      console.error("Error creating action plan:", error);
      toast({ title: "Erro", description: "Não foi possível criar o plano de ação", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Plano
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Plano de Ação</DialogTitle>
          <DialogDescription>
            Crie um plano de ação para corrigir não conformidades
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Organização *</Label>
            <Select value={form.organization_id} onValueChange={(v) => setForm({ ...form, organization_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a organização" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Implementar procedimento de gestão de resíduos"
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descreva as ações a implementar..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Input
                value={form.responsible}
                onChange={(e) => setForm({ ...form, responsible: e.target.value })}
                placeholder="Nome do responsável"
              />
            </div>
            <div className="space-y-2">
              <Label>Prazo</Label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Plano
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ImportFromAuditDialogProps {
  organizations: any[];
  onImported: () => void;
}

function ImportFromAuditDialog({ organizations, onImported }: ImportFromAuditDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedAudit, setSelectedAudit] = useState("");
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Fetch audits for selected organization
  const { data: audits } = useQuery({
    queryKey: ["audits-for-import", selectedOrg],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("id, title, status")
        .eq("organization_id", selectedOrg)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg,
  });

  // Fetch non-compliant requirements for selected audit
  const { data: findings } = useQuery({
    queryKey: ["audit-findings", selectedAudit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_requirements")
        .select(`
          id,
          compliance_status,
          findings,
          legal_requirements(article, requirement_text),
          legislation(number)
        `)
        .eq("audit_id", selectedAudit)
        .in("compliance_status", ["non_compliant", "partial"]);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedAudit,
  });

  // Check which findings already have action plans
  const { data: existingPlans } = useQuery({
    queryKey: ["existing-action-plans", selectedAudit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_plans")
        .select("audit_requirement_id")
        .not("audit_requirement_id", "is", null);
      if (error) throw error;
      return data?.map(p => p.audit_requirement_id) || [];
    },
    enabled: !!selectedAudit,
  });

  const availableFindings = findings?.filter(f => !existingPlans?.includes(f.id)) || [];

  const handleImport = async () => {
    if (selectedFindings.length === 0) {
      toast({ title: "Selecione pelo menos uma constatação", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    try {
      const plansToCreate = selectedFindings.map(findingId => {
        const finding = findings?.find(f => f.id === findingId);
        return {
          organization_id: selectedOrg,
          audit_requirement_id: findingId,
          title: `Ação corretiva: ${finding?.legislation?.number || ""} - ${finding?.legal_requirements?.article || "Requisito"}`,
          description: finding?.findings || finding?.legal_requirements?.requirement_text || "",
          status: "pendente",
          created_by: user?.id,
        };
      });

      const { error } = await supabase.from("action_plans").insert(plansToCreate);
      if (error) throw error;

      toast({ title: "Planos de ação criados", description: `${plansToCreate.length} planos importados da auditoria` });
      setOpen(false);
      setSelectedFindings([]);
      onImported();
    } catch (error) {
      console.error("Error importing:", error);
      toast({ title: "Erro ao importar", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const toggleFinding = (id: string) => {
    setSelectedFindings(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedFindings(availableFindings.map(f => f.id));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <ArrowRight className="h-4 w-4" />
          Importar da Auditoria
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Constatações da Auditoria</DialogTitle>
          <DialogDescription>
            Crie planos de ação a partir das não conformidades identificadas
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Organização</Label>
              <Select value={selectedOrg} onValueChange={(v) => { setSelectedOrg(v); setSelectedAudit(""); setSelectedFindings([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Auditoria</Label>
              <Select value={selectedAudit} onValueChange={(v) => { setSelectedAudit(v); setSelectedFindings([]); }} disabled={!selectedOrg}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {audits?.map((audit) => (
                    <SelectItem key={audit.id} value={audit.id}>{audit.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedAudit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Constatações (Não Conformes / Parciais)</Label>
                {availableFindings.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Selecionar Todas ({availableFindings.length})
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[250px] border rounded-md p-2">
                {availableFindings.length > 0 ? (
                  <div className="space-y-2">
                    {availableFindings.map((finding: any) => (
                      <div
                        key={finding.id}
                        onClick={() => toggleFinding(finding.id)}
                        className={`p-3 rounded-md border cursor-pointer transition-colors ${
                          selectedFindings.includes(finding.id) 
                            ? "bg-primary/10 border-primary" 
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selectedFindings.includes(finding.id)}
                            onChange={() => {}}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">
                              {finding.legislation?.number} - {finding.legal_requirements?.article}
                            </p>
                            <p className="text-sm line-clamp-2">
                              {finding.legal_requirements?.requirement_text}
                            </p>
                            {finding.findings && (
                              <p className="text-xs text-amber-600 mt-1">
                                Constatação: {finding.findings}
                              </p>
                            )}
                          </div>
                          <Badge 
                            variant="outline" 
                            className={finding.compliance_status === "non_compliant" 
                              ? "bg-red-100 text-red-700" 
                              : "bg-amber-100 text-amber-700"
                            }
                          >
                            {finding.compliance_status === "non_compliant" ? "Não Conforme" : "Parcial"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {findings?.length === 0 
                        ? "Nenhuma não conformidade nesta auditoria" 
                        : "Todas as constatações já têm planos de ação"}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleImport} disabled={isImporting || selectedFindings.length === 0}>
            {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar {selectedFindings.length} Plano(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActionPlansPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch organizations
  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch action plans
  const { data: actionPlans, isLoading, refetch } = useQuery({
    queryKey: ["action-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_plans")
        .select(`
          *,
          organizations(id, name),
          legal_requirements(id, article, requirement_text, legislation(number)),
          audit_requirements:audit_requirement_id(
            id,
            audit_id,
            audits(title)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch selected plan details
  const { data: planDetails } = useQuery({
    queryKey: ["action-plan-details", selectedPlan],
    queryFn: async () => {
      if (!selectedPlan) return null;
      const { data, error } = await supabase
        .from("action_plans")
        .select(`
          *,
          organizations(id, name),
          legal_requirements(id, article, requirement_text, legislation(number, title)),
          audit_requirements:audit_requirement_id(
            id,
            audit_id,
            findings,
            compliance_status,
            audits(id, title)
          )
        `)
        .eq("id", selectedPlan)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPlan,
  });

  const handleStatusChange = async (planId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("action_plans")
        .update({ status: newStatus })
        .eq("id", planId);
      if (error) throw error;
      toast({ title: "Estado atualizado" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["action-plan-details", planId] });
    } catch (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  };

  const handleUpdatePlan = async (planId: string, updates: any) => {
    try {
      const { error } = await supabase
        .from("action_plans")
        .update(updates)
        .eq("id", planId);
      if (error) throw error;
      toast({ title: "Plano atualizado" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["action-plan-details", planId] });
    } catch (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  };

  const filteredPlans = actionPlans?.filter(plan => 
    statusFilter === "all" || plan.status === statusFilter
  );

  const stats = {
    total: actionPlans?.length || 0,
    pendente: actionPlans?.filter(p => p.status === "pendente").length || 0,
    em_curso: actionPlans?.filter(p => p.status === "em_curso").length || 0,
    concluido: actionPlans?.filter(p => p.status === "concluido").length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-xl bg-gradient-to-r from-amber-100/70 via-orange-100/50 to-yellow-100/40 dark:from-amber-900/35 dark:via-orange-900/25 dark:to-yellow-900/20 border border-amber-200/50 dark:border-amber-800/35">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-stone-800 dark:text-stone-100">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
              <ListTodo className="h-5 w-5 text-white" />
            </div>
            Planos de Ação
          </h2>
          <p className="text-amber-700/70 dark:text-amber-400/70 mt-1">
            Gerencie ações corretivas para não conformidades
          </p>
        </div>
        <div className="flex items-center gap-2">
          {organizations && <ImportFromAuditDialog organizations={organizations} onImported={refetch} />}
          {organizations && <CreateActionPlanDialog organizations={organizations} onCreated={refetch} />}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br from-amber-50/95 via-orange-50/80 to-yellow-50/70 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/25 border border-amber-200/60 dark:border-amber-800/40" onClick={() => setStatusFilter("all")}>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-stone-800 dark:text-stone-100">{stats.total}</div>
            <p className="text-xs text-amber-700/70 dark:text-amber-400/70">Total</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br from-stone-50/95 via-amber-50/80 to-orange-50/70 dark:from-stone-900/50 dark:via-amber-950/40 dark:to-orange-950/30 border border-stone-200/60 dark:border-stone-700/40" onClick={() => setStatusFilter("pendente")}>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-stone-600 dark:text-stone-300">{stats.pendente}</div>
            <p className="text-xs text-amber-700/70 dark:text-amber-400/70">Pendentes</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br from-orange-50/95 via-amber-50/80 to-yellow-50/70 dark:from-orange-950/40 dark:via-amber-950/35 dark:to-yellow-950/25 border border-orange-200/60 dark:border-orange-800/40" onClick={() => setStatusFilter("em_curso")}>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.em_curso}</div>
            <p className="text-xs text-amber-700/70 dark:text-amber-400/70">Em Curso</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br from-emerald-50/95 via-teal-50/80 to-green-50/70 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-green-950/25 border border-emerald-200/60 dark:border-emerald-800/40" onClick={() => setStatusFilter("concluido")}>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.concluido}</div>
            <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">Concluídos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Plans List */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-gradient-to-br from-amber-50/95 via-orange-50/80 to-yellow-50/70 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/25 border border-amber-200/60 dark:border-amber-800/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-stone-800 dark:text-stone-100">Planos de Ação</CardTitle>
                {statusFilter !== "all" && (
                  <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")} className="text-amber-700 hover:text-amber-800 hover:bg-amber-100/50">
                    Limpar filtro
                  </Button>
                )}
              </div>
              <CardDescription className="text-amber-700/70 dark:text-amber-400/70">{filteredPlans?.length || 0} planos</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : filteredPlans && filteredPlans.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <div className="divide-y">
                    {filteredPlans.map((plan: any) => {
                      const status = statusConfig[plan.status as keyof typeof statusConfig] || statusConfig.pendente;
                      const StatusIcon = status?.icon || Clock;
                      const isOverdue = plan.due_date && new Date(plan.due_date) < new Date() && plan.status !== "concluido";
                      return (
                        <button
                          key={plan.id}
                          onClick={() => setSelectedPlan(plan.id)}
                          className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                            selectedPlan === plan.id ? "bg-muted" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{plan.title}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Building className="h-3 w-3" />
                                {plan.organizations?.name}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className={`text-xs ${status?.color}`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status?.label}
                            </Badge>
                            {isOverdue && (
                              <Badge variant="destructive" className="text-xs">
                                Atrasado
                              </Badge>
                            )}
                            {(plan as any).audit_requirements?.audits && (
                              <Badge variant="secondary" className="text-xs">
                                Auditoria
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <ListTodo className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum plano de ação</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Plan Details */}
        <div className="lg:col-span-2">
          {selectedPlan && planDetails ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{planDetails.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Building className="h-4 w-4" />
                        {planDetails.organizations?.name}
                      </CardDescription>
                    </div>
                    <Select
                      value={planDetails.status || "pendente"}
                      onValueChange={(v) => handleStatusChange(planDetails.id, v)}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_curso">Em Curso</SelectItem>
                        <SelectItem value="concluido">Concluído</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {planDetails.responsible && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Responsável:</span>
                        <span>{planDetails.responsible}</span>
                      </div>
                    )}
                    {planDetails.due_date && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Prazo:</span>
                        <span className={
                          new Date(planDetails.due_date) < new Date() && planDetails.status !== "concluido"
                            ? "text-destructive font-medium"
                            : ""
                        }>
                          {format(new Date(planDetails.due_date), "d MMMM yyyy", { locale: pt })}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {planDetails.description && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Descrição</Label>
                      <p className="text-sm whitespace-pre-wrap">{planDetails.description}</p>
                    </div>
                  )}

                  {/* Link to Audit */}
                  {(planDetails as any).audit_requirements?.audits && (
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Originado da Auditoria</p>
                      <p className="text-sm font-medium">{(planDetails as any).audit_requirements.audits.title}</p>
                      {(planDetails as any).audit_requirements.findings && (
                        <p className="text-xs text-amber-600 mt-1">
                          Constatação: {(planDetails as any).audit_requirements.findings}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Link to Requirement */}
                  {planDetails.legal_requirements && (
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Requisito Legal</p>
                      <p className="text-xs text-primary">{planDetails.legal_requirements.legislation?.number}</p>
                      <p className="text-sm">{planDetails.legal_requirements.article}: {planDetails.legal_requirements.requirement_text}</p>
                    </div>
                  )}

                  {/* Evidence URL */}
                  <div className="space-y-2">
                    <Label>URL de Evidência</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://..."
                        defaultValue={planDetails.evidence_url || ""}
                        onBlur={(e) => {
                          if (e.target.value !== (planDetails.evidence_url || "")) {
                            handleUpdatePlan(planDetails.id, { evidence_url: e.target.value || null });
                          }
                        }}
                      />
                      {planDetails.evidence_url && (
                        <Button variant="outline" size="icon" asChild>
                          <a href={planDetails.evidence_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Selecione um plano de ação</p>
                <p className="text-sm">Escolha um plano da lista para ver os detalhes</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
