import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { FileText, Loader2, Search, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle, AlertTriangle, Wrench, Trash2, List, GitBranch, CalendarDays, Sparkles, Ban, FileQuestion, Layers, Globe2, Building2, FolderTree, Link2Off, CalendarX, CalendarClock } from "lucide-react";
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
import { GlobalApplicabilityPanel } from "./GlobalApplicabilityPanel";
import { ClientLegislationImportPanel } from "./ClientLegislationImportPanel";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

type SortField = "title" | "number" | "publication_date" | "theme" | "category_count";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "tree";
type PanelMode = "browse" | "global" | "clients";

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
  const isMobile = useIsMobile();
  
  // Bulk fixes hook
  const bulkFixes = useBulkFixes(legislation);

  const [panelMode, setPanelMode] = useState<PanelMode>("browse");
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
  const [filterDiplomaType, setFilterDiplomaType] = useState<string | null>(null);
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);
  // Data quality filters
  const [filterMissingUrl, setFilterMissingUrl] = useState<boolean>(false);
  const [filterMissingDates, setFilterMissingDates] = useState<boolean>(false);
  const [filterInvalidDates, setFilterInvalidDates] = useState<boolean>(false);
  const [filterShortSummary, setFilterShortSummary] = useState<boolean>(false);

  // Extract diploma type from number
  const extractDiplomaType = (number: string): string => {
    if (!number) return "Outros";
    const normalized = number.trim();
    const typePatterns: [RegExp, string][] = [
      [/^decreto[- ]lei/i, "Decreto-Lei"],
      [/^lei\s/i, "Lei"],
      [/^portaria/i, "Portaria"],
      [/^despacho/i, "Despacho"],
      [/^regulamento\s*\(ue\)/i, "Regulamento (UE)"],
      [/^regulamento\s*\(ce\)/i, "Regulamento (CE)"],
      [/^regulamento/i, "Regulamento"],
      [/^diretiva/i, "Diretiva"],
      [/^decisão/i, "Decisão"],
      [/^resolução/i, "Resolução"],
      [/^decreto\s+regulamentar/i, "Decreto Regulamentar"],
      [/^decreto/i, "Decreto"],
      [/^aviso/i, "Aviso"],
      [/^declaração/i, "Declaração"],
      [/^lei\s+orgânica/i, "Lei Orgânica"],
      [/^lei\s+constitucional/i, "Lei Constitucional"],
      [/^acórdão/i, "Acórdão"],
    ];
    for (const [pattern, type] of typePatterns) {
      if (pattern.test(normalized)) return type;
    }
    return "Outros";
  };

  // Color mapping for diploma types
  const getDiplomaTypeColors = (type: string): string => {
    const colorMap: Record<string, string> = {
      "Decreto-Lei": "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300/50",
      "Lei": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300/50",
      "Lei Orgânica": "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border-emerald-400/50",
      "Lei Constitucional": "bg-emerald-700/15 text-emerald-900 dark:text-emerald-200 border-emerald-500/50",
      "Portaria": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300/50",
      "Despacho": "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-300/50",
      "Decreto": "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-300/50",
      "Decreto Regulamentar": "bg-indigo-600/15 text-indigo-800 dark:text-indigo-300 border-indigo-400/50",
      "Resolução": "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-300/50",
      "Aviso": "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-300/50",
      "Declaração": "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-300/50",
      "Acórdão": "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-300/50",
      "Regulamento": "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-300/50",
      "Regulamento (UE)": "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-300/50",
      "Regulamento (CE)": "bg-cyan-600/15 text-cyan-800 dark:text-cyan-300 border-cyan-400/50",
      "Diretiva": "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-300/50",
      "Decisão": "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-300/50",
      "Outros": "bg-stone-500/15 text-stone-700 dark:text-stone-400 border-stone-300/50",
    };
    return colorMap[type] || colorMap["Outros"];
  };

  // ---------------------------------------------------------------------------
  // Problems / data quality helpers (MUST be defined before useMemo blocks below)
  // ---------------------------------------------------------------------------
  type ProblemType = "generic_title" | "missing_origin" | "missing_dates" | "invalid_dates";

  const genericTitlePatterns = [
    "Documento ",
    "Diploma referenciado",
    "a aguardar importação",
  ];

  const isGenericTitle = (title: string, number?: string): boolean => {
    // Check if title equals the number (truly generic)
    if (number && title === number) return true;
    // Check if title is short without date pattern
    if (title.length <= 30 && !title.includes(", de ")) return true;
    // Check for known generic patterns
    return genericTitlePatterns.some((pattern) =>
      title.toLowerCase().includes(pattern.toLowerCase())
    );
  };

  const isShortSummary = (summary: string | null | undefined): boolean => {
    return !summary || summary.trim().length < 20;
  };

  const getProblems = (leg: LegislationWithCategories): ProblemType[] => {
    const problems: ProblemType[] = [];

    if (isGenericTitle(leg.title, leg.number)) problems.push("generic_title");

    if (!leg.origin || (leg.origin !== "PT" && leg.origin !== "EU")) {
      problems.push("missing_origin");
    }

    if (!leg.publication_date || !leg.effective_date) {
      problems.push("missing_dates");
    }

    if (isInvalidDate(leg.publication_date) || isInvalidDate(leg.effective_date)) {
      problems.push("invalid_dates");
    }

    return problems;
  };

  const hasProblems = (leg: LegislationWithCategories) => getProblems(leg).length > 0;

  const problemLabels: Record<ProblemType, string> = {
    generic_title: "Título genérico",
    missing_origin: "Origem em falta",
    missing_dates: "Datas em falta",
    invalid_dates: "Datas inválidas",
  };

  // Base filtered data (before diploma type filter) for legend counts
  const baseFilteredLegislation = useMemo(() => {
    if (!legislation) return [];

    let result = legislation.filter(leg =>
      leg.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      leg.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      leg.summary?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Filter by date range (publication_date)
    if (filterStartDate) {
      result = result.filter(leg => leg.publication_date && leg.publication_date >= filterStartDate);
    }
    if (filterEndDate) {
      result = result.filter(leg => leg.publication_date && leg.publication_date <= filterEndDate);
    }

    // Filter by "problems"
    if (filterProblems) {
      if (filterProblemType === "all") {
        result = result.filter(hasProblems);
      } else {
        result = result.filter(leg => getProblems(leg).includes(filterProblemType as ProblemType));
      }
    }

    // Filter by "generic title"
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

    // Filter by missing URL
    if (filterMissingUrl) {
      result = result.filter(leg => !leg.document_url || leg.document_url.trim() === '');
    }

    // Filter by missing dates
    if (filterMissingDates) {
      result = result.filter(leg => !leg.publication_date || !leg.effective_date);
    }

    // Filter by invalid dates
    if (filterInvalidDates) {
      result = result.filter(leg => isInvalidDate(leg.publication_date) || isInvalidDate(leg.effective_date));
    }

    // Filter by short summary (PT only)
    if (filterShortSummary) {
      result = result.filter(leg => leg.origin === 'PT' && isShortSummary(leg.summary));
    }

    // Filter by generic title (PT only)
    if (filterGenericTitle) {
      result = result.filter(leg => leg.origin === 'PT' && isGenericTitle(leg.title, leg.number));
    }

    // Filter by theme
    if (!filterNoCategory && !filterProblems && !filterRevoked && filterTheme !== "all") {
      result = result.filter(leg => leg.categories.some(cat => cat.theme_name === filterTheme));
    }

    // Filter by specific category
    if (!filterNoCategory && !filterProblems && !filterRevoked && filterCategory !== "all") {
      result = result.filter(leg => leg.categories.some(cat => cat.id === filterCategory));
    }

    return result;
  }, [legislation, searchTerm, filterStartDate, filterEndDate, filterProblems, filterProblemType, filterGenericTitle, filterRevoked, filterOrigin, filterNoCategory, filterMissingUrl, filterMissingDates, filterInvalidDates, filterShortSummary, filterTheme, filterCategory]);

  // Get unique diploma types from filtered legislation (excluding diploma type filter)
  const availableDiplomaTypes = useMemo(() => {
    const types = new Map<string, number>();
    baseFilteredLegislation.forEach(leg => {
      const type = extractDiplomaType(leg.number || "");
      types.set(type, (types.get(type) || 0) + 1);
    });
    return Array.from(types.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  }, [baseFilteredLegislation]);
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
  function isInvalidDate(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    try {
      const year = new Date(dateStr).getFullYear();
      const currentYear = new Date().getFullYear();
      return year > currentYear + 1 || year < 1900;
    } catch {
      return false;
    }
  }

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
  // Count items with generic titles (PT only for correction purposes)
  const genericTitleCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => 
      leg.origin === 'PT' && isGenericTitle(leg.title, leg.number)
    ).length;
  }, [legislation]);

  // Count items with short summaries (PT only for correction purposes)
  const shortSummaryCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => 
      leg.origin === 'PT' && isShortSummary(leg.summary)
    ).length;
  }, [legislation]);

  // Count items missing URL
  const missingUrlCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => !leg.document_url || leg.document_url.trim() === '').length;
  }, [legislation]);

  // Count items missing dates
  const missingDatesCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => !leg.publication_date || !leg.effective_date).length;
  }, [legislation]);

  // Count items with invalid dates
  const invalidDatesCount = useMemo(() => {
    if (!legislation) return 0;
    return legislation.filter(leg => isInvalidDate(leg.publication_date) || isInvalidDate(leg.effective_date)).length;
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

    // Filter by "generic title" (PT only for correction purposes)
    if (filterGenericTitle) {
      result = result.filter(leg => leg.origin === 'PT' && isGenericTitle(leg.title, leg.number));
    }

    // Filter by "short summary" (PT only for correction purposes)
    if (filterShortSummary) {
      result = result.filter(leg => leg.origin === 'PT' && isShortSummary(leg.summary));
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

    // Filter by diploma type
    if (filterDiplomaType) {
      result = result.filter(leg => extractDiplomaType(leg.number || "") === filterDiplomaType);
    }

    // Filter by "no category"
    if (filterNoCategory) {
      result = result.filter(leg => leg.categories.length === 0);
    }

    // Filter by missing URL
    if (filterMissingUrl) {
      result = result.filter(leg => !leg.document_url || leg.document_url.trim() === '');
    }

    // Filter by missing dates
    if (filterMissingDates) {
      result = result.filter(leg => !leg.publication_date || !leg.effective_date);
    }

    // Filter by invalid dates
    if (filterInvalidDates) {
      result = result.filter(leg => isInvalidDate(leg.publication_date) || isInvalidDate(leg.effective_date));
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
  }, [legislation, searchTerm, filterTheme, filterCategory, filterNoCategory, filterProblems, filterGenericTitle, filterRevoked, filterOrigin, filterDiplomaType, filterStartDate, filterEndDate, sortField, sortOrder]);

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
    <div className="space-y-4 sm:space-y-6">
      {/* Panel Mode Tabs - Mobile optimized */}
      {/* Stats at the top - Always visible */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4 mb-4">
        <AnimatedStatCard
          label="Total de Legislação"
          value={legislation?.length || 0}
          previousValue={periodStats.previous.total > 0 ? (legislation?.length || 0) - periodStats.current.total + periodStats.previous.total : undefined}
        />
        <AnimatedStatCard
          label="DRE (Portugal)"
          value={dreCount}
          previousValue={periodStats.previous.dre > 0 ? dreCount - periodStats.current.dre + periodStats.previous.dre : undefined}
          titleClassName="text-green-600"
        />
        <AnimatedStatCard
          label="EUR-Lex (UE)"
          value={eurlexCount}
          previousValue={periodStats.previous.eurlex > 0 ? eurlexCount - periodStats.current.eurlex + periodStats.previous.eurlex : undefined}
          titleClassName="text-blue-600"
        />
        <AnimatedStatCard
          label="Revogados"
          value={revokedCount}
          previousValue={periodStats.previous.revoked > 0 ? revokedCount - periodStats.current.revoked + periodStats.previous.revoked : undefined}
          icon={revokedCount > 0 ? Ban : undefined}
          iconClassName="text-slate-600"
          titleClassName={revokedCount > 0 ? "text-slate-600" : ""}
          className={revokedCount > 0 ? "border-slate-400 bg-slate-50/50" : ""}
        />
      </div>

      <Tabs value={panelMode} onValueChange={(v) => setPanelMode(v as PanelMode)} className="w-full">
        <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-full sm:w-auto h-auto gap-1 p-1">
            <TabsTrigger value="global" className="flex-1 sm:flex-none gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Globe2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Global</span>
              <span className="xs:hidden">Glob.</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex-1 sm:flex-none gap-1.5 px-3 py-2 text-xs sm:text-sm">
              <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Clientes</span>
              <span className="xs:hidden">Cli.</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="global" className="mt-4">
          <GlobalApplicabilityPanel />
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <ClientLegislationImportPanel />
        </TabsContent>
      </Tabs>

      {/* List View */}
      {viewMode === "list" && (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardDescription className="text-base">
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

              {/* Data Quality Filters */}
              <Button
                variant={filterNoCategory ? "default" : "outline"}
                size="sm"
                onClick={toggleNoCategoryFilter}
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  filterNoCategory && "bg-amber-600 hover:bg-amber-700 text-white"
                )}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sem Categoria</span>
                <span className="sm:hidden">S/Cat</span>
                ({noCategoryCount})
              </Button>

              <Button
                variant={filterMissingUrl ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterMissingUrl(prev => !prev);
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  filterMissingUrl && "bg-rose-600 hover:bg-rose-700 text-white"
                )}
              >
                <Link2Off className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sem URL</span>
                <span className="sm:hidden">S/URL</span>
                ({missingUrlCount})
              </Button>

              <Button
                variant={filterMissingDates ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterMissingDates(prev => !prev);
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  filterMissingDates && "bg-orange-600 hover:bg-orange-700 text-white"
                )}
              >
                <CalendarX className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Datas em Falta</span>
                <span className="sm:hidden">S/Datas</span>
                ({missingDatesCount})
              </Button>

              <Button
                variant={filterInvalidDates ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterInvalidDates(prev => !prev);
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  filterInvalidDates && "bg-red-600 hover:bg-red-700 text-white"
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Datas Inválidas</span>
                <span className="sm:hidden">Datas Inv.</span>
                ({invalidDatesCount})
              </Button>

              {/* New PT-specific correction filters */}
              <Button
                variant={filterGenericTitle ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterGenericTitle(prev => !prev);
                  if (!filterGenericTitle) setFilterOrigin("PT");
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  filterGenericTitle && "bg-yellow-600 hover:bg-yellow-700 text-white"
                )}
              >
                <FileQuestion className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Títulos Genéricos</span>
                <span className="sm:hidden">Títulos</span>
                ({genericTitleCount})
              </Button>

              <Button
                variant={filterShortSummary ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterShortSummary(prev => !prev);
                  if (!filterShortSummary) setFilterOrigin("PT");
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  filterShortSummary && "bg-sky-600 hover:bg-sky-700 text-white"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sumários Curtos</span>
                <span className="sm:hidden">Sumários</span>
                ({shortSummaryCount})
              </Button>

              <Button
                variant={filterRevoked ? "default" : "outline"}
                size="sm"
                onClick={toggleRevokedFilter}
                className={cn(
                  "h-7 px-2 text-xs gap-1",
                  filterRevoked && "bg-gray-700 hover:bg-gray-800 text-white"
                )}
              >
                <Ban className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Revogados</span>
                ({revokedCount})
              </Button>

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

            {/* Diploma Types Legend - Dynamic */}
            {availableDiplomaTypes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-muted-foreground mr-1">Tipos:</span>
                {availableDiplomaTypes.map(({ type, count }) => (
                  <button
                    key={type}
                    onClick={() => {
                      setFilterDiplomaType(filterDiplomaType === type ? null : type);
                      setCurrentPage(1);
                    }}
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-all ${getDiplomaTypeColors(type)} ${
                      filterDiplomaType === type ? "ring-2 ring-offset-1 ring-primary shadow-sm" : "hover:opacity-80"
                    }`}
                  >
                    {type}
                    <span className="ml-1 opacity-60">({count})</span>
                  </button>
                ))}
                {filterDiplomaType && (
                  <button
                    onClick={() => {
                      setFilterDiplomaType(null);
                      setCurrentPage(1);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-2 px-2 py-0.5 rounded border border-dashed hover:border-solid transition-all"
                  >
                    <FileText className="h-3 w-3" />
                    Limpar tipo
                  </button>
                )}
              </div>
            )}

            {/* Filter Results Counter */}
            {legislation && filteredAndSortedLegislation.length !== legislation.length && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border border-primary/20 rounded-lg">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm">
                  Mostrando <span className="font-semibold text-primary">{filteredAndSortedLegislation.length}</span> de{" "}
                  <span className="font-semibold">{legislation.length}</span> diplomas
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs ml-auto"
                  onClick={() => {
                    setSearchTerm("");
                    setFilterTheme("all");
                    setFilterCategory("all");
                    setFilterNoCategory(false);
                    setFilterProblems(false);
                    setFilterProblemType("all");
                    setFilterRevoked(false);
                    setFilterGenericTitle(false);
                    setFilterOrigin("all");
                    setFilterDiplomaType(null);
                    setFilterStartDate(null);
                    setFilterEndDate(null);
                    setFilterMissingUrl(false);
                    setFilterMissingDates(false);
                    setFilterInvalidDates(false);
                    setCurrentPage(1);
                  }}
                >
                  Limpar filtros
                </Button>
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
