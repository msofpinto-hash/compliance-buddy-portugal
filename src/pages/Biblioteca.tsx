import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Search, 
  ExternalLink,
  ArrowLeft,
  Calendar,
  Building2
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { CategoryTreeFilter } from "@/components/CategoryTreeFilter";

export default function Biblioteca() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);

  // Fetch themes with categories
  const { data: themes } = useThemesWithCategories();

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
          )
        `)
        .order("publication_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

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

      // Theme and category filter
      let matchesThemeCategory = true;
      if (selectedCategoryId && leg.legislation_category_mapping) {
        // Filter by specific category (including children)
        matchesThemeCategory = leg.legislation_category_mapping.some((mapping: any) => {
          if (mapping.theme_categories?.id === selectedCategoryId) return true;
          // Check if it's a child of the selected category
          let currentParent = mapping.theme_categories?.parent_id;
          while (currentParent) {
            if (currentParent === selectedCategoryId) return true;
            // Find the parent category
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

      return matchesSearch && matchesSource && matchesDateRange && matchesThemeCategory;
    });
  }, [legislation, searchTerm, selectedSource, selectedThemeId, selectedCategoryId, filterStartDate, filterEndDate]);

  // Get unique themes from legislation mappings
  const getLegislationThemes = (leg: any) => {
    if (!leg.legislation_category_mapping) return [];
    const themeSet = new Map<string, string>();
    leg.legislation_category_mapping.forEach((mapping: any) => {
      if (mapping.theme_categories?.themes) {
        themeSet.set(mapping.theme_categories.themes.id, mapping.theme_categories.themes.name);
      }
    });
    return Array.from(themeSet.values());
  };

  // Get categories for a legislation item
  const getLegislationCategories = (leg: any) => {
    if (!leg.legislation_category_mapping) return [];
    return leg.legislation_category_mapping
      .filter((mapping: any) => mapping.theme_categories?.name)
      .map((mapping: any) => mapping.theme_categories.name);
  };

  const hasActiveFilters = selectedThemeId || selectedCategoryId || selectedSource !== "all" || filterStartDate || filterEndDate;

  const clearAllFilters = () => {
    setSelectedThemeId(null);
    setSelectedCategoryId(null);
    setSelectedSource("all");
    setFilterStartDate(null);
    setFilterEndDate(null);
    setSearchTerm("");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to={user ? "/dashboard" : "/"}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Biblioteca de Legislação</h1>
              <p className="text-sm text-muted-foreground">
                Pesquise e explore toda a legislação
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por título, número ou entidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Filter buttons */}
              <div className="flex flex-wrap gap-2 items-center">
                {themes && (
                  <CategoryTreeFilter
                    themes={themes}
                    selectedThemeId={selectedThemeId}
                    selectedCategoryId={selectedCategoryId}
                    onThemeSelect={setSelectedThemeId}
                    onCategorySelect={setSelectedCategoryId}
                  />
                )}
                
                <DateRangeFilter
                  startDate={filterStartDate}
                  endDate={filterEndDate}
                  onStartDateChange={setFilterStartDate}
                  onEndDateChange={setFilterEndDate}
                  label="Período"
                />

                <Button
                  variant={selectedSource === "dre" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSource(selectedSource === "dre" ? "all" : "dre")}
                >
                  DRE
                </Button>
                <Button
                  variant={selectedSource === "eurlex" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSource(selectedSource === "eurlex" ? "all" : "eurlex")}
                >
                  EUR-Lex
                </Button>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="text-muted-foreground"
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results count */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredLegislation.length} diploma{filteredLegislation.length !== 1 ? "s" : ""} encontrado{filteredLegislation.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Legislation List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : filteredLegislation.length > 0 ? (
          <div className="space-y-4">
            {filteredLegislation.map((leg) => {
              const legThemes = getLegislationThemes(leg);
              const legCategories = getLegislationCategories(leg);
              return (
                <Card key={leg.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header with badges */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant={leg.source === "dre" ? "default" : leg.source === "eurlex" ? "secondary" : "outline"}>
                            {leg.source === "dre" ? "DRE" : leg.source === "eurlex" ? "EUR-Lex" : "Manual"}
                          </Badge>
                          <span className="font-semibold">{leg.number}</span>
                          {leg.revocation_date && (
                            <Badge variant="destructive">Revogado</Badge>
                          )}
                        </div>

                        {/* Title - Link to details */}
                        <Link to={`/legislacao/${leg.id}`} className="block hover:underline">
                          <h3 className="font-medium text-lg mb-2">{leg.title}</h3>
                        </Link>

                        {/* Summary */}
                        {leg.summary && (
                          <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                            {leg.summary}
                          </p>
                        )}

                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                          {leg.entity && (
                            <div className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              {leg.entity}
                            </div>
                          )}
                          {leg.publication_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(leg.publication_date), "d MMMM yyyy", { locale: pt })}
                            </div>
                          )}
                        </div>

                        {/* Themes and Categories */}
                        <div className="flex flex-wrap gap-1">
                          {legThemes.map((themeName, idx) => (
                            <Badge key={`theme-${idx}`} variant="outline" className="text-xs">
                              {themeName}
                            </Badge>
                          ))}
                          {legCategories.slice(0, 3).map((catName, idx) => (
                            <Badge key={`cat-${idx}`} variant="secondary" className="text-xs">
                              {catName}
                            </Badge>
                          ))}
                          {legCategories.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{legCategories.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 shrink-0">
                        <Link to={`/legislacao/${leg.id}`}>
                          <Button variant="default" size="sm" className="gap-2 w-full">
                            <FileText className="h-4 w-4" />
                            Ver Detalhes
                          </Button>
                        </Link>
                        {leg.document_url && (
                          <a
                            href={leg.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm" className="gap-2 w-full">
                              <ExternalLink className="h-4 w-4" />
                              Documento
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium text-lg mb-2">Nenhum diploma encontrado</h3>
              <p className="text-muted-foreground">
                Tente ajustar os filtros de pesquisa
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
