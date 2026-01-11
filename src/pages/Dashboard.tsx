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
  ExternalLink,
  BookOpen,
  LayoutDashboard,
  Scale,
  ClipboardList,
  FolderTree,
  Search,
  ChevronRight,
  HelpCircle,
  Menu,
  X,
  Gavel
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { pt } from "date-fns/locale";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const COLORS = {
  compliant: "hsl(142, 76%, 36%)",
  nonCompliant: "hsl(0, 84%, 60%)",
  inProgress: "hsl(45, 93%, 47%)",
  pending: "hsl(215, 20%, 65%)",
};

type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  count?: number;
};

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
        .limit(5);
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

  // Fetch compliance data by theme for ALL organizations
  const { data: complianceByTheme } = useQuery({
    queryKey: ["compliance-by-theme-all", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];
      
      const { data: applicabilities, error } = await supabase
        .from("applicabilities")
        .select(`
          *,
          legal_requirements(
            legislation(
              legislation_category_mapping(
                theme_categories(
                  themes(id, name)
                )
              )
            )
          )
        `)
        .in("organization_id", organizationIds)
        .eq("is_applicable", true);
      
      if (error) throw error;

      // Group by theme
      const themeStats: Record<string, { name: string; compliant: number; nonCompliant: number; inProgress: number }> = {};
      
      applicabilities?.forEach((app: any) => {
        const themes = app.legal_requirements?.legislation?.legislation_category_mapping || [];
        themes.forEach((mapping: any) => {
          const theme = mapping.theme_categories?.themes;
          if (theme) {
            if (!themeStats[theme.id]) {
              themeStats[theme.id] = { name: theme.name, compliant: 0, nonCompliant: 0, inProgress: 0 };
            }
            if (app.compliance_status === "conforme") themeStats[theme.id].compliant++;
            else if (app.compliance_status === "nao_conforme") themeStats[theme.id].nonCompliant++;
            else themeStats[theme.id].inProgress++;
          }
        });
      });

      return Object.values(themeStats).slice(0, 5);
    },
    enabled: organizationIds.length > 0,
  });

  // Fetch legislation trend (last 30 days)
  const { data: legislationTrend } = useQuery({
    queryKey: ["legislation-trend"],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      const { data, error } = await supabase
        .from("legislation")
        .select("publication_date, source")
        .gte("publication_date", thirtyDaysAgo.toISOString().split("T")[0])
        .order("publication_date", { ascending: true });
      
      if (error) throw error;

      // Group by date
      const dateRange = eachDayOfInterval({ start: thirtyDaysAgo, end: new Date() });
      const trend = dateRange.map(date => {
        const dateStr = format(date, "yyyy-MM-dd");
        const dayData = data?.filter(d => d.publication_date === dateStr) || [];
        return {
          date: format(date, "d MMM", { locale: pt }),
          dre: dayData.filter(d => d.source === "dre").length,
          eurlex: dayData.filter(d => d.source === "eurlex").length,
          total: dayData.length,
        };
      });

      return trend;
    },
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

  // Navigation items
  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    { id: "legislacao", label: "Legislação", icon: Gavel, href: "/biblioteca" },
    { id: "cliente", label: "Meus Diplomas", icon: FileText, href: "/cliente" },
    { id: "planos", label: "Planos de Ação", icon: ClipboardList, href: "/cliente" },
  ];

  if (isAdmin) {
    navItems.push({ id: "admin", label: "Administração", icon: Settings, href: "/admin" });
  }

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
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border mt-auto">
        <LogoutConfirmDialog 
          onConfirm={signOut} 
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent/10" 
          variant="ghost"
        />
      </div>
    </div>
  );

  // Alert stats for the cards
  const alertStats = {
    legislation: recentLegislation?.length || 0,
    potentiallyApplicable: 0,
    legalRequirements: complianceStats?.applicable || 0,
    alerts: alerts?.length || 0,
  };

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
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-4">
            {/* Main Content Area - 3 columns */}
            <div className="lg:col-span-3 space-y-6">
              {/* Alerts Section */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Avisos não lidos do último mês</CardTitle>
                    <Link to="/cliente" className="text-sm text-primary hover:underline flex items-center gap-1">
                      Ver mais <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-secondary/10 rounded-xl p-4 text-center border border-border hover:border-primary/30 transition-colors">
                      <div className="text-3xl font-bold mb-2">{alertStats.legislation}</div>
                      <div className="text-xs text-muted-foreground">Legislação</div>
                    </div>
                    <div className="bg-secondary/10 rounded-xl p-4 text-center border border-border hover:border-primary/30 transition-colors">
                      <div className="text-3xl font-bold mb-2">{alertStats.potentiallyApplicable}</div>
                      <div className="text-xs text-muted-foreground">Legis. Potenc. Aplicável</div>
                    </div>
                    <div className="bg-secondary/10 rounded-xl p-4 text-center border border-border hover:border-primary/30 transition-colors">
                      <div className="text-3xl font-bold mb-2">{alertStats.legalRequirements}</div>
                      <div className="text-xs text-muted-foreground">Requisitos Legais</div>
                    </div>
                    <div className="bg-secondary/10 rounded-xl p-4 text-center border border-border hover:border-primary/30 transition-colors">
                      <div className="text-3xl font-bold mb-2">{actionPlanStats.overdue}</div>
                      <div className="text-xs text-muted-foreground">Ações Atrasadas</div>
                    </div>
                    <div className="bg-secondary/10 rounded-xl p-4 text-center border border-border hover:border-primary/30 transition-colors">
                      <div className="text-3xl font-bold mb-2">{alertStats.alerts}</div>
                      <div className="text-xs text-muted-foreground">Alertas</div>
                    </div>
                  </div>
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

              {/* Legislation Trend */}
              <Card>
                <CardHeader>
                  <CardTitle>Tendência de Publicações (últimos 30 dias)</CardTitle>
                  <CardDescription>Nova legislação publicada no DRE e EUR-Lex</CardDescription>
                </CardHeader>
                <CardContent>
                  {legislationTrend && legislationTrend.some(d => d.total > 0) ? (
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={legislationTrend}>
                          <defs>
                            <linearGradient id="colorDre" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorEurlex" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="hsl(220, 70%, 50%)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis 
                            dataKey="date" 
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis 
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                          />
                          <Legend />
                          <Area 
                            type="monotone" 
                            dataKey="dre" 
                            name="DRE"
                            stroke="hsl(var(--primary))" 
                            fillOpacity={1} 
                            fill="url(#colorDre)" 
                          />
                          <Area 
                            type="monotone" 
                            dataKey="eurlex" 
                            name="EUR-Lex"
                            stroke="hsl(220, 70%, 50%)" 
                            fillOpacity={1} 
                            fill="url(#colorEurlex)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      Sem publicações nos últimos 30 dias
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Sidebar - 1 column */}
            <div className="space-y-6">
              {/* Help Card */}
              <Card className="bg-primary text-primary-foreground overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <HelpCircle className="h-8 w-8 shrink-0" />
                    <div>
                      <h3 className="font-semibold text-lg">Precisa de ajuda?</h3>
                      <p className="text-sm opacity-90">Confira a nossa documentação</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Button 
                      variant="secondary" 
                      className="w-full bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
                    >
                      Centro de Suporte
                    </Button>
                    <Button 
                      variant="secondary" 
                      className="w-full bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
                    >
                      Webinars
                    </Button>
                  </div>
                </CardContent>
              </Card>

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

              {/* Alerts */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Alertas Recentes</CardTitle>
                    <Badge variant="outline">{alerts?.length || 0}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingAlerts ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : alerts && alerts.length > 0 ? (
                    <div className="space-y-2">
                      {alerts.slice(0, 3).map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-start gap-2 rounded-lg border p-2 hover:bg-muted/50 transition-colors"
                        >
                          <div className="shrink-0 mt-0.5">
                            {alert.type === "deadline" ? (
                              <Clock className="h-3.5 w-3.5 text-amber-500" />
                            ) : alert.type === "new_legislation" ? (
                              <FileText className="h-3.5 w-3.5 text-blue-500" />
                            ) : (
                              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs line-clamp-1">{alert.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(alert.created_at), "d MMM", { locale: pt })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Sem alertas</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
