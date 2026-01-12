import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Sparkles
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
    <div className="min-h-screen bg-background">
      {/* Hero Header with Image */}
      <header className="relative border-b overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img 
            src={bibliotecaHero} 
            alt="" 
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/80" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 container mx-auto flex items-center justify-between px-4 py-6">
          <div className="flex items-center gap-4">
            <Link to={user ? "/dashboard" : "/"}>
              <Button variant="ghost" size="icon" className="rounded-full bg-background/50 backdrop-blur-sm">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Biblioteca de Legislação</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Explore e pesquise toda a legislação disponível organizada por temas e categorias
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
                  placeholder="Pesquisar por título, número ou palavras no sumário..."
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
                {selectedSource !== "all" && (
                  <Badge variant="secondary" className="gap-1.5 pr-1">
                    {selectedSource === "dre" ? <Flag className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                    {selectedSource === "dre" ? "DRE" : "EUR-Lex"}
                    <button
                      onClick={() => setSelectedSource("all")}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
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
            {filteredCount} diploma{filteredCount !== 1 ? "s" : ""} encontrado{filteredCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Tree View */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : legislationWithCategories ? (
          <LegislationTreeView 
            legislation={legislationWithCategories} 
            hideFilters 
            externalThemeId={selectedThemeId}
            applicabilityMap={legislationApplicabilitiesMap}
            externalSearchTerm={searchTerm}
          />
        ) : (
          <Card className="py-16">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="p-4 rounded-full bg-muted mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Nenhum diploma encontrado</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Não encontrámos legislação disponível.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
