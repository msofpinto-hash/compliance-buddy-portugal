import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ExternalLink,
  Download,
  Loader2,
  Lock,
  MessageSquare,
  ThumbsUp,
  Eye,
  Sparkles,
  Leaf,
  Shield,
  Zap,
  Factory,
  Building,
  Utensils,
  Heart,
  HardHat,
  type LucideIcon
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { DocumentsPanel } from "@/components/client/DocumentsPanel";
import { ActionPlansView } from "@/components/client/ActionPlansView";
import { PlanFeedbackDialog } from "@/components/client/PlanFeedbackDialog";
import { AuditPlanDetailsDialog } from "@/components/client/AuditPlanDetailsDialog";
import { EvidenceRequestsPanel } from "@/components/client/EvidenceRequestsPanel";
import { WelcomeHero } from "@/components/client/WelcomeHero";
import { ModuleCard } from "@/components/client/ModuleCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ClientGridBackground, ClientParticles, ClientAnimatedLogo } from "@/components/client/ClientBackgrounds";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/ui/date-range-filter";

// Module images
import moduleLegislation from "@/assets/module-legislation.jpg";
import moduleActions from "@/assets/module-actions.jpg";
import moduleAudits from "@/assets/module-audits.jpg";
import moduleDocuments from "@/assets/module-documents.jpg";
import auditHero from "@/assets/audit-hero.png";
import evidenceHero from "@/assets/evidence-hero.png";
import indicatorsHero from "@/assets/indicators-hero.png";
import logoIdCompliance from "@/assets/logo-id-compliance.png";

type TabType = "overview" | "actions" | "audits" | "documents" | "indicators";

const COLORS = {
  compliant: "hsl(142, 76%, 36%)",
  nonCompliant: "hsl(0, 84%, 60%)",
  inProgress: "hsl(45, 93%, 47%)",
  pending: "hsl(215, 20%, 65%)",
};

// Audit icon configuration based on keywords
interface AuditIconConfig {
  icon: LucideIcon;
  bgColor: string;
  iconColor: string;
}

const AUDIT_ICON_KEYWORDS: { keywords: string[]; config: AuditIconConfig }[] = [
  {
    keywords: ["ambiente", "ambiental", "resíduo", "água", "emissões", "poluição"],
    config: { icon: Leaf, bgColor: "bg-green-100", iconColor: "text-green-600" }
  },
  {
    keywords: ["segurança", "sst", "saúde", "trabalho", "ocupacional"],
    config: { icon: HardHat, bgColor: "bg-orange-100", iconColor: "text-orange-600" }
  },
  {
    keywords: ["energia", "energético", "elétrico", "consumo"],
    config: { icon: Zap, bgColor: "bg-yellow-100", iconColor: "text-yellow-600" }
  },
  {
    keywords: ["qualidade", "iso", "certificação", "processo"],
    config: { icon: CheckCircle2, bgColor: "bg-blue-100", iconColor: "text-blue-600" }
  },
  {
    keywords: ["alimentar", "higiene", "haccp", "comida"],
    config: { icon: Utensils, bgColor: "bg-amber-100", iconColor: "text-amber-600" }
  },
  {
    keywords: ["legal", "legislação", "conformidade", "compliance"],
    config: { icon: Scale, bgColor: "bg-purple-100", iconColor: "text-purple-600" }
  },
  {
    keywords: ["industrial", "fábrica", "produção", "manufatura"],
    config: { icon: Factory, bgColor: "bg-slate-100", iconColor: "text-slate-600" }
  },
  {
    keywords: ["instalações", "edifício", "infraestrutura"],
    config: { icon: Building, bgColor: "bg-indigo-100", iconColor: "text-indigo-600" }
  },
];

const getAuditIconConfig = (title: string, description?: string | null): AuditIconConfig => {
  const searchText = `${title} ${description || ""}`.toLowerCase();
  
  for (const item of AUDIT_ICON_KEYWORDS) {
    if (item.keywords.some(keyword => searchText.includes(keyword))) {
      return item.config;
    }
  }
  
  // Default icon
  return { icon: ClipboardCheck, bgColor: "bg-primary/10", iconColor: "text-primary" };
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [approvingAuditId, setApprovingAuditId] = useState<string | null>(null);
  const [approvingPlanId, setApprovingPlanId] = useState<string | null>(null);
  const [exportingAuditId, setExportingAuditId] = useState<string | null>(null);
  const [feedbackDialogAudit, setFeedbackDialogAudit] = useState<{ id: string; title: string } | null>(null);
  const [viewingAuditPlan, setViewingAuditPlan] = useState<any>(null);
  // Audit filters and sorting
  const [auditStatusFilter, setAuditStatusFilter] = useState<string | null>(null);
  const [auditStartDate, setAuditStartDate] = useState<string | null>(null);
  const [auditEndDate, setAuditEndDate] = useState<string | null>(null);
  const [auditSortBy, setAuditSortBy] = useState<"date_desc" | "date_asc" | "title" | "status">("date_desc");
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Get active tab from URL params
  const tabParam = searchParams.get("tab");
  const activeTab: TabType = (tabParam === "actions" || tabParam === "audits" || tabParam === "documents" || tabParam === "indicators") 
    ? tabParam 
    : "overview";

  // Fetch user profile
  const { data: userProfile } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

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
  const { data: audits, isLoading: loadingAudits, refetch: refetchAudits } = useQuery({
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

  // Handle audit approval
  const handleApproveAudit = async (auditId: string) => {
    setApprovingAuditId(auditId);
    try {
      const { error } = await supabase
        .from("audits")
        .update({ 
          status: "closed",
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq("id", auditId);
      
      if (error) throw error;
      
      toast({ title: "Auditoria aprovada", description: "A auditoria foi encerrada com sucesso." });
      refetchAudits();
    } catch (error) {
      console.error("Error approving audit:", error);
      toast({ title: "Erro", description: "Não foi possível aprovar a auditoria", variant: "destructive" });
    } finally {
      setApprovingAuditId(null);
    }
  };

  // Handle plan approval (by client)
  const handleApprovePlan = async (auditId: string) => {
    setApprovingPlanId(auditId);
    try {
      const { error } = await supabase
        .from("audits")
        .update({ 
          plan_approved_at: new Date().toISOString(),
          plan_approved_by: user?.id
        })
        .eq("id", auditId);
      
      if (error) throw error;
      
      toast({ title: "Plano aprovado", description: "O plano de auditoria foi aprovado com sucesso." });
      refetchAudits();
    } catch (error) {
      console.error("Error approving plan:", error);
      toast({ title: "Erro", description: "Não foi possível aprovar o plano", variant: "destructive" });
    } finally {
      setApprovingPlanId(null);
    }
  };

  // Handle plan feedback request
  const handlePlanFeedback = async (auditId: string, feedback: string) => {
    try {
      const { error } = await supabase
        .from("audits")
        .update({ 
          plan_feedback: feedback
        })
        .eq("id", auditId);
      
      if (error) throw error;
      
      toast({ title: "Pedido enviado", description: "O seu pedido de alterações foi registado com sucesso." });
      refetchAudits();
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast({ title: "Erro", description: "Não foi possível enviar o pedido", variant: "destructive" });
      throw error;
    }
  };

  // Handle audit PDF export
  const handleExportAuditPDF = async (auditId: string, auditTitle: string) => {
    setExportingAuditId(auditId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-compliance-report", {
        body: { 
          auditId,
          reportType: "audit"
        }
      });

      if (error) throw error;

      // Create blob and download
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Auditoria_${auditTitle.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Relatório gerado", description: "O relatório foi descarregado com sucesso" });
    } catch (error) {
      console.error("Error generating report:", error);
      toast({ title: "Erro", description: "Não foi possível gerar o relatório", variant: "destructive" });
    } finally {
      setExportingAuditId(null);
    }
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
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Logo/Org - Clickable to Dashboard */}
      <Link 
        to="/dashboard" 
        onClick={() => setSidebarOpen(false)}
        className="p-4 border-b border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
      >
        {currentOrg?.logo_url ? (
          <img 
            src={currentOrg.logo_url} 
            alt={currentOrg.name} 
            className="h-12 w-auto object-contain"
          />
        ) : (
          <div className="flex items-center gap-3">
            <ClientAnimatedLogo />
            <div className="flex flex-col">
              <span className="font-bold text-slate-800 dark:text-white leading-tight">I&D</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 leading-tight font-medium tracking-wider">COMPLIANCE</span>
            </div>
          </div>
        )}
      </Link>

      {/* User Info */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center">
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
              {user?.email?.split("@")[0]}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
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
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20" 
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-800 dark:hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <Badge className={cn(
                    "ml-auto text-xs",
                    isActive 
                      ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-0" 
                      : "bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-0"
                  )}>
                    {item.count}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Admin link if admin */}
        {isAdmin && (
          <div className="px-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/50">
            <Link
              to="/admin"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-800 dark:hover:text-white transition-all duration-200"
            >
              <Settings className="h-5 w-5 shrink-0" />
              <span>Administração</span>
            </Link>
          </div>
        )}
      </ScrollArea>

      {/* Footer - Help, Settings & Logout */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700/50 mt-auto space-y-1">
        <Link
          to="/settings"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-white transition-all duration-200 w-full"
        >
          <User className="h-4 w-4" />
          <span>Definições</span>
        </Link>
        <a
          href="mailto:suporte@legalcompliance.pt"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-white transition-all duration-200 w-full"
        >
          <HelpCircle className="h-4 w-4" />
          <span>Ajuda</span>
        </a>
        <LogoutConfirmDialog 
          onConfirm={signOut} 
          className="w-full justify-start gap-3 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 px-3" 
          variant="ghost"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex relative">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30 border-r-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0 border-r-2 border-slate-200 dark:border-slate-800">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 relative z-10">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b-2 border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 lg:px-8 py-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{currentOrg?.name || "Dashboard"}</p>
                <h1 className="text-xl font-semibold text-slate-800 dark:text-white">
                  {activeTab === "overview" && "Painel de Controlo"}
                  {activeTab === "actions" && "Planos de Ação"}
                  {activeTab === "audits" && "Auditorias"}
                  {activeTab === "documents" && "Documentos"}
                  {activeTab === "indicators" && "Indicadores"}
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Pesquisa" 
                  className="pl-9 w-64 bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20"
                />
              </div>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Link to="/legislacao-recente">
                      <Button variant="ghost" size="icon" className="relative text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10">
                        <FileText className="h-5 w-5" />
                        {unreadLegislationCount > 0 && (
                          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center shadow-sm">
                            {unreadLegislationCount > 99 ? "99+" : unreadLegislationCount}
                          </span>
                        )}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white">
                    <p>{unreadLegislationCount > 0 ? `${unreadLegislationCount} diplomas por ler` : "Legislação recente"}</p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8 space-y-8">
          {/* Overview Tab Content */}
          {activeTab === "overview" && (
            <>
              {/* Welcome Hero Section */}
              <WelcomeHero
                userName={userProfile?.full_name || user?.email}
                organizationName={currentOrg?.name}
                alertsCount={0}
                upcomingAudits={audits?.filter(a => a.status === "in_progress" || a.status === "planned").length || 0}
                pendingActions={actionPlanStats.pending + actionPlanStats.inProgress}
              />

              {/* Modules Grid */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-emerald-500" />
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Acesso Rápido</h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <ModuleCard
                    title="Legislação"
                    description="Consulte a biblioteca de diplomas legais aplicáveis"
                    icon={Gavel}
                    href="/biblioteca"
                    count={unreadLegislationCount > 0 ? unreadLegislationCount : undefined}
                    countLabel="novos"
                  />
                  <ModuleCard
                    title="Planos de Ação"
                    description="Gerir ações de conformidade e prazos"
                    icon={ClipboardList}
                    href="/dashboard?tab=actions"
                    count={actionPlanStats.pending + actionPlanStats.inProgress}
                    countLabel="ativos"
                  />
                  <ModuleCard
                    title="Auditorias"
                    description="Acompanhe o estado das auditorias"
                    icon={ClipboardCheck}
                    href="/dashboard?tab=audits"
                    count={audits?.filter(a => a.status === "in_progress" || a.status === "planned").length}
                    countLabel="ativas"
                  />
                  <ModuleCard
                    title="Evidências"
                    description="Submeta documentos de conformidade"
                    icon={FolderOpen}
                    href="/dashboard?tab=documents"
                  />
                </div>
              </div>

              {/* Recent Legislation */}
              <Card className="overflow-hidden bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-600/50 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                        <FileText className="h-5 w-5 text-primary" />
                        Legislação Recente
                      </CardTitle>
                      <CardDescription className="text-slate-500 dark:text-slate-300">Últimos diplomas publicados</CardDescription>
                    </div>
                    <Link to="/legislacao-recente" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 font-medium transition-colors">
                      Ver todos <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {loadingLegislation ? (
                    <div className="grid md:grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-40 w-full rounded-lg bg-slate-100 dark:bg-slate-700" />
                      ))}
                    </div>
                  ) : recentLegislation && recentLegislation.length > 0 ? (
                    <div className="grid md:grid-cols-4 gap-4">
                      {recentLegislation.slice(0, 4).map((leg) => (
                        <Link
                          key={leg.id}
                          to={`/legislacao/${leg.id}`}
                          className="relative rounded-lg border border-slate-200 dark:border-slate-600/50 bg-white dark:bg-slate-700/80 overflow-hidden group hover:border-primary/50 hover:shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200"
                        >
                          <div className="absolute top-2 left-2 z-10">
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              leg.source === "dre" 
                                ? "bg-emerald-50 dark:bg-emerald-800/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-600" 
                                : "bg-blue-50 dark:bg-blue-800/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-600"
                            )}>
                              {leg.source === "eurlex" ? "EUR-Lex" : leg.source?.toUpperCase() || "Manual"}
                            </Badge>
                          </div>
                          <div className="h-12 bg-slate-50 dark:bg-slate-600/50 border-b border-slate-100 dark:border-slate-600" />
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-slate-500 dark:text-slate-300 font-medium">
                                {leg.publication_date ? format(new Date(leg.publication_date), "d MMM yyyy", { locale: pt }) : ""}
                              </span>
                              <ExternalLink className="h-3 w-3 text-slate-400 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 group-hover:text-primary transition-colors">
                              {leg.number}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-300 line-clamp-2 mt-1">
                              {leg.title}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <FileText className="h-12 w-12 text-slate-300 dark:text-slate-500 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-300">Nenhuma legislação disponível</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Charts and Stats Row - 3 columns */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Compliance Pie Chart */}
                <Card className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
                      <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      </div>
                      Estado de Conformidade
                    </CardTitle>
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
                              contentStyle={{ 
                                borderRadius: "8px", 
                                border: "2px solid #e2e8f0", 
                                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                                backgroundColor: "#fff",
                                color: "#1e293b"
                              }}
                            />
                            <Legend 
                              verticalAlign="bottom" 
                              height={36}
                              formatter={(value) => <span className="text-sm text-slate-600 dark:text-slate-300">{value}</span>}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center text-slate-400">
                        <div className="text-center">
                          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p>Sem dados de conformidade</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Action Plans Pie Chart */}
                <Card className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
                      <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                        <ClipboardList className="h-4 w-4 text-primary" />
                      </div>
                      Planos de Ação
                    </CardTitle>
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
                              contentStyle={{ 
                                borderRadius: "8px", 
                                border: "2px solid #e2e8f0", 
                                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                                backgroundColor: "#fff",
                                color: "#1e293b"
                              }}
                            />
                            <Legend 
                              verticalAlign="bottom" 
                              height={36}
                              formatter={(value) => <span className="text-sm text-slate-600 dark:text-slate-300">{value}</span>}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-[200px] flex items-center justify-center text-slate-400">
                        <div className="text-center">
                          <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p>Sem planos de ação</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Stats + Trend */}
                <Card className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
                      <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
                        <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      Atividade
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-500" />
                        <span className="text-sm text-slate-600 dark:text-slate-300">Ações Pendentes</span>
                      </div>
                      <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 font-bold">{actionPlanStats.pending}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        <span className="text-sm text-slate-600 dark:text-slate-300">Ações Atrasadas</span>
                      </div>
                      <Badge variant="outline" className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 font-bold">{actionPlanStats.overdue}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm text-slate-600 dark:text-slate-300">Concluídas</span>
                      </div>
                      <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 font-bold">{actionPlanStats.completed}</Badge>
                    </div>

                    {/* Mini Trend Chart */}
                    <div className="pt-3 border-t-2 border-slate-100 dark:border-slate-800">
                      <p className="text-xs text-slate-500 mb-2">Evolução (últimos 7 dias)</p>
                      <div className="h-[80px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={complianceTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorTaxa" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(161, 93%, 30%)" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="hsl(161, 93%, 30%)" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <XAxis 
                              dataKey="date" 
                              tick={{ fontSize: 10, fill: "#94a3b8" }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis 
                              domain={[0, 100]}
                              tick={{ fontSize: 10, fill: "#94a3b8" }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip 
                              formatter={(value: number) => [`${value}%`, "Taxa"]}
                              contentStyle={{ 
                                borderRadius: "8px", 
                                border: "2px solid #e2e8f0",
                                backgroundColor: "#fff",
                                color: "#1e293b",
                                fontSize: "12px"
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="taxa" 
                              stroke="hsl(161, 93%, 40%)" 
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
            <div className="space-y-8">
              {/* Hero Header */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600/20 via-violet-500/10 to-indigo-500/20">
                <div className="absolute inset-0 bg-grid-white/10" />
                <div className="relative flex flex-col md:flex-row items-center gap-6 p-6 md:p-8">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-purple-500/20 text-purple-700 border-0">
                        <ClipboardCheck className="h-3 w-3 mr-1" />
                        Módulo de Auditorias
                      </Badge>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Auditorias</h1>
                    <p className="text-muted-foreground text-lg max-w-xl">
                      Acompanhe as auditorias planeadas, em curso e o histórico completo de auditorias realizadas
                    </p>
                  </div>
                  <div className="hidden md:block w-48 h-32 relative">
                    <img 
                      src={auditHero} 
                      alt="Auditorias" 
                      className="w-full h-full object-contain drop-shadow-xl"
                    />
                  </div>
                </div>
              </div>

              {/* Audit Plan Section - Planned and In Progress */}
              {(() => {
                const plannedAudits = audits?.filter(
                  (a) => a.status === "planned" || a.status === "in_progress"
                ) || [];
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <Calendar className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">Plano de Auditoria</h2>
                        <p className="text-sm text-muted-foreground">
                          Auditorias planeadas e em curso
                        </p>
                      </div>
                    </div>
                    
                    {loadingAudits ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {[1, 2].map((i) => (
                          <Skeleton key={i} className="h-40" />
                        ))}
                      </div>
                    ) : plannedAudits.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center">
                          <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                          <p className="text-muted-foreground">Sem auditorias planeadas</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        {plannedAudits.map((audit) => {
                          const iconConfig = getAuditIconConfig(audit.title, audit.description);
                          const IconComponent = iconConfig.icon;
                          
                          return (
                            <Card key={audit.id} className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
                              {/* Decorative gradient header */}
                              <div className={`h-2 ${
                                audit.status === "in_progress" 
                                  ? "bg-gradient-to-r from-yellow-400 to-amber-500" 
                                  : "bg-gradient-to-r from-blue-500 to-indigo-500"
                              }`} />
                              
                              <CardContent className="p-6">
                                <div className="flex gap-5">
                                  {/* Thematic Icon */}
                                  <div className={`shrink-0 h-16 w-16 rounded-2xl ${iconConfig.bgColor} flex items-center justify-center`}>
                                    <IconComponent className={`h-8 w-8 ${iconConfig.iconColor}`} />
                                  </div>
                                  
                                  <div className="flex-1 space-y-4">
                                    {/* Header with status badges and actions */}
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 space-y-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Badge 
                                            variant="outline" 
                                            className={`gap-1.5 px-3 py-1 ${
                                              audit.status === "in_progress" 
                                                ? "bg-yellow-500/10 text-yellow-700 border-yellow-300" 
                                                : "bg-blue-500/10 text-blue-700 border-blue-300"
                                            }`}
                                          >
                                            <div className={`h-2 w-2 rounded-full ${
                                              audit.status === "in_progress" ? "bg-yellow-500 animate-pulse" : "bg-blue-500"
                                            }`} />
                                            {audit.status === "in_progress" ? "Em Curso" : "Planeada"}
                                          </Badge>
                                          {audit.plan_approved_at && (
                                            <Badge variant="outline" className="gap-1.5 px-3 py-1 bg-green-500/10 text-green-700 border-green-300">
                                              <ThumbsUp className="h-3 w-3" />
                                              Plano Aprovado
                                            </Badge>
                                          )}
                                          {audit.plan_feedback && !audit.plan_approved_at && (
                                            <Badge variant="outline" className="gap-1.5 px-3 py-1 bg-orange-500/10 text-orange-700 border-orange-300">
                                              <MessageSquare className="h-3 w-3" />
                                              Alterações Solicitadas
                                            </Badge>
                                          )}
                                        </div>
                                        
                                        <h3 className="text-xl font-bold tracking-tight">{audit.title}</h3>
                                        
                                        {audit.description && (
                                          <p className="text-muted-foreground line-clamp-2">{audit.description}</p>
                                        )}
                                      </div>
                                      
                                      {/* Action buttons */}
                                      <div className="flex gap-2">
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          className="h-10 w-10 rounded-full"
                                          onClick={() => setViewingAuditPlan(audit)}
                                          title="Ver detalhes do plano"
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="outline"
                                          className="h-10 w-10 rounded-full"
                                          onClick={() => handleExportAuditPDF(audit.id, audit.title)}
                                          disabled={exportingAuditId === audit.id}
                                          title="Exportar PDF"
                                        >
                                          {exportingAuditId === audit.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Download className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                    
                                    {/* Meta info with icons */}
                                    <div className="flex flex-wrap gap-4">
                                      {audit.audit_date && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                                          <Calendar className="h-4 w-4 text-primary" />
                                          <span className="text-sm font-medium">{format(new Date(audit.audit_date), "d 'de' MMMM 'de' yyyy", { locale: pt })}</span>
                                        </div>
                                      )}
                                      {audit.auditor && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                                          <User className="h-4 w-4 text-primary" />
                                          <span className="text-sm font-medium">{audit.auditor}</span>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Plan actions - only for planned audits not yet approved */}
                                    {audit.status === "planned" && !audit.plan_approved_at && (
                                      <div className="flex flex-wrap gap-3 pt-4 border-t">
                                        <Button
                                          onClick={() => handleApprovePlan(audit.id)}
                                          disabled={approvingPlanId === audit.id}
                                          className="gap-2 flex-1 sm:flex-none"
                                        >
                                          {approvingPlanId === audit.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <ThumbsUp className="h-4 w-4" />
                                          )}
                                          Aprovar Plano
                                        </Button>
                                        <Button
                                          variant="outline"
                                          onClick={() => setFeedbackDialogAudit({ id: audit.id, title: audit.title })}
                                          className="gap-2 flex-1 sm:flex-none"
                                        >
                                          <MessageSquare className="h-4 w-4" />
                                          Solicitar Alterações
                                        </Button>
                                      </div>
                                    )}
                                    
                                    {/* Show existing feedback */}
                                    {audit.plan_feedback && (
                                      <div className="pt-4 border-t">
                                        <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                                          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                                          <div>
                                            <p className="text-sm font-medium text-orange-800 mb-1">Alterações solicitadas</p>
                                            <p className="text-sm text-orange-700">{audit.plan_feedback}</p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Audit History Section */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <ClipboardCheck className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Histórico de Auditorias</h2>
                      <p className="text-sm text-muted-foreground">
                        Auditorias realizadas e encerradas
                      </p>
                    </div>
                  </div>
                  
                  {/* Filters */}
                  <div className="flex flex-wrap gap-2">
                    <Select 
                      value={auditStatusFilter || "all"} 
                      onValueChange={(v) => setAuditStatusFilter(v === "all" ? null : v)}
                    >
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder="Todos os estados" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os estados</SelectItem>
                        <SelectItem value="pending_approval">Em Aprovação</SelectItem>
                        <SelectItem value="closed">Encerrada</SelectItem>
                        <SelectItem value="cancelled">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <DateRangeFilter
                      startDate={auditStartDate}
                      endDate={auditEndDate}
                      onStartDateChange={setAuditStartDate}
                      onEndDateChange={setAuditEndDate}
                      label="Período"
                    />
                    
                    <Select 
                      value={auditSortBy} 
                      onValueChange={(v) => setAuditSortBy(v as typeof auditSortBy)}
                    >
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder="Ordenar por" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date_desc">Data (recente)</SelectItem>
                        <SelectItem value="date_asc">Data (antiga)</SelectItem>
                        <SelectItem value="title">Título A-Z</SelectItem>
                        <SelectItem value="status">Estado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              {(() => {
                // Status order for sorting
                const statusOrder: Record<string, number> = {
                  pending_approval: 1,
                  in_progress: 2,
                  planned: 3,
                  closed: 4,
                  cancelled: 5
                };

                // Filter and sort audits (exclude planned and in_progress - shown in Plano de Auditoria)
                const filteredAudits = audits?.filter((audit) => {
                  // Exclude planned and in_progress (shown in Plano de Auditoria section)
                  if (audit.status === "planned" || audit.status === "in_progress") {
                    return false;
                  }
                  // Status filter
                  if (auditStatusFilter && audit.status !== auditStatusFilter) {
                    return false;
                  }
                  // Date filter
                  if (audit.audit_date) {
                    const auditDate = new Date(audit.audit_date);
                    if (auditStartDate && auditDate < new Date(auditStartDate)) {
                      return false;
                    }
                    if (auditEndDate && auditDate > new Date(auditEndDate)) {
                      return false;
                    }
                  } else {
                    // If no audit_date and date filter is active, exclude
                    if (auditStartDate || auditEndDate) {
                      return false;
                    }
                  }
                  return true;
                }).sort((a, b) => {
                  switch (auditSortBy) {
                    case "date_desc":
                      return new Date(b.audit_date || 0).getTime() - new Date(a.audit_date || 0).getTime();
                    case "date_asc":
                      return new Date(a.audit_date || 0).getTime() - new Date(b.audit_date || 0).getTime();
                    case "title":
                      return a.title.localeCompare(b.title, "pt");
                    case "status":
                      return (statusOrder[a.status || "planned"] || 99) - (statusOrder[b.status || "planned"] || 99);
                    default:
                      return 0;
                  }
                }) || [];

                if (loadingAudits) {
                  return (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-32" />
                      ))}
                    </div>
                  );
                }

                if (!audits || audits.length === 0) {
                  return (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">Sem auditorias registadas</p>
                      </CardContent>
                    </Card>
                  );
                }

                if (filteredAudits.length === 0) {
                  return (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">Nenhuma auditoria encontrada com os filtros selecionados</p>
                        <Button
                          variant="link"
                          className="mt-2"
                          onClick={() => {
                            setAuditStatusFilter(null);
                            setAuditStartDate(null);
                            setAuditEndDate(null);
                          }}
                        >
                          Limpar filtros
                        </Button>
                      </CardContent>
                    </Card>
                  );
                }

                return (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {filteredAudits.length} {filteredAudits.length === 1 ? "auditoria encontrada" : "auditorias encontradas"}
                    </p>
                    {filteredAudits.map((audit) => (
                      <Card key={audit.id}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                            <Badge 
                                variant="outline" 
                                className={`gap-1 ${
                                  audit.status === "closed" 
                                    ? "bg-green-500 text-white border-0" 
                                    : audit.status === "in_progress" 
                                    ? "bg-yellow-500 text-white border-0" 
                                    : audit.status === "pending_approval"
                                    ? "bg-purple-500 text-white border-0"
                                    : audit.status === "cancelled"
                                    ? "bg-gray-500 text-white border-0"
                                    : "bg-blue-500 text-white border-0"
                                }`}
                              >
                                {audit.status === "closed" ? "Encerrada" : 
                                 audit.status === "in_progress" ? "Em Curso" : 
                                 audit.status === "pending_approval" ? "Em Aprovação" :
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
                          {/* Action buttons */}
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportAuditPDF(audit.id, audit.title);
                              }}
                              disabled={exportingAuditId === audit.id}
                              className="gap-2"
                            >
                              {exportingAuditId === audit.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              Exportar
                            </Button>
                            {audit.status === "pending_approval" && (
                              <Button
                                size="sm"
                                onClick={() => handleApproveAudit(audit.id)}
                                disabled={approvingAuditId === audit.id}
                                className="gap-2"
                              >
                                {approvingAuditId === audit.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Aprovar
                              </Button>
                            )}
                            {audit.status === "closed" && (
                              <div className="flex items-center gap-1 text-sm text-green-600">
                                <Lock className="h-4 w-4" />
                                <span>Encerrada</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    ))}
                  </div>
                );
              })()}
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && currentOrg?.id && (
            <EvidenceRequestsPanel organizationId={currentOrg.id} />
          )}

          {/* Indicators Tab */}
          {activeTab === "indicators" && (
            <div className="space-y-6">
              {/* Hero Header */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-600/20 via-blue-500/10 to-sky-500/20">
                <div className="absolute inset-0 bg-grid-white/10" />
                <div className="relative flex flex-col md:flex-row items-center gap-6 p-6 md:p-8">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-700 border-0">
                        <BarChart3 className="h-3 w-3 mr-1" />
                        Módulo de Indicadores
                      </Badge>
                      <Badge variant="outline" className="text-xs">Em breve</Badge>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Indicadores</h1>
                    <p className="text-muted-foreground text-lg max-w-xl">
                      Métricas e indicadores de desempenho para monitorizar a conformidade legal da sua organização
                    </p>
                  </div>
                  <div className="hidden md:block w-48 h-32 relative">
                    <img 
                      src={indicatorsHero} 
                      alt="Indicadores" 
                      className="w-full h-full object-contain drop-shadow-xl"
                    />
                  </div>
                </div>
              </div>
              
              {/* Coming Soon Cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-500/20 to-transparent rounded-bl-full" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Taxa de Conformidade
                    </CardTitle>
                    <CardDescription>Evolução ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-24 flex items-center justify-center text-muted-foreground">
                      <Sparkles className="h-8 w-8 opacity-30" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-yellow-500/20 to-transparent rounded-bl-full" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-yellow-600" />
                      Tempo de Resolução
                    </CardTitle>
                    <CardDescription>Média de tempo para corrigir não-conformidades</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-24 flex items-center justify-center text-muted-foreground">
                      <Sparkles className="h-8 w-8 opacity-30" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/20 to-transparent rounded-bl-full" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardCheck className="h-5 w-5 text-blue-600" />
                      Auditorias Concluídas
                    </CardTitle>
                    <CardDescription>Resultados e tendências de auditoria</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-24 flex items-center justify-center text-muted-foreground">
                      <Sparkles className="h-8 w-8 opacity-30" />
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
                    <BarChart3 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Indicadores em Desenvolvimento</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Estamos a desenvolver dashboards interativos com métricas avançadas para acompanhar a performance da sua organização.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
      
      {/* Plan Feedback Dialog */}
      <PlanFeedbackDialog
        open={!!feedbackDialogAudit}
        onOpenChange={(open) => !open && setFeedbackDialogAudit(null)}
        auditTitle={feedbackDialogAudit?.title || ""}
        onSubmit={(feedback) => handlePlanFeedback(feedbackDialogAudit!.id, feedback)}
      />
      
      {/* Audit Plan Details Dialog */}
      <AuditPlanDetailsDialog
        open={!!viewingAuditPlan}
        onOpenChange={(open) => !open && setViewingAuditPlan(null)}
        audit={viewingAuditPlan}
      />
    </div>
  );
}
