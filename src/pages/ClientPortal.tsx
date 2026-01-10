import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Loader2,
  Home,
  LayoutDashboard,
  ChevronRight
} from "lucide-react";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { Link, useLocation } from "react-router-dom";
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

type TabValue = "overview" | "legislation" | "actions";

export default function ClientPortal() {
  const { user, signOut, isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("overview");

  const handleExportReport = async (reportType: "compliance" | "legislation" | "requirements", orgId?: string) => {
    const targetOrgId = orgId || (userRoles && userRoles.length > 0 ? userRoles[0].organization_id : null);
    if (!targetOrgId) return;
    
    const targetOrg = userRoles?.find(r => r.organization_id === targetOrgId);
    
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
          body: JSON.stringify({ organizationId: targetOrgId, reportType }),
        }
      );

      if (!response.ok) {
        throw new Error("Falha ao gerar relatório");
      }

      const html = await response.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      
      const orgName = (targetOrg?.organizations as any)?.name || "organizacao";
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

  // Fetch user's organizations (multiple)
  const { data: userRoles, isLoading: loadingRole } = useQuery({
    queryKey: ["user-roles", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("*, organizations(*)")
        .eq("user_id", user.id)
        .eq("role", "client");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Get organization IDs
  const organizationIds = userRoles?.map(r => r.organization_id).filter(Boolean) || [];
  const organizationNames = userRoles?.map(r => (r.organizations as any)?.name).filter(Boolean) || [];

  // Fetch assigned legislation for ALL organizations
  const { data: assignedLegislation, isLoading: loadingLegislation } = useQuery({
    queryKey: ["org-legislation-all", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("organization_legislation")
        .select(`
          id,
          assigned_at,
          notes,
          organization_id,
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
        .in("organization_id", organizationIds)
        .order("assigned_at", { ascending: false });
      
      if (error) throw error;
      
      // Remove duplicates (same legislation might be assigned to multiple orgs)
      const uniqueLegislation = new Map();
      data?.forEach(item => {
        const legId = (item.legislation as any)?.id;
        if (legId && !uniqueLegislation.has(legId)) {
          uniqueLegislation.set(legId, item);
        }
      });
      return Array.from(uniqueLegislation.values());
    },
    enabled: organizationIds.length > 0,
  });

  // Fetch applicabilities for ALL organizations
  const { data: applicabilities, isLoading: loadingApplicabilities } = useQuery({
    queryKey: ["org-applicabilities-all", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("applicabilities")
        .select(`
          id,
          is_applicable,
          compliance_status,
          notes,
          organization_id,
          legal_requirements(
            id,
            article,
            requirement_text,
            legislation_id
          )
        `)
        .in("organization_id", organizationIds);
      
      if (error) throw error;
      return data;
    },
    enabled: organizationIds.length > 0,
  });

  // Fetch action plans for ALL organizations
  const { data: actionPlans, isLoading: loadingActionPlans } = useQuery({
    queryKey: ["client-action-plans-all", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];
      
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
        .in("organization_id", organizationIds)
        .order("due_date", { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      return data;
    },
    enabled: organizationIds.length > 0,
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

  // Action plan stats
  const actionPlanStats = {
    pending: actionPlans?.filter(p => p.status === "pendente").length || 0,
    inProgress: actionPlans?.filter(p => p.status === "em_curso").length || 0,
    completed: actionPlans?.filter(p => p.status === "concluido").length || 0,
    overdue: actionPlans?.filter(p => {
      if (!p.due_date || p.status === "concluido") return false;
      return new Date(p.due_date) < new Date();
    }).length || 0,
  };

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

  if (organizationIds.length === 0) {
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
            <LogoutConfirmDialog onConfirm={signOut} className="gap-2" />
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

  const navItems = [
    { id: "overview" as TabValue, label: "Visão Geral", icon: LayoutDashboard },
    { id: "legislation" as TabValue, label: "Diplomas", icon: FileText, count: overallStats.totalLegislation },
    { id: "actions" as TabValue, label: "Planos de Ação", icon: ClipboardList, count: actionPlanStats.pending + actionPlanStats.inProgress },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-lg">
              <Scale className="h-5 w-5" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight">Portal do Cliente</h1>
              <p className="text-xs text-muted-foreground">
                {organizationNames.length === 1 
                  ? organizationNames[0] 
                  : `${organizationNames.length} organizações`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Export Button */}
            <div className="relative group">
              <Button 
                variant="ghost" 
                size="sm"
                className="gap-2"
                disabled={!!exportingType}
              >
                {exportingType ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="hidden md:inline">Exportar</span>
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
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 disabled:opacity-50"
                    onClick={() => handleExportReport("requirements")}
                    disabled={!!exportingType}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Lista de Requisitos
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 disabled:opacity-50"
                    onClick={() => handleExportReport("compliance")}
                    disabled={!!exportingType}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Relatório de Conformidade
                  </button>
                </div>
              </div>
            </div>
            
            <Link to="/biblioteca">
              <Button variant="ghost" size="sm" className="gap-2">
                <BookOpen className="h-4 w-4" />
                <span className="hidden md:inline">Biblioteca</span>
              </Button>
            </Link>
            
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden md:inline">Dashboard</span>
              </Button>
            </Link>
            
            {isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="hidden md:inline">Admin</span>
                </Button>
              </Link>
            )}
            
            <LogoutConfirmDialog onConfirm={signOut} size="sm" className="gap-2" />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-64 border-r bg-card min-h-[calc(100vh-57px)] sticky top-[57px]">
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  activeTab === item.id 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1 font-medium">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <Badge 
                    variant={activeTab === item.id ? "secondary" : "outline"} 
                    className="ml-auto"
                  >
                    {item.count}
                  </Badge>
                )}
              </button>
            ))}
          </nav>
          
          {/* Sidebar Stats Summary */}
          <div className="p-4 border-t">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Taxa de Conformidade</span>
                <span 
                  className="font-bold"
                  style={{ color: complianceRate >= 80 ? COLORS.compliant : complianceRate >= 50 ? COLORS.inProgress : COLORS.nonCompliant }}
                >
                  {complianceRate}%
                </span>
              </div>
              <Progress value={complianceRate} className="h-2" />
              
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{overallStats.compliant}</div>
                  <div className="text-[10px] text-muted-foreground">Conforme</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-600">{overallStats.inProgress}</div>
                  <div className="text-[10px] text-muted-foreground">Em Aval.</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{overallStats.nonCompliant}</div>
                  <div className="text-[10px] text-muted-foreground">Não Conf.</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Tab Navigation */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t bg-card z-20">
          <div className="flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-colors ${
                  activeTab === item.id 
                    ? "text-primary bg-primary/5" 
                    : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.count !== undefined && item.count > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-[10px] text-primary-foreground rounded-full flex items-center justify-center">
                      {item.count > 9 ? "9+" : item.count}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Welcome Header */}
              <div>
                <h2 className="text-2xl font-bold">
                  Olá, {user?.email?.split("@")[0]}
                </h2>
                <p className="text-muted-foreground">
                  Aqui está o resumo do estado de conformidade da sua organização
                </p>
              </div>

              {/* Quick Stats */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Diplomas</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overallStats.totalLegislation}</div>
                    <p className="text-xs text-muted-foreground">Atribuídos à organização</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Requisitos</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{overallStats.totalRequirements}</div>
                    <p className="text-xs text-muted-foreground">Aplicáveis à organização</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ações Pendentes</CardTitle>
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{actionPlanStats.pending + actionPlanStats.inProgress}</div>
                    <p className="text-xs text-muted-foreground">
                      {actionPlanStats.overdue > 0 && (
                        <span className="text-destructive">{actionPlanStats.overdue} em atraso</span>
                      )}
                      {actionPlanStats.overdue === 0 && "Nenhuma em atraso"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Conformidade</CardTitle>
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

              {/* Charts Row */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Compliance Pie Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Estado de Conformidade</CardTitle>
                    <CardDescription>Distribuição dos requisitos por estado</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pieData.length > 0 ? (
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
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
                      <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>Sem requisitos avaliados</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Actions / Recent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle>Ações Urgentes</CardTitle>
                    <CardDescription>Itens que requerem a sua atenção</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {actionPlanStats.overdue > 0 && (
                      <div 
                        className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 cursor-pointer hover:bg-destructive/15 transition-colors"
                        onClick={() => setActiveTab("actions")}
                      >
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <div className="flex-1">
                          <p className="font-medium text-destructive">Ações em Atraso</p>
                          <p className="text-sm text-muted-foreground">
                            {actionPlanStats.overdue} ações ultrapassaram o prazo
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    {overallStats.nonCompliant > 0 && (
                      <div 
                        className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/15 transition-colors"
                        onClick={() => { setActiveTab("legislation"); setStatusFilter("non-compliant"); }}
                      >
                        <XCircle className="h-5 w-5 text-red-600" />
                        <div className="flex-1">
                          <p className="font-medium text-red-700 dark:text-red-400">Não Conformidades</p>
                          <p className="text-sm text-muted-foreground">
                            {overallStats.nonCompliant} requisitos não conformes
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    {overallStats.inProgress > 0 && (
                      <div 
                        className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 cursor-pointer hover:bg-yellow-500/15 transition-colors"
                        onClick={() => { setActiveTab("legislation"); setStatusFilter("in-progress"); }}
                      >
                        <Clock className="h-5 w-5 text-yellow-600" />
                        <div className="flex-1">
                          <p className="font-medium text-yellow-700 dark:text-yellow-400">Em Avaliação</p>
                          <p className="text-sm text-muted-foreground">
                            {overallStats.inProgress} requisitos em avaliação
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    {actionPlanStats.overdue === 0 && overallStats.nonCompliant === 0 && overallStats.inProgress === 0 && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-700 dark:text-green-400">Tudo em Ordem</p>
                          <p className="text-sm text-muted-foreground">
                            Não existem itens urgentes
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Legislation */}
              {assignedLegislation && assignedLegislation.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Diplomas Recentes</CardTitle>
                      <CardDescription>Últimos diplomas atribuídos</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab("legislation")} className="gap-1">
                      Ver Todos
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {assignedLegislation.slice(0, 3).map((item: any) => {
                        const leg = item.legislation;
                        if (!leg) return null;
                        const compliance = getComplianceStatus(leg.id);
                        
                        return (
                          <Link
                            key={item.id}
                            to={`/legislacao/${leg.id}`}
                            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="shrink-0">{leg.number}</Badge>
                                <Badge variant={compliance.color as any} className="shrink-0">{compliance.label}</Badge>
                              </div>
                              <p className="font-medium truncate">{leg.title}</p>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Legislation Tab */}
          {activeTab === "legislation" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Diplomas Atribuídos</h2>
                  <p className="text-muted-foreground">
                    Legislação aplicável à sua organização
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar diplomas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
              </div>

              {/* Status Filter Tabs */}
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList className="flex-wrap h-auto gap-1">
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

              {/* Legislation List */}
              {loadingLegislation || loadingApplicabilities ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : filteredLegislation?.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Nenhum diploma encontrado</p>
                    {statusFilter !== "all" && (
                      <Button variant="link" onClick={() => setStatusFilter("all")}>
                        Ver todos os diplomas
                      </Button>
                    )}
                  </CardContent>
                </Card>
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
                      <Card key={item.id} className="hover:bg-muted/30 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Badge variant="outline" className="shrink-0">
                                  {leg.number}
                                </Badge>
                                <Badge 
                                  variant={compliance.color as any}
                                  className="shrink-0"
                                >
                                  {compliance.label}
                                </Badge>
                              </div>
                              <h4 className="font-medium line-clamp-2 mb-1">{leg.title}</h4>
                              {leg.summary && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                  {leg.summary}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {leg.publication_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(leg.publication_date), "d MMM yyyy", { locale: pt })}
                                  </span>
                                )}
                                {stats && stats.total > 0 && (
                                  <span>
                                    {stats.compliant}/{stats.total} requisitos conformes
                                  </span>
                                )}
                                {uniqueThemes.length > 0 && (
                                  <span>
                                    {uniqueThemes.slice(0, 2).join(", ")}
                                    {uniqueThemes.length > 2 && ` +${uniqueThemes.length - 2}`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Link to={`/legislacao/${leg.id}`}>
                              <Button variant="outline" size="sm" className="gap-1 shrink-0">
                                Ver Detalhes
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </div>
                          {stats && stats.total > 0 && (
                            <div className="mt-3">
                              <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-muted">
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
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Action Plans Tab */}
          {activeTab === "actions" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Planos de Ação</h2>
                <p className="text-muted-foreground">
                  Ações corretivas pendentes e em curso
                </p>
              </div>

              {/* Action Plan Stats */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-gray-500/10">
                        <Clock className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{actionPlanStats.pending}</p>
                        <p className="text-xs text-muted-foreground">Pendentes</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-yellow-500/10">
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{actionPlanStats.inProgress}</p>
                        <p className="text-xs text-muted-foreground">Em Curso</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{actionPlanStats.completed}</p>
                        <p className="text-xs text-muted-foreground">Concluídas</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-red-500/10">
                        <XCircle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-destructive">{actionPlanStats.overdue}</p>
                        <p className="text-xs text-muted-foreground">Em Atraso</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Action Plans List */}
              {loadingActionPlans ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : !actionPlans || actionPlans.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Sem planos de ação</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {actionPlans.map((plan: any) => {
                    const isOverdue = plan.due_date && plan.status !== "concluido" && new Date(plan.due_date) < new Date();
                    
                    return (
                      <Card key={plan.id} className={`${isOverdue ? "border-destructive/50" : ""}`}>
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge 
                                  variant="outline" 
                                  className={`gap-1 ${
                                    plan.status === "concluido" 
                                      ? "bg-green-500 text-white border-0" 
                                      : plan.status === "em_curso" 
                                        ? "bg-yellow-500 text-white border-0" 
                                        : "bg-gray-500 text-white border-0"
                                  }`}
                                >
                                  {plan.status === "concluido" ? (
                                    <><CheckCircle2 className="h-3 w-3" /> Concluído</>
                                  ) : plan.status === "em_curso" ? (
                                    <><AlertTriangle className="h-3 w-3" /> Em Curso</>
                                  ) : (
                                    <><Clock className="h-3 w-3" /> Pendente</>
                                  )}
                                </Badge>
                                {plan.due_date && (
                                  <Badge variant={isOverdue ? "destructive" : "outline"} className="gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(plan.due_date), "d MMM yyyy", { locale: pt })}
                                    {isOverdue && " (atrasado)"}
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
                                <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
                              )}
                              {plan.legal_requirements && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {plan.legal_requirements.legislation?.number} - {plan.legal_requirements.article || "Geral"}
                                </p>
                              )}
                            </div>
                            {plan.evidence_url && (
                              <a 
                                href={plan.evidence_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="shrink-0"
                              >
                                <Button variant="outline" size="sm" className="gap-1">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Evidência
                                </Button>
                              </a>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
