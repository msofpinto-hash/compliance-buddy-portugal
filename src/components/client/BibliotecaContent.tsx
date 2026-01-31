import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Folder
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { useThemesWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories } from "@/hooks/useLegislation";
import { LegislationTreeView } from "@/components/admin/LegislationTreeView";
import { AdvancedSearchDialog } from "@/components/AdvancedSearchDialog";
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

interface BibliotecaContentProps {
  organizationId?: string | null;
}

export function BibliotecaContent({ organizationId }: BibliotecaContentProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedApplicability, setSelectedApplicability] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);

  // Persist library state so navigating to a diploma and returning doesn't reset filters/scroll.
  const storageBaseKey = useMemo(
    () => `biblioteca_state:${organizationId ?? "public"}`,
    [organizationId],
  );
  const filtersKey = `${storageBaseKey}:filters`;
  const scrollKey = `${storageBaseKey}:scrollY`;
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;

    // Restore filters
    try {
      const raw = sessionStorage.getItem(filtersKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{
          searchTerm: string;
          selectedThemeId: string | null;
          selectedCategoryId: string | null;
          selectedSource: string;
          selectedApplicability: string;
          filterStartDate: string | null;
          filterEndDate: string | null;
        }>;

        if (typeof parsed.searchTerm === "string") setSearchTerm(parsed.searchTerm);
        if (typeof parsed.selectedThemeId === "string" || parsed.selectedThemeId === null) setSelectedThemeId(parsed.selectedThemeId ?? null);
        if (typeof parsed.selectedCategoryId === "string" || parsed.selectedCategoryId === null) setSelectedCategoryId(parsed.selectedCategoryId ?? null);
        if (typeof parsed.selectedSource === "string") setSelectedSource(parsed.selectedSource);
        if (typeof parsed.selectedApplicability === "string") setSelectedApplicability(parsed.selectedApplicability);
        if (typeof parsed.filterStartDate === "string" || parsed.filterStartDate === null) setFilterStartDate(parsed.filterStartDate ?? null);
        if (typeof parsed.filterEndDate === "string" || parsed.filterEndDate === null) setFilterEndDate(parsed.filterEndDate ?? null);
      }
    } catch {
      // ignore
    }

    // Restore scroll position (after paint)
    const rawScroll = sessionStorage.getItem(scrollKey);
    const scrollY = rawScroll ? Number(rawScroll) : NaN;
    if (!Number.isNaN(scrollY) && scrollY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    }

    hydratedRef.current = true;
  }, [filtersKey, scrollKey]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const payload = {
      searchTerm,
      selectedThemeId,
      selectedCategoryId,
      selectedSource,
      selectedApplicability,
      filterStartDate,
      filterEndDate,
    };
    try {
      sessionStorage.setItem(filtersKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [filtersKey, searchTerm, selectedThemeId, selectedCategoryId, selectedSource, selectedApplicability, filterStartDate, filterEndDate]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(scrollKey, String(window.scrollY));
        } catch {
          // ignore
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrollKey]);

  // Fetch themes with categories
  const { data: themes } = useThemesWithCategories();

  // Fetch legislation with categories for tree view
  const { data: legislationWithCategories, isLoading } = useLegislationWithCategories();

  // Fetch legislation applicabilities for user's organization
  const { data: legislationApplicabilitiesMap } = useQuery({
    queryKey: ["org-legislation-applicabilities", organizationId],
    queryFn: async () => {
      if (!organizationId) return {};
      const { data, error } = await supabase
        .from("organization_legislation")
        .select("legislation_id, applicability_type")
        .eq("organization_id", organizationId);
      if (error) throw error;
      
      const map: Record<string, string> = {};
      data?.forEach((a) => {
        map[a.legislation_id] = a.applicability_type || "nao_avaliado";
      });
      return map;
    },
    enabled: !!organizationId,
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-emerald-400" />
          Biblioteca de Legislação
        </h2>
        <p className="text-muted-foreground">
          Explore e pesquise toda a legislação disponível organizada por temas e categorias
        </p>
      </div>

      {/* Search Bar */}
      <Card className="bg-card/60 backdrop-blur-xl border-emerald-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
              <Input
                placeholder="Pesquisar legislação por título, número ou conteúdo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background/50 border-emerald-500/30 focus:border-emerald-400"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            
            {/* Origin Tabs */}
            <Tabs value={selectedSource} onValueChange={setSelectedSource} className="shrink-0">
              <TabsList className="bg-emerald-500/10">
                <TabsTrigger value="all" className="text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
                  Todos
                </TabsTrigger>
                <TabsTrigger value="dre" className="text-xs gap-1 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
                  <Flag className="h-3 w-3" />
                  PT
                </TabsTrigger>
                <TabsTrigger value="eurlex" className="text-xs gap-1 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
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
              showApplicability={!!organizationId}
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

      {/* Theme Icons Bar */}
      <Card className="bg-card/60 backdrop-blur-xl border-emerald-500/20 overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 overflow-x-auto pb-2">
            {/* All themes button */}
            <motion.button
              onClick={() => { setSelectedThemeId(null); setSelectedCategoryId(null); }}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 min-w-[100px] shrink-0",
                !selectedThemeId 
                  ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-2 border-emerald-500/50 shadow-md" 
                  : "bg-card/50 border-2 border-transparent hover:border-emerald-500/30 hover:bg-emerald-500/10"
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                !selectedThemeId ? "bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg" : "bg-muted text-muted-foreground"
              )}>
                <LayoutGrid className="h-6 w-6" />
              </div>
              <span className={cn(
                "text-xs font-medium",
                !selectedThemeId ? "text-emerald-400" : "text-muted-foreground"
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
                      : "bg-card/50 border-2 border-transparent hover:border-muted hover:bg-muted/50"
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
                    isSelected ? cn(config.bgLight, config.bgDark) : "bg-background"
                  )}>
                    <ThemeIcon className={cn("h-6 w-6", config.color)} />
                  </div>
                  <span className={cn(
                    "text-xs font-medium relative z-10 text-center leading-tight",
                    isSelected ? config.color : "text-muted-foreground"
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

      {/* Active Filters & Results Count */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-emerald-400">{filteredCount}</span> diploma{filteredCount !== 1 ? "s" : ""} encontrado{filteredCount !== 1 ? "s" : ""}
        </p>
        
        {hasActiveFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            {selectedSource !== "all" && (
              <Badge variant="secondary" className="gap-1 bg-blue-500/20 text-blue-400 border-blue-500/30">
                {selectedSource === "dre" ? <Flag className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                {selectedSource === "dre" ? "Portugal" : "UE"}
                <button onClick={() => setSelectedSource("all")} className="ml-1 hover:bg-blue-500/30 rounded-full p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {selectedThemeId && themes && (
              <Badge variant="secondary" className="gap-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <Tags className="h-3 w-3" />
                {themes.find(t => t.id === selectedThemeId)?.name}
                <button onClick={() => { setSelectedThemeId(null); setSelectedCategoryId(null); }} className="ml-1 hover:bg-emerald-500/30 rounded-full p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {selectedCategoryId && themes && (() => {
              const theme = themes.find(t => t.categories.some(c => c.id === selectedCategoryId));
              const category = theme?.categories.find(c => c.id === selectedCategoryId);
              return category ? (
                <Badge variant="secondary" className="gap-1 bg-teal-500/20 text-teal-400 border-teal-500/30">
                  <Folder className="h-3 w-3" />
                  {category.name}
                  <button onClick={() => setSelectedCategoryId(null)} className="ml-1 hover:bg-teal-500/30 rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ) : null;
            })()}
            {searchTerm && (
              <Badge variant="secondary" className="gap-1">
                <Search className="h-3 w-3" />
                "{searchTerm.slice(0, 20)}{searchTerm.length > 20 ? '...' : ''}"
                <button onClick={() => setSearchTerm("")} className="ml-1 hover:bg-muted rounded-full p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1"
              onClick={clearAllFilters}
            >
              <X className="h-3 w-3" />
              Limpar
            </Button>
          </div>
        )}
      </div>

      {/* Legislation Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : legislationWithCategories ? (
        <Card className="bg-card/60 backdrop-blur-xl border-emerald-500/20 overflow-hidden">
          <LegislationTreeView 
            legislation={legislationWithCategories} 
            hideFilters 
            externalThemeId={selectedThemeId}
            applicabilityMap={legislationApplicabilitiesMap}
            externalSearchTerm={searchTerm}
          />
        </Card>
      ) : (
        <Card className="py-20 bg-card/60 backdrop-blur-xl border-emerald-500/20">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <motion.div 
              className="p-6 rounded-full bg-emerald-500/10 mb-6"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <FileText className="h-12 w-12 text-emerald-400" />
            </motion.div>
            <h3 className="text-xl font-semibold mb-2">Nenhum diploma encontrado</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Não encontrámos legislação disponível com os filtros selecionados.
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                className="mt-6 gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                onClick={clearAllFilters}
              >
                <X className="h-4 w-4" />
                Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
