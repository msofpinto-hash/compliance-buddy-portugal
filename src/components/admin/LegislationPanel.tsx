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
import { FileText, Loader2, Search, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle, AlertTriangle, Wrench, Trash2, List, GitBranch, CalendarDays, Sparkles, Ban, FileQuestion, Layers } from "lucide-react";
import { useLegislationWithCategories, type LegislationWithCategories } from "@/hooks/useLegislation";
import { useFixIncompletesJob } from "@/hooks/useFixIncompletesJob";
import { useBulkFixes } from "@/hooks/useBulkFixes";
import { AssignCategoriesDialog } from "./AssignCategoriesDialog";
import { BulkAssignCategoriesDialog } from "./BulkAssignCategoriesDialog";
import { ManageRequirementsDialog } from "./ManageRequirementsDialog";
import { EditLegislationDatesDialog } from "./EditLegislationDatesDialog";
import { EditLegislationDialog } from "./EditLegislationDialog";
import { BulkEditLegislationDatesDialog } from "./BulkEditLegislationDatesDialog";
import { ManageRelationsDialog } from "./ManageRelationsDialog";
import { LegislationTreeView } from "./LegislationTreeView";
import { LegislationCard } from "./LegislationCard";
import { AISuggestCategoriesDialog } from "./AISuggestCategoriesDialog";
import { BulkAISuggestCategoriesDialog } from "./BulkAISuggestCategoriesDialog";
import { AnimatedStatCard } from "./AnimatedStatCard";
import { ActiveJobsBanner } from "./ActiveJobsBanner";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type SortField = "title" | "number" | "publication_date" | "theme" | "category_count";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "tree";

const ITEMS_PER_PAGE_OPTIONS = [25, 50, 100, 200];

interface LegislationPanelProps {
  hideBanner?: boolean;
}

export function LegislationPanel({ hideBanner = false }: LegislationPanelProps) {
  const { data: legislation, isLoading, error } = useLegislationWithCategories();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: fixIncompletesJob } = useFixIncompletesJob();
  const isFixIncompletesRunning = fixIncompletesJob?.status === "running";
  
  // Bulk fixes hook
  const bulkFixes = useBulkFixes(legislation);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("publication_date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterTheme, setFilterTheme] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterNoCategory, setFilterNoCategory] = useState<boolean>(false);
  const [filterProblems, setFilterProblems] = useState<boolean>(false);
  const [filterProblemType, setFilterProblemType] = useState<string>("all"); // "all" | specific problem type
  const [filterRevoked, setFilterRevoked] = useState<boolean>(false);
  const [filterGenericTitle, setFilterGenericTitle] = useState<boolean>(false);
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
  const [aiSuggestDialogOpen, setAiSuggestDialogOpen] = useState(false);
  const [bulkAiSuggestDialogOpen, setBulkAiSuggestDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFixingIncompletes, setIsFixingIncompletes] = useState(false);

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

  // Helper to check if a date is invalid (future year > current + 1)
  const isInvalidDate = (dateStr: string | null | undefined): boolean => {
    if (!dateStr) return false;
    try {
      const year = new Date(dateStr).getFullYear();
      const currentYear = new Date().getFullYear();
      return year > currentYear + 1 || year < 1900;
    } catch {
      return false;
    }
  };

  // Problem types for transparency
  type ProblemType = "generic_title" | "missing_origin" | "missing_dates" | "invalid_dates";

  // Generic title patterns (auto-imported placeholders)
  const genericTitlePatterns = [
    "Documento ",
    "Diploma referenciado",
    "a aguardar importação",
  ];

  // Helper to check if a title is generic
  const isGenericTitle = (title: string): boolean => {
    return genericTitlePatterns.some(pattern => 
      title.toLowerCase().includes(pattern.toLowerCase())
    ) || title.length < 10;
  };

  // Helper to get all problems for a legislation item
  const getProblems = (leg: LegislationWithCategories): ProblemType[] => {
    const problems: ProblemType[] = [];
    
    // Generic or too short title (includes auto-imported placeholders)
    if (isGenericTitle(leg.title)) {
      problems.push("generic_title");
    }
    
    // Missing or invalid origin
    if (!leg.origin || (leg.origin !== "PT" && leg.origin !== "EU")) {
      problems.push("missing_origin");
    }
    
    // Missing publication or effective date
    if (!leg.publication_date || !leg.effective_date) {
      problems.push("missing_dates");
    }
    
    // Invalid dates (year > current + 1 or < 1900)
    if (isInvalidDate(leg.publication_date) || isInvalidDate(leg.effective_date)) {
      problems.push("invalid_dates");
    }
    
    return problems;
  };

  // Helper to check if legislation has problems (for filtering)
  const hasProblems = (leg: LegislationWithCategories) => getProblems(leg).length > 0;

  // Problem labels for display
  const problemLabels: Record<ProblemType, string> = {
    generic_title: "Título genérico",
    missing_origin: "Origem em falta",
    missing_dates: "Datas em falta",
    invalid_dates: "Datas inválidas",
  };

  // Count items with problems
  const problemsCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(hasProblems).length;
  }, [legislation]);

  // Count items by problem type
  const problemTypeCounts = useMemo(() => {
    if (!legislation) return { generic_title: 0, missing_origin: 0, missing_dates: 0, invalid_dates: 0 };
    
    const counts = { generic_title: 0, missing_origin: 0, missing_dates: 0, invalid_dates: 0 };
    legislation.forEach(leg => {
      const problems = getProblems(leg);
      problems.forEach(p => counts[p]++);
    });
    return counts;
  }, [legislation]);

  // Count items with generic titles
  const genericTitleCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => isGenericTitle(leg.title)).length;
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

    // Filter by "problems" (with optional specific type)
    if (filterProblems) {
      if (filterProblemType === "all") {
        result = result.filter(hasProblems);
      } else {
        result = result.filter(leg => getProblems(leg).includes(filterProblemType as any));
      }
    }

    // Filter by "generic title" (pending import)
    if (filterGenericTitle) {
      result = result.filter(leg => isGenericTitle(leg.title));
    }

    // Filter by "revoked"
    if (filterRevoked) {
      result = result.filter(leg => !!(leg as any).revocation_date);
    }

    // Filter by origin
    if (filterOrigin !== "all") {
      if (filterOrigin === "other") {
        result = result.filter(leg => !leg.origin || (leg.origin !== "PT" && leg.origin !== "EU"));
      } else {
        result = result.filter(leg => leg.origin === filterOrigin);
      }
    }

    // Filter by "no category"
    if (filterNoCategory) {
      result = result.filter(leg => leg.categories.length === 0);
    }

    // Then filter by theme (only if not filtering by special filters)
    if (!filterNoCategory && !filterProblems && !filterRevoked && filterTheme !== "all") {
      result = result.filter(leg =>
        leg.categories.some(cat => cat.theme_name === filterTheme)
      );
    }

    // Then filter by specific category (only if not filtering by special filters)
    if (!filterNoCategory && !filterProblems && !filterRevoked && filterCategory !== "all") {
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
  }, [legislation, searchTerm, filterTheme, filterCategory, filterNoCategory, filterProblems, filterGenericTitle, filterRevoked, filterOrigin, filterStartDate, filterEndDate, sortField, sortOrder]);

  // Count items without category
  const noCategoryCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => leg.categories.length === 0).length;
  }, [legislation]);

  // Count revoked items
  const revokedCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => !!(leg as any).revocation_date).length;
  }, [legislation]);

  // Period comparison calculations (last 30 days vs previous 30 days)
  const periodStats = useMemo(() => {
    if (!legislation) return {
      current: { total: 0, dre: 0, eurlex: 0, other: 0, noCategory: 0, problems: 0, revoked: 0, genericTitle: 0 },
      previous: { total: 0, dre: 0, eurlex: 0, other: 0, noCategory: 0, problems: 0, revoked: 0, genericTitle: 0 },
    };

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const currentPeriod = legislation.filter(leg => {
      if (!leg.created_at) return false;
      const createdAt = new Date(leg.created_at);
      return createdAt >= thirtyDaysAgo && createdAt <= now;
    });

    const previousPeriod = legislation.filter(leg => {
      if (!leg.created_at) return false;
      const createdAt = new Date(leg.created_at);
      return createdAt >= sixtyDaysAgo && createdAt < thirtyDaysAgo;
    });

    const countStats = (items: typeof legislation) => ({
      total: items.length,
      dre: items.filter(l => l.origin === 'PT').length,
      eurlex: items.filter(l => l.origin === 'EU').length,
      other: items.filter(l => !l.origin || (l.origin !== 'PT' && l.origin !== 'EU')).length,
      noCategory: items.filter(l => l.categories.length === 0).length,
      problems: items.filter(hasProblems).length,
      revoked: items.filter(l => !!(l as any).revocation_date).length,
      genericTitle: items.filter(l => isGenericTitle(l.title)).length,
    });

    return {
      current: countStats(currentPeriod),
      previous: countStats(previousPeriod),
    };
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
      setFilterRevoked(false);
      setFilterGenericTitle(false);
    }
    setCurrentPage(1);
  };

  const toggleProblemsFilter = () => {
    setFilterProblems(prev => !prev);
    if (!filterProblems) {
      setFilterTheme("all");
      setFilterCategory("all");
      setFilterNoCategory(false);
      setFilterRevoked(false);
      setFilterGenericTitle(false);
    }
    setCurrentPage(1);
  };

  const toggleRevokedFilter = () => {
    setFilterRevoked(prev => !prev);
    if (!filterRevoked) {
      setFilterTheme("all");
      setFilterCategory("all");
      setFilterNoCategory(false);
      setFilterProblems(false);
      setFilterGenericTitle(false);
    }
    setCurrentPage(1);
  };

  const toggleGenericTitleFilter = () => {
    setFilterGenericTitle(prev => !prev);
    if (!filterGenericTitle) {
      setFilterTheme("all");
      setFilterCategory("all");
      setFilterNoCategory(false);
      setFilterProblems(false);
      setFilterRevoked(false);
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

  const handleFixIncompleteRequirements = async () => {
    if (isFixIncompletesRunning) {
      toast({
        title: "Correção já em curso",
        description: "Já existe um job a correr. Veja o indicador de progresso acima.",
      });
      return;
    }

    setIsFixingIncompletes(true);

    try {
      const { error } = await supabase.functions.invoke("fix-incomplete-requirements", {
        body: { batchSize: 5, maxBatches: 200, minRatio: 0.3 },
      });

      if (error) {
        const anyErr = error as any;
        const status = anyErr?.context?.status ?? anyErr?.status;

        // When a job is already running, treat as informational (not an error).
        if (status === 409) {
          let runningJobId: string | undefined;
          try {
            const ctx = anyErr?.context;
            if (ctx && typeof ctx.clone === "function") {
              const body = await ctx.clone().json();
              runningJobId = body?.runningJobId;
            }
          } catch {
            // ignore parse errors
          }

          toast({
            title: "Correção já em curso",
            description: runningJobId
              ? `Job ${runningJobId.slice(0, 8)}… em execução. Veja o progresso acima.`
              : "Já existe um job a correr. Veja o indicador de progresso acima.",
          });

          // Force-refresh the banner state.
          queryClient.invalidateQueries({ queryKey: ["fix-incompletes-job"] });
          return;
        }

        throw error;
      }

      toast({
        title: "Correção iniciada",
        description:
          "A correção de diplomas incompletos foi iniciada em segundo plano. Pode acompanhar o progresso no indicador acima.",
      });

      queryClient.invalidateQueries({ queryKey: ["fix-incompletes-job"] });
    } catch (error) {
      console.error("Fix incompletes error:", error);
      toast({
        title: "Erro ao iniciar correção",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingIncompletes(false);
    }
  };

  // Count diplomas with invalid dates (kept for display)
  const invalidDatesCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter((leg) => {
      const problems = getProblems(leg);
      return problems.includes("invalid_dates");
    }).length;
  }, [legislation]);


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

      {/* Progress Banner for All Active Jobs */}
      {!hideBanner && <ActiveJobsBanner />}

      {/* Stats - Apenas estatísticas de inventário (sem problemas/correções) */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
        <AnimatedStatCard
          label="Total de Legislação"
          value={legislation?.length || 0}
          previousValue={periodStats.previous.total > 0 ? (legislation?.length || 0) - periodStats.current.total + periodStats.previous.total : undefined}
          onClick={() => {
            setFilterOrigin("all");
            setFilterNoCategory(false);
            setFilterProblems(false);
            setFilterRevoked(false);
            setFilterTheme("all");
            setFilterCategory("all");
            setCurrentPage(1);
          }}
        />
        <AnimatedStatCard
          label="DRE (Portugal)"
          value={dreCount}
          previousValue={periodStats.previous.dre > 0 ? dreCount - periodStats.current.dre + periodStats.previous.dre : undefined}
          titleClassName="text-green-600"
          isActive={filterOrigin === "PT"}
          activeRingColor="ring-green-500"
          onClick={() => {
            setFilterOrigin(filterOrigin === "PT" ? "all" : "PT");
            setFilterNoCategory(false);
            setFilterProblems(false);
            setFilterRevoked(false);
            setCurrentPage(1);
          }}
        />
        <AnimatedStatCard
          label="EUR-Lex (UE)"
          value={eurlexCount}
          previousValue={periodStats.previous.eurlex > 0 ? eurlexCount - periodStats.current.eurlex + periodStats.previous.eurlex : undefined}
          titleClassName="text-blue-600"
          isActive={filterOrigin === "EU"}
          activeRingColor="ring-blue-500"
          onClick={() => {
            setFilterOrigin(filterOrigin === "EU" ? "all" : "EU");
            setFilterNoCategory(false);
            setFilterProblems(false);
            setFilterRevoked(false);
            setCurrentPage(1);
          }}
        />
        <AnimatedStatCard
          label="Outros"
          value={otherCount}
          previousValue={periodStats.previous.other > 0 ? otherCount - periodStats.current.other + periodStats.previous.other : undefined}
          isActive={filterOrigin === "other"}
          activeRingColor="ring-primary"
          onClick={() => {
            if (filterOrigin === "all") {
              setFilterOrigin("other");
            } else {
              setFilterOrigin("all");
            }
            setFilterNoCategory(false);
            setFilterProblems(false);
            setFilterRevoked(false);
            setCurrentPage(1);
          }}
        />
        <AnimatedStatCard
          label="Revogados"
          value={revokedCount}
          previousValue={periodStats.previous.revoked > 0 ? revokedCount - periodStats.current.revoked + periodStats.previous.revoked : undefined}
          icon={revokedCount > 0 ? Ban : undefined}
          iconClassName="text-slate-600"
          titleClassName={revokedCount > 0 ? "text-slate-600" : ""}
          className={revokedCount > 0 ? "border-slate-400 bg-slate-50/50" : ""}
          isActive={filterRevoked}
          activeRingColor="ring-slate-500"
          onClick={() => toggleRevokedFilter()}
        />
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
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-full sm:w-64">
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
            
            {/* Filtering Controls - Row 1: Quick filters */}
            <div className="flex flex-wrap gap-2 items-center">
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
              <div className="flex items-center gap-0.5 border rounded-md p-0.5 bg-muted/50">
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

              {/* Status filters group */}
              <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/50">
                <Button
                  variant={filterNoCategory ? "default" : "ghost"}
                  size="sm"
                  onClick={toggleNoCategoryFilter}
                  className={cn(
                    "h-7 px-2 text-xs gap-1",
                    filterNoCategory && "bg-amber-600 hover:bg-amber-700 text-white"
                  )}
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Sem Cat. ({noCategoryCount})
                </Button>
                <Button
                  variant={filterProblems ? "default" : "ghost"}
                  size="sm"
                  onClick={toggleProblemsFilter}
                  className={cn(
                    "h-7 px-2 text-xs gap-1",
                    filterProblems && "bg-red-600 hover:bg-red-700 text-white"
                  )}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Problemas ({problemsCount})
                </Button>
                <Button
                  variant={filterRevoked ? "default" : "ghost"}
                  size="sm"
                  onClick={toggleRevokedFilter}
                  className={cn(
                    "h-7 px-2 text-xs gap-1",
                    filterRevoked && "bg-gray-700 hover:bg-gray-800 text-white"
                  )}
                >
                  <Ban className="h-3.5 w-3.5" />
                  Revogados ({revokedCount})
                </Button>
              </div>

              {/* Theme & Category selectors */}
              <Select value={filterTheme} onValueChange={handleThemeChange} disabled={filterNoCategory || filterProblems || filterRevoked}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue placeholder="Tema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os temas</SelectItem>
                  {availableThemes.map(theme => (
                    <SelectItem key={theme} value={theme}>{theme}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterCategory} onValueChange={handleCategoryChange} disabled={filterNoCategory || filterProblems || filterRevoked}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="Categoria" />
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

            {/* Problem Type Actions Bar - Only shows when filtering by problems */}
            {filterProblems && (
              <div className="flex flex-wrap gap-2 items-center p-3 bg-red-50 border border-red-200 rounded-lg">
                <span className="text-sm font-medium text-red-800 mr-2">Tipo de problema:</span>
                <Select value={filterProblemType} onValueChange={(v) => { setFilterProblemType(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-44 h-8 text-xs bg-white border-red-300">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos ({problemsCount})</SelectItem>
                    <SelectItem value="generic_title">
                      Título genérico ({problemTypeCounts.generic_title})
                    </SelectItem>
                    <SelectItem value="missing_origin">
                      Origem em falta ({problemTypeCounts.missing_origin})
                    </SelectItem>
                    <SelectItem value="missing_dates">
                      Datas em falta ({problemTypeCounts.missing_dates})
                    </SelectItem>
                    <SelectItem value="invalid_dates">
                      Datas inválidas ({problemTypeCounts.invalid_dates})
                    </SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex-1" />

                {/* Contextual correction buttons - automatic batch fixes */}
                {filterProblemType === "generic_title" && problemTypeCounts.generic_title > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkFixes.fixGenericTitles()}
                    disabled={bulkFixes.isFixingGenericTitles}
                    className="bg-white border-orange-300 text-orange-700 hover:bg-orange-50 gap-2"
                  >
                    {bulkFixes.isFixingGenericTitles ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileQuestion className="h-4 w-4" />}
                    Corrigir Títulos ({problemTypeCounts.generic_title})
                  </Button>
                )}
                {filterProblemType === "missing_origin" && problemTypeCounts.missing_origin > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkFixes.fixMissingOrigin()}
                    disabled={bulkFixes.isFixingOrigin}
                    className="bg-white border-blue-300 text-blue-700 hover:bg-blue-50 gap-2"
                  >
                    {bulkFixes.isFixingOrigin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                    Corrigir Origem ({problemTypeCounts.missing_origin})
                  </Button>
                )}
                {filterProblemType === "missing_dates" && problemTypeCounts.missing_dates > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkFixes.fixMissingDates()}
                    disabled={bulkFixes.isFixingMissingDates}
                    className="bg-white border-purple-300 text-purple-700 hover:bg-purple-50 gap-2"
                  >
                    {bulkFixes.isFixingMissingDates ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                    Corrigir Datas ({problemTypeCounts.missing_dates})
                  </Button>
                )}
                {filterProblemType === "invalid_dates" && problemTypeCounts.invalid_dates > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkFixes.fixInvalidDates()}
                    disabled={bulkFixes.isFixingInvalidDates}
                    className="bg-white border-orange-300 text-orange-700 hover:bg-orange-50 gap-2"
                  >
                    {bulkFixes.isFixingInvalidDates ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                    Corrigir Datas Inválidas ({problemTypeCounts.invalid_dates})
                  </Button>
                )}
                {filterProblemType === "all" && problemsCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Execute all fixes sequentially
                      bulkFixes.fixGenericTitles();
                      setTimeout(() => bulkFixes.fixMissingOrigin(), 500);
                      setTimeout(() => bulkFixes.fixInvalidDates(), 1000);
                    }}
                    disabled={bulkFixes.isFixing}
                    className="bg-white border-red-300 text-red-700 hover:bg-red-50 gap-2"
                  >
                    {bulkFixes.isFixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                    Corrigir Tudo
                  </Button>
                )}
              </div>
            )}

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
              <div className={cn(
                "flex flex-wrap items-center gap-3 rounded-lg p-3 border",
                selectedIds.size > 0 
                  ? "bg-primary/10 border-primary/30" 
                  : "bg-muted/50 border-transparent"
              )}>
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
                  <label htmlFor="select-all" className="text-sm cursor-pointer font-medium">
                    Selecionar todos ({filteredAndSortedLegislation.length})
                  </label>
                </div>
                
                {selectedIds.size > 0 && (
                  <>
                    <div className="h-4 w-px bg-border" />
                    <Badge variant="secondary" className="text-sm font-medium">
                      {selectedIds.size} selecionado(s)
                    </Badge>
                    <div className="flex-1" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSelection}
                    >
                      Limpar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setBulkCategoriesDialogOpen(true)}
                      className="bg-amber-600 hover:bg-amber-700 gap-2"
                    >
                      <Layers className="h-4 w-4" />
                      Atribuir Categorias ({selectedIds.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBulkAiSuggestDialogOpen(true)}
                      className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <Sparkles className="h-4 w-4" />
                      Sugerir (IA) ({selectedIds.size})
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
                  problemTypes={getProblems(leg)}
                  onToggleSelect={toggleSelectLegislation}
                  onOpenCategories={openCategoriesDialog}
                  onOpenRequirements={openRequirementsDialog}
                  onOpenDates={openDatesDialog}
                  onOpenRelations={openRelationsDialog}
                  onOpenEdit={openEditDialog}
                  onOpenAISuggestions={(leg) => {
                    setSelectedLegislation(leg);
                    setAiSuggestDialogOpen(true);
                  }}
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

      {/* AI Suggestions Dialog */}
      <AISuggestCategoriesDialog
        open={aiSuggestDialogOpen}
        onOpenChange={setAiSuggestDialogOpen}
        legislation={selectedLegislation}
        existingCategories={selectedLegislation?.categories || []}
      />

      {/* Bulk AI Suggestions Dialog */}
      <BulkAISuggestCategoriesDialog
        open={bulkAiSuggestDialogOpen}
        onOpenChange={setBulkAiSuggestDialogOpen}
        legislationList={selectedLegislationList.map(leg => ({
          id: leg.id,
          number: leg.number,
          title: leg.title,
          summary: leg.summary,
          categories: leg.categories,
        }))}
      />
    </div>
  );
}
