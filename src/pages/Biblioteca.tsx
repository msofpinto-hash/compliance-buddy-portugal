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
import { IDSidebar } from "@/components/client/IDSidebar";
import { IDBackground, IDParticles, IDHeroSection, IDCard } from "@/components/client/IDBackground";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { cn } from "@/lib/utils";

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
      {/* I&D Inspired Background */}
      <IDBackground />

      {/* Desktop Sidebar */}
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
        {/* Top Header - Warm institutional style */}
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
                <p className="text-xs text-amber-700/70 dark:text-amber-300/60 uppercase tracking-wider font-medium">{currentOrg?.name || "Biblioteca"}</p>
                <h1 className="text-lg font-semibold text-stone-800 dark:text-white flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Legislação
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
        <main className="p-4 lg:p-8 space-y-5">
          {/* Hero Header - I&D Style */}
          <IDHeroSection
            title="Biblioteca de Legislação"
            subtitle="Consulta e acompanhamento de toda a legislação aplicável à sua organização"
            badge="Gestão Documental"
            icon={BookOpen}
          />

          {/* Search Bar - Clean institutional */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <IDCard>
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600 dark:text-amber-400" />
                    <Input
                      placeholder="Pesquisar legislação..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-amber-50/50 dark:bg-amber-950/20 border-stone-200/80 dark:border-amber-800/40 focus:border-amber-500 focus:ring-amber-500/20 text-stone-700 dark:text-white placeholder:text-stone-400 dark:placeholder:text-amber-300/40"
                    />
                    {searchTerm && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        onClick={() => setSearchTerm("")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Origin Tabs - Warm green style */}
                  <Tabs value={selectedSource} onValueChange={setSelectedSource} className="shrink-0">
                    <TabsList className="bg-stone-100 dark:bg-stone-800/50 border border-stone-200/60 dark:border-amber-800/40">
                      <TabsTrigger value="all" className="text-xs data-[state=active]:bg-emerald-600 data-[state=active]:text-white dark:data-[state=active]:bg-emerald-500">
                        Todos
                      </TabsTrigger>
                      <TabsTrigger value="dre" className="text-xs gap-1 data-[state=active]:bg-emerald-600 data-[state=active]:text-white dark:data-[state=active]:bg-emerald-500">
                        <Flag className="h-3 w-3" />
                        PT
                      </TabsTrigger>
                      <TabsTrigger value="eurlex" className="text-xs gap-1 data-[state=active]:bg-emerald-600 data-[state=active]:text-white dark:data-[state=active]:bg-emerald-500">
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
            </IDCard>
          </motion.div>

          {/* Theme Icons Bar - I&D Warm Style */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <IDCard>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {/* All themes button */}
                  <motion.button
                    onClick={() => { setSelectedThemeId(null); setSelectedCategoryId(null); }}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 min-w-[90px] shrink-0",
                      !selectedThemeId 
                        ? "bg-gradient-to-br from-emerald-600 to-emerald-700 dark:from-emerald-500 dark:to-emerald-600 text-white shadow-md ring-2 ring-amber-300/30 dark:ring-amber-500/20" 
                        : "bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-amber-800/30 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-stone-600 dark:text-amber-200"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      !selectedThemeId ? "bg-white/20" : "bg-white dark:bg-stone-700"
                    )}>
                      <LayoutGrid className={cn("h-5 w-5", !selectedThemeId ? "text-white" : "text-emerald-600 dark:text-amber-400")} />
                    </div>
                    <span className="text-xs font-medium">
                      Todos
                    </span>
                  </motion.button>

                  {/* Theme buttons */}
                  {themes?.map((theme, index) => {
                    const config = themeConfig[theme.name] || { icon: Folder, color: "text-amber-600", bgLight: "bg-amber-50", bgDark: "dark:bg-amber-900/30", border: "border-amber-200" };
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
                          "flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 min-w-[90px] shrink-0",
                          isSelected 
                            ? "bg-gradient-to-br from-emerald-600 to-emerald-700 dark:from-emerald-500 dark:to-emerald-600 text-white shadow-md ring-2 ring-amber-300/30 dark:ring-amber-500/20"
                            : "bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-amber-800/30 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-stone-600 dark:text-amber-200"
                        )}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.05 * index }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          isSelected ? "bg-white/20" : "bg-white dark:bg-stone-700"
                        )}>
                          <ThemeIcon className={cn("h-5 w-5", isSelected ? "text-white" : config.color)} />
                        </div>
                        <span className="text-xs font-medium text-center leading-tight">
                          {theme.name.length > 10 ? theme.name.substring(0, 10) + "..." : theme.name}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </CardContent>
            </IDCard>
          </motion.div>

          {/* Active Filters & Results Count - Warm style */}
          <motion.div 
            className="flex items-center justify-between flex-wrap gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <p className="text-sm text-stone-600 dark:text-amber-200/80">
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{filteredCount}</span> diploma{filteredCount !== 1 ? "s" : ""} encontrado{filteredCount !== 1 ? "s" : ""}
            </p>
            
            {hasActiveFilters && (
              <div className="flex items-center gap-2 flex-wrap">
                {selectedSource !== "all" && (
                  <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200 border-0">
                    {selectedSource === "dre" ? <Flag className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                    {selectedSource === "dre" ? "Portugal" : "UE"}
                    <button onClick={() => setSelectedSource("all")} className="ml-1 hover:bg-amber-200 dark:hover:bg-amber-700 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {selectedThemeId && themes && (
                  <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-200 border-0">
                    <Tags className="h-3 w-3" />
                    {themes.find(t => t.id === selectedThemeId)?.name}
                    <button onClick={() => { setSelectedThemeId(null); setSelectedCategoryId(null); }} className="ml-1 hover:bg-emerald-200 dark:hover:bg-emerald-700 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {selectedCategoryId && themes && (() => {
                  const theme = themes.find(t => t.categories.some(c => c.id === selectedCategoryId));
                  const category = theme?.categories.find(c => c.id === selectedCategoryId);
                  return category ? (
                    <Badge variant="secondary" className="gap-1 bg-orange-100 text-orange-800 dark:bg-orange-800/40 dark:text-orange-200 border-0">
                      <Folder className="h-3 w-3" />
                      {category.name}
                      <button onClick={() => setSelectedCategoryId(null)} className="ml-1 hover:bg-orange-200 dark:hover:bg-orange-700 rounded-full p-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })()}
                {searchTerm && (
                  <Badge variant="secondary" className="gap-1 bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-0">
                    <Search className="h-3 w-3" />
                    "{searchTerm.slice(0, 20)}{searchTerm.length > 20 ? '...' : ''}"
                    <button onClick={() => setSearchTerm("")} className="ml-1 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 gap-1"
                  onClick={clearAllFilters}
                >
                  <X className="h-3 w-3" />
                  Limpar
                </Button>
              </div>
            )}
          </motion.div>

          {/* Legislation Content - Warm Style */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-xl bg-amber-100/50 dark:bg-amber-900/15" />
                ))}
              </div>
            ) : legislationWithCategories ? (
              <IDCard className="overflow-hidden">
                <LegislationTreeView 
                  legislation={legislationWithCategories} 
                  hideFilters 
                  externalThemeId={selectedThemeId}
                  applicabilityMap={legislationApplicabilitiesMap}
                  externalSearchTerm={searchTerm}
                />
              </IDCard>
            ) : (
              <IDCard className="py-20">
                <CardContent className="flex flex-col items-center justify-center text-center">
                  <motion.div 
                    className="p-6 rounded-full bg-gradient-to-br from-amber-100 to-emerald-100 dark:from-amber-900/30 dark:to-emerald-900/30 mb-6"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <FileText className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
                  </motion.div>
                  <h3 className="text-xl font-semibold mb-2 text-stone-800 dark:text-white">Nenhum diploma encontrado</h3>
                  <p className="text-sm text-stone-500 dark:text-amber-200/60 max-w-md">
                    Não encontrámos legislação disponível com os filtros selecionados.
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      className="mt-6 gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
                      onClick={clearAllFilters}
                    >
                      <X className="h-4 w-4" />
                      Limpar filtros
                    </Button>
                  )}
                </CardContent>
              </IDCard>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
