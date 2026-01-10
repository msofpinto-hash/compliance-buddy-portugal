import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  Plus, 
  Trash2, 
  ClipboardList, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  FileText,
  Edit,
  ExternalLink
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface Organization {
  id: string;
  name: string;
}

interface ManageActionPlansDialogProps {
  organization: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ActionPlan {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string | null;
  responsible: string | null;
  evidence_url: string | null;
  requirement_id: string | null;
  created_at: string;
  legal_requirements?: {
    id: string;
    article: string | null;
    requirement_text: string;
    legislation?: {
      number: string;
      title: string;
    };
  } | null;
}

const STATUS_OPTIONS = [
  { value: "pendente", label: "Pendente", icon: Clock, color: "bg-gray-500" },
  { value: "em_curso", label: "Em Curso", icon: AlertTriangle, color: "bg-yellow-500" },
  { value: "concluido", label: "Concluído", icon: CheckCircle2, color: "bg-green-500" },
];

export function ManageActionPlansDialog({
  organization,
  open,
  onOpenChange,
}: ManageActionPlansDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreating, setIsCreating] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ActionPlan | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    due_date: "",
    responsible: "",
    requirement_id: "",
    evidence_url: "",
    status: "pendente",
  });

  // Fetch action plans for organization
  const { data: actionPlans, isLoading } = useQuery({
    queryKey: ["action-plans", organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      const { data, error } = await supabase
        .from("action_plans")
        .select(`
          *,
          legal_requirements(
            id,
            article,
            requirement_text,
            legislation(number, title)
          )
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ActionPlan[];
    },
    enabled: !!organization && open,
  });

  // Fetch non-compliant requirements for linking
  const { data: nonCompliantRequirements } = useQuery({
    queryKey: ["non-compliant-requirements", organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      
      const { data, error } = await supabase
        .from("applicabilities")
        .select(`
          id,
          requirement_id,
          legal_requirements(
            id,
            article,
            requirement_text,
            legislation(number, title)
          )
        `)
        .eq("organization_id", organization.id)
        .eq("compliance_status", "nao_conforme");
      
      if (error) throw error;
      return data;
    },
    enabled: !!organization && open,
  });

  // Create action plan mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!organization) throw new Error("No organization");
      
      const { error } = await supabase.from("action_plans").insert({
        organization_id: organization.id,
        title: formData.title,
        description: formData.description || null,
        due_date: formData.due_date || null,
        responsible: formData.responsible || null,
        requirement_id: formData.requirement_id || null,
        evidence_url: formData.evidence_url || null,
        status: formData.status,
        created_by: user?.id,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-plans", organization?.id] });
      toast({ title: "Plano de ação criado" });
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar",
        variant: "destructive",
      });
    },
  });

  // Update action plan mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingPlan) throw new Error("No plan selected");
      
      const { error } = await supabase
        .from("action_plans")
        .update({
          title: formData.title,
          description: formData.description || null,
          due_date: formData.due_date || null,
          responsible: formData.responsible || null,
          requirement_id: formData.requirement_id || null,
          evidence_url: formData.evidence_url || null,
          status: formData.status,
        })
        .eq("id", editingPlan.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-plans", organization?.id] });
      toast({ title: "Plano de ação atualizado" });
      resetForm();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar",
        variant: "destructive",
      });
    },
  });

  // Delete action plan mutation
  const deleteMutation = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from("action_plans")
        .delete()
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-plans", organization?.id] });
      toast({ title: "Plano de ação eliminado" });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao eliminar",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      due_date: "",
      responsible: "",
      requirement_id: "",
      evidence_url: "",
      status: "pendente",
    });
    setIsCreating(false);
    setEditingPlan(null);
  };

  const startEditing = (plan: ActionPlan) => {
    setEditingPlan(plan);
    setFormData({
      title: plan.title,
      description: plan.description || "",
      due_date: plan.due_date || "",
      responsible: plan.responsible || "",
      requirement_id: plan.requirement_id || "",
      evidence_url: plan.evidence_url || "",
      status: plan.status || "pendente",
    });
    setIsCreating(true);
  };

  // Filter plans
  const filteredPlans = actionPlans?.filter(plan => {
    if (statusFilter === "all") return true;
    return plan.status === statusFilter;
  });

  // Stats
  const stats = {
    total: actionPlans?.length || 0,
    pendente: actionPlans?.filter(p => p.status === "pendente").length || 0,
    emCurso: actionPlans?.filter(p => p.status === "em_curso").length || 0,
    concluido: actionPlans?.filter(p => p.status === "concluido").length || 0,
  };

  const getStatusBadge = (status: string | null) => {
    const opt = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];
    const Icon = opt.icon;
    return (
      <Badge variant="outline" className={`gap-1 ${opt.color} text-white border-0`}>
        <Icon className="h-3 w-3" />
        {opt.label}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Planos de Ação
          </DialogTitle>
          <DialogDescription>
            {organization?.name} - Gerir ações corretivas para não-conformidades
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-gray-600">{stats.pendente}</div>
            <div className="text-xs text-muted-foreground">Pendente</div>
          </Card>
          <Card className="p-3 text-center bg-yellow-500/10">
            <div className="text-2xl font-bold text-yellow-600">{stats.emCurso}</div>
            <div className="text-xs text-muted-foreground">Em Curso</div>
          </Card>
          <Card className="p-3 text-center bg-green-500/10">
            <div className="text-2xl font-bold text-green-600">{stats.concluido}</div>
            <div className="text-xs text-muted-foreground">Concluído</div>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="flex-1">
            <TabsList>
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="pendente">Pendente</TabsTrigger>
              <TabsTrigger value="em_curso">Em Curso</TabsTrigger>
              <TabsTrigger value="concluido">Concluído</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setIsCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Plano
          </Button>
        </div>

        {/* Create/Edit Form */}
        {isCreating && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">
                {editingPlan ? "Editar Plano de Ação" : "Novo Plano de Ação"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    placeholder="Ex: Atualizar procedimento de segurança"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    placeholder="Descreva a ação a tomar..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="responsible">Responsável</Label>
                  <Input
                    id="responsible"
                    placeholder="Nome do responsável"
                    value={formData.responsible}
                    onChange={(e) => setFormData(prev => ({ ...prev, responsible: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="due_date">Data Limite</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Estado</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requirement">Requisito Associado</Label>
                  <Select 
                    value={formData.requirement_id} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, requirement_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional - Selecionar requisito" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {nonCompliantRequirements?.map((app: any) => (
                        <SelectItem key={app.requirement_id} value={app.requirement_id}>
                          {app.legal_requirements?.legislation?.number} - {app.legal_requirements?.article || "Geral"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="evidence_url">URL de Evidência</Label>
                  <Input
                    id="evidence_url"
                    type="url"
                    placeholder="https://..."
                    value={formData.evidence_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, evidence_url: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => editingPlan ? updateMutation.mutate() : createMutation.mutate()}
                  disabled={!formData.title.trim() || createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingPlan ? "Guardar Alterações" : "Criar Plano"}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Plans List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !actionPlans?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum plano de ação criado</p>
              <p className="text-sm">Crie planos de ação para gerir não-conformidades</p>
            </div>
          ) : !filteredPlans?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum plano encontrado com o filtro selecionado</p>
              <Button variant="link" onClick={() => setStatusFilter("all")}>
                Ver todos
              </Button>
            </div>
          ) : (
            filteredPlans.map(plan => (
              <Card key={plan.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(plan.status)}
                        {plan.due_date && (
                          <Badge variant="outline" className="gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(plan.due_date), "d MMM yyyy", { locale: pt })}
                          </Badge>
                        )}
                        {plan.responsible && (
                          <Badge variant="secondary" className="gap-1">
                            <User className="h-3 w-3" />
                            {plan.responsible}
                          </Badge>
                        )}
                      </div>
                      
                      <h4 className="font-medium">{plan.title}</h4>
                      
                      {plan.description && (
                        <p className="text-sm text-muted-foreground">{plan.description}</p>
                      )}

                      {plan.legal_requirements && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>
                            {plan.legal_requirements.legislation?.number} - {plan.legal_requirements.article || "Geral"}
                          </span>
                        </div>
                      )}

                      {plan.evidence_url && (
                        <a 
                          href={plan.evidence_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver evidência
                        </a>
                      )}
                    </div>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditing(plan)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(plan.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
