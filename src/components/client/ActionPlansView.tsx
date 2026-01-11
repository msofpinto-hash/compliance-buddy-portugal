import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Calendar, 
  User, 
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  ArrowRight,
  ExternalLink,
  Filter,
  List,
  LayoutGrid,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  Download,
  FileSpreadsheet,
  Printer,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { exportToExcel as exportExcel, SheetData } from "@/lib/excelUtils";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Extend jsPDF type for autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType; gradient?: string }> = {
  pendente: { label: "Pendente", color: "text-slate-700", bgColor: "bg-slate-50 border-slate-200", icon: Clock, gradient: "from-slate-400 to-slate-500" },
  em_curso: { label: "Em Curso", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200", icon: AlertCircle, gradient: "from-amber-400 to-amber-500" },
  concluido: { label: "Concluído", color: "text-emerald-700", bgColor: "bg-emerald-50 border-emerald-200", icon: CheckCircle2, gradient: "from-emerald-400 to-emerald-500" },
  cancelado: { label: "Cancelado", color: "text-slate-500", bgColor: "bg-slate-50 border-slate-200", icon: XCircle, gradient: "from-slate-300 to-slate-400" },
};

const typeConfig = {
  audit: { label: "Auditoria", color: "bg-sky-50 text-sky-700 border-sky-200", icon: "📋" },
  adhoc: { label: "Ad-hoc", color: "bg-violet-50 text-violet-700 border-violet-200", icon: "⚡" },
};

const priorityConfig: Record<string, { label: string; color: string; bgColor: string; dotColor: string; ringColor: string }> = {
  alta: { label: "Alta", color: "text-rose-700", bgColor: "bg-rose-50 border-rose-200", dotColor: "bg-gradient-to-br from-rose-400 to-rose-600", ringColor: "ring-rose-200" },
  media: { label: "Média", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200", dotColor: "bg-gradient-to-br from-amber-400 to-amber-500", ringColor: "ring-amber-200" },
  baixa: { label: "Baixa", color: "text-emerald-700", bgColor: "bg-emerald-50 border-emerald-200", dotColor: "bg-gradient-to-br from-emerald-400 to-emerald-500", ringColor: "ring-emerald-200" },
};

interface ActionPlansViewProps {
  organizationIds: string[];
  organizations: Array<{ id: string; name: string }>;
}

interface ActionPlan {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  responsible: string | null;
  evidence_url: string | null;
  organization_id: string;
  audit_requirement_id: string | null;
  requirement_id: string | null;
  created_at: string;
  organizations?: { id: string; name: string } | null;
  legal_requirements?: { 
    id: string; 
    article: string | null; 
    requirement_text: string;
    legislation?: { number: string } | null;
  } | null;
  audit_requirements?: {
    id: string;
    audit_id: string;
    findings: string | null;
    audits?: { title: string } | null;
  } | null;
}

// Create Action Plan Dialog
function CreateActionPlanDialog({ 
  organizations, 
  onCreated 
}: { 
  organizations: Array<{ id: string; name: string }>; 
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    organization_id: organizations.length === 1 ? organizations[0].id : "",
    title: "",
    description: "",
    responsible: "",
    due_date: "",
    priority: "media",
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
        priority: form.priority,
        created_by: user?.id,
        status: "pendente",
      });

      if (error) throw error;

      toast({ title: "Plano de ação criado" });
      setForm({ organization_id: organizations.length === 1 ? organizations[0].id : "", title: "", description: "", responsible: "", due_date: "", priority: "media" });
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
          Nova Ação
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Ação (Ad-hoc)</DialogTitle>
          <DialogDescription>
            Crie uma ação independente de auditorias
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {organizations.length > 1 && (
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
          )}
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
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Alta
                    </div>
                  </SelectItem>
                  <SelectItem value="media">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Média
                    </div>
                  </SelectItem>
                  <SelectItem value="baixa">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Baixa
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            Criar Ação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Import from Audit Dialog
function ImportFromAuditDialog({ 
  organizations, 
  onImported 
}: { 
  organizations: Array<{ id: string; name: string }>; 
  onImported: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(organizations.length === 1 ? organizations[0].id : "");
  const [selectedAudit, setSelectedAudit] = useState("");
  const [selectedFindings, setSelectedFindings] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

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
          title: `Ação corretiva: ${(finding as any)?.legislation?.number || ""} - ${(finding as any)?.legal_requirements?.article || "Requisito"}`,
          description: (finding as any)?.findings || (finding as any)?.legal_requirements?.requirement_text || "",
          status: "pendente",
          created_by: user?.id,
        };
      });

      const { error } = await supabase.from("action_plans").insert(plansToCreate);
      if (error) throw error;

      toast({ title: "Planos de ação criados", description: `${plansToCreate.length} planos importados` });
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <ArrowRight className="h-4 w-4" />
          Importar Auditoria
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Constatações</DialogTitle>
          <DialogDescription>
            Crie ações a partir das não conformidades de auditorias
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            {organizations.length > 1 && (
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
            )}
            <div className={`space-y-2 ${organizations.length === 1 ? "col-span-2" : ""}`}>
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
                <Label>Constatações</Label>
                {availableFindings.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFindings(availableFindings.map(f => f.id))}>
                    Selecionar Todas ({availableFindings.length})
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[200px] border rounded-md p-2">
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
                          <Checkbox checked={selectedFindings.includes(finding.id)} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">
                              {finding.legislation?.number} - {finding.legal_requirements?.article}
                            </p>
                            <p className="text-sm line-clamp-2">{finding.legal_requirements?.requirement_text}</p>
                          </div>
                          <Badge variant="outline" className={finding.compliance_status === "non_compliant" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}>
                            {finding.compliance_status === "non_compliant" ? "NC" : "Parcial"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhuma constatação disponível</p>
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
            Criar {selectedFindings.length} Ação(ões)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActionPlansView({ organizationIds, organizations }: ActionPlansViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"list" | "cards">("list");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<ActionPlan | null>(null);
  
  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ 
    key: "created_at", 
    direction: "desc" 
  });
  
  // Filters
  const [filters, setFilters] = useState({
    search: "",
    type: "all", // all, audit, adhoc
    status: [] as string[],
    priority: "all", // all, alta, media, baixa
    responsible: "",
    dateStart: "",
    dateEnd: "",
    hideCompleted: false,
  });

  // Fetch action plans
  const { data: actionPlans, isLoading, refetch } = useQuery({
    queryKey: ["action-plans-view", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("action_plans")
        .select(`
          *,
          organizations(id, name),
          legal_requirements(id, article, requirement_text, legislation(number)),
          audit_requirements:audit_requirement_id(
            id,
            audit_id,
            findings,
            audits(title)
          )
        `)
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ActionPlan[];
    },
    enabled: organizationIds.length > 0,
  });

  // Get unique responsibles for filter
  const uniqueResponsibles = useMemo(() => {
    const responsibles = actionPlans?.map(p => p.responsible).filter(Boolean) || [];
    return [...new Set(responsibles)] as string[];
  }, [actionPlans]);

  // Priority order map for sorting
  const priorityOrder: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  const statusOrder: Record<string, number> = { pendente: 0, em_curso: 1, concluido: 2, cancelado: 3 };

  // Filter and sort action plans
  const filteredPlans = useMemo(() => {
    if (!actionPlans) return [];
    
    const filtered = actionPlans.filter(plan => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matches = 
          plan.title.toLowerCase().includes(searchLower) ||
          plan.description?.toLowerCase().includes(searchLower) ||
          plan.responsible?.toLowerCase().includes(searchLower);
        if (!matches) return false;
      }

      // Type filter
      if (filters.type === "audit" && !plan.audit_requirement_id) return false;
      if (filters.type === "adhoc" && plan.audit_requirement_id) return false;

      // Status filter
      if (filters.status.length > 0 && !filters.status.includes(plan.status || "pendente")) return false;

      // Priority filter
      if (filters.priority !== "all" && (plan.priority || "media") !== filters.priority) return false;

      // Responsible filter
      if (filters.responsible && plan.responsible !== filters.responsible) return false;

      // Date filters
      if (filters.dateStart && plan.due_date && new Date(plan.due_date) < new Date(filters.dateStart)) return false;
      if (filters.dateEnd && plan.due_date && new Date(plan.due_date) > new Date(filters.dateEnd)) return false;

      // Hide completed
      if (filters.hideCompleted && plan.status === "concluido") return false;

      return true;
    });

    // Sort
    return filtered.sort((a, b) => {
      const { key, direction } = sortConfig;
      const multiplier = direction === "asc" ? 1 : -1;

      switch (key) {
        case "priority":
          const aPriority = priorityOrder[a.priority || "media"] ?? 1;
          const bPriority = priorityOrder[b.priority || "media"] ?? 1;
          return (aPriority - bPriority) * multiplier;
        case "status":
          const aStatus = statusOrder[a.status || "pendente"] ?? 0;
          const bStatus = statusOrder[b.status || "pendente"] ?? 0;
          return (aStatus - bStatus) * multiplier;
        case "due_date":
          const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return (aDate - bDate) * multiplier;
        case "title":
          return a.title.localeCompare(b.title) * multiplier;
        case "responsible":
          return (a.responsible || "").localeCompare(b.responsible || "") * multiplier;
        case "created_at":
        default:
          return (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) * multiplier;
      }
    });
  }, [actionPlans, filters, sortConfig]);

  // Toggle sort
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }));
  };

  // Sort icon helper
  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortConfig.direction === "asc" 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Stats
  const stats = useMemo(() => {
    const all = actionPlans || [];
    return {
      total: all.length,
      pendente: all.filter(p => p.status === "pendente").length,
      em_curso: all.filter(p => p.status === "em_curso").length,
      concluido: all.filter(p => p.status === "concluido").length,
      overdue: all.filter(p => {
        if (!p.due_date || p.status === "concluido") return false;
        return new Date(p.due_date) < new Date();
      }).length,
      fromAudit: all.filter(p => p.audit_requirement_id).length,
      adhoc: all.filter(p => !p.audit_requirement_id).length,
    };
  }, [actionPlans]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.type !== "all") count++;
    if (filters.status.length > 0) count++;
    if (filters.priority !== "all") count++;
    if (filters.responsible) count++;
    if (filters.dateStart || filters.dateEnd) count++;
    if (filters.hideCompleted) count++;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      search: "",
      type: "all",
      status: [],
      priority: "all",
      responsible: "",
      dateStart: "",
      dateEnd: "",
      hideCompleted: false,
    });
  };

  const handleStatusChange = async (planId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("action_plans")
        .update({ status: newStatus })
        .eq("id", planId);
      if (error) throw error;
      toast({ title: "Estado atualizado" });
      refetch();
    } catch (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  };

  const toggleStatusFilter = (status: string) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status.includes(status) 
        ? prev.status.filter(s => s !== status)
        : [...prev.status, status]
    }));
  };

  const getTypeInfo = (plan: ActionPlan) => {
    return plan.audit_requirement_id ? typeConfig.audit : typeConfig.adhoc;
  };

  const isOverdue = (plan: ActionPlan) => {
    if (!plan.due_date || plan.status === "concluido") return false;
    return new Date(plan.due_date) < new Date();
  };

  // Export functions
  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      pendente: "Pendente",
      em_curso: "Em Curso",
      concluido: "Concluído",
      cancelado: "Cancelado",
    };
    return labels[status] || status || "Pendente";
  };

  const getTypeLabel = (plan: ActionPlan): string => {
    return plan.audit_requirement_id ? "Auditoria" : "Ad-hoc";
  };

  const formatDateExport = (dateStr: string | null): string => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd/MM/yyyy");
  };

  const exportToExcel = async () => {
    const dataRows = filteredPlans.map(plan => ({
      tipo: getTypeLabel(plan),
      titulo: plan.title,
      descricao: plan.description || "-",
      estado: getStatusLabel(plan.status || "pendente"),
      responsavel: plan.responsible || "-",
      prazo: formatDateExport(plan.due_date),
      origemAuditoria: plan.audit_requirements?.audits?.title || "-",
      criadoEm: formatDateExport(plan.created_at),
    }));

    const dataColumns = [
      { header: "Tipo", key: "tipo", width: 12 },
      { header: "Título", key: "titulo", width: 40 },
      { header: "Descrição", key: "descricao", width: 50 },
      { header: "Estado", key: "estado", width: 12 },
      { header: "Responsável", key: "responsavel", width: 20 },
      { header: "Prazo", key: "prazo", width: 12 },
      { header: "Origem Auditoria", key: "origemAuditoria", width: 30 },
      { header: "Criado em", key: "criadoEm", width: 12 },
    ];

    const summaryRows = [
      { metrica: "Total de Ações (Filtradas)", valor: filteredPlans.length },
      { metrica: "Pendentes", valor: filteredPlans.filter(p => p.status === "pendente").length },
      { metrica: "Em Curso", valor: filteredPlans.filter(p => p.status === "em_curso").length },
      { metrica: "Concluídas", valor: filteredPlans.filter(p => p.status === "concluido").length },
      { metrica: "De Auditoria", valor: filteredPlans.filter(p => p.audit_requirement_id).length },
      { metrica: "Ad-hoc", valor: filteredPlans.filter(p => !p.audit_requirement_id).length },
      { metrica: "Data Exportação", valor: format(new Date(), "dd/MM/yyyy HH:mm") },
    ];

    const summaryColumns = [
      { header: "Métrica", key: "metrica", width: 25 },
      { header: "Valor", key: "valor", width: 20 },
    ];

    const sheets: SheetData[] = [
      { name: "Resumo", columns: summaryColumns, rows: summaryRows },
      { name: "Planos de Ação", columns: dataColumns, rows: dataRows },
    ];

    const fileName = `planos-acao-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    await exportExcel(sheets, fileName);
    toast({ title: "Excel exportado", description: `${filteredPlans.length} registos exportados` });
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text("Planos de Ação", 20, 20);

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Gerado em: ${format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: pt })}`, 20, 28);

    // Stats boxes
    const statsY = 38;
    const boxWidth = 35;
    const boxHeight = 20;
    const boxGap = 4;

    const pdfStats = [
      { label: "Total", value: filteredPlans.length, color: [37, 99, 235] as [number, number, number] },
      { label: "Pendentes", value: filteredPlans.filter(p => p.status === "pendente").length, color: [107, 114, 128] as [number, number, number] },
      { label: "Em Curso", value: filteredPlans.filter(p => p.status === "em_curso").length, color: [234, 179, 8] as [number, number, number] },
      { label: "Concluídas", value: filteredPlans.filter(p => p.status === "concluido").length, color: [22, 163, 74] as [number, number, number] },
    ];

    pdfStats.forEach((stat, i) => {
      const x = 20 + i * (boxWidth + boxGap);
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(x, statsY, boxWidth, boxHeight, 2, 2, "F");
      doc.setFontSize(14);
      doc.setTextColor(...stat.color);
      doc.text(String(stat.value), x + boxWidth / 2, statsY + 10, { align: "center" });
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(stat.label, x + boxWidth / 2, statsY + 16, { align: "center" });
    });

    // Table
    const tableData = filteredPlans.map(plan => [
      getTypeLabel(plan),
      plan.title.length > 50 ? plan.title.substring(0, 47) + "..." : plan.title,
      getStatusLabel(plan.status || "pendente"),
      plan.responsible || "-",
      formatDateExport(plan.due_date),
    ]);

    doc.autoTable({
      startY: statsY + boxHeight + 10,
      head: [["Tipo", "Título", "Estado", "Responsável", "Prazo"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { 
        fillColor: [243, 244, 246], 
        textColor: [17, 24, 39],
        fontStyle: "bold" 
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 70 },
        2: { cellWidth: 22 },
        3: { cellWidth: 35 },
        4: { cellWidth: 25 },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 20, right: 20 },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
    }

    const fileName = `planos-acao-${format(new Date(), "yyyy-MM-dd")}.pdf`;
    doc.save(fileName);
    toast({ title: "PDF exportado", description: `${filteredPlans.length} registos exportados` });
  };

  const handlePrint = () => {
    // Create a print-specific stylesheet
    const printStyles = `
      @media print {
        body * { visibility: hidden; }
        #print-container, #print-container * { visibility: visible; }
        #print-container { 
          position: absolute; 
          left: 0; 
          top: 0; 
          width: 100%;
          padding: 20px;
        }
        .print-header { 
          text-align: center; 
          margin-bottom: 20px;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 15px;
        }
        .print-title { 
          font-size: 24px; 
          font-weight: bold; 
          color: #1f2937;
          margin: 0;
        }
        .print-subtitle { 
          font-size: 12px; 
          color: #6b7280;
          margin-top: 5px;
        }
        .print-stats {
          display: flex;
          justify-content: center;
          gap: 30px;
          margin-bottom: 20px;
          padding: 10px 0;
        }
        .print-stat {
          text-align: center;
        }
        .print-stat-value {
          font-size: 20px;
          font-weight: bold;
        }
        .print-stat-label {
          font-size: 10px;
          color: #6b7280;
        }
        .print-table { 
          width: 100%; 
          border-collapse: collapse; 
          font-size: 11px;
        }
        .print-table th { 
          background: #f3f4f6; 
          border: 1px solid #e5e7eb;
          padding: 8px 10px;
          text-align: left;
          font-weight: 600;
          color: #374151;
        }
        .print-table td { 
          border: 1px solid #e5e7eb;
          padding: 6px 10px;
          vertical-align: top;
        }
        .print-table tr:nth-child(even) { 
          background: #f9fafb; 
        }
        .print-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 500;
        }
        .print-badge-audit { background: #dbeafe; color: #1e40af; }
        .print-badge-adhoc { background: #f3e8ff; color: #7c3aed; }
        .print-badge-pendente { background: #f3f4f6; color: #374151; }
        .print-badge-em_curso { background: #fef3c7; color: #92400e; }
        .print-badge-concluido { background: #d1fae5; color: #065f46; }
        .print-badge-cancelado { background: #f3f4f6; color: #6b7280; }
        .print-overdue { color: #dc2626; font-weight: 500; }
        .print-footer {
          margin-top: 20px;
          text-align: center;
          font-size: 10px;
          color: #9ca3af;
          border-top: 1px solid #e5e7eb;
          padding-top: 10px;
        }
        @page { 
          size: A4 landscape; 
          margin: 15mm;
        }
      }
    `;

    // Create print container
    const printContainer = document.createElement("div");
    printContainer.id = "print-container";

    const printStats = {
      total: filteredPlans.length,
      pendente: filteredPlans.filter(p => p.status === "pendente").length,
      em_curso: filteredPlans.filter(p => p.status === "em_curso").length,
      concluido: filteredPlans.filter(p => p.status === "concluido").length,
    };

    printContainer.innerHTML = `
      <div class="print-header">
        <h1 class="print-title">Planos de Ação</h1>
        <p class="print-subtitle">Gerado em ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: pt })}</p>
      </div>
      <div class="print-stats">
        <div class="print-stat">
          <div class="print-stat-value">${printStats.total}</div>
          <div class="print-stat-label">Total</div>
        </div>
        <div class="print-stat">
          <div class="print-stat-value" style="color: #6b7280;">${printStats.pendente}</div>
          <div class="print-stat-label">Pendentes</div>
        </div>
        <div class="print-stat">
          <div class="print-stat-value" style="color: #d97706;">${printStats.em_curso}</div>
          <div class="print-stat-label">Em Curso</div>
        </div>
        <div class="print-stat">
          <div class="print-stat-value" style="color: #059669;">${printStats.concluido}</div>
          <div class="print-stat-label">Concluídas</div>
        </div>
      </div>
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 70px;">Tipo</th>
            <th>Título</th>
            <th style="width: 100px;">Estado</th>
            <th style="width: 120px;">Responsável</th>
            <th style="width: 90px;">Prazo</th>
          </tr>
        </thead>
        <tbody>
          ${filteredPlans.map(plan => {
            const typeClass = plan.audit_requirement_id ? "print-badge-audit" : "print-badge-adhoc";
            const typeLabel = plan.audit_requirement_id ? "Auditoria" : "Ad-hoc";
            const statusClass = `print-badge-${plan.status || "pendente"}`;
            const isOverduePlan = plan.due_date && plan.status !== "concluido" && new Date(plan.due_date) < new Date();
            return `
              <tr>
                <td><span class="print-badge ${typeClass}">${typeLabel}</span></td>
                <td>${plan.title}</td>
                <td><span class="print-badge ${statusClass}">${getStatusLabel(plan.status || "pendente")}</span></td>
                <td>${plan.responsible || "-"}</td>
                <td class="${isOverduePlan ? "print-overdue" : ""}">${plan.due_date ? formatDateExport(plan.due_date) : "-"}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
      <div class="print-footer">
        Documento gerado automaticamente • ${filteredPlans.length} registos
      </div>
    `;

    // Add styles and container to document
    const styleSheet = document.createElement("style");
    styleSheet.textContent = printStyles;
    document.head.appendChild(styleSheet);
    document.body.appendChild(printContainer);

    // Print
    window.print();

    // Cleanup
    document.head.removeChild(styleSheet);
    document.body.removeChild(printContainer);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Header - Aligned with other modules */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-emerald-500/20">
        <div className="absolute inset-0 bg-grid-white/10" />
        <div className="relative flex flex-col md:flex-row items-center justify-between gap-6 p-6 md:p-8">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-primary/20 text-primary border-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Ações Corretivas
              </Badge>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Planos de Ação</h1>
            <p className="text-muted-foreground text-lg max-w-xl">
              Gestão de ações corretivas e preventivas para garantir a conformidade legal
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-background/80 backdrop-blur-sm">
                  <Download className="h-4 w-4" />
                  Exportar
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToExcel} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToPDF} className="gap-2">
                  <Download className="h-4 w-4" />
                  Exportar PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Imprimir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Stats Row - Enhanced */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card 
          className={`group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${!filters.status.length && filters.type === "all" ? "ring-2 ring-primary/20 border-primary/30" : ""}`}
          onClick={() => clearFilters()}
        >
          <CardContent className="p-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-3xl font-bold text-primary">{stats.total}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">Total</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${filters.status.includes("pendente") ? "ring-2 ring-slate-300 border-slate-400" : ""}`}
          onClick={() => toggleStatusFilter("pendente")}
        >
          <CardContent className="p-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <p className="text-3xl font-bold text-slate-600">{stats.pendente}</p>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1">Pendentes</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${filters.status.includes("em_curso") ? "ring-2 ring-amber-300 border-amber-400" : ""}`}
          onClick={() => toggleStatusFilter("em_curso")}
        >
          <CardContent className="p-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <p className="text-3xl font-bold text-amber-600">{stats.em_curso}</p>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1">Em Curso</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${filters.status.includes("concluido") ? "ring-2 ring-emerald-300 border-emerald-400" : ""}`}
          onClick={() => toggleStatusFilter("concluido")}
        >
          <CardContent className="p-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-3xl font-bold text-emerald-600">{stats.concluido}</p>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1">Concluídas</p>
          </CardContent>
        </Card>
        
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <XCircle className="h-4 w-4 text-rose-500" />
              <p className="text-3xl font-bold text-rose-600">{stats.overdue}</p>
            </div>
            <p className="text-xs text-rose-600/80 font-medium mt-1">Em Atraso</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${filters.type === "audit" ? "ring-2 ring-sky-300 border-sky-400" : ""}`}
          onClick={() => setFilters(p => ({ ...p, type: p.type === "audit" ? "all" : "audit" }))}
        >
          <CardContent className="p-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-3xl font-bold text-sky-600">{stats.fromAudit}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">📋 Auditoria</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${filters.type === "adhoc" ? "ring-2 ring-violet-300 border-violet-400" : ""}`}
          onClick={() => setFilters(p => ({ ...p, type: p.type === "adhoc" ? "all" : "adhoc" }))}
        >
          <CardContent className="p-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-3xl font-bold text-violet-600">{stats.adhoc}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">⚡ Ad-hoc</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar - Enhanced */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <CreateActionPlanDialog organizations={organizations} onCreated={refetch} />
            <ImportFromAuditDialog organizations={organizations} onImported={refetch} />
            
            <div className="h-6 w-px bg-border hidden sm:block" />
            
            <Button 
              variant={filtersOpen ? "secondary" : "outline"} 
              size="sm" 
              className="gap-2"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
            
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
                Limpar
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar ações..."
                value={filters.search}
                onChange={(e) => setFilters(p => ({ ...p, search: e.target.value }))}
                className="pl-9 w-64 h-9"
              />
            </div>
            <div className="flex bg-muted rounded-lg p-1">
              <Button 
                variant={viewMode === "list" ? "secondary" : "ghost"} 
                size="sm" 
                className="h-7 px-3"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button 
                variant={viewMode === "cards" ? "secondary" : "ghost"} 
                size="sm" 
                className="h-7 px-3"
                onClick={() => setViewMode("cards")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Panel - Enhanced */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <Card className="border-dashed">
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</Label>
                  <Select value={filters.type} onValueChange={(v) => setFilters(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="w-full h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="audit">📋 Auditoria</SelectItem>
                      <SelectItem value="adhoc">⚡ Ad-hoc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</Label>
                  <Select 
                    value={filters.status.length === 1 ? filters.status[0] : "all"} 
                    onValueChange={(v) => setFilters(p => ({ ...p, status: v === "all" ? [] : [v] }))}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os estados</SelectItem>
                      <SelectItem value="pendente">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-slate-500" />
                          Pendente
                        </div>
                      </SelectItem>
                      <SelectItem value="em_curso">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-3 w-3 text-amber-500" />
                          Em Curso
                        </div>
                      </SelectItem>
                      <SelectItem value="concluido">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Concluído
                        </div>
                      </SelectItem>
                      <SelectItem value="cancelado">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-3 w-3 text-slate-400" />
                          Cancelado
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prioridade</Label>
                  <Select value={filters.priority} onValueChange={(v) => setFilters(p => ({ ...p, priority: v }))}>
                    <SelectTrigger className="w-full h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as prioridades</SelectItem>
                      <SelectItem value="alta">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-rose-400 to-rose-600" />
                          Alta
                        </div>
                      </SelectItem>
                      <SelectItem value="media">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-amber-400 to-amber-500" />
                          Média
                        </div>
                      </SelectItem>
                      <SelectItem value="baixa">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500" />
                          Baixa
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Responsável</Label>
                  <Select value={filters.responsible || "all"} onValueChange={(v) => setFilters(p => ({ ...p, responsible: v === "all" ? "" : v }))}>
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueResponsibles.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prazo</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={filters.dateStart}
                      onChange={(e) => setFilters(p => ({ ...p, dateStart: e.target.value }))}
                      className="text-xs w-full h-9"
                      placeholder="De"
                    />
                    <Input
                      type="date"
                      value={filters.dateEnd}
                      onChange={(e) => setFilters(p => ({ ...p, dateEnd: e.target.value }))}
                      className="text-xs w-full h-9"
                      placeholder="Até"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-dashed">
                <Checkbox 
                  id="hideCompleted"
                  checked={filters.hideCompleted}
                  onCheckedChange={(v) => setFilters(p => ({ ...p, hideCompleted: !!v }))}
                />
                <Label htmlFor="hideCompleted" className="text-sm cursor-pointer text-muted-foreground">
                  Ocultar ações concluídas
                </Label>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Content */}
      {filteredPlans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="flex h-16 w-16 mx-auto mb-4 items-center justify-center rounded-full bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">
              {actionPlans?.length === 0 ? "Sem planos de ação" : "Nenhum resultado encontrado"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {actionPlans?.length === 0 
                ? "Crie o seu primeiro plano de ação para começar a gerir as suas ações corretivas." 
                : "Tente ajustar os filtros para encontrar o que procura."}
            </p>
            {actionPlans?.length === 0 && (
              <div className="mt-6">
                <CreateActionPlanDialog organizations={organizations} onCreated={refetch} />
              </div>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <Card className="overflow-hidden">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead 
                    className="w-[50px] cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => handleSort("priority")}
                  >
                    <div className="flex items-center justify-center">
                      <SortIcon column="priority" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px] font-semibold">Tipo</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted transition-colors font-semibold"
                    onClick={() => handleSort("title")}
                  >
                    <div className="flex items-center gap-1">
                      Ação
                      <SortIcon column="title" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="w-[120px] cursor-pointer hover:bg-muted transition-colors font-semibold"
                    onClick={() => handleSort("due_date")}
                  >
                    <div className="flex items-center gap-1">
                      Prazo
                      <SortIcon column="due_date" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="w-[130px] cursor-pointer hover:bg-muted transition-colors font-semibold"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      Estado
                      <SortIcon column="status" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="w-[150px] cursor-pointer hover:bg-muted transition-colors font-semibold"
                    onClick={() => handleSort("responsible")}
                  >
                    <div className="flex items-center gap-1">
                      Responsável
                      <SortIcon column="responsible" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[110px] font-semibold">Alterar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans.map((plan, index) => {
                  const typeInfo = getTypeInfo(plan);
                  const statusInfo = statusConfig[plan.status || "pendente"];
                  const priorityInfo = priorityConfig[plan.priority || "media"];
                  const overdue = isOverdue(plan);
                  const StatusIcon = statusInfo.icon;

                  return (
                    <TableRow 
                      key={plan.id} 
                      className={`cursor-pointer transition-colors group ${overdue ? "bg-rose-50/50 hover:bg-rose-50" : "hover:bg-muted/50"}`}
                      onClick={() => setSelectedPlan(plan)}
                    >
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <span 
                            className={`h-3.5 w-3.5 rounded-full shadow-sm ring-2 ${priorityInfo.dotColor} ${priorityInfo.ringColor}`} 
                            title={`Prioridade: ${priorityInfo.label}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs font-medium ${typeInfo.color}`}>
                          {typeInfo.icon} {typeInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium line-clamp-1 group-hover:text-primary transition-colors">{plan.title}</p>
                          {plan.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{plan.description}</p>
                          )}
                          {plan.audit_requirements?.audits && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="text-sky-600">📋</span>
                              <span className="line-clamp-1">{plan.audit_requirements.audits.title}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {plan.due_date ? (
                          <div className={`flex items-center gap-1.5 ${overdue ? "text-rose-600 font-semibold" : "text-muted-foreground"}`}>
                            <Calendar className={`h-3.5 w-3.5 ${overdue ? "text-rose-500" : ""}`} />
                            {format(new Date(plan.due_date), "dd/MM/yyyy")}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1.5 font-medium ${statusInfo.bgColor} ${statusInfo.color}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {plan.responsible ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                              {plan.responsible.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm">{plan.responsible}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value={plan.status || "pendente"} onValueChange={(v) => handleStatusChange(plan.id, v)}>
                          <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendente">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3 text-slate-500" />
                                Pendente
                              </div>
                            </SelectItem>
                            <SelectItem value="em_curso">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-3 w-3 text-amber-500" />
                                Em Curso
                              </div>
                            </SelectItem>
                            <SelectItem value="concluido">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                Concluído
                              </div>
                            </SelectItem>
                            <SelectItem value="cancelado">
                              <div className="flex items-center gap-2">
                                <XCircle className="h-3 w-3 text-slate-400" />
                                Cancelado
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlans.map((plan) => {
            const typeInfo = getTypeInfo(plan);
            const statusInfo = statusConfig[plan.status || "pendente"];
            const priorityInfo = priorityConfig[plan.priority || "media"];
            const overdue = isOverdue(plan);
            const StatusIcon = statusInfo.icon;

            return (
              <Card 
                key={plan.id} 
                className={`group cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${overdue ? "border-rose-300 bg-rose-50/30" : "hover:border-primary/30"}`}
                onClick={() => setSelectedPlan(plan)}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span 
                        className={`h-3.5 w-3.5 rounded-full shadow-sm ring-2 ${priorityInfo.dotColor} ${priorityInfo.ringColor}`} 
                        title={`Prioridade: ${priorityInfo.label}`}
                      />
                      <Badge variant="outline" className={`text-xs font-medium ${typeInfo.color}`}>
                        {typeInfo.icon} {typeInfo.label}
                      </Badge>
                    </div>
                    <Badge variant="outline" className={`gap-1.5 font-medium text-xs ${statusInfo.bgColor} ${statusInfo.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                  
                  {/* Content */}
                  <div className="space-y-2">
                    <h4 className="font-semibold line-clamp-2 group-hover:text-primary transition-colors">{plan.title}</h4>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
                    )}
                  </div>
                  
                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-dashed">
                    <div className="flex items-center gap-2">
                      {plan.responsible ? (
                        <>
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {plan.responsible.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-muted-foreground">{plan.responsible}</span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">Sem responsável</span>
                      )}
                    </div>
                    {plan.due_date && (
                      <div className={`flex items-center gap-1.5 text-xs ${overdue ? "text-rose-600 font-semibold" : "text-muted-foreground"}`}>
                        <Calendar className={`h-3.5 w-3.5 ${overdue ? "text-rose-500" : ""}`} />
                        {format(new Date(plan.due_date), "dd/MM/yyyy")}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog - Enhanced */}
      <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              {selectedPlan && (
                <Badge variant="outline" className={`text-xs font-medium ${getTypeInfo(selectedPlan).color}`}>
                  {getTypeInfo(selectedPlan).icon} {getTypeInfo(selectedPlan).label}
                </Badge>
              )}
              {selectedPlan && isOverdue(selectedPlan) && (
                <Badge variant="outline" className="text-xs font-medium bg-rose-50 text-rose-700 border-rose-200">
                  ⚠️ Em Atraso
                </Badge>
              )}
            </div>
            <DialogTitle className="text-lg mt-2">Detalhes da Ação</DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-5 py-2">
              {/* Title */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Título</Label>
                <p className="font-semibold text-foreground">{selectedPlan.title}</p>
              </div>
              
              {/* Description */}
              {selectedPlan.description && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Descrição</Label>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">{selectedPlan.description}</p>
                </div>
              )}
              
              {/* Grid Info */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prioridade</Label>
                  <div className="flex items-center gap-2">
                    <span className={`h-3.5 w-3.5 rounded-full shadow-sm ring-2 ${priorityConfig[selectedPlan.priority || "media"].dotColor} ${priorityConfig[selectedPlan.priority || "media"].ringColor}`} />
                    <span className={`font-medium ${priorityConfig[selectedPlan.priority || "media"].color}`}>
                      {priorityConfig[selectedPlan.priority || "media"].label}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</Label>
                  <Select value={selectedPlan.status || "pendente"} onValueChange={(v) => {
                    handleStatusChange(selectedPlan.id, v);
                    setSelectedPlan({ ...selectedPlan, status: v });
                  }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-slate-500" />
                          Pendente
                        </div>
                      </SelectItem>
                      <SelectItem value="em_curso">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-3 w-3 text-amber-500" />
                          Em Curso
                        </div>
                      </SelectItem>
                      <SelectItem value="concluido">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          Concluído
                        </div>
                      </SelectItem>
                      <SelectItem value="cancelado">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-3 w-3 text-slate-400" />
                          Cancelado
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prazo</Label>
                  <div className={`flex items-center gap-1.5 font-medium ${isOverdue(selectedPlan) ? "text-rose-600" : "text-foreground"}`}>
                    <Calendar className={`h-4 w-4 ${isOverdue(selectedPlan) ? "text-rose-500" : "text-muted-foreground"}`} />
                    {selectedPlan.due_date ? format(new Date(selectedPlan.due_date), "dd/MM/yyyy") : "—"}
                  </div>
                </div>
              </div>
              
              {/* Responsible */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Responsável</Label>
                {selectedPlan.responsible ? (
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                      {selectedPlan.responsible.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{selectedPlan.responsible}</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground/50">Sem responsável atribuído</p>
                )}
              </div>
              
              {/* Audit Origin */}
              {selectedPlan.audit_requirements?.audits && (
                <div className="space-y-1.5 p-3 bg-sky-50/50 border border-sky-100 rounded-lg">
                  <Label className="text-xs font-semibold text-sky-700 uppercase tracking-wide flex items-center gap-1.5">
                    📋 Origem da Auditoria
                  </Label>
                  <p className="text-sm font-medium text-sky-900">{selectedPlan.audit_requirements.audits.title}</p>
                </div>
              )}
              
              {/* Evidence */}
              {selectedPlan.evidence_url && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Evidência</Label>
                  <a 
                    href={selectedPlan.evidence_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver documento anexo
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
