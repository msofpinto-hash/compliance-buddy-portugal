import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Building2, 
  BookOpen, 
  ClipboardList, 
  ClipboardCheck,
  FileCheck, 
  BarChart3,
  Users,
  Edit,
  Search,
  ExternalLink,
  FileText,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ChevronDown,
  Leaf,
  Shield,
  Zap,
  Award,
  Heart,
  Folder,
  LayoutGrid,
  X
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Tables } from "@/integrations/supabase/types";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LegislationApplicabilitySelect } from "@/components/LegislationApplicabilitySelect";
import { RequirementApplicabilitySelect } from "@/components/RequirementApplicabilitySelect";
import { motion } from "framer-motion";

type Organization = Tables<"organizations">;

interface ClientDetailViewProps {
  organization: Organization;
  onBack: () => void;
}

// Status configs
const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pendente: { label: "Pendente", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  em_curso: { label: "Em Curso", color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertCircle },
  concluido: { label: "Concluído", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", color: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  alta: { label: "Alta", color: "bg-rose-100 text-rose-700 border-rose-200" },
  media: { label: "Média", color: "bg-amber-100 text-amber-700 border-amber-200" },
  baixa: { label: "Baixa", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

const auditStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  planned: { label: "Planeada", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock },
  in_progress: { label: "Em Curso", color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertCircle },
  pending_approval: { label: "Em Aprovação", color: "bg-purple-100 text-purple-700 border-purple-200", icon: Clock },
  closed: { label: "Encerrada", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "Cancelada", color: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
};

// Theme config
const themeConfig: Record<string, { icon: React.ElementType; color: string; bgLight: string; border: string }> = {
  "Ambiente": { icon: Leaf, color: "text-emerald-600", bgLight: "bg-emerald-100", border: "border-emerald-300" },
  "SST": { icon: Shield, color: "text-orange-600", bgLight: "bg-orange-100", border: "border-orange-300" },
  "Segurança e Saúde no Trabalho": { icon: Shield, color: "text-orange-600", bgLight: "bg-orange-100", border: "border-orange-300" },
  "Energia": { icon: Zap, color: "text-yellow-600", bgLight: "bg-yellow-100", border: "border-yellow-300" },
  "Qualidade": { icon: Award, color: "text-blue-600", bgLight: "bg-blue-100", border: "border-blue-300" },
  "Segurança": { icon: Shield, color: "text-red-600", bgLight: "bg-red-100", border: "border-red-300" },
  "Conciliação Familiar e Profissional": { icon: Heart, color: "text-pink-600", bgLight: "bg-pink-100", border: "border-pink-300" },
};

// Navigation items for sidebar
const navItems = [
  { id: "legislacao", label: "Legislação", icon: BookOpen },
  { id: "acoes", label: "Planos de Ação", icon: ClipboardList },
  { id: "auditorias", label: "Auditorias", icon: ClipboardCheck },
  { id: "evidencias", label: "Evidências", icon: FileCheck },
  { id: "indicadores", label: "Indicadores", icon: BarChart3 },
  { id: "utilizadores", label: "Utilizadores", icon: Users },
];

export function ClientDetailView({ organization, onBack }: ClientDetailViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("legislacao");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLegislation, setExpandedLegislation] = useState<Set<string>>(new Set());
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Fetch organization legislation with requirements
  const { data: orgLegislation, isLoading: loadingLegislation } = useQuery({
    queryKey: ["client-detail-legislation", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_legislation")
        .select(`
          id,
          applicability_type,
          notes,
          legislation_id,
          legislation(
            id, 
            number, 
            title, 
            summary, 
            publication_date, 
            origin,
            document_url
          )
        `)
        .eq("organization_id", organization.id)
        .order("assigned_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch categories for assigned legislation
  const { data: legislationCategories } = useQuery({
    queryKey: ["client-detail-leg-categories", organization.id],
    queryFn: async () => {
      if (!orgLegislation?.length) return [];
      
      const legislationIds = orgLegislation.map(ol => ol.legislation_id);
      
      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select(`
          legislation_id,
          theme_categories(
            id,
            name,
            parent_id,
            theme_id,
            themes(id, name)
          )
        `)
        .in("legislation_id", legislationIds);
      
      if (error) throw error;
      return data;
    },
    enabled: !!orgLegislation?.length,
  });

  // Build themes and categories from legislation mapping
  const { themesWithCategories, categoryMap } = useMemo(() => {
    if (!legislationCategories) return { themesWithCategories: [], categoryMap: new Map() };
    
    const themeMap = new Map<string, { id: string; name: string; categories: Map<string, { id: string; name: string; count: number }> }>();
    const catToLegMap = new Map<string, Set<string>>(); // category_id -> legislation_ids
    
    legislationCategories.forEach(lc => {
      const cat = lc.theme_categories;
      if (!cat || !cat.themes) return;
      
      const theme = cat.themes;
      if (!themeMap.has(theme.id)) {
        themeMap.set(theme.id, { id: theme.id, name: theme.name, categories: new Map() });
      }
      
      const themeEntry = themeMap.get(theme.id)!;
      if (!themeEntry.categories.has(cat.id)) {
        themeEntry.categories.set(cat.id, { id: cat.id, name: cat.name, count: 0 });
      }
      themeEntry.categories.get(cat.id)!.count++;
      
      // Track legislation per category
      if (!catToLegMap.has(cat.id)) {
        catToLegMap.set(cat.id, new Set());
      }
      catToLegMap.get(cat.id)!.add(lc.legislation_id);
    });
    
    const result = Array.from(themeMap.values()).map(t => ({
      id: t.id,
      name: t.name,
      categories: Array.from(t.categories.values()),
    }));
    
    return { themesWithCategories: result, categoryMap: catToLegMap };
  }, [legislationCategories]);

  // Fetch requirements with applicabilities
  const { data: requirementsData, isLoading: loadingRequirements } = useQuery({
    queryKey: ["client-detail-requirements", organization.id],
    queryFn: async () => {
      if (!orgLegislation?.length) return [];
      
      const legislationIds = orgLegislation.map(ol => ol.legislation_id);
      
      const { data: requirements, error: reqError } = await supabase
        .from("legal_requirements")
        .select("id, article, requirement_text, legislation_id, display_order")
        .in("legislation_id", legislationIds)
        .order("display_order", { ascending: true, nullsFirst: false });
      
      if (reqError) throw reqError;
      
      // Get applicabilities
      const { data: applicabilities, error: appError } = await supabase
        .from("applicabilities")
        .select("*")
        .eq("organization_id", organization.id);
      
      if (appError) throw appError;
      
      // Map applicabilities to requirements
      const appMap = new Map(applicabilities?.map(a => [a.requirement_id, a]) || []);
      
      return requirements?.map(req => ({
        ...req,
        applicability: appMap.get(req.id) || null,
      })) || [];
    },
    enabled: !!orgLegislation?.length,
  });

  // Group requirements by legislation
  const requirementsByLegislation = useMemo(() => {
    const map = new Map<string, typeof requirementsData>();
    requirementsData?.forEach(req => {
      const existing = map.get(req.legislation_id) || [];
      existing.push(req);
      map.set(req.legislation_id, existing);
    });
    return map;
  }, [requirementsData]);

  // Fetch action plans
  const { data: actionPlans, isLoading: loadingActions } = useQuery({
    queryKey: ["client-detail-actions", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_plans")
        .select(`
          *,
          legal_requirements(id, article, legislation_id, legislation:legislation_id(number, title))
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch audits
  const { data: audits, isLoading: loadingAudits } = useQuery({
    queryKey: ["client-detail-audits", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("*")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch evidence requests
  const { data: evidenceRequests, isLoading: loadingEvidence } = useQuery({
    queryKey: ["client-detail-evidence", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_evidence_requests")
        .select(`
          *,
          evidence_templates(id, group_name, title, description)
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Filter legislation by search and theme/category
  const filteredLegislation = useMemo(() => {
    if (!orgLegislation) return [];
    
    return orgLegislation.filter(ol => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        ol.legislation?.title?.toLowerCase().includes(search) ||
        ol.legislation?.number?.toLowerCase().includes(search);
      
      // Filter by category
      if (selectedCategoryId) {
        const legIdsInCategory = categoryMap.get(selectedCategoryId);
        if (!legIdsInCategory?.has(ol.legislation_id)) return false;
      } else if (selectedThemeId) {
        // Filter by theme (any category in this theme)
        const theme = themesWithCategories.find(t => t.id === selectedThemeId);
        if (theme) {
          const themeCategories = theme.categories.map(c => c.id);
          const hasTheme = themeCategories.some(catId => categoryMap.get(catId)?.has(ol.legislation_id));
          if (!hasTheme) return false;
        }
      }
      
      return matchesSearch;
    });
  }, [orgLegislation, searchTerm, selectedThemeId, selectedCategoryId, categoryMap, themesWithCategories]);

  // Toggle legislation expansion
  const toggleLegislation = (id: string) => {
    setExpandedLegislation(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Stats
  const stats = useMemo(() => {
    const totalLegislation = orgLegislation?.length || 0;
    const totalRequirements = requirementsData?.length || 0;
    const evaluatedRequirements = requirementsData?.filter(r => r.applicability)?.length || 0;
    const pendingActions = actionPlans?.filter(a => a.status === "pendente" || a.status === "em_curso")?.length || 0;
    const pendingEvidence = evidenceRequests?.filter(e => e.status === "pending" || e.status === "submitted")?.length || 0;
    const totalAudits = audits?.length || 0;
    
    return { totalLegislation, totalRequirements, evaluatedRequirements, pendingActions, pendingEvidence, totalAudits };
  }, [orgLegislation, requirementsData, actionPlans, evidenceRequests, audits]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-200px)]">
      {/* Sidebar Navigation - Similar ao portal do cliente */}
      <div className="lg:w-64 shrink-0">
        <Card className="sticky top-6 overflow-hidden bg-gradient-to-b from-white to-amber-50/30 dark:from-stone-900 dark:to-amber-950/20 border-amber-200/60 dark:border-amber-800/40">
          {/* Header */}
          <div className="p-4 border-b border-amber-200/60 dark:border-amber-900/30">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onBack}
              className="mb-3 -ml-2 text-amber-700 hover:text-amber-800 hover:bg-amber-100/50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div className="flex items-center gap-3">
              {organization.logo_url ? (
                <img 
                  src={organization.logo_url} 
                  alt={organization.name} 
                  className="h-10 w-10 object-contain rounded-lg"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="font-bold text-amber-800 dark:text-amber-100 truncate">
                  {organization.name}
                </h2>
                {organization.description && (
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 truncate">
                    {organization.description}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <ScrollArea className="py-4">
            <nav className="px-3 space-y-1">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                const ItemIcon = item.icon;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left",
                      isActive 
                        ? "bg-amber-100/80 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-500/25" 
                        : "text-amber-700/80 dark:text-amber-200/80 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 hover:text-amber-800 dark:hover:text-amber-100"
                    )}
                  >
                    <ItemIcon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </ScrollArea>

          {/* Quick Stats */}
          <div className="p-4 border-t border-amber-200/60 dark:border-amber-900/30 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-amber-600 dark:text-amber-400">Legislação</span>
              <span className="font-medium text-amber-800 dark:text-amber-200">{stats.totalLegislation}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-amber-600 dark:text-amber-400">Requisitos</span>
              <span className="font-medium text-amber-800 dark:text-amber-200">{stats.evaluatedRequirements}/{stats.totalRequirements}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-amber-600 dark:text-amber-400">Auditorias</span>
              <span className="font-medium text-amber-800 dark:text-amber-200">{stats.totalAudits}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-amber-600 dark:text-amber-400">Ações</span>
              <span className="font-medium text-amber-800 dark:text-amber-200">{stats.pendingActions}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-amber-600 dark:text-amber-400">Evidências</span>
              <span className="font-medium text-amber-800 dark:text-amber-200">{stats.pendingEvidence}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">

        {/* Legislação Content */}
        {activeTab === "legislacao" && (
          <div className="space-y-4">
            {/* Theme Bar */}
            {themesWithCategories.length > 0 && (
              <Card className="bg-gradient-to-r from-amber-50/80 to-orange-50/50 dark:from-amber-900/20 dark:to-orange-900/15 border-amber-200/60">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {/* All button */}
                    <motion.button
                      onClick={() => { setSelectedThemeId(null); setSelectedCategoryId(null); }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 shrink-0",
                        !selectedThemeId 
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md" 
                          : "bg-white/70 dark:bg-stone-800/50 text-muted-foreground hover:bg-amber-100/50"
                      )}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      <span className="text-sm font-medium">Todos</span>
                    </motion.button>

                    {/* Theme buttons */}
                    {themesWithCategories.map((theme) => {
                      const config = themeConfig[theme.name] || { icon: Folder, color: "text-slate-600", bgLight: "bg-slate-100", border: "border-slate-300" };
                      const ThemeIcon = config.icon;
                      const isSelected = selectedThemeId === theme.id;
                      
                      return (
                        <motion.button
                          key={theme.id}
                          onClick={() => { 
                            if (isSelected) {
                              setSelectedThemeId(null);
                              setSelectedCategoryId(null);
                            } else {
                              setSelectedThemeId(theme.id);
                              setSelectedCategoryId(null);
                            }
                          }}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 shrink-0",
                            isSelected 
                              ? cn(config.bgLight, "border", config.border, "shadow-sm")
                              : "bg-white/70 dark:bg-stone-800/50 text-muted-foreground hover:bg-muted/50"
                          )}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <ThemeIcon className={cn("h-4 w-4", isSelected ? config.color : "")} />
                          <span className={cn("text-sm font-medium", isSelected ? config.color : "")}>
                            {theme.name}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category Buttons (when theme selected) */}
            {selectedThemeId && (() => {
              const selectedTheme = themesWithCategories.find(t => t.id === selectedThemeId);
              return selectedTheme && selectedTheme.categories.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant={!selectedCategoryId ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategoryId(null)}
                    className={!selectedCategoryId ? "bg-amber-500 hover:bg-amber-600" : ""}
                  >
                    Todas ({selectedTheme.categories.reduce((a, c) => a + c.count, 0)})
                  </Button>
                  {selectedTheme.categories.map(cat => (
                    <Button
                      key={cat.id}
                      variant={selectedCategoryId === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={selectedCategoryId === cat.id ? "bg-amber-500 hover:bg-amber-600" : ""}
                    >
                      {cat.name} ({cat.count})
                    </Button>
                  ))}
                </div>
              ) : null;
            })()}

            {/* Search and filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Pesquisar legislação..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {/* Active filters indicator */}
              {(selectedThemeId || selectedCategoryId || searchTerm) && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {filteredLegislation.length} resultado{filteredLegislation.length !== 1 ? "s" : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedThemeId(null);
                      setSelectedCategoryId(null);
                      setSearchTerm("");
                    }}
                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-100/50 gap-1"
                  >
                    <X className="h-3 w-3" />
                    Limpar
                  </Button>
                </div>
              )}
            </div>

            {loadingLegislation ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : filteredLegislation.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Nenhuma legislação atribuída</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredLegislation.map((ol) => {
                  const leg = ol.legislation;
                  if (!leg) return null;
                  
                  const isExpanded = expandedLegislation.has(leg.id);
                  const requirements = requirementsByLegislation.get(leg.id) || [];
                  
                  return (
                    <Card key={ol.id} className="overflow-hidden">
                      <Collapsible open={isExpanded} onOpenChange={() => toggleLegislation(leg.id)}>
                        <CollapsibleTrigger asChild>
                          <div className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className={cn(
                                    "shrink-0 text-xs",
                                    leg.origin === "PT" && "border-green-300 text-green-700 bg-green-50",
                                    leg.origin === "EU" && "border-blue-300 text-blue-700 bg-blue-50"
                                  )}>
                                    {leg.origin || "?"}
                                  </Badge>
                                  <span className="text-sm font-medium text-muted-foreground">
                                    {leg.number}
                                  </span>
                                  {leg.publication_date && (
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(leg.publication_date), "dd/MM/yyyy", { locale: pt })}
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-medium line-clamp-2">{leg.title}</h4>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {requirements.length} requisitos
                                  </Badge>
                                  <LegislationApplicabilitySelect
                                    organizationId={organization.id}
                                    legislationId={leg.id}
                                    currentValue={ol.applicability_type}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {leg.document_url && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                    <a href={leg.document_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                  <Link to={`/legislacao/${leg.id}`}>
                                    <FileText className="h-4 w-4" />
                                  </Link>
                                </Button>
                                <ChevronDown className={cn(
                                  "h-4 w-4 transition-transform",
                                  isExpanded && "rotate-180"
                                )} />
                              </div>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t bg-muted/20 p-4">
                            {requirements.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                Sem requisitos extraídos
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {requirements.map((req) => (
                                  <div 
                                    key={req.id}
                                    className="flex items-start gap-3 p-3 rounded-lg bg-background border"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        {req.article && (
                                          <Badge variant="outline" className="text-xs shrink-0">
                                            {req.article}
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm line-clamp-3">{req.requirement_text}</p>
                                    </div>
                                    <div className="shrink-0">
                                      <RequirementApplicabilitySelect
                                        organizationId={organization.id}
                                        requirementId={req.id}
                                        currentValue={req.applicability?.applicability_type || "nao_avaliado"}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Planos de Ação Content */}
        {activeTab === "acoes" && (
          <div className="space-y-4">
            {loadingActions ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !actionPlans?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Nenhum plano de ação</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {actionPlans.map((plan) => {
                  const status = statusConfig[plan.status || "pendente"];
                  const priority = priorityConfig[plan.priority || "media"];
                  const StatusIcon = status?.icon || Clock;
                  
                  return (
                    <Card key={plan.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className={cn("text-xs", status?.color)}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {status?.label}
                              </Badge>
                              {priority && (
                                <Badge variant="outline" className={cn("text-xs", priority.color)}>
                                  {priority.label}
                                </Badge>
                              )}
                              {plan.due_date && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(plan.due_date), "dd/MM/yyyy", { locale: pt })}
                                </span>
                              )}
                            </div>
                            <h4 className="font-medium">{plan.title}</h4>
                            {plan.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {plan.description}
                              </p>
                            )}
                            {plan.responsible && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                {plan.responsible}
                              </div>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Auditorias Content */}
        {activeTab === "auditorias" && (
          <div className="space-y-4">
            {loadingAudits ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !audits?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Nenhuma auditoria</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {audits.map((audit) => {
                  const status = auditStatusConfig[audit.status] || auditStatusConfig.planned;
                  const StatusIcon = status.icon;
                  
                  return (
                    <Card key={audit.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className={cn("text-xs", status.color)}>
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {status.label}
                              </Badge>
                              {audit.audit_date && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(audit.audit_date), "dd/MM/yyyy", { locale: pt })}
                                </span>
                              )}
                            </div>
                            <h4 className="font-medium">{audit.title}</h4>
                            {audit.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {audit.description}
                              </p>
                            )}
                            {audit.auditor && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                {audit.auditor}
                              </div>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Evidências Content */}
        {activeTab === "evidencias" && (
          <div className="space-y-4">
            {loadingEvidence ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : !evidenceRequests?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">Nenhum pedido de evidência</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {evidenceRequests.map((req) => {
                  const statusColors: Record<string, string> = {
                    pending: "bg-slate-100 text-slate-700 border-slate-200",
                    submitted: "bg-amber-100 text-amber-700 border-amber-200",
                    approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
                    rejected: "bg-rose-100 text-rose-700 border-rose-200",
                  };
                  const statusLabels: Record<string, string> = {
                    pending: "Pendente",
                    submitted: "Submetido",
                    approved: "Aprovado",
                    rejected: "Rejeitado",
                  };
                  
                  return (
                    <Card key={req.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className={cn("text-xs", statusColors[req.status])}>
                                {statusLabels[req.status] || req.status}
                              </Badge>
                              {req.due_date && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(req.due_date), "dd/MM/yyyy", { locale: pt })}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mb-1">
                              {req.evidence_templates?.group_name}
                            </div>
                            <h4 className="font-medium">{req.evidence_templates?.title}</h4>
                            {req.evidence_templates?.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {req.evidence_templates.description}
                              </p>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Indicadores Content */}
        {activeTab === "indicadores" && (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">Módulo de indicadores em desenvolvimento</p>
              <p className="text-sm text-muted-foreground mt-1">Em breve poderá definir e acompanhar indicadores de desempenho</p>
            </CardContent>
          </Card>
        )}

        {/* Utilizadores Content */}
        {activeTab === "utilizadores" && (
          <ClientUsersTab organizationId={organization.id} />
        )}
      </div>
    </div>
  );
}

// Sub-component for users tab
function ClientUsersTab({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery({
    queryKey: ["org-users-detail", organizationId],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("id, user_id, role, created_at")
        .eq("organization_id", organizationId);
      
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];
      
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, user_type")
        .in("id", userIds);
      
      if (profilesError) throw profilesError;
      
      return roles.map(role => ({
        ...role,
        profile: profiles?.find(p => p.id === role.user_id) || null,
      }));
    },
  });

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!users?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-muted-foreground">Nenhum utilizador associado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.profile?.full_name || "—"}
                </TableCell>
                <TableCell>{user.profile?.email || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {user.profile?.user_type || "consulta"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
