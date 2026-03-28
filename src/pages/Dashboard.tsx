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
import { TechWelcomeHero } from "@/components/client/TechWelcomeHero";
import { TechModuleCard } from "@/components/client/TechModuleCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IDBackground, IDHeroSection, IDCard } from "@/components/client/IDBackground";
import { IDSidebar } from "@/components/client/IDSidebar";
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
import moduleLegislation from "@/assets/module-legislation-new.jpg";
import moduleActions from "@/assets/module-actions-new.jpg";
import moduleAudits from "@/assets/module-audits-new.jpg";
import moduleDocuments from "@/assets/module-documents-new.jpg";
import auditHero from "@/assets/audit-hero.png";
import evidenceHero from "@/assets/evidence-hero.png";
import indicatorsHero from "@/assets/indicators-hero.png";
import logoIdCompliance from "@/assets/logo-id-compliance.png";
import heroVideo from "@/assets/hero-background.mp4";

type TabType = "overview" | "actions" | "audits" | "documents" | "indicators";

const COLORS = {
  compliant: "hsl(152, 82%, 42%)",
  nonCompliant: "hsl(354, 85%, 55%)",
  inProgress: "hsl(38, 95%, 52%)",
  pending: "hsl(220, 15%, 55%)",
};

// Gradient definitions for pie charts
const PIE_GRADIENTS = {
  compliant: { start: "hsl(158, 85%, 48%)", end: "hsl(145, 78%, 36%)" },
  nonCompliant: { start: "hsl(0, 90%, 65%)", end: "hsl(354, 85%, 50%)" },
  inProgress: { start: "hsl(45, 100%, 60%)", end: "hsl(32, 95%, 48%)" },
  pending: { start: "hsl(220, 20%, 70%)", end: "hsl(220, 15%, 50%)" },
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

  // Real compliance summary data (no mock trend - would need historical snapshots table)
  const complianceSummaryData = [
    { name: "Conforme", value: complianceStats?.compliant || 0 },
    { name: "Não Conforme", value: complianceStats?.nonCompliant || 0 },
    { name: "Em Avaliação", value: complianceStats?.inProgress || 0 },
  ];

  // Categorize alerts by type
  const alertsByType = {
    legislation: alerts?.filter(a => a.type === "new_legislation") || [],
    deadlines: alerts?.filter(a => a.type === "deadline") || [],
    other: alerts?.filter(a => !["new_legislation", "deadline"].includes(a.type || "")) || [],
  };

  // SidebarContent removed - using IDSidebar component instead

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* I&D Background */}
      <IDBackground />

      {/* Desktop Sidebar - I&D Style */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30 border-r border-stone-200/50 dark:border-amber-900/30 bg-white dark:bg-[#1a1512] shadow-sm">
        <IDSidebar currentOrg={currentOrg} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0 border-r border-stone-200/50 dark:border-amber-900/30 bg-white dark:bg-[#1a1512]">
          <IDSidebar currentOrg={currentOrg} onCloseMobile={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 relative z-10">
        {/* Top Header - I&D Style */}
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#1a1512]/95 backdrop-blur-md border-b border-stone-200/60 dark:border-amber-900/30">
          <div className="flex items-center justify-between px-4 lg:px-8 py-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden text-stone-700 dark:text-amber-200 hover:text-stone-800 dark:hover:text-white hover:bg-amber-50 dark:hover:bg-amber-900/30"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <p className="text-xs text-amber-700/70 dark:text-amber-300/60 uppercase tracking-wider font-medium">{currentOrg?.name || "Dashboard"}</p>
                <h1 className="text-lg font-semibold text-stone-800 dark:text-white flex items-center gap-2">
                  {activeTab === "overview" && (
                    <>
                      <LayoutDashboard className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Painel de Controlo
                    </>
                  )}
                  {activeTab === "actions" && (
                    <>
                      <ClipboardList className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Planos de Ação
                    </>
                  )}
                  {activeTab === "audits" && (
                    <>
                      <ClipboardCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Auditorias
                    </>
                  )}
                  {activeTab === "documents" && (
                    <>
                      <FolderOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Evidências
                    </>
                  )}
                  {activeTab === "indicators" && (
                    <>
                      <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Indicadores
                    </>
                  )}
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-600 dark:text-amber-400" />
                <Input 
                  placeholder="Pesquisa" 
                  className="pl-9 w-64 bg-amber-50/50 dark:bg-amber-950/20 border-stone-200/80 dark:border-amber-800/40 text-stone-700 dark:text-white placeholder:text-stone-400 dark:placeholder:text-amber-300/40 focus:border-amber-500 focus:ring-amber-500/20"
                />
              </div>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Link to="/legislacao-recente">
                      <Button variant="ghost" size="icon" className="relative text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                        <FileText className="h-5 w-5" />
                        {unreadLegislationCount > 0 && (
                          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shadow-md">
                            {unreadLegislationCount > 99 ? "99+" : unreadLegislationCount}
                          </span>
                        )}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="bg-stone-900 text-stone-100">
                    <p>{unreadLegislationCount > 0 ? `${unreadLegislationCount} diplomas por ler` : "Legislação recente"}</p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8 space-y-5">
          {/* Overview Tab Content */}
          {activeTab === "overview" && (
            <>
              {/* Welcome Hero Section - Tech Style */}
              <TechWelcomeHero
                userName={userProfile?.full_name || user?.email}
                organizationName={currentOrg?.name}
                alertsCount={0}
                upcomingAudits={audits?.filter(a => a.status === "in_progress" || a.status === "planned").length || 0}
                pendingActions={actionPlanStats.pending + actionPlanStats.inProgress}
              />

              {/* Modules Grid - I&D Style */}
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 dark:from-emerald-500 dark:to-emerald-600 shadow-md">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-stone-800 dark:text-white">Acesso Rápido</h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <TechModuleCard
                    title="Legislação"
                    description="Consulte a biblioteca de diplomas legais aplicáveis"
                    icon={Gavel}
                    href="/biblioteca"
                    image={moduleLegislation}
                    glowColor="emerald"
                    count={unreadLegislationCount > 0 ? unreadLegislationCount : undefined}
                    countLabel="novos"
                    index={0}
                  />
                  <TechModuleCard
                    title="Planos de Ação"
                    description="Gerir ações de conformidade e prazos"
                    icon={ClipboardList}
                    href="/dashboard?tab=actions"
                    image={moduleActions}
                    glowColor="terracotta"
                    count={actionPlanStats.pending + actionPlanStats.inProgress}
                    countLabel="ativos"
                    index={1}
                  />
                  <TechModuleCard
                    title="Auditorias"
                    description="Acompanhe o estado das auditorias"
                    icon={ClipboardCheck}
                    href="/dashboard?tab=audits"
                    image={moduleAudits}
                    glowColor="amber"
                    count={audits?.filter(a => a.status === "in_progress" || a.status === "planned").length}
                    countLabel="ativas"
                    index={2}
                  />
                  <TechModuleCard
                    title="Evidências"
                    description="Submeta documentos de conformidade"
                    icon={FolderOpen}
                    href="/dashboard?tab=documents"
                    image={moduleDocuments}
                    glowColor="rose"
                    index={3}
                  />
                </div>
              </div>

              {/* Recent Legislation - I&D Style */}
              <IDCard className="overflow-hidden">
                <div className="p-5 border-b border-stone-200/60 dark:border-amber-900/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-700 dark:from-emerald-500 dark:to-emerald-600 shadow-md">
                        <FileText className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-stone-800 dark:text-white">Legislação Recente</h3>
                        <p className="text-sm text-stone-500 dark:text-amber-200/60">Últimos diplomas publicados</p>
                      </div>
                    </div>
                    <Link 
                      to="/legislacao-recente" 
                      className="group flex items-center gap-1 px-4 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-sm font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all duration-300"
                    >
                      Ver todos <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>
                <div className="p-5">
                  {loadingLegislation ? (
                    <div className="grid md:grid-cols-4 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-44 w-full rounded-xl" />
                      ))}
                    </div>
                  ) : recentLegislation && recentLegislation.length > 0 ? (
                    <div className="grid md:grid-cols-4 gap-4">
                      {recentLegislation.slice(0, 4).map((leg, index) => {
                        const colors = [
                          { border: "border-emerald-200 dark:border-emerald-800/60", bg: "bg-emerald-50/50 dark:bg-emerald-900/20", accent: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-300" },
                          { border: "border-amber-200 dark:border-amber-800/60", bg: "bg-amber-50/50 dark:bg-amber-900/20", accent: "bg-amber-600", text: "text-amber-700 dark:text-amber-300" },
                          { border: "border-sky-200 dark:border-sky-800/60", bg: "bg-sky-50/50 dark:bg-sky-900/20", accent: "bg-sky-600", text: "text-sky-700 dark:text-sky-300" },
                          { border: "border-rose-200 dark:border-rose-800/60", bg: "bg-rose-50/50 dark:bg-rose-900/20", accent: "bg-rose-600", text: "text-rose-700 dark:text-rose-300" },
                        ];
                        const color = colors[index % colors.length];
                        return (
                          <Link
                            key={leg.id}
                            to={`/legislacao/${leg.id}`}
                            className={`group relative rounded-xl border ${color.border} ${color.bg} overflow-hidden hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1`}
                          >
                            {/* Colored top accent */}
                            <div className={`h-1 ${color.accent}`} />
                            
                            <div className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs text-stone-500 dark:text-amber-200/60 bg-stone-100 dark:bg-stone-800/60 px-2 py-1 rounded">
                                  {leg.publication_date ? format(new Date(leg.publication_date), "d MMM yyyy", { locale: pt }) : ""}
                                </span>
                                <div className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${color.accent}`}>
                                  <ExternalLink className="h-3 w-3 text-white" />
                                </div>
                              </div>
                              <p className={`text-sm font-bold text-stone-800 dark:text-white line-clamp-2 group-hover:${color.text} transition-colors`}>
                                {leg.number}
                              </p>
                              <p className="text-xs text-stone-500 dark:text-amber-200/60 line-clamp-2 mt-2">
                                {leg.title}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="p-4 rounded-lg bg-stone-100 dark:bg-stone-800/60 inline-block mb-3">
                        <FileText className="h-10 w-10 text-stone-400 dark:text-stone-500" />
                      </div>
                      <p className="text-stone-500 dark:text-amber-200/60">Nenhuma legislação disponível</p>
                    </div>
                  )}
                </div>
              </IDCard>

              {/* Charts and Stats Row - 3 columns */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Compliance Pie Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <Card className="group relative bg-gradient-to-br from-white via-emerald-50/50 to-teal-50/40 dark:from-slate-900 dark:via-emerald-950/30 dark:to-teal-950/20 border border-emerald-200/60 dark:border-emerald-800/40 shadow-sm hover:shadow-lg hover:shadow-emerald-400/15 transition-all duration-300 overflow-hidden backdrop-blur-sm">
                    {/* Animated background glow */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-200/15 via-transparent to-teal-200/15 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-emerald-300/20 to-teal-400/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    
                    <CardHeader className="pb-2 relative z-10">
                      <CardTitle className="text-base flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
                        <motion.div 
                          className="p-2 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 shadow-lg shadow-emerald-400/25"
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        </motion.div>
                        <span className="font-semibold">Estado de Conformidade</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                      {compliancePieData.length > 0 ? (
                        <div className="h-[200px] relative">
                          {/* Central indicator */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '36px' }}>
                            <motion.div 
                              className="text-center"
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: 0.8, duration: 0.5, type: "spring" }}
                            >
                              <motion.span 
                                className="text-2xl font-bold bg-gradient-to-br from-emerald-600 to-teal-600 bg-clip-text text-transparent"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.2 }}
                              >
                                {(() => {
                                  const total = compliancePieData.reduce((acc, item) => acc + item.value, 0);
                                  const compliant = compliancePieData.find(d => d.name === "Conforme")?.value || 0;
                                  return total > 0 ? Math.round((compliant / total) * 100) : 0;
                                })()}%
                              </motion.span>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Conforme</p>
                            </motion.div>
                          </div>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <defs>
                                <linearGradient id="complianceGradient" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor={PIE_GRADIENTS.compliant.start} />
                                  <stop offset="100%" stopColor={PIE_GRADIENTS.compliant.end} />
                                </linearGradient>
                                <linearGradient id="nonComplianceGradient" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor={PIE_GRADIENTS.nonCompliant.start} />
                                  <stop offset="100%" stopColor={PIE_GRADIENTS.nonCompliant.end} />
                                </linearGradient>
                                <linearGradient id="inProgressGradient" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor={PIE_GRADIENTS.inProgress.start} />
                                  <stop offset="100%" stopColor={PIE_GRADIENTS.inProgress.end} />
                                </linearGradient>
                                <linearGradient id="pendingGradient" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor={PIE_GRADIENTS.pending.start} />
                                  <stop offset="100%" stopColor={PIE_GRADIENTS.pending.end} />
                                </linearGradient>
                                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                                </filter>
                              </defs>
                              <Pie
                                data={compliancePieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={75}
                                paddingAngle={4}
                                dataKey="value"
                                animationBegin={0}
                                animationDuration={1200}
                                animationEasing="ease-out"
                                stroke="none"
                              >
                                {compliancePieData.map((entry, index) => {
                                  const gradientId = entry.name === "Conforme" ? "complianceGradient" 
                                    : entry.name === "Não Conforme" ? "nonComplianceGradient"
                                    : entry.name === "Em Progresso" ? "inProgressGradient" 
                                    : "pendingGradient";
                                  return <Cell key={`cell-${index}`} fill={`url(#${gradientId})`} filter="url(#glow)" />;
                                })}
                              </Pie>
                              <Tooltip 
                                formatter={(value: number) => [`${value} requisitos`, ""]}
                                contentStyle={{ 
                                  borderRadius: "12px", 
                                  border: "none", 
                                  boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                                  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                                  color: "#1e293b",
                                  padding: "12px 16px"
                                }}
                              />
                              <Legend 
                                verticalAlign="bottom" 
                                height={36}
                                formatter={(value) => <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{value}</span>}
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
                </motion.div>

                {/* Action Plans Pie Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                >
                  <Card className="group relative bg-gradient-to-br from-white via-sage-50/50 to-emerald-50/40 dark:from-slate-900 dark:via-emerald-950/25 dark:to-teal-950/15 border border-emerald-200/50 dark:border-emerald-800/35 shadow-sm hover:shadow-lg hover:shadow-emerald-400/15 transition-all duration-300 overflow-hidden backdrop-blur-sm">
                    {/* Animated background glow */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-200/10 via-transparent to-teal-200/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-emerald-300/15 to-teal-400/15 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    
                    <CardHeader className="pb-2 relative z-10">
                      <CardTitle className="text-base flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
                        <motion.div 
                          className="p-2 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 shadow-lg shadow-emerald-400/25"
                          whileHover={{ scale: 1.1, rotate: -5 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          <ClipboardList className="h-4 w-4 text-white" />
                        </motion.div>
                        <span className="font-semibold">Planos de Ação</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10">
                      {actionPlanPieData.length > 0 ? (
                        <div className="h-[200px] relative">
                          {/* Central indicator */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '36px' }}>
                            <motion.div 
                              className="text-center"
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: 0.9, duration: 0.5, type: "spring" }}
                            >
                              <motion.span 
                                className="text-2xl font-bold bg-gradient-to-br from-emerald-600 to-teal-600 bg-clip-text text-transparent"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.3 }}
                              >
                                {(() => {
                                  const total = actionPlanPieData.reduce((acc, item) => acc + item.value, 0);
                                  const completed = actionPlanPieData.find(d => d.name === "Concluído")?.value || 0;
                                  return total > 0 ? Math.round((completed / total) * 100) : 0;
                                })()}%
                              </motion.span>
                              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">Concluído</p>
                            </motion.div>
                          </div>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <defs>
                                <linearGradient id="actionCompletedGradient" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor="hsl(158, 85%, 48%)" />
                                  <stop offset="100%" stopColor="hsl(145, 78%, 36%)" />
                                </linearGradient>
                                <linearGradient id="actionPendingGradient" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor="hsl(45, 100%, 60%)" />
                                  <stop offset="100%" stopColor="hsl(32, 95%, 48%)" />
                                </linearGradient>
                                <linearGradient id="actionOverdueGradient" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor="hsl(0, 90%, 65%)" />
                                  <stop offset="100%" stopColor="hsl(354, 85%, 50%)" />
                                </linearGradient>
                                <linearGradient id="actionInProgressGradient" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor="hsl(217, 91%, 65%)" />
                                  <stop offset="100%" stopColor="hsl(224, 76%, 48%)" />
                                </linearGradient>
                              </defs>
                              <Pie
                                data={actionPlanPieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={75}
                                paddingAngle={4}
                                dataKey="value"
                                animationBegin={100}
                                animationDuration={1200}
                                animationEasing="ease-out"
                                stroke="none"
                              >
                                {actionPlanPieData.map((entry, index) => {
                                  const gradientId = entry.name === "Concluído" ? "actionCompletedGradient" 
                                    : entry.name === "Pendente" ? "actionPendingGradient"
                                    : entry.name === "Atrasado" ? "actionOverdueGradient" 
                                    : "actionInProgressGradient";
                                  return <Cell key={`cell-${index}`} fill={`url(#${gradientId})`} filter="url(#glow)" />;
                                })}
                              </Pie>
                              <Tooltip 
                                formatter={(value: number) => [`${value} ações`, ""]}
                                contentStyle={{ 
                                  borderRadius: "12px", 
                                  border: "none", 
                                  boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                                  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                                  color: "#1e293b",
                                  padding: "12px 16px"
                                }}
                              />
                              <Legend 
                                verticalAlign="bottom" 
                                height={36}
                                formatter={(value) => <span className="text-sm font-medium text-emerald-800/80 dark:text-emerald-300/80">{value}</span>}
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
                </motion.div>

                {/* Quick Stats + Trend */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  <Card className="group relative bg-gradient-to-br from-white via-teal-50/40 to-emerald-50/30 dark:from-slate-900 dark:via-teal-950/25 dark:to-emerald-950/15 border border-teal-200/50 dark:border-teal-800/35 shadow-sm hover:shadow-lg hover:shadow-teal-400/15 transition-all duration-300 overflow-hidden backdrop-blur-sm">
                    {/* Animated background glow */}
                    <div className="absolute inset-0 bg-gradient-to-br from-teal-200/10 via-transparent to-emerald-200/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-teal-300/15 to-emerald-400/15 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    
                    <CardHeader className="pb-3 relative z-10">
                      <CardTitle className="text-base flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
                        <motion.div 
                          className="p-2 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 shadow-lg shadow-teal-400/25"
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          <TrendingUp className="h-4 w-4 text-white" />
                        </motion.div>
                        <span className="font-semibold">Atividade</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 relative z-10">
                      <motion.div 
                        className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-emerald-100/60 to-teal-100/40 dark:from-emerald-900/25 dark:to-teal-900/15 border border-emerald-200/60 dark:border-emerald-700/30 hover:shadow-md hover:shadow-emerald-400/15 transition-all duration-300"
                        whileHover={{ scale: 1.02, x: 4 }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-sm">
                            <Clock className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-sm font-medium text-emerald-900/90 dark:text-emerald-100/90">Ações Pendentes</span>
                        </div>
                        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 shadow-lg shadow-amber-400/20 font-bold px-3">{actionPlanStats.pending}</Badge>
                      </motion.div>
                      <motion.div 
                        className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-emerald-100/50 to-sage-100/40 dark:from-emerald-900/20 dark:to-teal-900/10 border border-emerald-200/50 dark:border-emerald-700/25 hover:shadow-md hover:shadow-rose-400/15 transition-all duration-300"
                        whileHover={{ scale: 1.02, x: 4 }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-500 to-rose-500 shadow-sm">
                            <AlertTriangle className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-sm font-medium text-emerald-900/90 dark:text-emerald-100/90">Ações Atrasadas</span>
                        </div>
                        <Badge className="bg-gradient-to-r from-red-500 to-rose-500 text-white border-0 shadow-lg shadow-red-400/20 font-bold px-3">{actionPlanStats.overdue}</Badge>
                      </motion.div>
                      <motion.div 
                        className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-teal-100/50 to-emerald-100/40 dark:from-teal-900/20 dark:to-emerald-900/15 border border-teal-200/50 dark:border-teal-700/25 hover:shadow-md hover:shadow-emerald-400/15 transition-all duration-300"
                        whileHover={{ scale: 1.02, x: 4 }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
                            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-sm font-medium text-emerald-900/90 dark:text-emerald-100/90">Concluídas</span>
                        </div>
                        <Badge className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 shadow-lg shadow-emerald-400/20 font-bold px-3">{actionPlanStats.completed}</Badge>
                      </motion.div>

                      {/* Compliance Summary */}
                      <div className="pt-3 border-t border-emerald-200/50 dark:border-emerald-700/30">
                        <p className="text-xs font-medium text-emerald-700/80 dark:text-emerald-400/80 mb-2">Resumo de Conformidade</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Taxa atual</span>
                            <span className="text-lg font-bold" style={{ color: complianceRate >= 80 ? COLORS.compliant : complianceRate >= 50 ? COLORS.inProgress : COLORS.nonCompliant }}>
                              {complianceRate}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                            <motion.div 
                              className="h-full rounded-full"
                              style={{ background: `linear-gradient(90deg, ${COLORS.compliant}, hsl(168, 85%, 38%))` }}
                              initial={{ width: 0 }}
                              animate={{ width: `${complianceRate}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{complianceStats?.applicable || 0} requisitos aplicáveis</span>
                            <span>{complianceStats?.compliant || 0} conformes</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
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
              {/* Hero Header - I&D Warm Corporate Style */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative overflow-hidden rounded-xl bg-gradient-to-r from-white via-amber-50/50 to-stone-50 dark:from-[#1a1512] dark:via-[#181410] dark:to-[#141210] border border-amber-200/50 dark:border-amber-900/30 p-6 lg:p-8 shadow-sm"
              >
                {/* Decorative accent - warm gradient */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-600 via-amber-500 to-orange-500 dark:from-emerald-500 dark:via-amber-500 dark:to-orange-400" />
                
                {/* Warm corner accents */}
                <div className="absolute -right-20 -top-20 w-48 h-48 bg-gradient-to-br from-amber-200/30 to-orange-200/20 dark:from-amber-700/15 dark:to-orange-700/10 rounded-full blur-3xl" />
                <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-emerald-200/20 dark:bg-emerald-700/10 rounded-full blur-2xl" />
                
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pl-4">
                  <div className="space-y-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-emerald-100 to-amber-100/80 dark:from-emerald-800/50 dark:to-amber-800/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/60 dark:border-emerald-700/40">
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Módulo de Auditorias
                    </span>
                    <h1 className="text-2xl lg:text-3xl font-semibold text-stone-800 dark:text-white tracking-tight">
                      Auditorias
                    </h1>
                    <p className="text-stone-600 dark:text-amber-100/70 max-w-xl text-sm lg:text-base">
                      Acompanhe as auditorias planeadas, em curso e o histórico completo de auditorias realizadas
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Audit Plan Section - Planned and In Progress */}
              {(() => {
                const plannedAudits = audits?.filter(
                  (a) => a.status === "planned" || a.status === "in_progress"
                ) || [];
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
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
                                  ? "bg-gradient-to-r from-amber-400 to-orange-500" 
                                  : "bg-gradient-to-r from-emerald-500 to-teal-500"
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
                    <div className="p-2 rounded-lg bg-emerald-500/10">
                      <ClipboardCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
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
              {/* Hero Header - I&D Warm Corporate Style */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative overflow-hidden rounded-xl bg-gradient-to-r from-white via-amber-50/50 to-stone-50 dark:from-[#1a1512] dark:via-[#181410] dark:to-[#141210] border border-amber-200/50 dark:border-amber-900/30 p-6 lg:p-8 shadow-sm"
              >
                {/* Decorative accent - warm gradient */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-600 via-amber-500 to-orange-500 dark:from-emerald-500 dark:via-amber-500 dark:to-orange-400" />
                
                {/* Warm corner accents */}
                <div className="absolute -right-20 -top-20 w-48 h-48 bg-gradient-to-br from-amber-200/30 to-orange-200/20 dark:from-amber-700/15 dark:to-orange-700/10 rounded-full blur-3xl" />
                <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-emerald-200/20 dark:bg-emerald-700/10 rounded-full blur-2xl" />
                
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pl-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-emerald-100 to-amber-100/80 dark:from-emerald-800/50 dark:to-amber-800/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/60 dark:border-emerald-700/40">
                        <BarChart3 className="h-3.5 w-3.5" />
                        Módulo de Indicadores
                      </span>
                      <Badge variant="outline" className="text-xs border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300">Em breve</Badge>
                    </div>
                    <h1 className="text-2xl lg:text-3xl font-semibold text-stone-800 dark:text-white tracking-tight">
                      Indicadores
                    </h1>
                    <p className="text-stone-600 dark:text-amber-100/70 max-w-xl text-sm lg:text-base">
                      Métricas e indicadores de desempenho para monitorizar a conformidade legal da sua organização
                    </p>
                  </div>
                </div>
              </motion.div>
              
              {/* Coming Soon Cards - I&D Style */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="relative overflow-hidden bg-white/95 dark:bg-[#181410]/90 border border-stone-200/60 dark:border-amber-900/30">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-bl-full" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-stone-800 dark:text-white">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      Taxa de Conformidade
                    </CardTitle>
                    <CardDescription className="text-stone-600 dark:text-amber-200/60">Evolução ao longo do tempo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-24 flex items-center justify-center text-stone-400 dark:text-amber-200/40">
                      <Sparkles className="h-8 w-8 opacity-30" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="relative overflow-hidden bg-white/95 dark:bg-[#181410]/90 border border-stone-200/60 dark:border-amber-900/30">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-amber-500/20 to-transparent rounded-bl-full" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-stone-800 dark:text-white">
                      <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      Tempo de Resolução
                    </CardTitle>
                    <CardDescription className="text-stone-600 dark:text-amber-200/60">Média de tempo para corrigir não-conformidades</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-24 flex items-center justify-center text-stone-400 dark:text-amber-200/40">
                      <Sparkles className="h-8 w-8 opacity-30" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="relative overflow-hidden bg-white/95 dark:bg-[#181410]/90 border border-stone-200/60 dark:border-amber-900/30">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-orange-500/20 to-transparent rounded-bl-full" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-stone-800 dark:text-white">
                      <ClipboardCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      Auditorias Concluídas
                    </CardTitle>
                    <CardDescription className="text-stone-600 dark:text-amber-200/60">Resultados e tendências de auditoria</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-24 flex items-center justify-center text-stone-400 dark:text-amber-200/40">
                      <Sparkles className="h-8 w-8 opacity-30" />
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card className="border-dashed bg-white/95 dark:bg-[#181410]/90 border-amber-300/60 dark:border-amber-800/40">
                <CardContent className="py-16 text-center">
                  <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-amber-100/80 dark:from-emerald-800/30 dark:to-amber-800/20 flex items-center justify-center mb-6">
                    <BarChart3 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-stone-800 dark:text-white">Indicadores em Desenvolvimento</h3>
                  <p className="text-stone-600 dark:text-amber-200/60 max-w-md mx-auto">
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
