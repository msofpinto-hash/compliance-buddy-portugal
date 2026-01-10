import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Bell, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  TrendingUp,
  LogOut,
  Settings,
  ExternalLink,
  BookOpen,
  PieChart as PieChartIcon,
  BarChart3
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, eachDayOfInterval } from "date-fns";
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

const COLORS = {
  compliant: "hsl(142, 76%, 36%)",
  nonCompliant: "hsl(0, 84%, 60%)",
  inProgress: "hsl(45, 93%, 47%)",
  pending: "hsl(215, 20%, 65%)",
};

export default function Dashboard() {
  const { user, signOut, isAdmin } = useAuth();

  // Fetch user's organization
  const { data: userRole } = useQuery({
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

  // Fetch action plans with details
  const { data: actionPlans } = useQuery({
    queryKey: ["action-plans", userRole?.organization_id],
    queryFn: async () => {
      if (!userRole?.organization_id) return [];
      const { data, error } = await supabase
        .from("action_plans")
        .select("*")
        .eq("organization_id", userRole.organization_id);
      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.organization_id,
  });

  // Fetch compliance data by theme
  const { data: complianceByTheme } = useQuery({
    queryKey: ["compliance-by-theme", userRole?.organization_id],
    queryFn: async () => {
      if (!userRole?.organization_id) return [];
      
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
        .eq("organization_id", userRole.organization_id)
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
    enabled: !!userRole?.organization_id,
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

  // Compliance stats
  const { data: complianceStats } = useQuery({
    queryKey: ["compliance-stats", userRole?.organization_id],
    queryFn: async () => {
      if (!userRole?.organization_id) return { applicable: 0, compliant: 0, nonCompliant: 0, inProgress: 0 };
      
      const { data, error } = await supabase
        .from("applicabilities")
        .select("is_applicable, compliance_status")
        .eq("organization_id", userRole.organization_id);
      
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
    enabled: !!userRole?.organization_id,
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Legal Compliance</h1>
              <p className="text-sm text-muted-foreground">
                {userRole?.organizations?.name || "Dashboard"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/biblioteca">
              <Button variant="ghost" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Biblioteca
              </Button>
            </Link>
            <Link to="/cliente">
              <Button variant="ghost" className="gap-2">
                <FileText className="h-4 w-4" />
                Meus Diplomas
              </Button>
            </Link>
            {isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Admin
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold">
            Olá, {user?.email?.split("@")[0]}
          </h2>
          <p className="text-muted-foreground">
            Aqui está o resumo do seu estado de conformidade
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Conformidade</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: complianceRate >= 80 ? COLORS.compliant : complianceRate >= 50 ? COLORS.inProgress : COLORS.nonCompliant }}>
                {complianceRate}%
              </div>
              <p className="text-xs text-muted-foreground">
                {complianceStats?.compliant || 0} de {complianceStats?.applicable || 0} requisitos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ações Pendentes</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{actionPlanStats.pending}</div>
              <p className="text-xs text-muted-foreground">
                {actionPlanStats.inProgress} em curso
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ações Atrasadas</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {actionPlanStats.overdue}
              </div>
              <p className="text-xs text-muted-foreground">
                Requerem atenção imediata
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Alertas Não Lidos</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{alerts?.length || 0}</div>
              <p className="text-xs text-muted-foreground">
                Nova legislação e prazos
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          {/* Compliance Pie Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Estado de Conformidade</CardTitle>
              </div>
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
              <div className="flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Planos de Ação</CardTitle>
              </div>
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

          {/* Compliance by Theme Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Conformidade por Tema</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {complianceByTheme && complianceByTheme.length > 0 ? (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={complianceByTheme} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" fontSize={12} />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        width={80} 
                        fontSize={11}
                        tickFormatter={(value) => value.length > 12 ? value.slice(0, 12) + "..." : value}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                      />
                      <Bar dataKey="compliant" stackId="a" fill={COLORS.compliant} name="Conforme" />
                      <Bar dataKey="inProgress" stackId="a" fill={COLORS.inProgress} name="Em Avaliação" />
                      <Bar dataKey="nonCompliant" stackId="a" fill={COLORS.nonCompliant} name="Não Conforme" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  Sem dados por tema
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Legislation Trend */}
        <Card className="mb-8">
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

        {/* Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Legislation */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Legislação Recente</CardTitle>
                  <CardDescription>Últimos diplomas publicados</CardDescription>
                </div>
                <Link to="/biblioteca">
                  <Button variant="ghost" size="sm">Ver todos</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {loadingLegislation ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentLegislation && recentLegislation.length > 0 ? (
                <div className="space-y-3">
                  {recentLegislation.map((leg) => (
                    <div
                      key={leg.id}
                      className="flex items-start justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={leg.source === "dre" ? "default" : "secondary"}>
                            {leg.source === "dre" ? "DRE" : leg.source === "eurlex" ? "EUR-Lex" : "Manual"}
                          </Badge>
                          <span className="font-medium text-sm truncate">{leg.number}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {leg.title}
                        </p>
                        {leg.publication_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(leg.publication_date), "d MMM yyyy", { locale: pt })}
                          </p>
                        )}
                      </div>
                      {leg.document_url && (
                        <a
                          href={leg.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 ml-2"
                        >
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
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

          {/* Alerts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Alertas</CardTitle>
                  <CardDescription>Notificações importantes</CardDescription>
                </div>
                <Badge variant="outline">{alerts?.length || 0} não lidos</Badge>
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
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="shrink-0 mt-0.5">
                        {alert.type === "deadline" ? (
                          <Clock className="h-4 w-4 text-amber-500" />
                        ) : alert.type === "new_legislation" ? (
                          <FileText className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Bell className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{alert.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {alert.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(alert.created_at), "d MMM yyyy, HH:mm", { locale: pt })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                  <p className="text-muted-foreground">Sem alertas pendentes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
