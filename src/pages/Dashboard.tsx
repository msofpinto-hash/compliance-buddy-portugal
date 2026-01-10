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
  BookOpen
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

export default function Dashboard() {
  const { user, signOut } = useAuth();

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

  // Fetch action plans stats
  const { data: actionPlanStats, isLoading: loadingStats } = useQuery({
    queryKey: ["action-plan-stats", userRole?.organization_id],
    queryFn: async () => {
      if (!userRole?.organization_id) return { pending: 0, inProgress: 0, completed: 0, overdue: 0 };
      
      const { data, error } = await supabase
        .from("action_plans")
        .select("status, due_date")
        .eq("organization_id", userRole.organization_id);
      
      if (error) throw error;

      const today = new Date();
      const stats = {
        pending: 0,
        inProgress: 0,
        completed: 0,
        overdue: 0,
      };

      data?.forEach((plan) => {
        if (plan.status === "concluido") stats.completed++;
        else if (plan.status === "em_curso") stats.inProgress++;
        else stats.pending++;

        if (plan.due_date && new Date(plan.due_date) < today && plan.status !== "concluido") {
          stats.overdue++;
        }
      });

      return stats;
    },
    enabled: !!userRole?.organization_id,
  });

  // Fetch compliance stats
  const { data: complianceStats } = useQuery({
    queryKey: ["compliance-stats", userRole?.organization_id],
    queryFn: async () => {
      if (!userRole?.organization_id) return { applicable: 0, compliant: 0, nonCompliant: 0 };
      
      const { data, error } = await supabase
        .from("applicabilities")
        .select("is_applicable, compliance_status")
        .eq("organization_id", userRole.organization_id);
      
      if (error) throw error;

      const stats = { applicable: 0, compliant: 0, nonCompliant: 0 };
      data?.forEach((app) => {
        if (app.is_applicable) {
          stats.applicable++;
          if (app.compliance_status === "conforme") stats.compliant++;
          else if (app.compliance_status === "nao_conforme") stats.nonCompliant++;
        }
      });

      return stats;
    },
    enabled: !!userRole?.organization_id,
  });

  const complianceRate = complianceStats?.applicable 
    ? Math.round((complianceStats.compliant / complianceStats.applicable) * 100) 
    : 0;

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
            {userRole?.role === "admin" && (
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
              <div className="text-2xl font-bold">{complianceRate}%</div>
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
              <div className="text-2xl font-bold">{actionPlanStats?.pending || 0}</div>
              <p className="text-xs text-muted-foreground">
                {actionPlanStats?.inProgress || 0} em curso
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
                {actionPlanStats?.overdue || 0}
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
