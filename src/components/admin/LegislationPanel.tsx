import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Loader2, Search, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle, Layers, AlertTriangle, Wrench, Trash2, List, GitBranch, CalendarDays, LayoutGrid, LayoutList } from "lucide-react";
import { useLegislationWithCategories, type LegislationWithCategories } from "@/hooks/useLegislation";
import { AssignCategoriesDialog } from "./AssignCategoriesDialog";
import { BulkAssignCategoriesDialog } from "./BulkAssignCategoriesDialog";
import { ManageRequirementsDialog } from "./ManageRequirementsDialog";
import { EditLegislationDatesDialog } from "./EditLegislationDatesDialog";
import { EditLegislationDialog } from "./EditLegislationDialog";
import { BulkEditLegislationDatesDialog } from "./BulkEditLegislationDatesDialog";
import { BulkFixMetadataDialog } from "./BulkFixMetadataDialog";
import { ManageRelationsDialog } from "./ManageRelationsDialog";
import { LegislationTreeView } from "./LegislationTreeView";
import { LegislationCard } from "./LegislationCard";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SortField = "title" | "number" | "publication_date" | "theme" | "category_count";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "tree";
type ListDisplayMode = "compact" | "expanded";

const ITEMS_PER_PAGE_OPTIONS = [25, 50, 100, 200];

export function LegislationPanel() {
  const { data: legislation, isLoading, error } = useLegislationWithCategories();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("publication_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterTheme, setFilterTheme] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterNoCategory, setFilterNoCategory] = useState<boolean>(false);
  const [filterProblems, setFilterProblems] = useState<boolean>(false);
  const [filterOrigin, setFilterOrigin] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [selectedLegislation, setSelectedLegislation] = useState<LegislationWithCategories | null>(null);
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);
  const [bulkCategoriesDialogOpen, setBulkCategoriesDialogOpen] = useState(false);
  const [bulkDatesDialogOpen, setBulkDatesDialogOpen] = useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [datesDialogOpen, setDatesDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [relationsDialogOpen, setRelationsDialogOpen] = useState(false);
  const [bulkFixDialogOpen, setBulkFixDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Helper to check if legislation has problems
  const hasProblems = (leg: LegislationWithCategories) => {
    const hasGenericTitle = leg.title.startsWith("Documento ") || leg.title.length < 10;
    const hasMissingOrigin = !leg.origin || (leg.origin !== "PT" && leg.origin !== "EU");
    const hasMissingDates = !leg.publication_date || !leg.effective_date;
    return hasGenericTitle || hasMissingOrigin || hasMissingDates;
  };

  // Count items with problems
  const problemsCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(hasProblems).length;
  }, [legislation]);

  // Filter and sort legislation
  const filteredAndSortedLegislation = useMemo(() => {
    if (!legislation) return [];

    // First filter by search term
    let result = legislation.filter(leg =>
      leg.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      leg.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      leg.summary?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter by date range (publication_date)
    if (filterStartDate) {
      result = result.filter(leg => {
        if (!leg.publication_date) return false;
        return leg.publication_date >= filterStartDate;
      });
    }
    if (filterEndDate) {
      result = result.filter(leg => {
        if (!leg.publication_date) return false;
        return leg.publication_date <= filterEndDate;
      });
    }

    // Filter by "problems"
    if (filterProblems) {
      result = result.filter(hasProblems);
    }

    // Filter by origin
    if (filterOrigin !== "all") {
      result = result.filter(leg => leg.origin === filterOrigin);
    }

    // Filter by "no category"
    if (filterNoCategory) {
      result = result.filter(leg => leg.categories.length === 0);
    }

    // Then filter by theme (only if not filtering by "no category")
    if (!filterNoCategory && !filterProblems && filterTheme !== "all") {
      result = result.filter(leg =>
        leg.categories.some(cat => cat.theme_name === filterTheme)
      );
    }

    // Then filter by specific category (only if not filtering by "no category")
    if (!filterNoCategory && !filterProblems && filterCategory !== "all") {
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
        case "category_count":
          comparison = a.categories.length - b.categories.length;
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [legislation, searchTerm, filterTheme, filterCategory, filterNoCategory, filterProblems, filterOrigin, filterStartDate, filterEndDate, sortField, sortOrder]);

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
      setFilterProblems(false);
    }
    setCurrentPage(1);
  };

  const toggleProblemsFilter = () => {
    setFilterProblems(prev => !prev);
    if (!filterProblems) {
      setFilterTheme("all");
      setFilterCategory("all");
      setFilterNoCategory(false);
    }
    setCurrentPage(1);
  };

  // Selection helpers
  const toggleSelectLegislation = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    const allFilteredIds = new Set(filteredAndSortedLegislation.map(leg => leg.id));
    setSelectedIds(allFilteredIds);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedLegislationList = useMemo(() => {
    if (!legislation) return [];
    return legislation.filter(leg => selectedIds.has(leg.id));
  }, [legislation, selectedIds]);

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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    setIsDeleting(true);
    
    try {
      const idsToDelete = Array.from(selectedIds);
      
      // Delete related data first (category mappings, organization assignments, relations)
      await supabase
        .from("legislation_category_mapping")
        .delete()
        .in("legislation_id", idsToDelete);
      
      await supabase
        .from("organization_legislation")
        .delete()
        .in("legislation_id", idsToDelete);
      
      await supabase
        .from("legislation_relations")
        .delete()
        .or(`source_legislation_id.in.(${idsToDelete.join(",")}),target_legislation_id.in.(${idsToDelete.join(",")})`);

      // Delete legal requirements
      await supabase
        .from("legal_requirements")
        .delete()
        .in("legislation_id", idsToDelete);

      // Delete alerts related to this legislation
      await supabase
        .from("alerts")
        .delete()
        .in("related_legislation_id", idsToDelete);

      // Delete applicabilities (through legal requirements - already handled above)
      // First get requirement IDs for these legislation items
      const { data: requirements } = await supabase
        .from("legal_requirements")
        .select("id")
        .in("legislation_id", idsToDelete);
      
      if (requirements && requirements.length > 0) {
        const requirementIds = requirements.map(r => r.id);
        
        // Delete action plans for these requirements
        await supabase
          .from("action_plans")
          .delete()
          .in("requirement_id", requirementIds);
        
        // Delete applicabilities for these requirements
        await supabase
          .from("applicabilities")
          .delete()
          .in("requirement_id", requirementIds);
      }
      
      // Delete legislation
      const { error } = await supabase
        .from("legislation")
        .delete()
        .in("id", idsToDelete);
      
      if (error) throw error;
      
      toast({
        title: "Legislação eliminada",
        description: `${idsToDelete.length} diploma(s) eliminado(s) com sucesso`,
      });
      
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Erro ao eliminar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setBulkDeleteDialogOpen(false);
    }
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

  // Count by origin field (PT = DRE, EU = EUR-Lex)
  const dreCount = legislation?.filter(l => l.origin === 'PT').length || 0;
  const eurlexCount = legislation?.filter(l => l.origin === 'EU').length || 0;
  const otherCount = legislation?.filter(l => !l.origin || (l.origin !== 'PT' && l.origin !== 'EU')).length || 0;

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

  const openEditDialog = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="gap-2"
          >
            <List className="h-4 w-4" />
            Lista
          </Button>
          <Button
            variant={viewMode === "tree" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("tree")}
            className="gap-2"
          >
            <GitBranch className="h-4 w-4" />
            Árvore
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
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
            <CardDescription>Outros</CardDescription>
            <CardTitle className="text-3xl">{otherCount}</CardTitle>
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
        <Card className={problemsCount > 0 ? "border-red-300 bg-red-50/50" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              {problemsCount > 0 && <AlertTriangle className="h-3 w-3 text-red-600" />}
              Com Problemas
            </CardDescription>
            <CardTitle className={`text-3xl ${problemsCount > 0 ? "text-red-600" : ""}`}>
              {problemsCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tree View */}
      {viewMode === "tree" && legislation && (
        <LegislationTreeView legislation={legislation} />
      )}

      {/* List View */}
      {viewMode === "list" && (
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
              <div className="flex items-center gap-2">
                {problemsCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkFixDialogOpen(true)}
                    className="border-red-300 text-red-700 hover:bg-red-50 gap-2"
                  >
                    <Wrench className="h-4 w-4" />
                    Corrigir em Massa
                  </Button>
                )}
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar legislação..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
            
            {/* Sorting and Filtering Controls */}
            <div className="flex flex-wrap gap-3 items-center">
              <DateRangeFilter
                startDate={filterStartDate}
                endDate={filterEndDate}
                onStartDateChange={(date) => {
                  setFilterStartDate(date);
                  setCurrentPage(1);
                }}
                onEndDateChange={(date) => {
                  setFilterEndDate(date);
                  setCurrentPage(1);
                }}
                label="Período"
              />

              {/* Origin Filter */}
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button
                  variant={filterOrigin === "all" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => { setFilterOrigin("all"); setCurrentPage(1); }}
                  className="h-7 px-2 text-xs"
                >
                  Todas
                </Button>
                <Button
                  variant={filterOrigin === "PT" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => { setFilterOrigin("PT"); setCurrentPage(1); }}
                  className="h-7 px-2 text-xs gap-1"
                >
                  🇵🇹 PT
                </Button>
                <Button
                  variant={filterOrigin === "EU" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => { setFilterOrigin("EU"); setCurrentPage(1); }}
                  className="h-7 px-2 text-xs gap-1"
                >
                  🇪🇺 EU
                </Button>
              </div>

              <Button
                variant={filterNoCategory ? "default" : "outline"}
                size="sm"
                onClick={toggleNoCategoryFilter}
                className={filterNoCategory ? "bg-amber-600 hover:bg-amber-700" : "border-amber-300 text-amber-700 hover:bg-amber-50"}
              >
                <AlertCircle className="h-4 w-4 mr-1" />
                Sem Categoria ({noCategoryCount})
              </Button>

              <Button
                variant={filterProblems ? "default" : "outline"}
                size="sm"
                onClick={toggleProblemsFilter}
                className={filterProblems ? "bg-red-600 hover:bg-red-700" : "border-red-300 text-red-700 hover:bg-red-50"}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Com Problemas ({problemsCount})
              </Button>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tema:</span>
                <Select value={filterTheme} onValueChange={handleThemeChange} disabled={filterNoCategory || filterProblems}>
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
                <Select value={filterCategory} onValueChange={handleCategoryChange} disabled={filterNoCategory || filterProblems}>
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
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publication_date">Data de Publicação</SelectItem>
                  <SelectItem value="category_count">Nº de Categorias</SelectItem>
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

            {/* Bulk selection bar */}
            {filteredAndSortedLegislation.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredAndSortedLegislation.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        selectAllFiltered();
                      } else {
                        clearSelection();
                      }
                    }}
                  />
                  <label htmlFor="select-all" className="text-sm cursor-pointer">
                    Selecionar todos ({filteredAndSortedLegislation.length})
                  </label>
                </div>
                
                {selectedIds.size > 0 && (
                  <>
                    <div className="h-4 w-px bg-border" />
                    <span className="text-sm text-muted-foreground">
                      {selectedIds.size} selecionado(s)
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSelection}
                    >
                      Limpar seleção
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setBulkCategoriesDialogOpen(true)}
                      className="bg-primary"
                    >
                      <Layers className="h-4 w-4 mr-1" />
                      Atribuir Categorias ({selectedIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBulkDatesDialogOpen(true)}
                    >
                      <CalendarDays className="h-4 w-4 mr-1" />
                      Editar Datas ({selectedIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setBulkDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Eliminar ({selectedIds.size})
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {paginatedLegislation.length > 0 ? (
            <div className="space-y-2">
              {paginatedLegislation.map((leg) => (
                <LegislationCard
                  key={leg.id}
                  leg={leg}
                  isSelected={selectedIds.has(leg.id)}
                  hasProblems={hasProblems(leg)}
                  onToggleSelect={toggleSelectLegislation}
                  onOpenCategories={openCategoriesDialog}
                  onOpenRequirements={openRequirementsDialog}
                  onOpenDates={openDatesDialog}
                  onOpenRelations={openRelationsDialog}
                  onOpenEdit={openEditDialog}
                />
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
      )}

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
      <EditLegislationDialog
        legislation={selectedLegislation}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
      <BulkAssignCategoriesDialog
        legislationList={selectedLegislationList}
        open={bulkCategoriesDialogOpen}
        onOpenChange={(open) => {
          setBulkCategoriesDialogOpen(open);
          if (!open) {
            clearSelection();
          }
        }}
      />
      <BulkEditLegislationDatesDialog
        legislationList={selectedLegislationList}
        open={bulkDatesDialogOpen}
        onOpenChange={(open) => {
          setBulkDatesDialogOpen(open);
          if (!open) {
            clearSelection();
          }
        }}
      />
      <BulkFixMetadataDialog
        open={bulkFixDialogOpen}
        onOpenChange={setBulkFixDialogOpen}
        problemsCount={problemsCount}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirmar Eliminação
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Está prestes a eliminar permanentemente <strong>{selectedIds.size} diploma(s)</strong>.
                </p>
                
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm">
                  <strong className="text-destructive">Atenção:</strong> Esta ação é irreversível. 
                  Serão também eliminados:
                  <ul className="list-disc list-inside mt-2 text-muted-foreground">
                    <li>Associações a categorias</li>
                    <li>Atribuições a organizações</li>
                    <li>Relações com outros diplomas</li>
                    <li>Requisitos legais associados</li>
                  </ul>
                </div>

                {selectedLegislationList.length <= 10 && (
                  <div className="max-h-40 overflow-y-auto border rounded p-2 text-sm">
                    <p className="font-medium mb-2">Diplomas a eliminar:</p>
                    <ul className="space-y-1">
                      {selectedLegislationList.map(leg => (
                        <li key={leg.id} className="text-muted-foreground truncate">
                          • {leg.number} - {leg.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Eliminar {selectedIds.size} diploma(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
