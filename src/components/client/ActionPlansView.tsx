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
  Printer
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Extend jsPDF type for autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  pendente: { label: "Pendente", color: "text-gray-700", bgColor: "bg-gray-100 border-gray-300", icon: Clock },
  em_curso: { label: "Em Curso", color: "text-amber-700", bgColor: "bg-amber-100 border-amber-300", icon: AlertCircle },
  concluido: { label: "Concluído", color: "text-green-700", bgColor: "bg-green-100 border-green-300", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", color: "text-gray-500", bgColor: "bg-gray-100 border-gray-300", icon: XCircle },
};

const typeConfig = {
  audit: { label: "Auditoria", color: "bg-blue-100 text-blue-700 border-blue-300" },
  adhoc: { label: "Ad-hoc", color: "bg-purple-100 text-purple-700 border-purple-300" },
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
      setForm({ organization_id: organizations.length === 1 ? organizations[0].id : "", title: "", description: "", responsible: "", due_date: "" });
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
  
  // Filters
  const [filters, setFilters] = useState({
    search: "",
    type: "all", // all, audit, adhoc
    status: [] as string[],
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

  // Filter action plans
  const filteredPlans = useMemo(() => {
    if (!actionPlans) return [];
    
    return actionPlans.filter(plan => {
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

      // Responsible filter
      if (filters.responsible && plan.responsible !== filters.responsible) return false;

      // Date filters
      if (filters.dateStart && plan.due_date && new Date(plan.due_date) < new Date(filters.dateStart)) return false;
      if (filters.dateEnd && plan.due_date && new Date(plan.due_date) > new Date(filters.dateEnd)) return false;

      // Hide completed
      if (filters.hideCompleted && plan.status === "concluido") return false;

      return true;
    });
  }, [actionPlans, filters]);

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

  const exportToExcel = () => {
    const dataToExport = filteredPlans.map(plan => ({
      "Tipo": getTypeLabel(plan),
      "Título": plan.title,
      "Descrição": plan.description || "-",
      "Estado": getStatusLabel(plan.status || "pendente"),
      "Responsável": plan.responsible || "-",
      "Prazo": formatDateExport(plan.due_date),
      "Origem Auditoria": plan.audit_requirements?.audits?.title || "-",
      "Criado em": formatDateExport(plan.created_at),
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    ws["!cols"] = [
      { wch: 12 }, // Tipo
      { wch: 40 }, // Título
      { wch: 50 }, // Descrição
      { wch: 12 }, // Estado
      { wch: 20 }, // Responsável
      { wch: 12 }, // Prazo
      { wch: 30 }, // Origem Auditoria
      { wch: 12 }, // Criado em
    ];

    // Add summary sheet
    const summaryData = [
      { "Métrica": "Total de Ações (Filtradas)", "Valor": filteredPlans.length },
      { "Métrica": "Pendentes", "Valor": filteredPlans.filter(p => p.status === "pendente").length },
      { "Métrica": "Em Curso", "Valor": filteredPlans.filter(p => p.status === "em_curso").length },
      { "Métrica": "Concluídas", "Valor": filteredPlans.filter(p => p.status === "concluido").length },
      { "Métrica": "De Auditoria", "Valor": filteredPlans.filter(p => p.audit_requirement_id).length },
      { "Métrica": "Ad-hoc", "Valor": filteredPlans.filter(p => !p.audit_requirement_id).length },
      { "Métrica": "Data Exportação", "Valor": format(new Date(), "dd/MM/yyyy HH:mm") },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 25 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");
    XLSX.utils.book_append_sheet(wb, ws, "Planos de Ação");

    const fileName = `planos-acao-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Planos de Ação</h2>
          <p className="text-muted-foreground">Gestão de ações corretivas e preventivas</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={exportToExcel} title="Exportar Excel">
            <FileSpreadsheet className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={exportToPDF} title="Exportar PDF">
            <Download className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handlePrint} title="Imprimir">
            <Printer className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => clearFilters()}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-primary/50 transition-colors ${filters.status.includes("pendente") ? "border-primary" : ""}`} onClick={() => toggleStatusFilter("pendente")}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-gray-600">{stats.pendente}</p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-primary/50 transition-colors ${filters.status.includes("em_curso") ? "border-primary" : ""}`} onClick={() => toggleStatusFilter("em_curso")}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.em_curso}</p>
            <p className="text-xs text-muted-foreground">Em Curso</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-primary/50 transition-colors ${filters.status.includes("concluido") ? "border-primary" : ""}`} onClick={() => toggleStatusFilter("concluido")}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.concluido}</p>
            <p className="text-xs text-muted-foreground">Concluídas</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.overdue}</p>
            <p className="text-xs text-muted-foreground">Em Atraso</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-primary/50 transition-colors ${filters.type === "audit" ? "border-primary" : ""}`} onClick={() => setFilters(p => ({ ...p, type: p.type === "audit" ? "all" : "audit" }))}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.fromAudit}</p>
            <p className="text-xs text-muted-foreground">Auditoria</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:border-primary/50 transition-colors ${filters.type === "adhoc" ? "border-primary" : ""}`} onClick={() => setFilters(p => ({ ...p, type: p.type === "adhoc" ? "all" : "adhoc" }))}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.adhoc}</p>
            <p className="text-xs text-muted-foreground">Ad-hoc</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant={filtersOpen ? "default" : "outline"} 
              size="sm" 
              className="gap-2"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <Filter className="h-4 w-4" />
              {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
            </Button>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {activeFiltersCount} filtro(s) aplicado(s)
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 ml-1" onClick={clearFilters}>
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
            <CreateActionPlanDialog organizations={organizations} onCreated={refetch} />
            <ImportFromAuditDialog organizations={organizations} onImported={refetch} />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar..."
                value={filters.search}
                onChange={(e) => setFilters(p => ({ ...p, search: e.target.value }))}
                className="pl-9 w-64"
              />
            </div>
            <div className="flex border rounded-md">
              <Button 
                variant={viewMode === "list" ? "secondary" : "ghost"} 
                size="sm" 
                className="rounded-r-none"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button 
                variant={viewMode === "cards" ? "secondary" : "ghost"} 
                size="sm" 
                className="rounded-l-none"
                onClick={() => setViewMode("cards")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Registo</Label>
                  <Select value={filters.type} onValueChange={(v) => setFilters(p => ({ ...p, type: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="audit">Auditoria</SelectItem>
                      <SelectItem value="adhoc">Ad-hoc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Estado</Label>
                  <Select 
                    value={filters.status.length === 1 ? filters.status[0] : "all"} 
                    onValueChange={(v) => setFilters(p => ({ ...p, status: v === "all" ? [] : [v] }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_curso">Em Curso</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Responsável</Label>
                  <Select value={filters.responsible || "all"} onValueChange={(v) => setFilters(p => ({ ...p, responsible: v === "all" ? "" : v }))}>
                    <SelectTrigger>
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
                  <Label className="text-xs">Data Prazo (De - Até)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={filters.dateStart}
                      onChange={(e) => setFilters(p => ({ ...p, dateStart: e.target.value }))}
                      className="text-xs"
                    />
                    <Input
                      type="date"
                      value={filters.dateEnd}
                      onChange={(e) => setFilters(p => ({ ...p, dateEnd: e.target.value }))}
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="hideCompleted"
                      checked={filters.hideCompleted}
                      onCheckedChange={(v) => setFilters(p => ({ ...p, hideCompleted: !!v }))}
                    />
                    <Label htmlFor="hideCompleted" className="text-xs cursor-pointer">
                      Ocultar concluídas
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Content */}
      {filteredPlans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {actionPlans?.length === 0 ? "Sem planos de ação" : "Nenhum resultado com os filtros aplicados"}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <Card>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="w-[120px]">Prazo</TableHead>
                  <TableHead className="w-[120px]">Estado</TableHead>
                  <TableHead className="w-[150px]">Responsável</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans.map((plan) => {
                  const typeInfo = getTypeInfo(plan);
                  const statusInfo = statusConfig[plan.status || "pendente"];
                  const overdue = isOverdue(plan);
                  const StatusIcon = statusInfo.icon;

                  return (
                    <TableRow 
                      key={plan.id} 
                      className={`cursor-pointer hover:bg-muted/50 ${overdue ? "bg-destructive/5" : ""}`}
                      onClick={() => setSelectedPlan(plan)}
                    >
                      <TableCell>
                        <Badge variant="outline" className={typeInfo.color}>
                          {typeInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium line-clamp-1">{plan.title}</p>
                          {plan.audit_requirements?.audits && (
                            <p className="text-xs text-muted-foreground">
                              Auditoria: {plan.audit_requirements.audits.title}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {plan.due_date ? (
                          <span className={overdue ? "text-destructive font-medium" : ""}>
                            {format(new Date(plan.due_date), "dd/MM/yyyy")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`gap-1 ${statusInfo.bgColor} ${statusInfo.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{plan.responsible || "-"}</span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value={plan.status || "pendente"} onValueChange={(v) => handleStatusChange(plan.id, v)}>
                          <SelectTrigger className="h-8 w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendente">Pendente</SelectItem>
                            <SelectItem value="em_curso">Em Curso</SelectItem>
                            <SelectItem value="concluido">Concluído</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
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
            const overdue = isOverdue(plan);
            const StatusIcon = statusInfo.icon;

            return (
              <Card 
                key={plan.id} 
                className={`cursor-pointer hover:shadow-md transition-shadow ${overdue ? "border-destructive/50" : ""}`}
                onClick={() => setSelectedPlan(plan)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className={typeInfo.color}>
                      {typeInfo.label}
                    </Badge>
                    <Badge variant="outline" className={`gap-1 ${statusInfo.bgColor} ${statusInfo.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                  <div>
                    <h4 className="font-medium line-clamp-2">{plan.title}</h4>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{plan.description}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {plan.responsible || "Sem responsável"}
                    </div>
                    {plan.due_date && (
                      <div className={`flex items-center gap-1 ${overdue ? "text-destructive" : ""}`}>
                        <Calendar className="h-3 w-3" />
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

      {/* Detail Dialog */}
      <Dialog open={!!selectedPlan} onOpenChange={() => setSelectedPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedPlan && (
                <Badge variant="outline" className={getTypeInfo(selectedPlan).color}>
                  {getTypeInfo(selectedPlan).label}
                </Badge>
              )}
              Detalhes da Ação
            </DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Título</Label>
                <p className="font-medium">{selectedPlan.title}</p>
              </div>
              {selectedPlan.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">Descrição</Label>
                  <p className="text-sm">{selectedPlan.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Estado</Label>
                  <Select value={selectedPlan.status || "pendente"} onValueChange={(v) => {
                    handleStatusChange(selectedPlan.id, v);
                    setSelectedPlan({ ...selectedPlan, status: v });
                  }}>
                    <SelectTrigger>
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
                <div>
                  <Label className="text-xs text-muted-foreground">Prazo</Label>
                  <p className={`font-medium ${isOverdue(selectedPlan) ? "text-destructive" : ""}`}>
                    {selectedPlan.due_date ? format(new Date(selectedPlan.due_date), "dd/MM/yyyy") : "-"}
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Responsável</Label>
                <p>{selectedPlan.responsible || "-"}</p>
              </div>
              {selectedPlan.audit_requirements?.audits && (
                <div>
                  <Label className="text-xs text-muted-foreground">Origem</Label>
                  <p className="text-sm">Auditoria: {selectedPlan.audit_requirements.audits.title}</p>
                </div>
              )}
              {selectedPlan.evidence_url && (
                <div>
                  <Label className="text-xs text-muted-foreground">Evidência</Label>
                  <a 
                    href={selectedPlan.evidence_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver documento
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
