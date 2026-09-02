import { useState, useMemo, useEffect } from "react";
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
  Menu,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories } from "@/hooks/useLegislation";
import { usePendingRequirements } from "@/hooks/usePendingRequirements";
import { LegislationTreeView } from "@/components/admin/LegislationTreeView";
import { AdvancedSearchDialog } from "@/components/AdvancedSearchDialog";
import { ExportApplicableDialog } from "@/components/client/ExportApplicableDialog";

import { IDTopNav } from "@/components/client/IDTopNav";
import {
  IDBackground,
  IDParticles,
  IDHeroSection,
  IDCard,
} from "@/components/client/IDBackground";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OrganizationSelector } from "@/components/OrganizationSelector";
import { cn } from "@/lib/utils";

// Theme icons and colors mapping
import heroBiblioteca from "@/assets/module-legislation-new.jpg";
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

// Enhanced warm theme configuration with distinct colors per theme
const themeConfig: Record<
  string,
  {
    icon: React.ElementType;
    color: string;
    bgLight: string;
    bgDark: string;
    border: string;
    gradient: string;
    gradientDark: string;
    ring: string;
  }
> = {
  Ambiente: {
    icon: Leaf,
    color: "text-primary ",
    bgLight: "bg-primary",
    bgDark: "",
    border: "border-primary ",
    gradient: "from-primary to-teal-700",
    gradientDark: " dark:to-teal-600",
    ring: "ring-primary/40 ",
  },
  SST: {
    icon: Shield,
    color: "text-orange-600 dark:text-orange-400",
    bgLight: "bg-orange-100",
    bgDark: "dark:bg-orange-900/40",
    border: "border-orange-300 dark:border-orange-700",
    gradient: "from-orange-500 to-red-600",
    gradientDark: "dark:from-orange-400 dark:to-red-500",
    ring: "ring-orange-300/40 dark:ring-orange-500/30",
  },
  "Segurança e Saúde no Trabalho": {
    icon: Shield,
    color: "text-orange-600 dark:text-orange-400",
    bgLight: "bg-orange-100",
    bgDark: "dark:bg-orange-900/40",
    border: "border-orange-300 dark:border-orange-700",
    gradient: "from-orange-500 to-red-600",
    gradientDark: "dark:from-orange-400 dark:to-red-500",
    ring: "ring-orange-300/40 dark:ring-orange-500/30",
  },
  Energia: {
    icon: Zap,
    color: "text-primary ",
    bgLight: "bg-accent",
    bgDark: "",
    border: "border-primary ",
    gradient: "from-primary to-yellow-600",
    gradientDark: " dark:to-yellow-500",
    ring: "ring-primary/40 ",
  },
  Qualidade: {
    icon: Award,
    color: "text-sky-600 dark:text-sky-400",
    bgLight: "bg-sky-100",
    bgDark: "dark:bg-sky-900/40",
    border: "border-sky-300 dark:border-sky-700",
    gradient: "from-sky-500 to-blue-600",
    gradientDark: "dark:from-sky-400 dark:to-blue-500",
    ring: "ring-sky-300/40 dark:ring-sky-500/30",
  },
  Segurança: {
    icon: Shield,
    color: "text-rose-600 dark:text-rose-400",
    bgLight: "bg-rose-100",
    bgDark: "dark:bg-rose-900/40",
    border: "border-rose-300 dark:border-rose-700",
    gradient: "from-rose-500 to-red-600",
    gradientDark: "dark:from-rose-400 dark:to-red-500",
    ring: "ring-rose-300/40 dark:ring-rose-500/30",
  },
  "Conciliação Familiar e Profissional": {
    icon: Heart,
    color: "text-pink-600 dark:text-pink-400",
    bgLight: "bg-pink-100",
    bgDark: "dark:bg-pink-900/40",
    border: "border-pink-300 dark:border-pink-700",
    gradient: "from-pink-500 to-rose-600",
    gradientDark: "dark:from-pink-400 dark:to-rose-500",
    ring: "ring-pink-300/40 dark:ring-pink-500/30",
  },
};

// Default theme config fallback
const defaultThemeConfig = {
  icon: Folder,
  color: "text-muted-foreground ",
  bgLight: "bg-muted",
  bgDark: "",
  border: "border-border ",
  gradient: "from-border to-border",
  gradientDark: " ",
  ring: "ring-border/40 ",
};

const getThemeImage = (themeName: string): string | undefined => {
  const normalized = themeName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    themeImages[normalized] ||
    themeImages[
      Object.keys(themeImages).find((k) => normalized.includes(k)) || ""
    ]
  );
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
  const { user, isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedApplicability, setSelectedApplicability] =
    useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Fetch themes with categories
  const { data: allThemes } = useThemesWithCategories();

  // Fetch legislation with categories for tree view
  const { data: legislationWithCategories, isLoading } =
    useLegislationWithCategories();

  // Fetch user's organizations (admins see every organization)
  const { data: userRoles } = useQuery({
    queryKey: ["user-roles", user?.id, isAdmin],
    queryFn: async () => {
      if (!user?.id) return [];
      if (isAdmin) {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, logo_url")
          .order("name");
        if (error) throw error;
        return (data || []).map((o) => ({
          organization_id: o.id,
          organizations: o,
        }));
      }
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
  const organizations =
    userRoles
      ?.map((r) => ({
        id: r.organization_id as string,
        name: (r.organizations as any)?.name as string,
        logo_url: (r.organizations as any)?.logo_url as string | undefined,
      }))
      .filter((o) => o.id && o.name) || [];

  const organizationIds = selectedOrgId
    ? [selectedOrgId]
    : userRoles?.map((r) => r.organization_id).filter(Boolean) || [];

  const currentOrg =
    organizations.find((o) => o.id === (selectedOrgId || organizationIds[0])) ||
    organizations[0];

  // Requisitos por avaliar por diploma (organização atual)
  const { data: pendingRequirementsMap } = usePendingRequirements(currentOrg?.id);



  // Themes assigned to the current organization
  const { data: orgThemeIds } = useQuery({
    queryKey: ["organization-themes", currentOrg?.id],
    queryFn: async () => {
      if (!currentOrg?.id) return [] as string[];
      const { data, error } = await supabase
        .from("organization_themes")
        .select("theme_id")
        .eq("organization_id", currentOrg.id);
      if (error) throw error;
      return (data || []).map((t) => t.theme_id as string);
    },
    enabled: !!currentOrg?.id,
  });

  // Only show themes assigned to the organization (all themes for admins/no org)
  const themes = useMemo(() => {
    if (!allThemes) return allThemes;
    if (!currentOrg?.id || !orgThemeIds) return allThemes;
    if (orgThemeIds.length === 0) return [];
    return allThemes.filter((t) => orgThemeIds.includes(t.id));
  }, [allThemes, orgThemeIds, currentOrg?.id]);

  // Clear theme selection if it is no longer visible
  useEffect(() => {
    if (selectedThemeId && themes && !themes.some((t) => t.id === selectedThemeId)) {
      setSelectedThemeId(null);
      setSelectedCategoryId(null);
    }
  }, [themes, selectedThemeId]);


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
      const matchesSearch =
        !searchTerm ||
        leg.title?.toLowerCase().includes(searchLower) ||
        leg.number?.toLowerCase().includes(searchLower) ||
        leg.summary?.toLowerCase().includes(searchLower);

      const matchesSource =
        selectedSource === "all" || leg.source === selectedSource;

      let matchesThemeCategory = true;
      if (selectedCategoryId) {
        matchesThemeCategory = leg.categories.some(
          (cat) => cat.id === selectedCategoryId,
        );
      } else if (selectedThemeId && themes) {
        const selectedTheme = themes.find((t) => t.id === selectedThemeId);
        matchesThemeCategory = leg.categories.some(
          (cat) => cat.theme_name === selectedTheme?.name,
        );
      }

      return matchesSearch && matchesSource && matchesThemeCategory;
    }).length;
  }, [
    legislationWithCategories,
    searchTerm,
    selectedSource,
    selectedThemeId,
    selectedCategoryId,
    themes,
  ]);

  const hasActiveFilters = !!(
    selectedThemeId ||
    selectedCategoryId ||
    selectedSource !== "all" ||
    filterStartDate ||
    filterEndDate ||
    selectedApplicability !== "all" ||
    searchTerm
  );

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
    <div className="min-h-screen relative overflow-hidden">
      {/* I&D Inspired Background */}
      <IDBackground />

      {/* Main Content */}
      <div className="relative z-10">
        <IDTopNav
          currentOrg={currentOrg}
          actions={
            <>
              {organizations.length > 1 && (
                <OrganizationSelector
                  organizations={organizations}
                  selectedOrgId={selectedOrgId}
                  onSelect={setSelectedOrgId}
                />
              )}
              <ThemeToggle />
            </>
          }
        />

        {/* Page Content */}
        <main className="p-4 lg:p-8 space-y-5">
          {/* Hero Header - I&D Style */}
          <IDHeroSection
            title="Biblioteca de Legislação"
            subtitle="Consulta e acompanhamento de toda a legislação aplicável à sua organização"
            badge="Gestão Documental"
            icon={BookOpen}
            image={heroBiblioteca}
            imageAlt="Estantes de documentação legal"
            stats={[
              {
                label: "Diplomas",
                value: legislationWithCategories?.length || 0,
              },
              { label: "Filtrados", value: filteredCount },
            ]}
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
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary " />
                    <Input
                      placeholder="Pesquisar legislação..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-accent/50 border-border/80 focus:border-primary focus:ring-primary/20 text-foreground dark:text-white placeholder:text-muted-foreground "
                    />
                    {searchTerm && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-accent "
                        onClick={() => setSearchTerm("")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Origin Tabs - Warm green style */}
                  <Tabs
                    value={selectedSource}
                    onValueChange={setSelectedSource}
                    className="shrink-0"
                  >
                    <TabsList className="bg-muted border border-border/60 ">
                      <TabsTrigger
                        value="all"
                        className="text-xs data-[state=active]:bg-primary data-[state=active]:text-white dark:data-[state=active]:bg-primary"
                      >
                        Todos
                      </TabsTrigger>
                      <TabsTrigger
                        value="dre"
                        className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white dark:data-[state=active]:bg-primary"
                      >
                        <Flag className="h-3 w-3" />
                        PT
                      </TabsTrigger>
                      <TabsTrigger
                        value="eurlex"
                        className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-white dark:data-[state=active]:bg-primary"
                      >
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

                  <ExportApplicableDialog
                    organizationId={currentOrg?.id}
                    organizationName={currentOrg?.name}
                    themes={(themes || []).map((t) => ({ id: t.id, name: t.name }))}
                    legislation={legislationWithCategories || []}
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
                    onClick={() => {
                      setSelectedThemeId(null);
                      setSelectedCategoryId(null);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 min-w-[90px] shrink-0",
                      !selectedThemeId
                        ? "bg-gradient-to-br from-primary to-primary text-white shadow-md ring-2 ring-primary/30 "
                        : "bg-muted border border-border/60 hover:bg-accent text-muted-foreground ",
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        !selectedThemeId ? "bg-white/20" : "bg-white ",
                      )}
                    >
                      <LayoutGrid
                        className={cn(
                          "h-5 w-5",
                          !selectedThemeId ? "text-white" : "text-primary ",
                        )}
                      />
                    </div>
                    <span className="text-xs font-medium">Todos</span>
                  </motion.button>

                  {/* Theme buttons */}
                  {themes?.map((theme, index) => {
                    const config =
                      themeConfig[theme.name] || defaultThemeConfig;
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
                            ? `bg-gradient-to-br ${config.gradient} ${config.gradientDark} text-white shadow-md ring-2 ${config.ring}`
                            : "bg-muted border border-border/60 hover:bg-accent text-muted-foreground ",
                        )}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.05 * index }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            isSelected
                              ? "bg-white/20"
                              : `bg-white ${config.border}`,
                          )}
                        >
                          <ThemeIcon
                            className={cn(
                              "h-5 w-5",
                              isSelected ? "text-white" : config.color,
                            )}
                          />
                        </div>
                        <span className="text-xs font-medium text-center leading-tight">
                          {theme.name.length > 10
                            ? theme.name.substring(0, 10) + "..."
                            : theme.name}
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
            <p className="text-sm text-muted-foreground ">
              <span className="font-semibold text-primary ">
                {filteredCount}
              </span>{" "}
              diploma{filteredCount !== 1 ? "s" : ""} encontrado
              {filteredCount !== 1 ? "s" : ""}
            </p>

            {hasActiveFilters && (
              <div className="flex items-center gap-2 flex-wrap">
                {selectedSource !== "all" && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-accent text-primary border-0"
                  >
                    {selectedSource === "dre" ? (
                      <Flag className="h-3 w-3" />
                    ) : (
                      <Globe className="h-3 w-3" />
                    )}
                    {selectedSource === "dre" ? "Portugal" : "UE"}
                    <button
                      onClick={() => setSelectedSource("all")}
                      className="ml-1 hover:bg-accent rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {selectedThemeId && themes && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-primary text-primary border-0"
                  >
                    <Tags className="h-3 w-3" />
                    {themes.find((t) => t.id === selectedThemeId)?.name}
                    <button
                      onClick={() => {
                        setSelectedThemeId(null);
                        setSelectedCategoryId(null);
                      }}
                      className="ml-1 hover:bg-primary rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {selectedCategoryId &&
                  themes &&
                  (() => {
                    const theme = themes.find((t) =>
                      t.categories.some((c) => c.id === selectedCategoryId),
                    );
                    const category = theme?.categories.find(
                      (c) => c.id === selectedCategoryId,
                    );
                    return category ? (
                      <Badge
                        variant="secondary"
                        className="gap-1 bg-orange-100 text-orange-800 dark:bg-orange-800/40 dark:text-orange-200 border-0"
                      >
                        <Folder className="h-3 w-3" />
                        {category.name}
                        <button
                          onClick={() => setSelectedCategoryId(null)}
                          className="ml-1 hover:bg-orange-200 dark:hover:bg-orange-700 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })()}
                {searchTerm && (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-muted text-foreground border-0"
                  >
                    <Search className="h-3 w-3" />"{searchTerm.slice(0, 20)}
                    {searchTerm.length > 20 ? "..." : ""}"
                    <button
                      onClick={() => setSearchTerm("")}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
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
                  <Skeleton
                    key={i}
                    className="h-32 w-full rounded-xl bg-accent/50 "
                  />
                ))}
              </div>
            ) : legislationWithCategories ? (
              <IDCard className="overflow-hidden">
                <LegislationTreeView
                  legislation={legislationWithCategories}
                  hideFilters
                  externalThemeId={selectedThemeId}
                  applicabilityMap={legislationApplicabilitiesMap}
                  editableOrganizationId={isAdmin && currentOrg?.id ? currentOrg.id : undefined}
                  externalSearchTerm={searchTerm}
                />
              </IDCard>
            ) : (
              <IDCard className="py-20">
                <CardContent className="flex flex-col items-center justify-center text-center">
                  <motion.div
                    className="p-6 rounded-full bg-gradient-to-br from-primary to-primary mb-6"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <FileText className="h-12 w-12 text-primary " />
                  </motion.div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground dark:text-white">
                    Nenhum diploma encontrado
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Não encontrámos legislação disponível com os filtros
                    selecionados.
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      className="mt-6 gap-2 border-primary text-primary hover:bg-accent "
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
