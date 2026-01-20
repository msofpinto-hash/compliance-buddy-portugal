import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { 
  LayoutGrid, 
  Leaf, 
  Shield, 
  Zap, 
  Award, 
  Heart, 
  Folder,
  Search,
  X,
  ChevronRight,
  AlertTriangle,
  Layers,
  Edit,
  FileQuestion,
  ExternalLink,
  Trash2,
  RefreshCw,
  Loader2,
  CheckSquare,
  Square,
  Sparkles
} from "lucide-react";
import { useThemesWithCategories, type ThemeWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories, type LegislationWithCategories } from "@/hooks/useLegislation";
import { AssignCategoriesDialog } from "./AssignCategoriesDialog";
import { ManageRequirementsDialog } from "./ManageRequirementsDialog";
import { EditLegislationDialog } from "./EditLegislationDialog";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// Theme icons and colors mapping
const themeConfig: Record<string, { icon: React.ElementType; color: string; bgLight: string; bgDark: string; border: string }> = {
  "Ambiente": { icon: Leaf, color: "text-emerald-600", bgLight: "bg-emerald-100", bgDark: "dark:bg-emerald-900/40", border: "border-emerald-300 dark:border-emerald-700" },
  "SST": { icon: Shield, color: "text-orange-600", bgLight: "bg-orange-100", bgDark: "dark:bg-orange-900/40", border: "border-orange-300 dark:border-orange-700" },
  "Segurança e Saúde no Trabalho": { icon: Shield, color: "text-orange-600", bgLight: "bg-orange-100", bgDark: "dark:bg-orange-900/40", border: "border-orange-300 dark:border-orange-700" },
  "Energia": { icon: Zap, color: "text-yellow-600", bgLight: "bg-yellow-100", bgDark: "dark:bg-yellow-900/40", border: "border-yellow-300 dark:border-yellow-700" },
  "Qualidade": { icon: Award, color: "text-blue-600", bgLight: "bg-blue-100", bgDark: "dark:bg-blue-900/40", border: "border-blue-300 dark:border-blue-700" },
  "Segurança": { icon: Shield, color: "text-red-600", bgLight: "bg-red-100", bgDark: "dark:bg-red-900/40", border: "border-red-300 dark:border-red-700" },
  "Conciliação Familiar e Profissional": { icon: Heart, color: "text-pink-600", bgLight: "bg-pink-100", bgDark: "dark:bg-pink-900/40", border: "border-pink-300 dark:border-pink-700" },
};

// Generic title patterns (auto-imported placeholders)
const genericTitlePatterns = [
  "Documento ",
  "Diploma referenciado",
  "a aguardar importação",
];

const isGenericTitle = (title: string): boolean => {
  return genericTitlePatterns.some(pattern => 
    title.toLowerCase().includes(pattern.toLowerCase())
  ) || title.length < 10;
};

// Check if legislation has problems
const hasProblems = (leg: LegislationWithCategories): boolean => {
  if (isGenericTitle(leg.title)) return true;
  if (!leg.origin || (leg.origin !== "PT" && leg.origin !== "EU")) return true;
  if (!leg.publication_date || !leg.effective_date) return true;
  return false;
};

interface CategoryNode {
  id: string;
  name: string;
  parent_id: string | null;
  theme_id: string;
  count: number;
  problemCount: number;
  noCategoryCount: number;
  children: CategoryNode[];
}

export function MaintenanceThemeBrowser() {
  const { data: themes, isLoading: themesLoading } = useThemesWithCategories();
  const { data: legislation, isLoading: legLoading } = useLegislationWithCategories();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showOnlyProblems, setShowOnlyProblems] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [extractConfirmOpen, setExtractConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Dialogs
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedLegislation, setSelectedLegislation] = useState<LegislationWithCategories | null>(null);

  // Calculate stats per theme
  const themeStats = useMemo(() => {
    if (!themes || !legislation) return new Map<string, { total: number; problems: number; noCategory: number }>();
    
    const stats = new Map<string, { total: number; problems: number; noCategory: number }>();
    
    themes.forEach(theme => {
      const themeLegislation = legislation.filter(leg => 
        leg.categories.some(cat => cat.theme_name === theme.name)
      );
      
      stats.set(theme.id, {
        total: themeLegislation.length,
        problems: themeLegislation.filter(hasProblems).length,
        noCategory: 0, // Will be calculated differently
      });
    });
    
    // Count legislation without any category
    const noCategoryLegislation = legislation.filter(leg => leg.categories.length === 0);
    stats.set("no-category", {
      total: noCategoryLegislation.length,
      problems: noCategoryLegislation.filter(hasProblems).length,
      noCategory: noCategoryLegislation.length,
    });
    
    return stats;
  }, [themes, legislation]);

  // Get selected theme
  const selectedTheme = useMemo(() => {
    if (!selectedThemeId || !themes) return null;
    return themes.find(t => t.id === selectedThemeId) || null;
  }, [selectedThemeId, themes]);

  // Build category tree for selected theme
  const categoryTree = useMemo(() => {
    if (!selectedTheme || !legislation) return [];

    const categoryCounts = new Map<string, { count: number; problemCount: number }>();
    
    // Count legislation per category
    legislation.forEach(leg => {
      leg.categories.forEach(cat => {
        const current = categoryCounts.get(cat.id) || { count: 0, problemCount: 0 };
        current.count++;
        if (hasProblems(leg)) current.problemCount++;
        categoryCounts.set(cat.id, current);
      });
    });

    // Build tree
    const buildTree = (categories: ThemeWithCategories["categories"], parentId: string | null = null): CategoryNode[] => {
      return categories
        .filter(cat => cat.parent_id === parentId)
        .map(cat => {
          const counts = categoryCounts.get(cat.id) || { count: 0, problemCount: 0 };
          return {
            id: cat.id,
            name: cat.name,
            parent_id: cat.parent_id,
            theme_id: cat.theme_id,
            count: counts.count,
            problemCount: counts.problemCount,
            noCategoryCount: 0,
            children: buildTree(categories, cat.id),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    };

    return buildTree(selectedTheme.categories);
  }, [selectedTheme, legislation]);

  // Filter legislation based on selections
  const filteredLegislation = useMemo(() => {
    if (!legislation) return [];

    let result = legislation;

    // Filter by search
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      result = result.filter(leg =>
        leg.title.toLowerCase().includes(searchLower) ||
        leg.number.toLowerCase().includes(searchLower) ||
        leg.summary?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by theme or "no category"
    if (selectedThemeId === "no-category") {
      result = result.filter(leg => leg.categories.length === 0);
    } else if (selectedThemeId && themes) {
      const themeName = themes.find(t => t.id === selectedThemeId)?.name;
      if (themeName) {
        result = result.filter(leg =>
          leg.categories.some(cat => cat.theme_name === themeName)
        );
      }
    }

    // Filter by category
    if (selectedCategoryId) {
      result = result.filter(leg =>
        leg.categories.some(cat => cat.id === selectedCategoryId)
      );
    }

    // Filter by problems
    if (showOnlyProblems) {
      result = result.filter(hasProblems);
    }

    return result;
  }, [legislation, searchTerm, selectedThemeId, selectedCategoryId, showOnlyProblems, themes]);

  // Handlers
  const handleThemeClick = (themeId: string) => {
    if (selectedThemeId === themeId) {
      setSelectedThemeId(null);
      setSelectedCategoryId(null);
    } else {
      setSelectedThemeId(themeId);
      setSelectedCategoryId(null);
    }
  };

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategoryId(categoryId === selectedCategoryId ? null : categoryId);
  };

  const handleEditLegislation = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setEditDialogOpen(true);
  };

  const handleEditCategories = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setCategoriesDialogOpen(true);
  };

  const handleEditRequirements = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setRequirementsDialogOpen(true);
  };

  // Selection handlers
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

  const selectAllVisible = () => {
    const visibleIds = filteredLegislation.slice(0, 50).map(leg => leg.id);
    setSelectedIds(new Set(visibleIds));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk delete requirements
  const handleBulkDeleteRequirements = async () => {
    if (selectedIds.size === 0) return;
    
    setIsProcessing(true);
    try {
      const idsArray = Array.from(selectedIds);
      
      // Delete all requirements for selected legislation
      const { error } = await supabase
        .from("legal_requirements")
        .delete()
        .in("legislation_id", idsArray);

      if (error) throw error;

      toast({
        title: "Requisitos eliminados",
        description: `Requisitos de ${idsArray.length} diploma(s) eliminados com sucesso.`,
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      setDeleteConfirmOpen(false);
      clearSelection();
    } catch (error: any) {
      console.error("Error deleting requirements:", error);
      toast({
        title: "Erro ao eliminar",
        description: error.message || "Não foi possível eliminar os requisitos.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Bulk extract requirements
  const handleBulkExtractRequirements = async () => {
    if (selectedIds.size === 0) return;
    
    setIsProcessing(true);
    try {
      const idsArray = Array.from(selectedIds);

      // Create a sync log for tracking
      const { data: syncLog, error: logError } = await supabase
        .from("sync_logs")
        .insert({
          sync_type: "bulk_extract_requirements",
          status: "running",
          items_processed: 0,
          items_added: 0,
        })
        .select()
        .single();

      if (logError) throw logError;

      // Process each legislation (call extract-requirements for each)
      let processed = 0;
      let added = 0;
      const errors: string[] = [];

      for (const legislationId of idsArray) {
        try {
          const { data, error } = await supabase.functions.invoke("extract-requirements", {
            body: { legislationId, forceReplace: true },
          });

          if (error) {
            errors.push(`${legislationId}: ${error.message}`);
          } else {
            processed++;
            added += data?.requirementsCount || 0;
          }
        } catch (err: any) {
          errors.push(`${legislationId}: ${err.message}`);
        }
      }

      // Update sync log
      await supabase
        .from("sync_logs")
        .update({
          status: errors.length > 0 ? "completed_with_errors" : "completed",
          completed_at: new Date().toISOString(),
          items_processed: processed,
          items_added: added,
          error_message: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
        })
        .eq("id", syncLog.id);

      toast({
        title: "Extração concluída",
        description: `${processed} diploma(s) processados, ${added} requisitos extraídos.${errors.length > 0 ? ` ${errors.length} erros.` : ""}`,
      });

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      setExtractConfirmOpen(false);
      clearSelection();
    } catch (error: any) {
      console.error("Error extracting requirements:", error);
      toast({
        title: "Erro na extração",
        description: error.message || "Não foi possível extrair os requisitos.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const isLoading = themesLoading || legLoading;

  // Render category tree item
  const renderCategoryItem = (category: CategoryNode, depth: number = 0) => {
    const isSelected = selectedCategoryId === category.id;
    const hasChildren = category.children.length > 0;
    
    return (
      <div key={category.id}>
        <button
          onClick={() => handleCategoryClick(category.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
            "hover:bg-muted/50",
            isSelected && "bg-primary/10 text-primary font-medium",
            depth > 0 && "ml-4"
          )}
          style={{ paddingLeft: `${(depth * 16) + 12}px` }}
        >
          {hasChildren && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          {!hasChildren && <div className="w-3" />}
          <span className="flex-1 text-left truncate">{category.name}</span>
          <div className="flex items-center gap-1">
            {category.problemCount > 0 && (
              <Badge variant="destructive" className="h-5 text-xs">
                {category.problemCount}
              </Badge>
            )}
            <Badge variant="secondary" className="h-5 text-xs">
              {category.count}
            </Badge>
          </div>
        </button>
        {hasChildren && category.children.map(child => renderCategoryItem(child, depth + 1))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const noCategoryStats = themeStats.get("no-category");

  return (
    <div className="space-y-4">
      {/* Theme Icons Bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Navegação por Temas</CardTitle>
          <CardDescription>Selecione um tema para ver e corrigir diplomas</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {/* All themes button */}
            <motion.button
              onClick={() => { setSelectedThemeId(null); setSelectedCategoryId(null); }}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 min-w-[80px] shrink-0",
                !selectedThemeId 
                  ? "bg-primary/10 border-2 border-primary/50 shadow-sm" 
                  : "bg-muted/30 border-2 border-transparent hover:border-muted hover:bg-muted/50"
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                !selectedThemeId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                <LayoutGrid className="h-5 w-5" />
              </div>
              <span className={cn(
                "text-xs font-medium",
                !selectedThemeId ? "text-primary" : "text-muted-foreground"
              )}>
                Todos
              </span>
            </motion.button>

            {/* No Category button */}
            <motion.button
              onClick={() => handleThemeClick("no-category")}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 min-w-[80px] shrink-0 relative",
                selectedThemeId === "no-category"
                  ? "bg-amber-100 dark:bg-amber-900/40 border-2 border-amber-300 dark:border-amber-700 shadow-sm"
                  : "bg-muted/30 border-2 border-transparent hover:border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                selectedThemeId === "no-category" 
                  ? "bg-amber-500 text-white" 
                  : "bg-amber-100 dark:bg-amber-900/50 text-amber-600"
              )}>
                <Layers className="h-5 w-5" />
              </div>
              <span className={cn(
                "text-xs font-medium",
                selectedThemeId === "no-category" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
              )}>
                Sem Cat.
              </span>
              {(noCategoryStats?.total || 0) > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 min-w-[20px] text-xs px-1"
                >
                  {noCategoryStats?.total}
                </Badge>
              )}
            </motion.button>

            {/* Theme buttons */}
            {themes?.map((theme, index) => {
              const config = themeConfig[theme.name] || { icon: Folder, color: "text-slate-600", bgLight: "bg-slate-100", bgDark: "dark:bg-slate-800", border: "border-slate-300" };
              const ThemeIcon = config.icon;
              const isSelected = selectedThemeId === theme.id;
              const stats = themeStats.get(theme.id);
              
              return (
                <motion.button
                  key={theme.id}
                  onClick={() => handleThemeClick(theme.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 min-w-[80px] shrink-0 relative",
                    isSelected 
                      ? cn(config.bgLight, config.bgDark, "border-2", config.border, "shadow-sm")
                      : "bg-muted/30 border-2 border-transparent hover:border-muted hover:bg-muted/50"
                  )}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: 0.05 * index }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    isSelected ? cn(config.bgLight, config.bgDark) : "bg-muted"
                  )}>
                    <ThemeIcon className={cn("h-5 w-5", config.color)} />
                  </div>
                  <span className={cn(
                    "text-xs font-medium text-center leading-tight",
                    isSelected ? config.color : "text-muted-foreground"
                  )}>
                    {theme.name.length > 10 ? theme.name.substring(0, 10) + "..." : theme.name}
                  </span>
                  {(stats?.problems || 0) > 0 && (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 min-w-[20px] text-xs px-1"
                    >
                      {stats?.problems}
                    </Badge>
                  )}
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Category Sidebar (when theme selected) */}
        {selectedThemeId && selectedThemeId !== "no-category" && categoryTree.length > 0 && (
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Categorias</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[400px]">
                <div className="space-y-0.5">
                  {categoryTree.map(cat => renderCategoryItem(cat))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Legislation List */}
        <Card className={cn(
          selectedThemeId && selectedThemeId !== "no-category" && categoryTree.length > 0
            ? "lg:col-span-3"
            : "lg:col-span-4"
        )}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  {selectedThemeId === "no-category" && (
                    <>
                      <Layers className="h-4 w-4 text-amber-600" />
                      Diplomas Sem Categoria
                    </>
                  )}
                  {selectedThemeId && selectedThemeId !== "no-category" && selectedTheme && (
                    <>
                      {(() => {
                        const config = themeConfig[selectedTheme.name];
                        const ThemeIcon = config?.icon || Folder;
                        return <ThemeIcon className={cn("h-4 w-4", config?.color || "text-muted-foreground")} />;
                      })()}
                      {selectedTheme.name}
                    </>
                  )}
                  {!selectedThemeId && "Todos os Diplomas"}
                </CardTitle>
                <CardDescription>
                  {filteredLegislation.length} diploma{filteredLegislation.length !== 1 ? "s" : ""}
                  {showOnlyProblems && " com problemas"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-8 w-[200px]"
                  />
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      onClick={() => setSearchTerm("")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {/* Problems filter toggle */}
                <Button
                  variant={showOnlyProblems ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowOnlyProblems(!showOnlyProblems)}
                  className="gap-1"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {showOnlyProblems ? "Com Problemas" : "Todos"}
                </Button>
              </div>
            </div>
            
            {/* Selection Actions Bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 mt-3 p-2 bg-primary/10 rounded-lg border border-primary/20">
                <Badge variant="secondary" className="gap-1">
                  <CheckSquare className="h-3 w-3" />
                  {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
                </Badge>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                  className="gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar Requisitos
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setExtractConfirmOpen(true)}
                  className="gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Reimportar Requisitos
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {/* Select All Header */}
            {filteredLegislation.length > 0 && (
              <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                <Checkbox
                  checked={selectedIds.size > 0 && selectedIds.size === Math.min(filteredLegislation.length, 50)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      selectAllVisible();
                    } else {
                      clearSelection();
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size === 0 
                    ? "Selecionar todos (máx. 50)" 
                    : `${selectedIds.size} selecionado${selectedIds.size !== 1 ? "s" : ""}`
                  }
                </span>
              </div>
            )}
            <ScrollArea className="h-[400px]">
              {filteredLegislation.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Layers className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-sm">Nenhum diploma encontrado</p>
                  {showOnlyProblems && (
                    <p className="text-xs mt-1">Tente desativar o filtro "Com Problemas"</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLegislation.slice(0, 50).map((leg) => {
                    const problems: string[] = [];
                    if (isGenericTitle(leg.title)) problems.push("Título genérico");
                    if (!leg.origin || (leg.origin !== "PT" && leg.origin !== "EU")) problems.push("Sem origem");
                    if (!leg.publication_date) problems.push("Sem data pub.");
                    if (!leg.effective_date) problems.push("Sem data vig.");
                    if (leg.categories.length === 0) problems.push("Sem categoria");

                    const isSelected = selectedIds.has(leg.id);

                    return (
                      <div
                        key={leg.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors",
                          isSelected && "bg-primary/5 border-primary/30"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectLegislation(leg.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "shrink-0 text-xs",
                                leg.origin === "PT" && "border-green-300 text-green-700 bg-green-50 dark:bg-green-900/20",
                                leg.origin === "EU" && "border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-900/20",
                                !leg.origin && "border-gray-300 text-gray-500"
                              )}
                            >
                              {leg.origin || "?"}
                            </Badge>
                            <span className="text-xs text-muted-foreground font-medium">
                              {leg.number}
                            </span>
                          </div>
                          <Link 
                            to={`/legislacao/${leg.id}`}
                            className="font-medium text-sm hover:underline line-clamp-2"
                          >
                            {leg.title}
                          </Link>
                          {problems.length > 0 && (
                            <div className="flex items-center gap-1 mt-2 flex-wrap">
                              {problems.map((p, i) => (
                                <Badge key={i} variant="destructive" className="text-xs h-5">
                                  {p}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditLegislation(leg)}
                            title="Editar dados"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditCategories(leg)}
                            title="Editar categorias"
                          >
                            <Layers className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditRequirements(leg)}
                            title="Editar requisitos"
                          >
                            <FileQuestion className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            asChild
                          >
                            <Link to={`/legislacao/${leg.id}`} title="Ver detalhes">
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredLegislation.length > 50 && (
                    <p className="text-center text-sm text-muted-foreground py-4">
                      Mostrando 50 de {filteredLegislation.length} resultados. 
                      Use a pesquisa para refinar.
                    </p>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

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
      {selectedLegislation && (
        <EditLegislationDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          legislation={selectedLegislation}
        />
      )}

      {/* Delete Requirements Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Eliminar Requisitos
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja eliminar <strong>todos os requisitos</strong> dos {selectedIds.size} diploma(s) selecionado(s)?
              <br /><br />
              <span className="text-destructive font-medium">Esta ação é irreversível.</span> Os requisitos eliminados também removerão as aplicabilidades e planos de ação associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDeleteRequirements}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  A eliminar...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar Requisitos
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Extract Requirements Confirmation Dialog */}
      <AlertDialog open={extractConfirmOpen} onOpenChange={setExtractConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Reimportar Requisitos
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vai reimportar requisitos para {selectedIds.size} diploma(s) selecionado(s).
              <br /><br />
              <strong>Atenção:</strong> Os requisitos existentes serão substituídos pelos novos requisitos extraídos. Este processo pode demorar alguns minutos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkExtractRequirements}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  A extrair...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Reimportar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
