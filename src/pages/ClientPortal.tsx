import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ChevronRight,
  FolderTree,
  Upload
} from "lucide-react";
import { ClientGridBackground, ClientParticles, ClientAnimatedLogo } from "@/components/client/ClientBackgrounds";
import { DocumentsPanel } from "@/components/client/DocumentsPanel";
import { CategoryTreeItem } from "@/components/client/CategoryTreeItem";
import { MyComplianceRequestsPanel } from "@/components/client/MyComplianceRequestsPanel";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { ExportReportDialog } from "@/components/admin/ExportReportDialog";
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

type TabValue = "overview" | "legislation" | "actions" | "documents";

export default function ClientPortal() {
  const { user, signOut, isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

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

  // Build organizations array for selector
  const organizations = userRoles?.map(r => ({
    id: r.organization_id as string,
    name: (r.organizations as any)?.name as string
  })).filter(o => o.id && o.name) || [];

  // Get organization IDs (filtered by selection)
  const organizationIds = selectedOrgId 
    ? [selectedOrgId]
    : userRoles?.map(r => r.organization_id).filter(Boolean) || [];

  // Get current organization info for export dialog
  const currentOrg = organizations.find(o => o.id === (selectedOrgId || organizationIds[0])) || organizations[0];

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

  // Fetch organization's assigned themes with categories
  const { data: assignedThemes } = useQuery({
    queryKey: ["org-themes-client", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from("organization_themes")
        .select(`
          id,
          theme_id,
          themes(
            id, 
            name, 
            icon, 
            description,
            theme_categories(
              id,
              name,
              parent_id
            )
          )
        `)
        .in("organization_id", organizationIds);
      
      if (error) throw error;
      
      // Remove duplicates
      const uniqueThemes = new Map();
      data?.forEach(item => {
        const theme = item.themes as any;
        if (theme?.id && !uniqueThemes.has(theme.id)) {
          uniqueThemes.set(theme.id, theme);
        }
      });
      return Array.from(uniqueThemes.values());
    },
    enabled: organizationIds.length > 0,
  });

  // Fetch legislation count per theme/category
  const { data: legislationByCategory } = useQuery({
    queryKey: ["legislation-by-category", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return { byCategory: new Map<string, number>(), byTheme: new Map<string, Set<string>>() };
      
      // Get all legislation IDs for these organizations
      const { data: orgLeg, error: orgError } = await supabase
        .from("organization_legislation")
        .select("legislation_id")
        .in("organization_id", organizationIds);
      
      if (orgError) throw orgError;
      
      const legislationIds = orgLeg?.map(l => l.legislation_id) || [];
      if (legislationIds.length === 0) return { byCategory: new Map<string, number>(), byTheme: new Map<string, Set<string>>() };
      
      // Get category mappings for these legislations
      const { data: mappings, error: mapError } = await supabase
        .from("legislation_category_mapping")
        .select(`
          legislation_id,
          category_id,
          theme_categories(id, name, theme_id, parent_id)
        `)
        .in("legislation_id", legislationIds);
      
      if (mapError) throw mapError;
      
      // Count per category and per theme
      const countByCategory = new Map<string, number>();
      const countByTheme = new Map<string, Set<string>>();
      
      mappings?.forEach((m: any) => {
        const catId = m.category_id;
        const themeId = m.theme_categories?.theme_id;
        const legId = m.legislation_id;
        
        // Count by category
        countByCategory.set(catId, (countByCategory.get(catId) || 0) + 1);
        
        // Count unique legislations by theme
        if (themeId) {
          if (!countByTheme.has(themeId)) {
            countByTheme.set(themeId, new Set());
          }
          countByTheme.get(themeId)!.add(legId);
        }
      });
      
      return { byCategory: countByCategory, byTheme: countByTheme };
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

  // Get selected theme's categories for display
  const selectedThemeData = themeFilter 
    ? assignedThemes?.find((t: any) => t.id === themeFilter) 
    : null;
  
  const selectedThemeCategories = selectedThemeData?.theme_categories || [];
  const rootCategories = selectedThemeCategories.filter((c: any) => !c.parent_id);
  
  // Get subcategories for selected category
  const getSubcategories = (parentId: string) => {
    return selectedThemeCategories.filter((c: any) => c.parent_id === parentId);
  };

  // Build category hierarchy helper
  const getAllDescendantCategoryIds = (categoryId: string): string[] => {
    const descendants: string[] = [categoryId];
    const children = selectedThemeCategories.filter((c: any) => c.parent_id === categoryId);
    children.forEach((child: any) => {
      descendants.push(...getAllDescendantCategoryIds(child.id));
    });
    return descendants;
  };

  // Filter legislation
  const filteredLegislation = assignedLegislation?.filter((item: any) => {
    const leg = item.legislation;
    if (!leg) return false;
    
    const matchesSearch = !searchTerm || 
      leg.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      leg.title.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filter by theme
    let matchesTheme = true;
    if (themeFilter) {
      const legCategories = leg.legislation_category_mapping || [];
      matchesTheme = legCategories.some((mapping: any) => 
        mapping.theme_categories?.themes?.id === themeFilter
      );
    }
    
    if (!matchesTheme) return false;

    // Filter by category (including subcategories)
    let matchesCategory = true;
    if (categoryFilter) {
      const categoryIdsToMatch = getAllDescendantCategoryIds(categoryFilter);
      const legCategories = leg.legislation_category_mapping || [];
      matchesCategory = legCategories.some((mapping: any) => 
        categoryIdsToMatch.includes(mapping.theme_categories?.id)
      );
    }
    
    if (!matchesCategory) return false;
    
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
      <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
        <ClientGridBackground />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center relative z-10"
        >
          <ClientAnimatedLogo className="mx-auto mb-4 scale-150" />
          <p className="mt-6 text-muted-foreground">A carregar...</p>
        </motion.div>
      </div>
    );
  }

  if (organizationIds.length === 0) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden">
        <ClientGridBackground />
        <ClientParticles />
        
        <header className="border-b border-border/50 bg-card/80 backdrop-blur-xl relative z-10">
          <div className="container mx-auto flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <ClientAnimatedLogo />
              <div>
                <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Portal do Cliente
                </h1>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <LogoutConfirmDialog onConfirm={signOut} className="gap-2" />
          </div>
        </header>
        
        <main className="container mx-auto px-4 py-16 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 mb-6">
              <Building2 className="h-16 w-16 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Sem Organização Associada
            </h2>
            <p className="text-muted-foreground mb-4">
              A sua conta ainda não está associada a nenhuma organização.
            </p>
            <p className="text-sm text-muted-foreground">
              Por favor contacte o administrador para ser adicionado a uma organização.
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  const navItems = [
    { id: "overview" as TabValue, label: "Visão Geral", icon: LayoutDashboard },
    { id: "legislation" as TabValue, label: "Diplomas", icon: FileText, count: overallStats.totalLegislation },
    { id: "documents" as TabValue, label: "Documentos", icon: Upload },
    { id: "actions" as TabValue, label: "Planos de Ação", icon: ClipboardList, count: actionPlanStats.pending + actionPlanStats.inProgress },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Futuristic Background */}
      <ClientGridBackground />
      <ClientParticles />
      
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-xl sticky top-0 z-20 relative">
        <div className="flex items-center justify-between px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3">
            <ClientAnimatedLogo />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                Portal do Cliente
              </h1>
              <p className="text-xs text-muted-foreground">Gestão de Conformidade</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Organization Selector */}
            {organizations.length > 1 && (
              <OrganizationSelector
                organizations={organizations}
                selectedOrgId={selectedOrgId}
                onSelect={setSelectedOrgId}
              />
            )}
            
            {/* Export Button */}
            <Button 
              variant="ghost"
              size="sm"
              className="gap-2 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"
              onClick={() => setExportDialogOpen(true)}
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">Exportar</span>
            </Button>
            
            <Link to="/biblioteca">
              <Button variant="ghost" size="sm" className="gap-2 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                <BookOpen className="h-4 w-4" />
                <span className="hidden md:inline">Biblioteca</span>
              </Button>
            </Link>
            
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-2 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden md:inline">Dashboard</span>
              </Button>
            </Link>
            
            {isAdmin && (
              <Link to="/admin">
                <Button variant="ghost" size="sm" className="gap-2 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors">
                  <Settings className="h-4 w-4" />
                  <span className="hidden md:inline">Admin</span>
                </Button>
              </Link>
            )}
            
            <LogoutConfirmDialog onConfirm={signOut} size="sm" className="gap-2" />
          </div>
        </div>
      </header>

      <div className="flex relative z-10">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-64 border-r border-border/50 bg-card/60 backdrop-blur-xl min-h-[calc(100vh-57px)] sticky top-[57px]">
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item, index) => (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-300 ${
                  activeTab === item.id 
                    ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10" 
                    : "hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400 border border-transparent"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1 font-medium">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <Badge 
                    variant={activeTab === item.id ? "secondary" : "outline"} 
                    className={`ml-auto ${activeTab === item.id ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}`}
                  >
                    {item.count}
                  </Badge>
                )}
              </motion.button>
            ))}
          </nav>
          
          {/* Sidebar Stats Summary */}
          <div className="p-4 border-t border-border/50">
            <div className="space-y-3 p-3 rounded-lg bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/10">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Taxa de Conformidade</span>
                <span 
                  className="font-bold"
                  style={{ color: complianceRate >= 80 ? COLORS.compliant : complianceRate >= 50 ? COLORS.inProgress : COLORS.nonCompliant }}
                >
                  {complianceRate}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                <motion.div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${complianceRate}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="text-center">
                  <div className="text-lg font-bold text-emerald-400">{overallStats.compliant}</div>
                  <div className="text-[10px] text-muted-foreground">Conforme</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-yellow-400">{overallStats.inProgress}</div>
                  <div className="text-[10px] text-muted-foreground">Em Aval.</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-400">{overallStats.nonCompliant}</div>
                  <div className="text-[10px] text-muted-foreground">Não Conf.</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Tab Navigation */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t border-border/50 bg-card/80 backdrop-blur-xl z-20">
          <div className="flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 transition-all duration-300 ${
                  activeTab === item.id 
                    ? "text-emerald-400 bg-gradient-to-t from-emerald-500/10 to-transparent" 
                    : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.count !== undefined && item.count > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-[10px] text-white rounded-full flex items-center justify-center">
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
          <AnimatePresence mode="wait">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="space-y-6"
              >
              {/* Welcome Header */}
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Olá, {user?.email?.split("@")[0]}
                </h2>
                <p className="text-muted-foreground">
                  Aqui está o resumo do estado de conformidade da sua organização
                </p>
              </div>

              {/* Quick Stats */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                {[
                  { label: "Temas", value: assignedThemes?.length || 0, subtitle: "Áreas de legislação", icon: FolderTree, delay: 0 },
                  { label: "Diplomas", value: overallStats.totalLegislation, subtitle: "Atribuídos à organização", icon: FileText, delay: 0.1 },
                  { label: "Requisitos", value: overallStats.totalRequirements, subtitle: "Aplicáveis à organização", icon: Clock, delay: 0.2 },
                  { label: "Ações Pendentes", value: actionPlanStats.pending + actionPlanStats.inProgress, subtitle: actionPlanStats.overdue > 0 ? `${actionPlanStats.overdue} em atraso` : "Nenhuma em atraso", icon: ClipboardList, delay: 0.3, isOverdue: actionPlanStats.overdue > 0 },
                  { label: "Conformidade", value: `${complianceRate}%`, subtitle: null, icon: TrendingUp, delay: 0.4, isRate: true },
                ].map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: stat.delay }}
                  >
                    <Card className="bg-card/60 backdrop-blur-xl border-border/50 hover:border-emerald-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                          <stat.icon className="h-4 w-4 text-emerald-400" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div 
                          className={`text-2xl font-bold ${stat.isRate ? "" : "text-foreground"}`}
                          style={stat.isRate ? { color: complianceRate >= 80 ? COLORS.compliant : complianceRate >= 50 ? COLORS.inProgress : COLORS.nonCompliant } : undefined}
                        >
                          {stat.value}
                        </div>
                        {stat.subtitle && (
                          <p className={`text-xs ${stat.isOverdue ? "text-destructive" : "text-muted-foreground"}`}>
                            {stat.subtitle}
                          </p>
                        )}
                        {stat.isRate && (
                          <div className="h-2 mt-2 rounded-full bg-muted/30 overflow-hidden">
                            <motion.div 
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${complianceRate}%` }}
                              transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Charts Row */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Compliance Pie Chart */}
                <Card className="bg-card/60 backdrop-blur-xl border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                      </div>
                      Estado de Conformidade
                    </CardTitle>
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
                              contentStyle={{ 
                                borderRadius: "8px", 
                                border: "1px solid hsl(var(--border))",
                                backgroundColor: "hsl(var(--card) / 0.9)",
                                backdropFilter: "blur(8px)"
                              }}
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
                          <Clock className="h-12 w-12 mx-auto mb-2 opacity-50 text-emerald-400" />
                          <p>Sem requisitos avaliados</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quick Actions / Recent Activity */}
                <Card className="bg-card/60 backdrop-blur-xl border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                        <AlertTriangle className="h-4 w-4 text-emerald-400" />
                      </div>
                      Ações Urgentes
                    </CardTitle>
                    <CardDescription>Itens que requerem a sua atenção</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {actionPlanStats.overdue > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 cursor-pointer hover:bg-destructive/15 transition-all duration-300 hover:shadow-lg hover:shadow-destructive/10"
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
                      </motion.div>
                    )}
                    
                    {overallStats.nonCompliant > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/15 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/10"
                        onClick={() => { setActiveTab("legislation"); setStatusFilter("non-compliant"); }}
                      >
                        <XCircle className="h-5 w-5 text-red-500" />
                        <div className="flex-1">
                          <p className="font-medium text-red-500">Não Conformidades</p>
                          <p className="text-sm text-muted-foreground">
                            {overallStats.nonCompliant} requisitos não conformes
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </motion.div>
                    )}
                    
                    {overallStats.inProgress > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 cursor-pointer hover:bg-yellow-500/15 transition-all duration-300 hover:shadow-lg hover:shadow-yellow-500/10"
                        onClick={() => { setActiveTab("legislation"); setStatusFilter("in-progress"); }}
                      >
                        <Clock className="h-5 w-5 text-yellow-500" />
                        <div className="flex-1">
                          <p className="font-medium text-yellow-500">Em Avaliação</p>
                          <p className="text-sm text-muted-foreground">
                            {overallStats.inProgress} requisitos em avaliação
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </motion.div>
                    )}
                    
                    {actionPlanStats.overdue === 0 && overallStats.nonCompliant === 0 && overallStats.inProgress === 0 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20"
                      >
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <div>
                          <p className="font-medium text-emerald-400">Tudo em Ordem</p>
                          <p className="text-sm text-muted-foreground">
                            Não existem itens urgentes
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* My Compliance Requests */}
              <MyComplianceRequestsPanel organizationIds={organizationIds} />
              {assignedThemes && assignedThemes.length > 0 && (
                <Card className="bg-card/60 backdrop-blur-xl border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10">
                        <FolderTree className="h-4 w-4 text-emerald-400" />
                      </div>
                      Temas Disponíveis
                    </CardTitle>
                    <CardDescription>Áreas de legislação atribuídas à sua organização</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {assignedThemes.map((theme: any) => {
                        const themeCount = legislationByCategory?.byTheme?.get(theme.id)?.size || 0;
                        const rootCategories = theme.theme_categories?.filter((c: any) => !c.parent_id) || [];
                        
                        const handleThemeClick = () => {
                          setThemeFilter(theme.id);
                          setActiveTab("legislation");
                        };
                        
                        return (
                          <div 
                            key={theme.id} 
                            className="p-4 rounded-lg border bg-card hover:bg-primary/5 hover:border-primary/30 transition-colors cursor-pointer group"
                            onClick={handleThemeClick}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                {theme.icon && <span className="text-xl">{theme.icon}</span>}
                                <span className="font-semibold group-hover:text-primary transition-colors">{theme.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="shrink-0">
                                  {themeCount} {themeCount === 1 ? "diploma" : "diplomas"}
                                </Badge>
                                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                            
                            {rootCategories.length > 0 && (
                              <div className="space-y-1.5">
                                {rootCategories.slice(0, 5).map((cat: any) => {
                                  const catCount = legislationByCategory?.byCategory?.get(cat.id) || 0;
                                  // Find subcategories
                                  const subCategories = theme.theme_categories?.filter((c: any) => c.parent_id === cat.id) || [];
                                  
                                  return (
                                    <div key={cat.id}>
                                      <div className="flex items-center justify-between text-sm py-1 px-2 rounded bg-muted/50">
                                        <span className="text-muted-foreground truncate">{cat.name}</span>
                                        {catCount > 0 && (
                                          <span className="text-xs font-medium text-primary ml-2">{catCount}</span>
                                        )}
                                      </div>
                                      {subCategories.length > 0 && (
                                        <div className="ml-3 mt-1 space-y-0.5">
                                          {subCategories.slice(0, 3).map((sub: any) => {
                                            const subCount = legislationByCategory?.byCategory?.get(sub.id) || 0;
                                            return (
                                              <div 
                                                key={sub.id}
                                                className="flex items-center justify-between text-xs py-0.5 px-2 text-muted-foreground"
                                              >
                                                <span className="truncate">↳ {sub.name}</span>
                                                {subCount > 0 && (
                                                  <span className="font-medium text-primary/70 ml-2">{subCount}</span>
                                                )}
                                              </div>
                                            );
                                          })}
                                          {subCategories.length > 3 && (
                                            <span className="text-xs text-muted-foreground pl-2">
                                              +{subCategories.length - 3} mais...
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {rootCategories.length > 5 && (
                                  <p className="text-xs text-muted-foreground pt-1">
                                    +{rootCategories.length - 5} categorias...
                                  </p>
                                )}
                              </div>
                            )}
                            
                            {rootCategories.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">
                                Sem categorias definidas
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

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
            </motion.div>
          )}

          {/* Legislation Tab - 2 Column Layout */}
          {activeTab === "legislation" && (
            <motion.div
              key="legislation"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-4"
            >
              {/* Search bar and Theme selector */}
              <Card className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Pesquisar por título, número ou entidade..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  {/* Theme Selector */}
                  {assignedThemes && assignedThemes.length > 0 && (
                    <div className="flex items-center gap-3">
                      <Select 
                        value={themeFilter || "all"} 
                        onValueChange={(value) => {
                          setThemeFilter(value === "all" ? null : value);
                          setCategoryFilter(null);
                        }}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Selecione um tema" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os temas</SelectItem>
                          {assignedThemes.map((theme: any) => {
                            const themeCount = legislationByCategory?.byTheme?.get(theme.id)?.size || 0;
                            return (
                              <SelectItem key={theme.id} value={theme.id}>
                                <div className="flex items-center gap-2">
                                  {theme.icon && <span>{theme.icon}</span>}
                                  <span>{theme.name}</span>
                                  <Badge variant="outline" className="ml-auto text-xs">
                                    {themeCount}
                                  </Badge>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {themeFilter && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => {
                            setThemeFilter(null);
                            setCategoryFilter(null);
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                  
                  {/* Status Filter */}
                  <Tabs value={statusFilter} onValueChange={setStatusFilter} className="shrink-0">
                    <TabsList className="h-9">
                      <TabsTrigger value="all" className="text-xs px-3">Todos</TabsTrigger>
                      <TabsTrigger value="compliant" className="text-xs gap-1 px-3">
                        <CheckCircle2 className="h-3 w-3" />
                        Conforme
                      </TabsTrigger>
                      <TabsTrigger value="non-compliant" className="text-xs gap-1 px-3">
                        <AlertTriangle className="h-3 w-3" />
                        Não Conforme
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </Card>

              {/* 2-Column Layout */}
              <div className="grid lg:grid-cols-[320px_1fr] gap-4">
                {/* Column 1: Categories */}
                <Card className="flex flex-col">
                  <CardHeader className="pb-3 pt-4 px-4 border-b shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          {selectedThemeData?.icon && <span className="shrink-0">{selectedThemeData.icon}</span>}
                          <span className="truncate">{selectedThemeData?.name || "Categorias"}</span>
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          Categorias e subcategorias
                        </CardDescription>
                      </div>
                      {categoryFilter && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => setCategoryFilter(null)}
                        >
                          Limpar
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 min-h-0">
                    <ScrollArea className="h-[520px]">
                      <div className="p-3">
                        {themeFilter ? (
                          <div className="space-y-1">
                            {rootCategories.map((cat: any) => (
                              <CategoryTreeItem
                                key={cat.id}
                                category={cat}
                                level={0}
                                categoryFilter={categoryFilter}
                                onSelectCategory={setCategoryFilter}
                                getSubcategories={getSubcategories}
                                getCategoryCount={(id: string) => legislationByCategory?.byCategory?.get(id) || 0}
                              />
                            ))}
                            {rootCategories.length === 0 && (
                              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <FolderTree className="h-10 w-10 mb-3 opacity-30" />
                                <p className="text-sm">Sem categorias neste tema</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <FolderTree className="h-12 w-12 mb-3 opacity-30" />
                            <p className="text-sm font-medium">Selecione um tema</p>
                            <p className="text-xs mt-1">Use o selector acima para escolher</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Column 2: Legislation */}
                <Card className="flex flex-col">
                  <CardHeader className="pb-3 pt-4 px-4 border-b shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="truncate">Legislação</span>
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5 truncate">
                          {categoryFilter 
                            ? selectedThemeCategories.find((c: any) => c.id === categoryFilter)?.name || "Categoria selecionada"
                            : themeFilter 
                            ? "Selecione uma categoria à esquerda"
                            : "Selecione um tema para começar"
                          }
                        </CardDescription>
                      </div>
                      {categoryFilter && filteredLegislation && filteredLegislation.length > 0 && (
                        <Badge variant="secondary" className="shrink-0">
                          {filteredLegislation.length} {filteredLegislation.length === 1 ? "diploma" : "diplomas"}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 min-h-0">
                    <ScrollArea className="h-[520px]">
                      <div className="p-3">
                        {categoryFilter ? (
                          loadingLegislation || loadingApplicabilities ? (
                            <div className="space-y-3">
                              {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-28" />
                              ))}
                            </div>
                          ) : filteredLegislation?.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                              <FileText className="h-12 w-12 mb-3 opacity-30" />
                              <p className="text-sm font-medium">Nenhum diploma encontrado</p>
                              <p className="text-xs mt-1">Esta categoria não tem legislação associada</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {filteredLegislation?.map((item: any) => {
                                const leg = item.legislation;
                                if (!leg) return null;
                                
                                const compliance = getComplianceStatus(leg.id);
                                const stats = complianceByLegislation.get(leg.id);

                                return (
                                  <Link 
                                    key={item.id}
                                    to={`/legislacao/${leg.id}`}
                                    className="block p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                          <Badge variant="outline" className="text-xs shrink-0">
                                            {leg.number}
                                          </Badge>
                                          <Badge 
                                            variant={compliance.color as any}
                                            className="text-xs shrink-0"
                                          >
                                            {compliance.label}
                                          </Badge>
                                        </div>
                                        <h4 className="font-medium text-sm leading-snug mb-2">{leg.title}</h4>
                                        {leg.publication_date && (
                                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Calendar className="h-3 w-3 shrink-0" />
                                            {format(new Date(leg.publication_date), "d 'de' MMMM 'de' yyyy", { locale: pt })}
                                          </p>
                                        )}
                                      </div>
                                      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                                    </div>
                                    {stats && stats.total > 0 && (
                                      <div className="mt-3 pt-3 border-t">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                                          <span>Conformidade</span>
                                          <span>{stats.compliant}/{stats.total} conformes</span>
                                        </div>
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
                                  </Link>
                                );
                              })}
                            </div>
                          )
                        ) : (
                          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <FileText className="h-12 w-12 mb-3 opacity-30" />
                            <p className="text-sm font-medium">Selecione uma categoria</p>
                            <p className="text-xs mt-1">Escolha uma categoria à esquerda para ver os diplomas</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {/* Action Plans Tab */}
          {activeTab === "actions" && (
            <motion.div
              key="actions"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-6"
            >
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
            </motion.div>
          )}

          {/* Documents Tab */}
          {activeTab === "documents" && (
            <motion.div
              key="documents"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <DocumentsPanel organizationIds={organizationIds} />
            </motion.div>
          )}
          </AnimatePresence>
        </main>
      </div>

      {/* Export Report Dialog */}
      {currentOrg && (
        <ExportReportDialog
          organizationId={currentOrg.id}
          organizationName={currentOrg.name}
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
        />
      )}
    </div>
  );
}
