import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  FileText, 
  Search, 
  ExternalLink,
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
  LayoutGrid,
  List,
  Eye,
  ListChecks,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Folder
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { pt } from "date-fns/locale";
import { useThemesWithCategories, ThemeCategory } from "@/hooks/useThemes";
import { useLegislationWithCategories } from "@/hooks/useLegislation";
import { CategoryTreeFilter } from "@/components/CategoryTreeFilter";
import { getLegislationApplicabilityInfo } from "@/components/LegislationApplicabilitySelect";
import { AdvancedSearchDialog } from "@/components/AdvancedSearchDialog";

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

const ITEMS_PER_PAGE = 25;

export default function Biblioteca() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedApplicability, setSelectedApplicability] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch themes with categories
  const { data: themes } = useThemesWithCategories();

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

  // Fetch legislation with categories
  const { data: legislation, isLoading } = useQuery({
    queryKey: ["biblioteca-legislation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select(`
          *,
          legislation_category_mapping(
            category_id,
            theme_categories(id, name, theme_id, parent_id, themes(id, name))
          ),
          legal_requirements(id)
        `)
        .order("publication_date", { ascending: false });
      if (error) throw error;
      return data;
    },
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

  // Helper to get legislation's applicability
  const getLegislationApplicabilityType = (legId: string) => {
    return legislationApplicabilitiesMap?.[legId] || "nao_avaliado";
  };

  // Filter legislation
  const filteredLegislation = useMemo(() => {
    if (!legislation) return [];
    
    return legislation.filter((leg) => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        leg.title?.toLowerCase().includes(searchLower) ||
        leg.number?.toLowerCase().includes(searchLower) ||
        leg.summary?.toLowerCase().includes(searchLower) ||
        leg.entity?.toLowerCase().includes(searchLower);

      // Source filter
      const matchesSource = selectedSource === "all" || leg.source === selectedSource;

      // Date range filter
      let matchesDateRange = true;
      if (filterStartDate && leg.publication_date) {
        matchesDateRange = leg.publication_date >= filterStartDate;
      }
      if (matchesDateRange && filterEndDate && leg.publication_date) {
        matchesDateRange = leg.publication_date <= filterEndDate;
      }
      if ((filterStartDate || filterEndDate) && !leg.publication_date) {
        matchesDateRange = false;
      }

      // Applicability filter
      let matchesApplicability = true;
      if (selectedApplicability !== "all" && userOrganization) {
        const applicabilityType = getLegislationApplicabilityType(leg.id);
        
        if (selectedApplicability === "pending") {
          matchesApplicability = applicabilityType === "nao_avaliado";
        } else if (selectedApplicability === "has_any") {
          matchesApplicability = applicabilityType !== "nao_avaliado";
        } else {
          matchesApplicability = applicabilityType === selectedApplicability;
        }
      }

      // Theme and category filter
      let matchesThemeCategory = true;
      if (selectedCategoryId && leg.legislation_category_mapping) {
        matchesThemeCategory = leg.legislation_category_mapping.some((mapping: any) => {
          if (mapping.theme_categories?.id === selectedCategoryId) return true;
          let currentParent = mapping.theme_categories?.parent_id;
          while (currentParent) {
            if (currentParent === selectedCategoryId) return true;
            const parentCat = leg.legislation_category_mapping.find(
              (m: any) => m.theme_categories?.id === currentParent
            );
            currentParent = parentCat?.theme_categories?.parent_id || null;
          }
          return false;
        });
      } else if (selectedThemeId && leg.legislation_category_mapping) {
        matchesThemeCategory = leg.legislation_category_mapping.some(
          (mapping: any) => mapping.theme_categories?.theme_id === selectedThemeId
        );
      } else if (selectedThemeId && !leg.legislation_category_mapping?.length) {
        matchesThemeCategory = false;
      }

      return matchesSearch && matchesSource && matchesDateRange && matchesThemeCategory && matchesApplicability;
    });
  }, [legislation, searchTerm, selectedSource, selectedThemeId, selectedCategoryId, filterStartDate, filterEndDate, selectedApplicability, legislationApplicabilitiesMap, userOrganization]);

  // Pagination
  const totalPages = Math.ceil(filteredLegislation.length / ITEMS_PER_PAGE);
  const paginatedLegislation = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLegislation.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLegislation, currentPage]);

  // Reset to page 1 when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSource, selectedThemeId, selectedCategoryId, filterStartDate, filterEndDate, selectedApplicability]);

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

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-gradient-to-r from-primary/5 via-primary/10 to-background sticky top-0 z-10 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to={user ? "/dashboard" : "/"}>
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Biblioteca de Legislação</h1>
                <p className="text-sm text-muted-foreground">
                  Explore e pesquise toda a legislação disponível
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Diplomas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <Flag className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.pt || 0}</p>
                  <p className="text-xs text-muted-foreground">DRE (PT)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Globe className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.eu || 0}</p>
                  <p className="text-xs text-muted-foreground">EUR-Lex (EU)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Sparkles className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.last7Days || 0}</p>
                  <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.last30Days || 0}</p>
                  <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-teal-500/10 to-teal-500/5 border-teal-500/20">
            <CardContent className="p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-teal-500/20">
                      <Tags className="h-4 w-4 text-teal-600" />
                    </div>
                    <p className="text-lg font-bold">{stats?.categorizedPercent || 0}%</p>
                  </div>
                </div>
                <Progress value={stats?.categorizedPercent || 0} className="h-1.5" />
                <p className="text-xs text-muted-foreground">Categorizados</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
              {/* Origin Tabs */}
              <Tabs value={selectedSource} onValueChange={setSelectedSource} className="w-full lg:w-auto">
                <TabsList className="grid w-full grid-cols-3 lg:w-auto">
                  <TabsTrigger value="all" className="gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    <span className="hidden sm:inline">Todos</span>
                  </TabsTrigger>
                  <TabsTrigger value="dre" className="gap-1.5">
                    <Flag className="h-4 w-4" />
                    <span className="hidden sm:inline">DRE</span>
                  </TabsTrigger>
                  <TabsTrigger value="eurlex" className="gap-1.5">
                    <Globe className="h-4 w-4" />
                    <span className="hidden sm:inline">EUR-Lex</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Theme/Category Filter */}
              {themes && (
                <CategoryTreeFilter
                  themes={themes}
                  selectedThemeId={selectedThemeId}
                  selectedCategoryId={selectedCategoryId}
                  onThemeSelect={setSelectedThemeId}
                  onCategorySelect={setSelectedCategoryId}
                />
              )}

              {/* Search bar */}
              <div className="relative flex-1 w-full lg:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por título, número ou entidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
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

              {/* Advanced Search & View Mode */}
              <div className="flex items-center gap-2">
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

                <div className="flex border rounded-lg">
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    className="rounded-r-none"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="rounded-l-none"
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Active Filters Chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                {selectedThemeId && !selectedCategoryId && themes && (
                  <Badge variant="default" className="gap-1.5 pr-1">
                    <Tags className="h-3 w-3" />
                    {themes.find(t => t.id === selectedThemeId)?.name}
                    <button
                      onClick={() => setSelectedThemeId(null)}
                      className="ml-1 rounded-full hover:bg-primary-foreground/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {selectedCategoryId && themes && (() => {
                  const theme = themes.find(t => t.categories.some(c => c.id === selectedCategoryId));
                  const category = theme?.categories.find(c => c.id === selectedCategoryId);
                  return theme && category ? (
                    <Badge variant="default" className="gap-1.5 pr-1">
                      <Tags className="h-3 w-3" />
                      {theme.name} → {category.name}
                      <button
                        onClick={() => {
                          setSelectedCategoryId(null);
                          setSelectedThemeId(null);
                        }}
                        className="ml-1 rounded-full hover:bg-primary-foreground/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })()}
                {(filterStartDate || filterEndDate) && (
                  <Badge variant="secondary" className="gap-1.5 pr-1">
                    <Calendar className="h-3 w-3" />
                    {filterStartDate && filterEndDate
                      ? `${format(new Date(filterStartDate), "dd/MM/yyyy")} → ${format(new Date(filterEndDate), "dd/MM/yyyy")}`
                      : filterStartDate
                        ? `De ${format(new Date(filterStartDate), "dd/MM/yyyy")}`
                        : `Até ${format(new Date(filterEndDate!), "dd/MM/yyyy")}`
                    }
                    <button
                      onClick={() => {
                        setFilterStartDate(null);
                        setFilterEndDate(null);
                      }}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {selectedApplicability !== "all" && (
                  <Badge variant="secondary" className="gap-1.5 pr-1">
                    <CheckCircle className="h-3 w-3" />
                    {applicabilityFilterOptions.find(o => o.value === selectedApplicability)?.label}
                    <button
                      onClick={() => setSelectedApplicability("all")}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {searchTerm && (
                  <Badge variant="secondary" className="gap-1.5 pr-1">
                    <Search className="h-3 w-3" />
                    "{searchTerm}"
                    <button
                      onClick={() => setSearchTerm("")}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-6 text-xs text-muted-foreground hover:text-foreground"
                >
                  Limpar tudo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Info */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredLegislation.length} diploma{filteredLegislation.length !== 1 ? "s" : ""} encontrado{filteredLegislation.length !== 1 ? "s" : ""}
            {totalPages > 1 && ` • Página ${currentPage} de ${totalPages}`}
          </p>
        </div>

        {/* Legislation List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : filteredLegislation.length === 0 ? (
          <Card className="py-16">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Nenhum diploma encontrado</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Não encontrámos legislação com os filtros selecionados. Tente ajustar os critérios de pesquisa.
              </p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearAllFilters} className="mt-4">
                  Limpar filtros
                </Button>
              )}
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedLegislation.map((leg) => {
              const requirementsCount = leg.legal_requirements?.length || 0;
              const applicabilityType = legislationApplicabilitiesMap?.[leg.id];
              const applicabilityInfo = applicabilityType ? getLegislationApplicabilityInfo(applicabilityType) : null;
              const showApplicability = applicabilityInfo && applicabilityType !== "nao_avaliado";
              const isNotEvaluated = legislationApplicabilitiesMap && (!applicabilityType || applicabilityType === "nao_avaliado");

              return (
                <Card 
                  key={leg.id} 
                  className={`group hover:shadow-lg transition-all duration-200 overflow-hidden ${
                    isNotEvaluated ? "border-l-4 border-l-amber-400" : ""
                  } ${
                    leg.origin === "PT" 
                      ? "hover:border-green-300" 
                      : "hover:border-blue-300"
                  }`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            leg.origin === "PT"
                              ? "bg-green-500/10 text-green-700 border-green-300"
                              : "bg-blue-500/10 text-blue-700 border-blue-300"
                          }`}
                        >
                          {leg.origin === "PT" ? (
                            <><Flag className="h-3 w-3 mr-1" />DRE</>
                          ) : (
                            <><Globe className="h-3 w-3 mr-1" />EU</>
                          )}
                        </Badge>
                        {showApplicability && (
                          <Badge variant="outline" className={`text-xs ${applicabilityInfo.color}`}>
                            {applicabilityInfo.label}
                          </Badge>
                        )}
                        {isNotEvaluated && userOrganization && (
                          <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <Link to={`/legislacao/${leg.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {leg.document_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <Link to={`/legislacao/${leg.id}`} className="block group-hover:text-primary transition-colors">
                      <p className="font-semibold text-sm">{leg.number}</p>
                      <p className="text-sm text-foreground/80 line-clamp-2 mt-1">{leg.title}</p>
                    </Link>

                    {/* Summary */}
                    {leg.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{leg.summary}</p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      {leg.publication_date && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(leg.publication_date), "dd MMM yyyy", { locale: pt })}
                        </span>
                      )}
                      {requirementsCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <ListChecks className="h-3 w-3 mr-1" />
                          {requirementsCount} req.
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedLegislation.map((leg) => {
              const requirementsCount = leg.legal_requirements?.length || 0;
              const applicabilityType = legislationApplicabilitiesMap?.[leg.id];
              const applicabilityInfo = applicabilityType ? getLegislationApplicabilityInfo(applicabilityType) : null;
              const showApplicability = applicabilityInfo && applicabilityType !== "nao_avaliado";
              const isNotEvaluated = legislationApplicabilitiesMap && (!applicabilityType || applicabilityType === "nao_avaliado");

              return (
                <Card 
                  key={leg.id}
                  className={`group hover:shadow-md transition-all duration-200 ${
                    isNotEvaluated ? "border-l-4 border-l-amber-400" : ""
                  } ${
                    leg.origin === "PT" 
                      ? "hover:border-green-300" 
                      : "hover:border-blue-300"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Origin Indicator */}
                      <div className={`p-2 rounded-lg shrink-0 ${
                        leg.origin === "PT" 
                          ? "bg-green-500/10" 
                          : "bg-blue-500/10"
                      }`}>
                        {leg.origin === "PT" ? (
                          <Flag className="h-5 w-5 text-green-600" />
                        ) : (
                          <Globe className="h-5 w-5 text-blue-600" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            {/* Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                              <Badge variant="outline" className="text-xs">
                                {leg.origin === "PT" ? "DRE" : "EUR-Lex"}
                              </Badge>
                              {showApplicability && (
                                <Badge variant="outline" className={`text-xs ${applicabilityInfo.color}`}>
                                  {applicabilityInfo.label}
                                </Badge>
                              )}
                              {isNotEvaluated && userOrganization && (
                                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-300">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Pendente
                                </Badge>
                              )}
                              {requirementsCount > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  <ListChecks className="h-3 w-3 mr-1" />
                                  {requirementsCount}
                                </Badge>
                              )}
                            </div>

                            {/* Title */}
                            <Link to={`/legislacao/${leg.id}`} className="group-hover:text-primary transition-colors">
                              <p className="font-semibold">{leg.number}</p>
                              <p className="text-sm text-foreground/80 line-clamp-1">{leg.title}</p>
                            </Link>

                            {/* Summary */}
                            {leg.summary && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{leg.summary}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            {leg.publication_date && (
                              <span className="text-xs text-muted-foreground mr-2 hidden sm:block">
                                {format(new Date(leg.publication_date), "dd/MM/yyyy")}
                              </span>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <Link to={`/legislacao/${leg.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            {leg.document_url && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="icon"
                    onClick={() => goToPage(pageNum)}
                    className="w-9"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
