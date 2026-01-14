import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { 
  FileText, 
  Search, 
  X,
  Tags,
  Flag,
  Globe,
  BookOpen,
  LayoutGrid,
  Leaf,
  Shield,
  Zap,
  Award,
  Heart,
  Folder,
  Menu
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories } from "@/hooks/useLegislation";
import { LegislationTreeView } from "@/components/admin/LegislationTreeView";
import { AdvancedSearchDialog } from "@/components/AdvancedSearchDialog";
import { DashboardSidebar } from "@/components/client/DashboardSidebar";
import { AnimatedParticles } from "@/components/client/AnimatedParticles";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { cn } from "@/lib/utils";
import heroVideo from "@/assets/hero-background.mp4";

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

export default function Biblioteca() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedApplicability, setSelectedApplicability] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Fetch themes with categories
  const { data: themes } = useThemesWithCategories();

  // Fetch legislation with categories for tree view
  const { data: legislationWithCategories, isLoading } = useLegislationWithCategories();

  // Fetch user's organizations
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

  const organizationIds = selectedOrgId 
    ? [selectedOrgId]
    : userRoles?.map(r => r.organization_id).filter(Boolean) || [];

  const currentOrg = organizations.find(o => o.id === (selectedOrgId || organizationIds[0])) || organizations[0];

  // Fetch legislation applicabilities for user's organization
  const { data: legislationApplicabilitiesMap } = useQuery({
    queryKey: ["org-legislation-applicabilities", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg?.id) return {};
      const { data, error } = await supabase
        .from("organization_legislation")
        .select("legislation_id, applicability_type")
        .eq("organization_id", currentOrg.id);
      if (error) throw error;
      
      const map: Record<string, string> = {};
      data?.forEach((a) => {
        map[a.legislation_id] = a.applicability_type || "nao_avaliado";
      });
      return map;
    },
    enabled: !!currentOrg?.id,
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
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Animated Video Background */}
      <div className="fixed inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={heroVideo} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/95 via-white/90 to-teal-50/85 dark:from-slate-900/92 dark:via-slate-900/88 dark:to-emerald-950/30" />
        <div className="absolute top-20 right-20 w-96 h-96 bg-emerald-300/25 dark:bg-emerald-400/12 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-teal-300/25 dark:bg-teal-400/12 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <AnimatedParticles count={25} />
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30 border-r border-emerald-200/60 dark:border-emerald-900/30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl">
        <DashboardSidebar currentOrg={currentOrg} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0 border-r border-emerald-200/60 dark:border-emerald-900/30 bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl">
          <DashboardSidebar currentOrg={currentOrg} onCloseMobile={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 relative z-10">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-emerald-200/60 dark:border-emerald-900/30">
          <div className="flex items-center justify-between px-4 lg:px-8 py-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 hover:bg-emerald-100/60 dark:hover:bg-emerald-500/15"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">{currentOrg?.name || "Biblioteca"}</p>
                <h1 className="text-xl font-semibold text-emerald-800 dark:text-emerald-100 flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Biblioteca de Legislação
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
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8 space-y-6">
          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="bg-white/95 dark:bg-slate-900/90 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
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
                    showApplicability={!!currentOrg}
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
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="bg-white/95 dark:bg-slate-900/90 border-emerald-200/60 dark:border-emerald-800/30 shadow-sm backdrop-blur-sm overflow-hidden">
              <CardContent className="p-4">
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
              </CardContent>
            </Card>
          </motion.div>

          {/* Active Filters & Results Count */}
          <motion.div 
            className="flex items-center justify-between flex-wrap gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
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
            transition={{ duration: 0.4, delay: 0.4 }}
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
    </div>
  );
}
