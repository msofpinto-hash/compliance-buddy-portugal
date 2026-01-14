import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileText, 
  Search, 
  ArrowLeft,
  Calendar,
  X,
  Tags,
  Flag,
  Globe,
  CheckCircle,
  TrendingUp,
  BookOpen,
  Sparkles,
  Filter,
  LayoutGrid,
  List,
  ChevronRight,
  ChevronDown,
  Leaf,
  Shield,
  Zap,
  Award,
  Heart,
  Folder
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories } from "@/hooks/useLegislation";
import { LegislationTreeView } from "@/components/admin/LegislationTreeView";
import { AdvancedSearchDialog } from "@/components/AdvancedSearchDialog";
import { cn } from "@/lib/utils";
import bibliotecaHero from "@/assets/biblioteca-hero.png";

// Theme icons and colors mapping
import themeAmbiente from "@/assets/theme-ambiente.png";
import themeSst from "@/assets/theme-sst.png";
import themeEnergia from "@/assets/theme-energia.png";
import themeQualidade from "@/assets/theme-qualidade.png";
import themeSeguranca from "@/assets/theme-seguranca.png";
import themeGeral from "@/assets/theme-geral.png";

const themeImages: Record<string, string> = {
  ambiente: themeAmbiente,
  sst: themeSst,
  energia: themeEnergia,
  qualidade: themeQualidade,
  seguranca: themeSeguranca,
  segurança: themeSeguranca,
  geral: themeGeral,
};

const themeConfig: Record<string, { icon: React.ElementType; color: string; bgLight: string; bgDark: string; border: string }> = {
  "Ambiente": { icon: Leaf, color: "text-emerald-600", bgLight: "bg-emerald-100", bgDark: "dark:bg-emerald-900/40", border: "border-emerald-300 dark:border-emerald-700" },
  "SST": { icon: Shield, color: "text-orange-600", bgLight: "bg-orange-100", bgDark: "dark:bg-orange-900/40", border: "border-orange-300 dark:border-orange-700" },
  "Segurança e Saúde no Trabalho": { icon: Shield, color: "text-orange-600", bgLight: "bg-orange-100", bgDark: "dark:bg-orange-900/40", border: "border-orange-300 dark:border-orange-700" },
  "Energia": { icon: Zap, color: "text-yellow-600", bgLight: "bg-yellow-100", bgDark: "dark:bg-yellow-900/40", border: "border-yellow-300 dark:border-yellow-700" },
  "Qualidade": { icon: Award, color: "text-blue-600", bgLight: "bg-blue-100", bgDark: "dark:bg-blue-900/40", border: "border-blue-300 dark:border-blue-700" },
  "Segurança": { icon: Shield, color: "text-red-600", bgLight: "bg-red-100", bgDark: "dark:bg-red-900/40", border: "border-red-300 dark:border-red-700" },
  "Conciliação Familiar e Profissional": { icon: Heart, color: "text-pink-600", bgLight: "bg-pink-100", bgDark: "dark:bg-pink-900/40", border: "border-pink-300 dark:border-pink-700" },
};

const getThemeImage = (themeName: string): string | undefined => {
  const normalized = themeName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return themeImages[normalized] || themeImages[Object.keys(themeImages).find(k => normalized.includes(k)) || ""];
};

const applicabilityFilterOptions = [
  { value: "all", label: "Todos" },
  { value: "nao_avaliado", label: "Não Avaliado" },
  { value: "aplicavel_direto", label: "Aplicável Direto" },
  { value: "aplicavel_indireto", label: "Aplicável Indireto" },
  { value: "aplicavel_condicionado", label: "Aplicável Condicionado" },
  { value: "nao_aplicavel", label: "Não Aplicável" },
  { value: "informativo", label: "Informativo" },
  { value: "has_any", label: "Com classificação" },
  { value: "pending", label: "Pendente de avaliação" },
];

const StatCard = ({ 
  icon: Icon, 
  value, 
  label, 
  gradient, 
  iconColor,
  delay = 0 
}: { 
  icon: React.ElementType; 
  value: number | string; 
  label: string; 
  gradient: string;
  iconColor: string;
  delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.5, delay, type: "spring", stiffness: 100 }}
    whileHover={{ y: -4, transition: { duration: 0.2 } }}
    whileTap={{ scale: 0.98 }}
  >
    <Card className={cn(
      "group relative overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer",
      gradient
    )}>
      {/* Animated shimmer effect on hover */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent dark:from-white/5 group-hover:from-white/70 dark:group-hover:from-white/8 transition-colors duration-300" />
      <CardContent className="p-4 relative">
        <div className="flex items-center gap-3">
          <motion.div 
            className={cn("p-2.5 rounded-xl shadow-sm group-hover:shadow-md transition-shadow duration-300", iconColor)}
            whileHover={{ scale: 1.15, rotate: 8 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <Icon className="h-5 w-5 text-white" />
          </motion.div>
          <div>
            <motion.p 
              className="text-2xl font-bold text-emerald-800 dark:text-emerald-100"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: delay + 0.2, duration: 0.4 }}
            >
              {value}
            </motion.p>
            <motion.p 
              className="text-xs text-emerald-700/80 dark:text-emerald-300/80 font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.3 }}
            >
              {label}
            </motion.p>
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

export default function Biblioteca() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedApplicability, setSelectedApplicability] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);
  

  // Fetch themes with categories
  const { data: themes } = useThemesWithCategories();

  // Fetch legislation with categories for tree view
  const { data: legislationWithCategories, isLoading } = useLegislationWithCategories();

  // Fetch user's organization
  const { data: userOrganization } = useQuery({
    queryKey: ["user-organization", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("organization_id, organizations(id, name)")
        .eq("user_id", user.id)
        .not("organization_id", "is", null)
        .maybeSingle();
      if (error) throw error;
      return data?.organizations || null;
    },
    enabled: !!user,
  });

  // Fetch stats for dashboard
  const { data: stats } = useQuery({
    queryKey: ["biblioteca-stats"],
    queryFn: async () => {
      const last30Days = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const last7Days = format(subDays(new Date(), 7), "yyyy-MM-dd");
      
      const [totalResult, ptResult, euResult, last30Result, last7Result, withCategoriesResult] = await Promise.all([
        supabase.from("legislation").select("*", { count: "exact", head: true }),
        supabase.from("legislation").select("*", { count: "exact", head: true }).eq("source", "dre"),
        supabase.from("legislation").select("*", { count: "exact", head: true }).eq("source", "eurlex"),
        supabase.from("legislation").select("*", { count: "exact", head: true }).gte("publication_date", last30Days),
        supabase.from("legislation").select("*", { count: "exact", head: true }).gte("publication_date", last7Days),
        supabase.rpc("get_legislation_without_categories_count"),
      ]);
      
      const total = totalResult.count || 0;
      const withoutCategories = withCategoriesResult.data || 0;
      
      return {
        total,
        pt: ptResult.count || 0,
        eu: euResult.count || 0,
        last30Days: last30Result.count || 0,
        last7Days: last7Result.count || 0,
        withCategories: total - withoutCategories,
        categorizedPercent: total > 0 ? Math.round(((total - withoutCategories) / total) * 100) : 0,
      };
    },
  });

  // Fetch legislation applicabilities for user's organization
  const { data: legislationApplicabilitiesMap } = useQuery({
    queryKey: ["org-legislation-applicabilities", userOrganization?.id],
    queryFn: async () => {
      if (!userOrganization?.id) return {};
      const { data, error } = await supabase
        .from("organization_legislation")
        .select("legislation_id, applicability_type")
        .eq("organization_id", userOrganization.id);
      if (error) throw error;
      
      const map: Record<string, string> = {};
      data?.forEach((a) => {
        map[a.legislation_id] = a.applicability_type || "nao_avaliado";
      });
      return map;
    },
    enabled: !!userOrganization?.id,
  });

  // Filter legislation for count
  const filteredCount = useMemo(() => {
    if (!legislationWithCategories) return 0;
    
    return legislationWithCategories.filter((leg) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        leg.title?.toLowerCase().includes(searchLower) ||
        leg.number?.toLowerCase().includes(searchLower) ||
        leg.summary?.toLowerCase().includes(searchLower);

      const matchesSource = selectedSource === "all" || leg.source === selectedSource;

      let matchesThemeCategory = true;
      if (selectedCategoryId) {
        matchesThemeCategory = leg.categories.some(cat => cat.id === selectedCategoryId);
      } else if (selectedThemeId && themes) {
        const selectedTheme = themes.find(t => t.id === selectedThemeId);
        matchesThemeCategory = leg.categories.some(cat => cat.theme_name === selectedTheme?.name);
      }

      return matchesSearch && matchesSource && matchesThemeCategory;
    }).length;
  }, [legislationWithCategories, searchTerm, selectedSource, selectedThemeId, selectedCategoryId, themes]);

  const hasActiveFilters = !!(selectedThemeId || selectedCategoryId || selectedSource !== "all" || filterStartDate || filterEndDate || selectedApplicability !== "all" || searchTerm);

  const clearAllFilters = () => {
    setSelectedThemeId(null);
    setSelectedCategoryId(null);
    setSelectedSource("all");
    setSelectedApplicability("all");
    setFilterStartDate(null);
    setFilterEndDate(null);
    setSearchTerm("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 via-mint-50/30 to-teal-50/40 dark:from-slate-900 dark:via-slate-900/95 dark:to-emerald-950/20">
      {/* Hero Header */}
      <header className="relative border-b border-emerald-200/60 dark:border-emerald-900/30 overflow-hidden">
        {/* Background with gradient overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src={bibliotecaHero} 
            alt="" 
            className="w-full h-full object-cover opacity-10 dark:opacity-5"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/95 via-white/90 to-teal-50/80 dark:from-slate-900/98 dark:via-slate-900/95 dark:to-emerald-950/40" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/30 dark:to-slate-900/30" />
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-emerald-200/30 to-teal-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-teal-200/25 to-mint-200/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        {/* Content */}
        <div className="relative z-10 container mx-auto px-4 py-8">
          <motion.div 
            className="flex items-center gap-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link to={user ? "/dashboard" : "/"}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-700 shadow-sm border border-emerald-200/50 dark:border-emerald-800/30"
              >
                <ArrowLeft className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
              </Button>
            </Link>
            <div className="flex items-center gap-5">
              <motion.div 
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-300/30 dark:shadow-emerald-500/20"
                whileHover={{ scale: 1.05, rotate: 3 }}
                transition={{ type: "spring", stiffness: 400 }}
              >
                <BookOpen className="h-8 w-8" />
              </motion.div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Biblioteca de Legislação
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-lg">
                  Explore e pesquise toda a legislação disponível organizada por temas e categorias
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="bg-white/95 dark:bg-slate-900/90 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1 group">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500 dark:text-emerald-400" />
                  <Input
                    placeholder="Pesquisar legislação por título, número ou conteúdo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-emerald-50/50 dark:bg-slate-800/80 border-emerald-200/80 dark:border-emerald-800/40 focus:border-emerald-400 focus:ring-emerald-400/30"
                  />
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                      onClick={() => setSearchTerm("")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                {/* Origin Tabs */}
                <Tabs value={selectedSource} onValueChange={setSelectedSource} className="shrink-0">
                  <TabsList className="bg-emerald-100/60 dark:bg-emerald-900/30">
                    <TabsTrigger value="all" className="text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-800 dark:data-[state=active]:text-emerald-100">
                      Todos
                    </TabsTrigger>
                    <TabsTrigger value="dre" className="text-xs gap-1 data-[state=active]:bg-white data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-800 dark:data-[state=active]:text-emerald-100">
                      <Flag className="h-3 w-3" />
                      PT
                    </TabsTrigger>
                    <TabsTrigger value="eurlex" className="text-xs gap-1 data-[state=active]:bg-white data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-800 dark:data-[state=active]:text-emerald-100">
                      <Globe className="h-3 w-3" />
                      UE
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Advanced Search */}
                <AdvancedSearchDialog
                  searchTerm={searchTerm}
                  onSearchTermChange={setSearchTerm}
                  selectedSource={selectedSource}
                  onSourceChange={setSelectedSource}
                  selectedApplicability={selectedApplicability}
                  onApplicabilityChange={setSelectedApplicability}
                  applicabilityOptions={applicabilityFilterOptions}
                  showApplicability={!!userOrganization}
                  startDate={filterStartDate}
                  endDate={filterEndDate}
                  onStartDateChange={setFilterStartDate}
                  onEndDateChange={setFilterEndDate}
                  onClearAll={clearAllFilters}
                  hasActiveFilters={hasActiveFilters}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Theme Icons Bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card className="bg-white/95 dark:bg-slate-900/90 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm backdrop-blur-sm overflow-hidden">
            <CardContent className="p-4">
              {/* Theme selector row */}
              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {/* All themes button */}
                <motion.button
                  onClick={() => { setSelectedThemeId(null); setSelectedCategoryId(null); }}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 min-w-[100px] shrink-0",
                    !selectedThemeId 
                      ? "bg-emerald-100 dark:bg-emerald-900/50 border-2 border-emerald-400 dark:border-emerald-600 shadow-md" 
                      : "bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent hover:border-emerald-200 dark:hover:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    !selectedThemeId ? "bg-emerald-500 text-white shadow-lg" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  )}>
                    <LayoutGrid className="h-6 w-6" />
                  </div>
                  <span className={cn(
                    "text-xs font-medium",
                    !selectedThemeId ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-400"
                  )}>
                    Todos
                  </span>
                </motion.button>

                {/* Theme buttons */}
                {themes?.map((theme, index) => {
                  const config = themeConfig[theme.name] || { icon: Folder, color: "text-slate-600", bgLight: "bg-slate-100", bgDark: "dark:bg-slate-800", border: "border-slate-300" };
                  const ThemeIcon = config.icon;
                  const isSelected = selectedThemeId === theme.id;
                  const themeImage = getThemeImage(theme.name);
                  
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
                        "flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 min-w-[100px] shrink-0 relative overflow-hidden",
                        isSelected 
                          ? cn(config.bgLight, config.bgDark, "border-2", config.border, "shadow-md")
                          : "bg-slate-50 dark:bg-slate-800/50 border-2 border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      )}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 * index }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {/* Background image */}
                      {themeImage && (
                        <div className="absolute inset-0 opacity-10">
                          <img src={themeImage} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center relative z-10 shadow-sm",
                        isSelected ? cn(config.bgLight, config.bgDark) : "bg-white dark:bg-slate-700"
                      )}>
                        <ThemeIcon className={cn("h-6 w-6", config.color)} />
                      </div>
                      <span className={cn(
                        "text-xs font-medium relative z-10 text-center leading-tight",
                        isSelected ? config.color : "text-slate-600 dark:text-slate-400"
                      )}>
                        {theme.name.length > 12 ? theme.name.substring(0, 12) + "..." : theme.name}
                      </span>
                      {isSelected && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-1 bg-current opacity-50"
                          layoutId="themeIndicator"
                        />
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Categories panel - shows when a theme is selected */}
              {selectedThemeId && themes && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="border-t border-emerald-200/60 dark:border-emerald-800/30 mt-4 pt-4"
                >
                  {(() => {
                    const selectedTheme = themes.find(t => t.id === selectedThemeId);
                    const config = themeConfig[selectedTheme?.name || ""] || { icon: Folder, color: "text-slate-600", bgLight: "bg-slate-100", bgDark: "dark:bg-slate-800", border: "border-slate-300" };
                    
                    if (!selectedTheme || selectedTheme.categories.length === 0) {
                      return (
                        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-2">
                          Sem categorias disponíveis para este tema
                        </p>
                      );
                    }

                    // Get root categories (no parent)
                    const rootCategories = selectedTheme.categories.filter(c => !c.parent_id);

                    return (
                      <div className="flex flex-wrap gap-2">
                        {rootCategories.map((category, index) => {
                          const isSelected = selectedCategoryId === category.id;
                          
                          return (
                            <motion.button
                              key={category.id}
                              onClick={() => setSelectedCategoryId(isSelected ? null : category.id)}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5",
                                isSelected 
                                  ? cn(config.bgLight, config.bgDark, config.color, "shadow-sm border", config.border)
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent"
                              )}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.2, delay: 0.03 * index }}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Folder className="h-3.5 w-3.5" />
                              {category.name}
                            </motion.button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Active Filters & Results Count */}
        <motion.div 
          className="flex items-center justify-between flex-wrap gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <p className="text-sm text-emerald-700/80 dark:text-emerald-300/80">
            <span className="font-semibold text-emerald-800 dark:text-emerald-100">{filteredCount}</span> diploma{filteredCount !== 1 ? "s" : ""} encontrado{filteredCount !== 1 ? "s" : ""}
          </p>
          
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedSource !== "all" && (
                <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {selectedSource === "dre" ? <Flag className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                  {selectedSource === "dre" ? "Portugal" : "UE"}
                  <button onClick={() => setSelectedSource("all")} className="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {selectedThemeId && themes && (
                <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                  <Tags className="h-3 w-3" />
                  {themes.find(t => t.id === selectedThemeId)?.name}
                  <button onClick={() => { setSelectedThemeId(null); setSelectedCategoryId(null); }} className="ml-1 hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {selectedCategoryId && themes && (() => {
                const theme = themes.find(t => t.categories.some(c => c.id === selectedCategoryId));
                const category = theme?.categories.find(c => c.id === selectedCategoryId);
                return category ? (
                  <Badge variant="secondary" className="gap-1 bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300">
                    <Folder className="h-3 w-3" />
                    {category.name}
                    <button onClick={() => setSelectedCategoryId(null)} className="ml-1 hover:bg-teal-200 dark:hover:bg-teal-800 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })()}
              {searchTerm && (
                <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Search className="h-3 w-3" />
                  "{searchTerm.slice(0, 20)}{searchTerm.length > 20 ? '...' : ''}"
                  <button onClick={() => setSearchTerm("")} className="ml-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950 gap-1"
                onClick={clearAllFilters}
              >
                <X className="h-3 w-3" />
                Limpar
              </Button>
            </div>
          )}
        </motion.div>

        {/* Legislation Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : legislationWithCategories ? (
            <Card className="bg-white/95 dark:bg-slate-900/90 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm overflow-hidden backdrop-blur-sm">
              <LegislationTreeView 
                legislation={legislationWithCategories} 
                hideFilters 
                externalThemeId={selectedThemeId}
                applicabilityMap={legislationApplicabilitiesMap}
                externalSearchTerm={searchTerm}
              />
            </Card>
          ) : (
            <Card className="py-20 bg-white/95 dark:bg-slate-900/90 border-emerald-200/60 dark:border-emerald-800/30 backdrop-blur-sm">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <motion.div 
                  className="p-6 rounded-full bg-emerald-100/60 dark:bg-emerald-900/30 mb-6"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  <FileText className="h-12 w-12 text-emerald-400" />
                </motion.div>
                <h3 className="text-xl font-semibold mb-2 text-emerald-800 dark:text-emerald-100">Nenhum diploma encontrado</h3>
                <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80 max-w-md">
                  Não encontrámos legislação disponível com os filtros selecionados.
                </p>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    className="mt-6 gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
                    onClick={clearAllFilters}
                  >
                    <X className="h-4 w-4" />
                    Limpar filtros
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      </main>
    </div>
  );
}
