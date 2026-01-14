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
  ChevronRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories } from "@/hooks/useLegislation";
import { CategoryTreeFilter } from "@/components/CategoryTreeFilter";
import { LegislationTreeView } from "@/components/admin/LegislationTreeView";
import { AdvancedSearchDialog } from "@/components/AdvancedSearchDialog";
import { cn } from "@/lib/utils";
import bibliotecaHero from "@/assets/biblioteca-hero.png";

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
  const [showFilters, setShowFilters] = useState(true);

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
      <main className="container mx-auto px-4 py-8">
        {/* Two Column Layout: Filters + Content */}
        <div className="flex gap-6">
          {/* Left Sidebar - Filters */}
          <motion.aside 
            className={cn(
              "w-80 shrink-0 space-y-4 transition-all duration-300",
              !showFilters && "hidden"
            )}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            {/* Search */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              <Card className="bg-white/90 dark:bg-slate-900/80 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm backdrop-blur-sm hover:shadow-md transition-shadow duration-300">
                <CardContent className="p-4">
                  <div className="relative group">
                    <motion.div
                      animate={{ scale: searchTerm ? 1.1 : 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500 dark:text-emerald-400 group-focus-within:text-emerald-600 transition-colors duration-200" />
                    </motion.div>
                    <Input
                      placeholder="Pesquisar legislação..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-emerald-50/50 dark:bg-slate-800/80 border-emerald-200/80 dark:border-emerald-800/40 focus:border-emerald-400 focus:ring-emerald-400/30 transition-all duration-200"
                    />
                    {searchTerm && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:rotate-90 transition-all duration-200"
                          onClick={() => setSearchTerm("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Origin Filter */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
            >
              <Card className="bg-white/90 dark:bg-slate-900/80 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm backdrop-blur-sm hover:shadow-md transition-shadow duration-300">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                    <motion.div whileHover={{ rotate: 360 }} transition={{ duration: 0.5 }}>
                      <Globe className="h-4 w-4 text-emerald-500" />
                    </motion.div>
                    Origem
                  </h3>
                  <Tabs value={selectedSource} onValueChange={setSelectedSource} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-emerald-100/60 dark:bg-emerald-900/30">
                      <TabsTrigger value="all" className="text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-800 dark:data-[state=active]:text-emerald-100 transition-all duration-200 data-[state=active]:shadow-sm">Todos</TabsTrigger>
                      <TabsTrigger value="dre" className="text-xs gap-1 data-[state=active]:bg-white data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-800 dark:data-[state=active]:text-emerald-100 transition-all duration-200 data-[state=active]:shadow-sm">
                        <Flag className="h-3 w-3" />
                        PT
                      </TabsTrigger>
                      <TabsTrigger value="eurlex" className="text-xs gap-1 data-[state=active]:bg-white data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-800 dark:data-[state=active]:text-emerald-100 transition-all duration-200 data-[state=active]:shadow-sm">
                        <Globe className="h-3 w-3" />
                        UE
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardContent>
              </Card>
            </motion.div>

            {/* Theme/Category Filter */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.45 }}
            >
              <Card className="bg-white/90 dark:bg-slate-900/80 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm backdrop-blur-sm hover:shadow-md transition-shadow duration-300">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                    <motion.div whileHover={{ scale: 1.2, rotate: 15 }} transition={{ type: "spring", stiffness: 400 }}>
                      <Tags className="h-4 w-4 text-emerald-500" />
                    </motion.div>
                    Tema / Categoria
                  </h3>
                  {themes && (
                    <CategoryTreeFilter
                      themes={themes}
                      selectedThemeId={selectedThemeId}
                      selectedCategoryId={selectedCategoryId}
                      onThemeSelect={setSelectedThemeId}
                      onCategorySelect={setSelectedCategoryId}
                    />
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Advanced Search */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <Card className="bg-white/90 dark:bg-slate-900/80 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm backdrop-blur-sm hover:shadow-md transition-shadow duration-300">
                <CardContent className="p-4">
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
                </CardContent>
              </Card>
            </motion.div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <Button
                  variant="outline"
                  className="w-full gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  onClick={clearAllFilters}
                >
                  <motion.div
                    whileHover={{ rotate: 90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X className="h-4 w-4" />
                  </motion.div>
                  Limpar todos os filtros
                </Button>
              </motion.div>
            )}
          </motion.aside>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Toolbar */}
            <motion.div 
              className="flex items-center justify-between"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
            >
              <div className="flex items-center gap-3">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                      "gap-2 border-emerald-200/80 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/50 dark:text-emerald-300 dark:hover:bg-emerald-900/30 transition-all duration-200",
                      showFilters && "bg-emerald-100/80 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700"
                    )}
                  >
                    <motion.div
                      animate={{ rotate: showFilters ? 0 : 180 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Filter className="h-4 w-4" />
                    </motion.div>
                    Filtros
                  </Button>
                </motion.div>
                
                <div className="h-6 w-px bg-emerald-200 dark:bg-emerald-800" />
                
                <p className="text-sm text-emerald-700/80 dark:text-emerald-300/80">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-100">{filteredCount}</span> diploma{filteredCount !== 1 ? "s" : ""} encontrado{filteredCount !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Active Filters Pills */}
              {hasActiveFilters && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {selectedSource !== "all" && (
                    <Badge variant="secondary" className="gap-1 shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {selectedSource === "dre" ? <Flag className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                      {selectedSource === "dre" ? "Portugal" : "UE"}
                      <button onClick={() => setSelectedSource("all")} className="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {selectedThemeId && themes && !selectedCategoryId && (
                    <Badge variant="secondary" className="gap-1 shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      <Tags className="h-3 w-3" />
                      {themes.find(t => t.id === selectedThemeId)?.name}
                      <button onClick={() => setSelectedThemeId(null)} className="ml-1 hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {selectedCategoryId && themes && (() => {
                    const theme = themes.find(t => t.categories.some(c => c.id === selectedCategoryId));
                    const category = theme?.categories.find(c => c.id === selectedCategoryId);
                    return theme && category ? (
                      <Badge variant="secondary" className="gap-1 shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        <Tags className="h-3 w-3" />
                        {category.name}
                        <button 
                          onClick={() => { setSelectedCategoryId(null); setSelectedThemeId(null); }} 
                          className="ml-1 hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })()}
                  {searchTerm && (
                    <Badge variant="secondary" className="gap-1 shrink-0 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <Search className="h-3 w-3" />
                      "{searchTerm.slice(0, 20)}{searchTerm.length > 20 ? '...' : ''}"
                      <button onClick={() => setSearchTerm("")} className="ml-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
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
                <Card className="bg-white/90 dark:bg-slate-900/80 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm overflow-hidden backdrop-blur-sm">
                  <LegislationTreeView 
                    legislation={legislationWithCategories} 
                    hideFilters 
                    externalThemeId={selectedThemeId}
                    applicabilityMap={legislationApplicabilitiesMap}
                    externalSearchTerm={searchTerm}
                  />
                </Card>
              ) : (
                <Card className="py-20 bg-white/90 dark:bg-slate-900/80 border-emerald-200/60 dark:border-emerald-800/30 backdrop-blur-sm">
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
          </div>
        </div>
      </main>
    </div>
  );
}
