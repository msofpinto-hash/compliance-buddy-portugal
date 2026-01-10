import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Clock,
  LogOut,
  Settings,
  BookOpen,
  Search,
  ExternalLink,
  Scale,
  Building2,
  TrendingUp,
  XCircle,
  ClipboardList,
  Calendar,
  User,
  Download,
  Loader2
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = {
  compliant: "hsl(142, 76%, 36%)",
  nonCompliant: "hsl(0, 84%, 60%)",
  inProgress: "hsl(45, 93%, 47%)",
};

export default function ClientPortal() {
  const { user, signOut, isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [exportingType, setExportingType] = useState<string | null>(null);

  const handleExportReport = async (reportType: "compliance" | "legislation" | "requirements") => {
    if (!userRole?.organization_id || !userRole?.organizations) return;
    
    setExportingType(reportType);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-compliance-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ organizationId: userRole.organization_id, reportType }),
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao gerar relatório");
      }

      const html = await response.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      
      const orgName = (userRole.organizations as any)?.name || "organizacao";
      const filenames: Record<string, string> = {
        compliance: `relatorio-conformidade-${orgName.replace(/[^a-zA-Z0-9]/g, "-")}.html`,
        legislation: `legislacao-aplicavel-${orgName.replace(/[^a-zA-Z0-9]/g, "-")}.html`,
        requirements: `requisitos-legais-${orgName.replace(/[^a-zA-Z0-9]/g, "-")}.html`,
      };
      
      const link = document.createElement("a");
      link.href = url;
      link.download = filenames[reportType];
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting report:", error);
    } finally {
      setExportingType(null);
    }
  };

  // Fetch user's organization
  const { data: userRole, isLoading: loadingRole } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("*, organizations(*)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch assigned legislation for the organization
  const { data: assignedLegislation, isLoading: loadingLegislation } = useQuery({
    queryKey: ["org-legislation", userRole?.organization_id],
    queryFn: async () => {
      if (!userRole?.organization_id) return [];
      
      const { data, error } = await supabase
        .from("organization_legislation")
        .select(`
          id,
          assigned_at,
          notes,
          legislation(
            id,
            number,
            title,
            summary,
            publication_date,
            effective_date,
            revocation_date,
            document_url,
            entity,
            legislation_category_mapping(
              theme_categories(
                id,
                name,
                themes(id, name)
              )
            )
          )
        `)
        .eq("organization_id", userRole.organization_id)
        .order("assigned_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.organization_id,
  });

  // Fetch applicabilities for this organization
  const { data: applicabilities, isLoading: loadingApplicabilities } = useQuery({
    queryKey: ["org-applicabilities", userRole?.organization_id],
    queryFn: async () => {
      if (!userRole?.organization_id) return [];
      
      const { data, error } = await supabase
        .from("applicabilities")
        .select(`
          id,
          is_applicable,
          compliance_status,
          notes,
          legal_requirements(
            id,
            article,
            requirement_text,
            legislation_id
          )
        `)
        .eq("organization_id", userRole.organization_id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.organization_id,
  });

  // Fetch action plans for this organization
  const { data: actionPlans, isLoading: loadingActionPlans } = useQuery({
    queryKey: ["client-action-plans", userRole?.organization_id],
    queryFn: async () => {
      if (!userRole?.organization_id) return [];
      
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
        .eq("organization_id", userRole.organization_id)
        .order("due_date", { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.organization_id,
  });

  // Build compliance map by legislation
  const complianceByLegislation = new Map<string, {
    total: number;
    compliant: number;
    nonCompliant: number;
    inProgress: number;
  }>();

  applicabilities?.forEach((app: any) => {
    if (!app.legal_requirements) return;
    const legId = app.legal_requirements.legislation_id;
    
    if (!complianceByLegislation.has(legId)) {
      complianceByLegislation.set(legId, { total: 0, compliant: 0, nonCompliant: 0, inProgress: 0 });
    }
    
    const stats = complianceByLegislation.get(legId)!;
    if (app.is_applicable) {
      stats.total++;
      if (app.compliance_status === "conforme") stats.compliant++;
      else if (app.compliance_status === "nao_conforme") stats.nonCompliant++;
      else stats.inProgress++;
    }
  });

  // Calculate overall stats
  const overallStats = {
    totalLegislation: assignedLegislation?.length || 0,
    totalRequirements: applicabilities?.filter((a: any) => a.is_applicable).length || 0,
    compliant: applicabilities?.filter((a: any) => a.is_applicable && a.compliance_status === "conforme").length || 0,
    nonCompliant: applicabilities?.filter((a: any) => a.is_applicable && a.compliance_status === "nao_conforme").length || 0,
    inProgress: applicabilities?.filter((a: any) => a.is_applicable && a.compliance_status === "em_curso").length || 0,
  };

  const complianceRate = overallStats.totalRequirements > 0
    ? Math.round((overallStats.compliant / overallStats.totalRequirements) * 100)
    : 0;

  // Filter legislation
  const filteredLegislation = assignedLegislation?.filter((item: any) => {
    const leg = item.legislation;
    if (!leg) return false;
    
    const matchesSearch = !searchTerm || 
      leg.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      leg.title.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === "all") return matchesSearch;
    
    const legStats = complianceByLegislation.get(leg.id);
    if (!legStats) return statusFilter === "pending" && matchesSearch;
    
    if (statusFilter === "compliant") return matchesSearch && legStats.nonCompliant === 0 && legStats.inProgress === 0 && legStats.compliant > 0;
    if (statusFilter === "non-compliant") return matchesSearch && legStats.nonCompliant > 0;
    if (statusFilter === "in-progress") return matchesSearch && legStats.inProgress > 0;
    if (statusFilter === "pending") return matchesSearch && legStats.total === 0;
    
    return matchesSearch;
  });

  // Pie chart data
  const pieData = [
    { name: "Conforme", value: overallStats.compliant, color: COLORS.compliant },
    { name: "Não Conforme", value: overallStats.nonCompliant, color: COLORS.nonCompliant },
    { name: "Em Avaliação", value: overallStats.inProgress, color: COLORS.inProgress },
  ].filter(d => d.value > 0);

  const getComplianceStatus = (legId: string) => {
    const stats = complianceByLegislation.get(legId);
    if (!stats || stats.total === 0) return { status: "pending", label: "Pendente", color: "secondary" };
    if (stats.nonCompliant > 0) return { status: "non-compliant", label: "Não Conforme", color: "destructive" };
    if (stats.inProgress > 0) return { status: "in-progress", label: "Em Avaliação", color: "warning" };
    return { status: "compliant", label: "Conforme", color: "success" };
  };

  if (loadingRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Scale className="h-12 w-12 text-primary mx-auto animate-pulse" />
          <p className="mt-4 text-muted-foreground">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!userRole?.organization_id) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Portal do Cliente</h1>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Button variant="outline" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </header>
        <main className="container mx-auto px-4 py-16 text-center">
          <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Sem Organização Associada</h2>
          <p className="text-muted-foreground mb-4">
            A sua conta ainda não está associada a nenhuma organização.
          </p>
          <p className="text-sm text-muted-foreground">
            Por favor contacte o administrador para ser adicionado a uma organização.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Portal do Cliente</h1>
              <p className="text-sm text-muted-foreground">
                {userRole.organizations?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Export Dropdown */}
            <div className="relative group">
              <Button 
                variant="outline" 
                className="gap-2"
                disabled={!!exportingType}
              >
                {exportingType ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Exportar</span>
              </Button>
              <div className="absolute right-0 top-full mt-1 w-56 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="p-1">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 disabled:opacity-50"
                    onClick={() => handleExportReport("legislation")}
                    disabled={!!exportingType}
                  >
                    <FileText className="h-4 w-4" />
                    Lista de Legislação
                    {exportingType === "legislation" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 disabled:opacity-50"
                    onClick={() => handleExportReport("requirements")}
                    disabled={!!exportingType}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Lista de Requisitos
                    {exportingType === "requirements" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 disabled:opacity-50"
                    onClick={() => handleExportReport("compliance")}
                    disabled={!!exportingType}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Relatório de Conformidade
                    {exportingType === "compliance" && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                  </button>
                </div>
              </div>
            </div>
            <Link to="/biblioteca">
              <Button variant="ghost" className="gap-2">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Biblioteca</span>
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
            </Link>
            {isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" className="gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Diplomas Atribuídos</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalLegislation}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Requisitos Aplicáveis</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalRequirements}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conforme</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{overallStats.compliant}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Não Conforme</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{overallStats.nonCompliant}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Conformidade</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div 
                className="text-2xl font-bold"
                style={{ color: complianceRate >= 80 ? COLORS.compliant : complianceRate >= 50 ? COLORS.inProgress : COLORS.nonCompliant }}
              >
                {complianceRate}%
              </div>
              <Progress value={complianceRate} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          {/* Compliance Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Estado de Conformidade</CardTitle>
              <CardDescription>Visão geral dos requisitos</CardDescription>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [`${value} requisitos`, ""]}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36}
                        formatter={(value) => <span className="text-sm">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Sem requisitos avaliados</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend Card */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Legenda de Estados</CardTitle>
              <CardDescription>Compreenda os diferentes estados de conformidade</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">Conforme</p>
                  <p className="text-sm text-muted-foreground">
                    Todos os requisitos do diploma estão em conformidade com as obrigações legais.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <Clock className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-400">Em Avaliação</p>
                  <p className="text-sm text-muted-foreground">
                    Alguns requisitos ainda estão a ser avaliados ou em processo de implementação.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-400">Não Conforme</p>
                  <p className="text-sm text-muted-foreground">
                    Existem requisitos que não estão em conformidade e requerem ação imediata.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Plans Section */}
        {actionPlans && actionPlans.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Planos de Ação
                  </CardTitle>
                  <CardDescription>
                    Ações corretivas pendentes e em curso
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {actionPlans.filter(p => p.status !== "concluido").length} pendentes
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {actionPlans.filter(p => p.status !== "concluido").slice(0, 5).map((plan: any) => (
                  <div key={plan.id} className="flex items-start justify-between gap-4 p-3 rounded-lg border">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge 
                          variant="outline" 
                          className={`gap-1 ${plan.status === "em_curso" ? "bg-yellow-500 text-white border-0" : "bg-gray-500 text-white border-0"}`}
                        >
                          {plan.status === "em_curso" ? (
                            <><AlertTriangle className="h-3 w-3" /> Em Curso</>
                          ) : (
                            <><Clock className="h-3 w-3" /> Pendente</>
                          )}
                        </Badge>
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
                      <p className="font-medium">{plan.title}</p>
                      {plan.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
                      )}
                      {plan.legal_requirements && (
                        <p className="text-xs text-muted-foreground">
                          <FileText className="h-3 w-3 inline mr-1" />
                          {plan.legal_requirements.legislation?.number} - {plan.legal_requirements.article || "Geral"}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {actionPlans.filter(p => p.status !== "concluido").length > 5 && (
                  <p className="text-center text-sm text-muted-foreground">
                    + {actionPlans.filter(p => p.status !== "concluido").length - 5} mais planos de ação
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legislation List */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Diplomas Atribuídos</CardTitle>
                <CardDescription>
                  Legislação aplicável à sua organização
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar diplomas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Tabs for filtering */}
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="compliant" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Conforme
                </TabsTrigger>
                <TabsTrigger value="in-progress" className="gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Em Avaliação
                </TabsTrigger>
                <TabsTrigger value="non-compliant" className="gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Não Conforme
                </TabsTrigger>
                <TabsTrigger value="pending">Pendente</TabsTrigger>
              </TabsList>
            </Tabs>

            {loadingLegislation || loadingApplicabilities ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : filteredLegislation?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum diploma encontrado</p>
                {statusFilter !== "all" && (
                  <Button variant="link" onClick={() => setStatusFilter("all")}>
                    Ver todos os diplomas
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLegislation?.map((item: any) => {
                  const leg = item.legislation;
                  if (!leg) return null;
                  
                  const compliance = getComplianceStatus(leg.id);
                  const stats = complianceByLegislation.get(leg.id);
                  const themes = leg.legislation_category_mapping?.map((m: any) => m.theme_categories?.themes?.name).filter(Boolean);
                  const uniqueThemes = [...new Set(themes)];

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="shrink-0">
                              {leg.number}
                            </Badge>
                            <Badge 
                              variant={compliance.color as any}
                              className="shrink-0"
                            >
                              {compliance.label}
                            </Badge>
                            {leg.source && (
                              <Badge variant="secondary" className="shrink-0">
                                {leg.source === "dre" ? "DRE" : leg.source === "eurlex" ? "EUR-Lex" : leg.source}
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-medium line-clamp-2">{leg.title}</h4>
                          {leg.summary && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {leg.summary}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                            {leg.publication_date && (
                              <span>
                                Publicado: {format(new Date(leg.publication_date), "d MMM yyyy", { locale: pt })}
                              </span>
                            )}
                            {stats && stats.total > 0 && (
                              <span>
                                {stats.compliant}/{stats.total} requisitos conformes
                              </span>
                            )}
                            {uniqueThemes.length > 0 && (
                              <span className="flex items-center gap-1">
                                {uniqueThemes.slice(0, 2).join(", ")}
                                {uniqueThemes.length > 2 && ` +${uniqueThemes.length - 2}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link to={`/legislacao/${leg.id}`}>
                            <Button variant="outline" size="sm" className="gap-1">
                              Ver Detalhes
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                      {stats && stats.total > 0 && (
                        <div className="mt-3">
                          <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
                            {stats.compliant > 0 && (
                              <div 
                                className="h-full bg-green-500" 
                                style={{ width: `${(stats.compliant / stats.total) * 100}%` }}
                              />
                            )}
                            {stats.inProgress > 0 && (
                              <div 
                                className="h-full bg-yellow-500" 
                                style={{ width: `${(stats.inProgress / stats.total) * 100}%` }}
                              />
                            )}
                            {stats.nonCompliant > 0 && (
                              <div 
                                className="h-full bg-red-500" 
                                style={{ width: `${(stats.nonCompliant / stats.total) * 100}%` }}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
