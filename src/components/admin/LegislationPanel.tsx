import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, FileText, Loader2, Calendar, Building2, Tags, FileEdit, Search, CalendarDays, Link2, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle } from "lucide-react";
import { useLegislationWithCategories, type LegislationWithCategories } from "@/hooks/useLegislation";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { AssignCategoriesDialog } from "./AssignCategoriesDialog";
import { ManageRequirementsDialog } from "./ManageRequirementsDialog";
import { EditLegislationDatesDialog } from "./EditLegislationDatesDialog";
import { ManageRelationsDialog } from "./ManageRelationsDialog";
import { LegislationTimeline } from "./LegislationTimeline";
import { LegislationRelationsBadges } from "./LegislationRelationsBadges";

type SortField = "title" | "number" | "publication_date" | "theme";
type SortOrder = "asc" | "desc";

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function LegislationPanel() {
  const { data: legislation, isLoading, error } = useLegislationWithCategories();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("publication_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterTheme, setFilterTheme] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterNoCategory, setFilterNoCategory] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [selectedLegislation, setSelectedLegislation] = useState<LegislationWithCategories | null>(null);
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [datesDialogOpen, setDatesDialogOpen] = useState(false);
  const [relationsDialogOpen, setRelationsDialogOpen] = useState(false);

  // Extract unique themes from legislation categories
  const availableThemes = useMemo(() => {
    if (!legislation) return [];
    const themes = new Set<string>();
    legislation.forEach(leg => {
      leg.categories.forEach(cat => {
        if (cat.theme_name) themes.add(cat.theme_name);
      });
    });
    return Array.from(themes).sort();
  }, [legislation]);

  // Extract unique categories (full paths) for the selected theme
  const availableCategories = useMemo(() => {
    if (!legislation) return [];
    const categories = new Map<string, string>(); // id -> full_path
    
    legislation.forEach(leg => {
      leg.categories.forEach(cat => {
        // If filtering by theme, only show categories from that theme
        if (filterTheme === "all" || cat.theme_name === filterTheme) {
          if (cat.id && cat.full_path) {
            categories.set(cat.id, cat.full_path);
          }
        }
      });
    });
    
    // Convert to array and sort by path
    return Array.from(categories.entries())
      .map(([id, path]) => ({ id, path }))
      .sort((a, b) => a.path.localeCompare(b.path, 'pt'));
  }, [legislation, filterTheme]);

  // Filter and sort legislation
  const filteredAndSortedLegislation = useMemo(() => {
    if (!legislation) return [];

    // First filter by search term
    let result = legislation.filter(leg =>
      leg.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      leg.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      leg.summary?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter by "no category"
    if (filterNoCategory) {
      result = result.filter(leg => leg.categories.length === 0);
    }

    // Then filter by theme (only if not filtering by "no category")
    if (!filterNoCategory && filterTheme !== "all") {
      result = result.filter(leg =>
        leg.categories.some(cat => cat.theme_name === filterTheme)
      );
    }

    // Then filter by specific category (only if not filtering by "no category")
    if (!filterNoCategory && filterCategory !== "all") {
      result = result.filter(leg =>
        leg.categories.some(cat => cat.id === filterCategory)
      );
    }

    // Sort the results
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "title":
          comparison = a.title.localeCompare(b.title, 'pt');
          break;
        case "number":
          comparison = a.number.localeCompare(b.number, 'pt');
          break;
        case "publication_date":
          const dateA = a.publication_date ? new Date(a.publication_date).getTime() : 0;
          const dateB = b.publication_date ? new Date(b.publication_date).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case "theme":
          const themeA = a.categories[0]?.theme_name || "";
          const themeB = b.categories[0]?.theme_name || "";
          comparison = themeA.localeCompare(themeB, 'pt');
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [legislation, searchTerm, filterTheme, filterCategory, filterNoCategory, sortField, sortOrder]);

  // Count items without category
  const noCategoryCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => leg.categories.length === 0).length;
  }, [legislation]);

  // Pagination calculations
  const totalItems = filteredAndSortedLegislation.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedLegislation = filteredAndSortedLegislation.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleThemeChange = (value: string) => {
    setFilterTheme(value);
    setFilterCategory("all");
    setFilterNoCategory(false);
    setCurrentPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setFilterCategory(value);
    setFilterNoCategory(false);
    setCurrentPage(1);
  };

  const toggleNoCategoryFilter = () => {
    setFilterNoCategory(prev => !prev);
    if (!filterNoCategory) {
      setFilterTheme("all");
      setFilterCategory("all");
    }
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === "asc" ? "desc" : "asc");
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Erro ao carregar legislação: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const dreCount = legislation?.filter(l => l.source === 'dre').length || 0;
  const eurlexCount = legislation?.filter(l => l.source === 'eurlex').length || 0;
  const manualCount = legislation?.filter(l => l.source === 'manual' || !l.source).length || 0;

  const openCategoriesDialog = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setCategoriesDialogOpen(true);
  };

  const openRequirementsDialog = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setRequirementsDialogOpen(true);
  };

  const openDatesDialog = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setDatesDialogOpen(true);
  };

  const openRelationsDialog = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setRelationsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Legislação</CardDescription>
            <CardTitle className="text-3xl">{legislation?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>DRE (Portugal)</CardDescription>
            <CardTitle className="text-3xl text-green-600">{dreCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>EUR-Lex (UE)</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{eurlexCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Manual / Importados</CardDescription>
            <CardTitle className="text-3xl">{manualCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={noCategoryCount > 0 ? "border-amber-300 bg-amber-50/50" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              {noCategoryCount > 0 && <AlertCircle className="h-3 w-3 text-amber-600" />}
              Sem Categoria
            </CardDescription>
            <CardTitle className={`text-3xl ${noCategoryCount > 0 ? "text-amber-600" : ""}`}>
              {noCategoryCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Legislation List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Legislação Importada
                </CardTitle>
                <CardDescription>
                  Gerencie categorias e requisitos legais ({filteredAndSortedLegislation.length} resultados)
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar legislação..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            {/* Sorting and Filtering Controls */}
            <div className="flex flex-wrap gap-3 items-center">
              <Button
                variant={filterNoCategory ? "default" : "outline"}
                size="sm"
                onClick={toggleNoCategoryFilter}
                className={filterNoCategory ? "bg-amber-600 hover:bg-amber-700" : "border-amber-300 text-amber-700 hover:bg-amber-50"}
              >
                <AlertCircle className="h-4 w-4 mr-1" />
                Sem Categoria ({noCategoryCount})
              </Button>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tema:</span>
                <Select value={filterTheme} onValueChange={handleThemeChange} disabled={filterNoCategory}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Todos os temas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os temas</SelectItem>
                    {availableThemes.map(theme => (
                      <SelectItem key={theme} value={theme}>{theme}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Categoria:</span>
                <Select value={filterCategory} onValueChange={handleCategoryChange} disabled={filterNoCategory}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Todas as categorias" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {availableCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id} className="text-xs">
                        {cat.path}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-sm text-muted-foreground">Ordenar por:</span>
              <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publication_date">Data de Publicação</SelectItem>
                  <SelectItem value="title">Título</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="theme">Tema</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSortOrder}
                title={sortOrder === "asc" ? "Ordem ascendente" : "Ordem descendente"}
              >
                {sortOrder === "asc" ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {paginatedLegislation.length > 0 ? (
            <div className="space-y-4">
              {paginatedLegislation.map((leg) => (
                <div
                  key={leg.id}
                  className="rounded-lg border p-4 transition-all hover:bg-accent/50"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge 
                          variant="outline"
                          className={
                            leg.source === 'dre' 
                              ? 'bg-green-500/10 text-green-700 border-green-300' 
                              : leg.source === 'eurlex'
                                ? 'bg-blue-500/10 text-blue-700 border-blue-300'
                                : ''
                          }
                        >
                          {leg.source === 'dre' ? 'DRE' : leg.source === 'eurlex' ? 'EUR-Lex' : 'Manual'}
                        </Badge>
                        <span className="font-mono text-sm text-muted-foreground">
                          {leg.number}
                        </span>
                      </div>
                      
                      <h4 className="font-semibold">{leg.title}</h4>
                      
                      {leg.summary && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {leg.summary}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {leg.entity && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {leg.entity}
                          </span>
                        )}
                      </div>

                      {/* Categories with full path */}
                      {leg.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {leg.categories.map((cat) => (
                            <Badge 
                              key={cat.id} 
                              variant="outline" 
                              className="text-xs"
                              title={cat.full_path}
                            >
                              {cat.full_path}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Timeline */}
                      <LegislationTimeline
                        publicationDate={leg.publication_date}
                        effectiveDate={leg.effective_date}
                        revocationDate={(leg as any).revocation_date}
                      />

                      {/* Relations */}
                      <LegislationRelationsBadges relations={leg.relations} />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 lg:flex-col">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDatesDialog(leg)}
                        className="gap-2"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Datas
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCategoriesDialog(leg)}
                        className="gap-2"
                      >
                        <Tags className="h-4 w-4" />
                        Categorias
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRequirementsDialog(leg)}
                        className="gap-2"
                      >
                        <FileEdit className="h-4 w-4" />
                        Requisitos
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRelationsDialog(leg)}
                        className="gap-2"
                      >
                        <Link2 className="h-4 w-4" />
                        Relações
                      </Button>
                      {leg.document_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Mostrar</span>
                    <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEMS_PER_PAGE_OPTIONS.map(option => (
                          <SelectItem key={option} value={option.toString()}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span>por página</span>
                    <span className="ml-2">
                      ({startIndex + 1}-{endIndex} de {totalItems})
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(1)}
                      disabled={currentPage === 1}
                      title="Primeira página"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      title="Página anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex items-center gap-1 mx-2">
                      {/* Show page numbers */}
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
                            className="h-8 w-8"
                            onClick={() => goToPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      title="Próxima página"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => goToPage(totalPages)}
                      disabled={currentPage === totalPages}
                      title="Última página"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
              {searchTerm ? (
                <p>Nenhuma legislação encontrada para "{searchTerm}"</p>
              ) : (
                <>
                  <p>Nenhuma legislação importada ainda</p>
                  <p className="text-sm">Execute uma sincronização para importar documentos</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AssignCategoriesDialog
        legislation={selectedLegislation}
        open={categoriesDialogOpen}
        onOpenChange={setCategoriesDialogOpen}
      />
      <ManageRequirementsDialog
        legislation={selectedLegislation}
        open={requirementsDialogOpen}
        onOpenChange={setRequirementsDialogOpen}
      />
      <EditLegislationDatesDialog
        legislation={selectedLegislation}
        open={datesDialogOpen}
        onOpenChange={setDatesDialogOpen}
      />
      <ManageRelationsDialog
        legislation={selectedLegislation}
        open={relationsDialogOpen}
        onOpenChange={setRelationsDialogOpen}
      />
    </div>
  );
}
