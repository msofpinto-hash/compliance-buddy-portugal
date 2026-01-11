import { useState, useEffect } from "react";
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
  User,
  Calendar,
  XCircle,
  ExternalLink
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { DocumentsPanel } from "@/components/client/DocumentsPanel";
import { ActionPlansView } from "@/components/client/ActionPlansView";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { pt } from "date-fns/locale";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type TabType = "overview" | "actions" | "audits" | "documents" | "indicators";

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
  { id: "legislacao", moduleKey: "legislacao", label: "Legislação", icon: Gavel, href: "/biblioteca", alwaysShow: true },
  { id: "planos_acao", moduleKey: "planos_acao", label: "Planos de Ação", icon: ClipboardList, href: "/dashboard?tab=actions" },
  { id: "auditorias", moduleKey: "auditorias", label: "Auditorias", icon: ClipboardCheck, href: "/dashboard?tab=audits" },
  { id: "documentos", moduleKey: "documentos", label: "Evidências Documentais", icon: FolderOpen, href: "/dashboard?tab=documents" },
  { id: "indicadores", moduleKey: "indicadores", label: "Indicadores", icon: BarChart3, href: "/dashboard?tab=indicators" },
];

export default function Dashboard() {
  const { user, signOut, isAdmin } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Get active tab from URL params
  const tabParam = searchParams.get("tab");
  const activeTab: TabType = (tabParam === "actions" || tabParam === "audits" || tabParam === "documents" || tabParam === "indicators") 
    ? tabParam 
    : "overview";

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

  // Fetch total legislation count
  const { data: totalLegislationCount } = useQuery({
    queryKey: ["total-legislation-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("legislation")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch user's read legislation count
  const { data: readLegislationCount } = useQuery({
    queryKey: ["user-legislation-reads-count", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from("user_legislation_reads")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // Calculate unread legislation count
  const unreadLegislationCount = (totalLegislationCount || 0) - (readLegislationCount || 0);

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

  // Fetch audits for ALL organizations
  const { data: audits, isLoading: loadingAudits } = useQuery({
    queryKey: ["audits-all", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];
      const { data, error } = await supabase
        .from("audits")
        .select("*")
        .in("organization_id", organizationIds)
        .order("audit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: organizationIds.length > 0,
  });

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

  // Generate mock trend data for compliance evolution (last 7 days)
  // In a real scenario, this would come from historical data stored in the database
  const complianceTrendData = eachDayOfInterval({
    start: subDays(new Date(), 6),
    end: new Date()
  }).map((date, index) => {
    // Simulate slight variation around current compliance rate
    const baseRate = complianceRate || 50;
    const variation = Math.sin(index * 0.8) * 5 + (index * 2);
    const rate = Math.max(0, Math.min(100, Math.round(baseRate - 10 + variation)));
    return {
      date: format(date, "EEE", { locale: pt }),
      taxa: index === 6 ? complianceRate : rate, // Last point is current rate
    };
  });

  // Categorize alerts by type
  const alertsByType = {
    legislation: alerts?.filter(a => a.type === "new_legislation") || [],
    deadlines: alerts?.filter(a => a.type === "deadline") || [],
    other: alerts?.filter(a => !["new_legislation", "deadline"].includes(a.type || "")) || [],
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo/Org - Clickable to Dashboard */}
      <Link 
        to="/dashboard" 
        onClick={() => setSidebarOpen(false)}
        className="p-4 border-b border-sidebar-border hover:bg-sidebar-accent/10 transition-colors cursor-pointer"
      >
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
      </Link>

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
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Link to="/legislacao-recente">
                      <Button variant="ghost" size="icon" className="relative">
                        <FileText className="h-5 w-5" />
                        {unreadLegislationCount > 0 && (
                          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                            {unreadLegislationCount > 99 ? "99+" : unreadLegislationCount}
                          </span>
                        )}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{unreadLegislationCount > 0 ? `${unreadLegislationCount} diplomas por ler` : "Legislação recente"}</p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8 space-y-6">
          {/* Overview Tab Content */}
          {activeTab === "overview" && (
            <>
          {/* Recent Legislation - Full Width at Top */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Legislação Recente</CardTitle>
                <Link to="/legislacao-recente" className="text-sm text-primary hover:underline flex items-center gap-1">
                  Ver mais <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <CardDescription>Últimos diplomas publicados</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingLegislation ? (
                <div className="grid md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-40 w-full" />
                  ))}
                </div>
              ) : recentLegislation && recentLegislation.length > 0 ? (
                <div className="grid md:grid-cols-4 gap-4">
                  {recentLegislation.slice(0, 4).map((leg) => (
                    <div
                      key={leg.id}
                      className="relative rounded-xl border bg-card overflow-hidden group hover:shadow-md transition-shadow"
                    >
                      <div className="absolute top-2 left-2 z-10">
                        <Badge variant={leg.source === "dre" ? "default" : "secondary"} className="text-xs">
                          {leg.source === "eurlex" ? "EUR-Lex" : leg.source?.toUpperCase() || "Manual"}
                        </Badge>
                      </div>
                      <div className="h-20 bg-gradient-to-br from-primary/20 to-primary/5" />
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">
                            {leg.publication_date ? format(new Date(leg.publication_date), "d MMM yyyy", { locale: pt }) : ""}
                          </span>
                          {leg.document_url && (
                            <a
                              href={leg.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary text-xs hover:underline"
                            >
                              Ver
                            </a>
                          )}
                        </div>
                        <p className="text-sm font-medium line-clamp-2">
                          {leg.number}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {leg.title}
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

          {/* Charts and Stats Row - 3 columns */}
          <div className="grid gap-6 lg:grid-cols-3">
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

            {/* Quick Stats + Trend */}
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

                {/* Mini Trend Chart */}
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Evolução (últimos 7 dias)</p>
                  <div className="h-[80px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={complianceTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorTaxa" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          domain={[0, 100]}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip 
                          formatter={(value: number) => [`${value}%`, "Taxa"]}
                          contentStyle={{ 
                            borderRadius: "8px", 
                            border: "1px solid hsl(var(--border))",
                            fontSize: "12px"
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="taxa" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorTaxa)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
            </>
          )}

          {/* Action Plans Tab */}
          {activeTab === "actions" && (
            <ActionPlansView 
              organizationIds={organizationIds} 
              organizations={organizations} 
            />
          )}

          {/* Audits Tab */}
          {activeTab === "audits" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Auditorias</h2>
                <p className="text-muted-foreground">
                  Auditorias realizadas à sua organização
                </p>
              </div>

              {loadingAudits ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : !audits || audits.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">Sem auditorias registadas</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {audits.map((audit) => (
                    <Card key={audit.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge 
                                variant="outline" 
                                className={`gap-1 ${
                                  audit.status === "completed" 
                                    ? "bg-green-500 text-white border-0" 
                                    : audit.status === "in_progress" 
                                    ? "bg-yellow-500 text-white border-0" 
                                    : audit.status === "cancelled"
                                    ? "bg-gray-500 text-white border-0"
                                    : "bg-blue-500 text-white border-0"
                                }`}
                              >
                                {audit.status === "completed" ? "Concluída" : 
                                 audit.status === "in_progress" ? "Em Curso" : 
                                 audit.status === "cancelled" ? "Cancelada" : "Planeada"}
                              </Badge>
                            </div>
                            <h3 className="font-semibold">{audit.title}</h3>
                            {audit.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{audit.description}</p>
                            )}
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              {audit.audit_date && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>{format(new Date(audit.audit_date), "d MMM yyyy", { locale: pt })}</span>
                                </div>
                              )}
                              {audit.auditor && (
                                <div className="flex items-center gap-1">
                                  <User className="h-4 w-4" />
                                  <span>{audit.auditor}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && (
            <DocumentsPanel organizationIds={organizationIds as string[]} />
          )}

          {/* Indicators Tab */}
          {activeTab === "indicators" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">Indicadores</h2>
                <p className="text-muted-foreground">
                  Métricas e indicadores de desempenho
                </p>
              </div>
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">Indicadores em desenvolvimento</p>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
