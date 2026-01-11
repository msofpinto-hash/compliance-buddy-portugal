import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  Bell, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  TrendingUp,
  Settings,
  BookOpen,
  LayoutDashboard,
  Scale,
  ClipboardList,
  Search,
  ChevronRight,
  HelpCircle,
  Menu,
  Gavel,
  ClipboardCheck,
  FolderOpen,
  BarChart3,
  User
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { OrganizationSelector } from "@/components/OrganizationSelector";
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
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const COLORS = {
  compliant: "hsl(142, 76%, 36%)",
  nonCompliant: "hsl(0, 84%, 60%)",
  inProgress: "hsl(45, 93%, 47%)",
  pending: "hsl(215, 20%, 65%)",
};

type ModuleType = 'legislacao' | 'planos_acao' | 'auditorias' | 'documentos' | 'indicadores';

type NavItem = {
  id: string;
  moduleKey?: ModuleType;
  label: string;
  icon: React.ElementType;
  href: string;
  count?: number;
  alwaysShow?: boolean;
};

const ALL_MODULES: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", alwaysShow: true },
  { id: "legislacao", moduleKey: "legislacao", label: "Legislação", icon: Gavel, href: "/cliente" },
  { id: "planos_acao", moduleKey: "planos_acao", label: "Planos de Ação", icon: ClipboardList, href: "/cliente?tab=actions" },
  { id: "auditorias", moduleKey: "auditorias", label: "Auditorias", icon: ClipboardCheck, href: "/cliente?tab=audits" },
  { id: "documentos", moduleKey: "documentos", label: "Documentos", icon: FolderOpen, href: "/cliente?tab=documents" },
  { id: "indicadores", moduleKey: "indicadores", label: "Indicadores", icon: BarChart3, href: "/cliente?tab=indicators" },
];

export default function Dashboard() {
  const { user, signOut, isAdmin } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Fetch user's organizations (multiple)
  const { data: userRoles } = useQuery({
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

  // Build organizations array for selector
  const organizations = userRoles?.map(r => ({
    id: r.organization_id as string,
    name: (r.organizations as any)?.name as string,
    logo_url: (r.organizations as any)?.logo_url as string | undefined
  })).filter(o => o.id && o.name) || [];

  // Get organization IDs (filtered by selection)
  const organizationIds = selectedOrgId 
    ? [selectedOrgId]
    : userRoles?.map(r => r.organization_id).filter(Boolean) || [];

  const currentOrg = organizations.find(o => o.id === (selectedOrgId || organizationIds[0])) || organizations[0];

  // Fetch user's module permissions
  const { data: userModules } = useQuery({
    queryKey: ["user-modules", user?.id, currentOrg?.id],
    queryFn: async () => {
      if (!user?.id || !currentOrg?.id) return [];
      const { data, error } = await supabase
        .from("user_module_permissions")
        .select("module")
        .eq("user_id", user.id)
        .eq("organization_id", currentOrg.id);
      if (error) throw error;
      return data?.map(d => d.module as ModuleType) || [];
    },
    enabled: !!user?.id && !!currentOrg?.id,
  });

  // Filter navigation based on permissions (admins see all, clients see their modules)
  const navItems = ALL_MODULES.filter(item => {
    if (item.alwaysShow) return true;
    if (isAdmin) return true;
    if (!item.moduleKey) return true;
    return userModules?.includes(item.moduleKey);
  });

  // Fetch recent legislation
  const { data: recentLegislation, isLoading: loadingLegislation } = useQuery({
    queryKey: ["recent-legislation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select("*")
        .order("publication_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // Fetch user alerts
  const { data: alerts, isLoading: loadingAlerts } = useQuery({
    queryKey: ["user-alerts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch action plans for ALL organizations
  const { data: actionPlans } = useQuery({
    queryKey: ["action-plans-all", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("action_plans")
        .select("*")
        .in("organization_id", organizationIds);
      if (error) throw error;
      return data;
    },
    enabled: organizationIds.length > 0,
  });

  // Calculate stats from action plans
  const actionPlanStats = {
    pending: actionPlans?.filter(p => p.status === "pendente").length || 0,
    inProgress: actionPlans?.filter(p => p.status === "em_curso").length || 0,
    completed: actionPlans?.filter(p => p.status === "concluido").length || 0,
    overdue: actionPlans?.filter(p => {
      if (!p.due_date || p.status === "concluido") return false;
      return new Date(p.due_date) < new Date();
    }).length || 0,
  };

  // Compliance stats for ALL organizations
  const { data: complianceStats } = useQuery({
    queryKey: ["compliance-stats-all", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return { applicable: 0, compliant: 0, nonCompliant: 0, inProgress: 0 };
      
      const { data, error } = await supabase
        .from("applicabilities")
        .select("is_applicable, compliance_status")
        .in("organization_id", organizationIds);
      
      if (error) throw error;

      const stats = { applicable: 0, compliant: 0, nonCompliant: 0, inProgress: 0 };
      data?.forEach((app) => {
        if (app.is_applicable) {
          stats.applicable++;
          if (app.compliance_status === "conforme") stats.compliant++;
          else if (app.compliance_status === "nao_conforme") stats.nonCompliant++;
          else stats.inProgress++;
        }
      });

      return stats;
    },
    enabled: organizationIds.length > 0,
  });

  const complianceRate = complianceStats?.applicable 
    ? Math.round((complianceStats.compliant / complianceStats.applicable) * 100) 
    : 0;

  // Pie chart data for compliance
  const compliancePieData = [
    { name: "Conforme", value: complianceStats?.compliant || 0, color: COLORS.compliant },
    { name: "Não Conforme", value: complianceStats?.nonCompliant || 0, color: COLORS.nonCompliant },
    { name: "Em Avaliação", value: complianceStats?.inProgress || 0, color: COLORS.inProgress },
  ].filter(d => d.value > 0);

  // Pie chart data for action plans
  const actionPlanPieData = [
    { name: "Concluído", value: actionPlanStats.completed, color: COLORS.compliant },
    { name: "Em Curso", value: actionPlanStats.inProgress, color: COLORS.inProgress },
    { name: "Pendente", value: actionPlanStats.pending, color: COLORS.pending },
  ].filter(d => d.value > 0);

  // Categorize alerts by type
  const alertsByType = {
    legislation: alerts?.filter(a => a.type === "new_legislation") || [],
    deadlines: alerts?.filter(a => a.type === "deadline") || [],
    other: alerts?.filter(a => !["new_legislation", "deadline"].includes(a.type || "")) || [],
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo/Org */}
      <div className="p-4 border-b border-sidebar-border">
        {currentOrg?.logo_url ? (
          <img 
            src={currentOrg.logo_url} 
            alt={currentOrg.name} 
            className="h-12 w-auto object-contain"
          />
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-5 w-5" />
            </div>
            <span className="font-semibold text-sidebar-foreground">Legal Compliance</span>
          </div>
        )}
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.email?.split("@")[0]}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {currentOrg?.name || ""}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.id === "dashboard" && location.pathname === "/dashboard");
            return (
              <Link
                key={item.id}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent/10"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {item.count}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Admin link if admin */}
        {isAdmin && (
          <div className="px-3 mt-4 pt-4 border-t border-sidebar-border">
            <Link
              to="/admin"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/10 transition-colors"
            >
              <Settings className="h-5 w-5 shrink-0" />
              <span>Administração</span>
            </Link>
          </div>
        )}
      </ScrollArea>

      {/* Footer - Help, Settings & Logout */}
      <div className="p-4 border-t border-sidebar-border mt-auto space-y-1">
        <Link
          to="/settings"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/10 transition-colors w-full"
        >
          <User className="h-4 w-4" />
          <span>Definições</span>
        </Link>
        <a
          href="mailto:suporte@legalcompliance.pt"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/10 transition-colors w-full"
        >
          <HelpCircle className="h-4 w-4" />
          <span>Ajuda</span>
        </a>
        <LogoutConfirmDialog 
          onConfirm={signOut} 
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/10 px-3" 
          variant="ghost"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-sidebar border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
          <div className="flex items-center justify-between px-4 lg:px-8 py-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <p className="text-sm text-muted-foreground">Home</p>
                <h1 className="text-2xl font-bold">
                  Bem-vindo, {user?.email?.split("@")[0]}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {organizations.length > 1 && (
                <OrganizationSelector
                  organizations={organizations}
                  selectedOrgId={selectedOrgId}
                  onSelect={setSelectedOrgId}
                />
              )}
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Pesquisa" 
                  className="pl-9 w-64 bg-card"
                />
              </div>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {(alerts?.length || 0) > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    {alerts?.length}
                  </span>
                )}
              </Button>
              <Link to="/settings">
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-4">
            {/* Main Content Area - 3 columns */}
            <div className="lg:col-span-3 space-y-6">
              {/* Notifications Timeline */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Notificações</CardTitle>
                      {(alerts?.length || 0) > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {alerts?.length} não lidas
                        </Badge>
                      )}
                    </div>
                    <Link to="/notifications" className="text-sm text-primary hover:underline flex items-center gap-1">
                      Ver todas <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingAlerts ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : alerts && alerts.length > 0 ? (
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                      
                      <div className="space-y-4">
                        {alerts.slice(0, 5).map((alert, index) => (
                          <div key={alert.id} className="relative flex gap-4 pl-10">
                            {/* Timeline dot */}
                            <div className={cn(
                              "absolute left-2.5 w-3 h-3 rounded-full border-2 border-background",
                              alert.type === "deadline" ? "bg-amber-500" :
                              alert.type === "new_legislation" ? "bg-blue-500" : "bg-muted-foreground"
                            )} />
                            
                            <div className="flex-1 bg-muted/30 rounded-lg p-3 hover:bg-muted/50 transition-colors">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {alert.type === "deadline" && (
                                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                        <Clock className="h-3 w-3 mr-1" />
                                        Prazo
                                      </Badge>
                                    )}
                                    {alert.type === "new_legislation" && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                        <FileText className="h-3 w-3 mr-1" />
                                        Legislação
                                      </Badge>
                                    )}
                                    {!["deadline", "new_legislation"].includes(alert.type || "") && (
                                      <Badge variant="outline" className="text-xs">
                                        <Bell className="h-3 w-3 mr-1" />
                                        Alerta
                                      </Badge>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(alert.created_at), "d MMM, HH:mm", { locale: pt })}
                                    </span>
                                  </div>
                                  <p className="font-medium text-sm">{alert.title}</p>
                                  <p className="text-sm text-muted-foreground line-clamp-1">{alert.message}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                      <p className="text-muted-foreground">Sem notificações pendentes</p>
                      <p className="text-sm text-muted-foreground">Está tudo em dia!</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Charts Row */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Compliance Pie Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Estado de Conformidade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {compliancePieData.length > 0 ? (
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={compliancePieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {compliancePieData.map((entry, index) => (
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
                      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                        Sem dados de conformidade
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Action Plans Pie Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Planos de Ação</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {actionPlanPieData.length > 0 ? (
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={actionPlanPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {actionPlanPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => [`${value} ações`, ""]}
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
                      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                        Sem planos de ação
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Content */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Legislação Recente</CardTitle>
                    <Link to="/biblioteca" className="text-sm text-primary hover:underline flex items-center gap-1">
                      Ver mais <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <CardDescription>Últimos diplomas publicados</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingLegislation ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : recentLegislation && recentLegislation.length > 0 ? (
                    <div className="grid md:grid-cols-3 gap-4">
                      {recentLegislation.slice(0, 3).map((leg) => (
                        <div
                          key={leg.id}
                          className="relative rounded-xl border bg-card overflow-hidden group hover:shadow-md transition-shadow"
                        >
                          <div className="absolute top-2 left-2 z-10">
                            <Badge variant={leg.source === "dre" ? "default" : "secondary"} className="text-xs">
                              {leg.source === "eurlex" ? "Novidade!" : leg.source?.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="h-24 bg-gradient-to-br from-primary/20 to-primary/5" />
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">
                                {leg.source === "dre" ? "DRE" : leg.source === "eurlex" ? "EUR-Lex" : "Artigo"}
                              </span>
                              {leg.document_url && (
                                <a
                                  href={leg.document_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary text-xs hover:underline"
                                >
                                  Saiba mais
                                </a>
                              )}
                            </div>
                            <p className="text-sm font-medium line-clamp-2">
                              {leg.number} - {leg.title}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma legislação disponível
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Sidebar - 1 column */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumo Rápido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm">Taxa de Conformidade</span>
                    </div>
                    <span className="font-bold" style={{ color: complianceRate >= 80 ? COLORS.compliant : complianceRate >= 50 ? COLORS.inProgress : COLORS.nonCompliant }}>
                      {complianceRate}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Ações Pendentes</span>
                    </div>
                    <span className="font-bold">{actionPlanStats.pending}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-sm">Ações Atrasadas</span>
                    </div>
                    <span className="font-bold text-destructive">{actionPlanStats.overdue}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="text-sm">Concluídas</span>
                    </div>
                    <span className="font-bold text-primary">{actionPlanStats.completed}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Module Quick Access */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Acesso Rápido</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {navItems.filter(item => item.id !== "dashboard").slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      to={item.href}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <item.icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{item.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
