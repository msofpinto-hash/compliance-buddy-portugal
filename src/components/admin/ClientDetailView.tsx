import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Building2, 
  BookOpen, 
  ClipboardList, 
  FileCheck, 
  BarChart3,
  Users,
  Edit,
  Trash2,
  Plus,
  Search,
  ExternalLink,
  FileText,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
  ChevronDown
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Tables } from "@/integrations/supabase/types";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LegislationApplicabilitySelect } from "@/components/LegislationApplicabilitySelect";
import { RequirementApplicabilitySelect } from "@/components/RequirementApplicabilitySelect";

type Organization = Tables<"organizations">;

interface ClientDetailViewProps {
  organization: Organization;
  onBack: () => void;
}

// Status configs
const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pendente: { label: "Pendente", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  em_curso: { label: "Em Curso", color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertCircle },
  concluido: { label: "Concluído", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", color: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  alta: { label: "Alta", color: "bg-rose-100 text-rose-700 border-rose-200" },
  media: { label: "Média", color: "bg-amber-100 text-amber-700 border-amber-200" },
  baixa: { label: "Baixa", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

export function ClientDetailView({ organization, onBack }: ClientDetailViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("legislacao");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLegislation, setExpandedLegislation] = useState<Set<string>>(new Set());

  // Fetch organization legislation with requirements
  const { data: orgLegislation, isLoading: loadingLegislation } = useQuery({
    queryKey: ["client-detail-legislation", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_legislation")
        .select(`
          id,
          applicability_type,
          notes,
          legislation_id,
          legislation(
            id, 
            number, 
            title, 
            summary, 
            publication_date, 
            origin,
            document_url
          )
        `)
        .eq("organization_id", organization.id)
        .order("assigned_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch requirements with applicabilities
  const { data: requirementsData, isLoading: loadingRequirements } = useQuery({
    queryKey: ["client-detail-requirements", organization.id],
    queryFn: async () => {
      if (!orgLegislation?.length) return [];
      
      const legislationIds = orgLegislation.map(ol => ol.legislation_id);
      
      const { data: requirements, error: reqError } = await supabase
        .from("legal_requirements")
        .select("id, article, requirement_text, legislation_id, display_order")
        .in("legislation_id", legislationIds)
        .order("display_order", { ascending: true, nullsFirst: false });
      
      if (reqError) throw reqError;
      
      // Get applicabilities
      const { data: applicabilities, error: appError } = await supabase
        .from("applicabilities")
        .select("*")
        .eq("organization_id", organization.id);
      
      if (appError) throw appError;
      
      // Map applicabilities to requirements
      const appMap = new Map(applicabilities?.map(a => [a.requirement_id, a]) || []);
      
      return requirements?.map(req => ({
        ...req,
        applicability: appMap.get(req.id) || null,
      })) || [];
    },
    enabled: !!orgLegislation?.length,
  });

  // Group requirements by legislation
  const requirementsByLegislation = useMemo(() => {
    const map = new Map<string, typeof requirementsData>();
    requirementsData?.forEach(req => {
      const existing = map.get(req.legislation_id) || [];
      existing.push(req);
      map.set(req.legislation_id, existing);
    });
    return map;
  }, [requirementsData]);

  // Fetch action plans
  const { data: actionPlans, isLoading: loadingActions } = useQuery({
    queryKey: ["client-detail-actions", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_plans")
        .select(`
          *,
          legal_requirements(id, article, legislation_id, legislation:legislation_id(number, title))
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch evidence requests
  const { data: evidenceRequests, isLoading: loadingEvidence } = useQuery({
    queryKey: ["client-detail-evidence", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_evidence_requests")
        .select(`
          *,
          evidence_templates(id, group_name, title, description)
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Filter legislation by search
  const filteredLegislation = useMemo(() => {
    if (!orgLegislation) return [];
    if (!searchTerm) return orgLegislation;
    
    const search = searchTerm.toLowerCase();
    return orgLegislation.filter(ol => 
      ol.legislation?.title?.toLowerCase().includes(search) ||
      ol.legislation?.number?.toLowerCase().includes(search)
    );
  }, [orgLegislation, searchTerm]);

  // Toggle legislation expansion
  const toggleLegislation = (id: string) => {
    setExpandedLegislation(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Stats
  const stats = useMemo(() => {
    const totalLegislation = orgLegislation?.length || 0;
    const totalRequirements = requirementsData?.length || 0;
    const evaluatedRequirements = requirementsData?.filter(r => r.applicability)?.length || 0;
    const pendingActions = actionPlans?.filter(a => a.status === "pendente" || a.status === "em_curso")?.length || 0;
    const pendingEvidence = evidenceRequests?.filter(e => e.status === "pending" || e.status === "submitted")?.length || 0;
    
    return { totalLegislation, totalRequirements, evaluatedRequirements, pendingActions, pendingEvidence };
  }, [orgLegislation, requirementsData, actionPlans, evidenceRequests]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
            <Building2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
              {organization.name}
            </h1>
            {organization.description && (
              <p className="text-sm text-muted-foreground">{organization.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-700 dark:text-blue-300">Legislação</span>
            </div>
            <p className="text-2xl font-bold text-blue-800 dark:text-blue-200 mt-1">
              {stats.totalLegislation}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-purple-700 dark:text-purple-300">Requisitos</span>
            </div>
            <p className="text-2xl font-bold text-purple-800 dark:text-purple-200 mt-1">
              {stats.evaluatedRequirements}/{stats.totalRequirements}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700 dark:text-amber-300">Ações Pendentes</span>
            </div>
            <p className="text-2xl font-bold text-amber-800 dark:text-amber-200 mt-1">
              {stats.pendingActions}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/30 dark:to-emerald-800/20 border-emerald-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-sm text-emerald-700 dark:text-emerald-300">Evidências</span>
            </div>
            <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200 mt-1">
              {stats.pendingEvidence}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-900/30 dark:to-rose-800/20 border-rose-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-rose-600" />
              <span className="text-sm text-rose-700 dark:text-rose-300">Indicadores</span>
            </div>
            <p className="text-2xl font-bold text-rose-800 dark:text-rose-200 mt-1">
              —
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="legislacao" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Legislação
          </TabsTrigger>
          <TabsTrigger value="acoes" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Planos de Ação
          </TabsTrigger>
          <TabsTrigger value="evidencias" className="gap-2">
            <FileCheck className="h-4 w-4" />
            Evidências
          </TabsTrigger>
          <TabsTrigger value="indicadores" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Indicadores
          </TabsTrigger>
          <TabsTrigger value="utilizadores" className="gap-2">
            <Users className="h-4 w-4" />
            Utilizadores
          </TabsTrigger>
        </TabsList>

        {/* Legislação Tab */}
        <TabsContent value="legislacao" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Pesquisar legislação..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {loadingLegislation ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : filteredLegislation.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">Nenhuma legislação atribuída</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredLegislation.map((ol) => {
                const leg = ol.legislation;
                if (!leg) return null;
                
                const isExpanded = expandedLegislation.has(leg.id);
                const requirements = requirementsByLegislation.get(leg.id) || [];
                
                return (
                  <Card key={ol.id} className="overflow-hidden">
                    <Collapsible open={isExpanded} onOpenChange={() => toggleLegislation(leg.id)}>
                      <CollapsibleTrigger asChild>
                        <div className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className={cn(
                                  "shrink-0 text-xs",
                                  leg.origin === "PT" && "border-green-300 text-green-700 bg-green-50",
                                  leg.origin === "EU" && "border-blue-300 text-blue-700 bg-blue-50"
                                )}>
                                  {leg.origin || "?"}
                                </Badge>
                                <span className="text-sm font-medium text-muted-foreground">
                                  {leg.number}
                                </span>
                                {leg.publication_date && (
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(leg.publication_date), "dd/MM/yyyy", { locale: pt })}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-medium line-clamp-2">{leg.title}</h4>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className="text-xs">
                                  {requirements.length} requisitos
                                </Badge>
                                <LegislationApplicabilitySelect
                                  organizationId={organization.id}
                                  legislationId={leg.id}
                                  currentValue={ol.applicability_type}
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {leg.document_url && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                  <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <Link to={`/legislacao/${leg.id}`}>
                                  <FileText className="h-4 w-4" />
                                </Link>
                              </Button>
                              <ChevronDown className={cn(
                                "h-4 w-4 transition-transform",
                                isExpanded && "rotate-180"
                              )} />
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t bg-muted/20 p-4">
                          {requirements.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Sem requisitos extraídos
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {requirements.map((req) => (
                                <div 
                                  key={req.id}
                                  className="flex items-start gap-3 p-3 rounded-lg bg-background border"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      {req.article && (
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          {req.article}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm line-clamp-3">{req.requirement_text}</p>
                                  </div>
                                  <div className="shrink-0">
                                    <RequirementApplicabilitySelect
                                      organizationId={organization.id}
                                      requirementId={req.id}
                                      currentValue={req.applicability?.applicability_type || "nao_avaliado"}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Planos de Ação Tab */}
        <TabsContent value="acoes" className="space-y-4">
          {loadingActions ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !actionPlans?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">Nenhum plano de ação</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {actionPlans.map((plan) => {
                const status = statusConfig[plan.status || "pendente"];
                const priority = priorityConfig[plan.priority || "media"];
                const StatusIcon = status?.icon || Clock;
                
                return (
                  <Card key={plan.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className={cn("text-xs", status?.color)}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status?.label}
                            </Badge>
                            {priority && (
                              <Badge variant="outline" className={cn("text-xs", priority.color)}>
                                {priority.label}
                              </Badge>
                            )}
                            {plan.due_date && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(plan.due_date), "dd/MM/yyyy", { locale: pt })}
                              </span>
                            )}
                          </div>
                          <h4 className="font-medium">{plan.title}</h4>
                          {plan.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {plan.description}
                            </p>
                          )}
                          {plan.responsible && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              {plan.responsible}
                            </div>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Evidências Tab */}
        <TabsContent value="evidencias" className="space-y-4">
          {loadingEvidence ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !evidenceRequests?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">Nenhum pedido de evidência</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {evidenceRequests.map((req) => {
                const statusColors: Record<string, string> = {
                  pending: "bg-slate-100 text-slate-700 border-slate-200",
                  submitted: "bg-amber-100 text-amber-700 border-amber-200",
                  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
                  rejected: "bg-rose-100 text-rose-700 border-rose-200",
                };
                const statusLabels: Record<string, string> = {
                  pending: "Pendente",
                  submitted: "Submetido",
                  approved: "Aprovado",
                  rejected: "Rejeitado",
                };
                
                return (
                  <Card key={req.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={cn("text-xs", statusColors[req.status])}>
                              {statusLabels[req.status] || req.status}
                            </Badge>
                            {req.due_date && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(req.due_date), "dd/MM/yyyy", { locale: pt })}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mb-1">
                            {req.evidence_templates?.group_name}
                          </div>
                          <h4 className="font-medium">{req.evidence_templates?.title}</h4>
                          {req.evidence_templates?.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {req.evidence_templates.description}
                            </p>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Indicadores Tab */}
        <TabsContent value="indicadores" className="space-y-4">
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">Módulo de indicadores em desenvolvimento</p>
              <p className="text-sm text-muted-foreground mt-1">Em breve poderá definir e acompanhar indicadores de desempenho</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Utilizadores Tab */}
        <TabsContent value="utilizadores" className="space-y-4">
          <ClientUsersTab organizationId={organization.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Sub-component for users tab
function ClientUsersTab({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery({
    queryKey: ["org-users-detail", organizationId],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("id, user_id, role, created_at")
        .eq("organization_id", organizationId);
      
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];
      
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, user_type")
        .in("id", userIds);
      
      if (profilesError) throw profilesError;
      
      return roles.map(role => ({
        ...role,
        profile: profiles?.find(p => p.id === role.user_id) || null,
      }));
    },
  });

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!users?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum utilizador associado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.profile?.full_name || "—"}
                </TableCell>
                <TableCell>{user.profile?.email || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {user.profile?.user_type || "consulta"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
