import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Save, ChevronRight, ChevronDown, FolderTree } from "lucide-react";
import { useThemesWithCategories, type ThemeCategory } from "@/hooks/useThemes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { LegislationWithCategories } from "@/hooks/useLegislation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface AssignCategoriesDialogProps {
  legislation: LegislationWithCategories | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CategoryNode extends ThemeCategory {
  children: CategoryNode[];
  path: string;
}

function buildCategoryTree(categories: ThemeCategory[], themeName: string): CategoryNode[] {
  const categoryMap = new Map<string, CategoryNode>();
  
  // Create nodes for all categories
  categories.forEach(cat => {
    categoryMap.set(cat.id, { 
      ...cat, 
      children: [],
      path: themeName
    });
  });
  
  // Build tree structure
  const rootCategories: CategoryNode[] = [];
  
  categories.forEach(cat => {
    const node = categoryMap.get(cat.id)!;
    
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      const parent = categoryMap.get(cat.parent_id)!;
      node.path = `${parent.path} → ${parent.name}`;
      parent.children.push(node);
    } else {
      rootCategories.push(node);
    }
  });
  
  // Sort children alphabetically
  const sortNodes = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    nodes.forEach(node => sortNodes(node.children));
  };
  sortNodes(rootCategories);
  
  return rootCategories;
}

interface CategoryItemProps {
  category: CategoryNode;
  selectedCategories: string[];
  toggleCategory: (id: string) => void;
  level: number;
  expandedCategories: Set<string>;
  toggleExpanded: (id: string) => void;
}

function CategoryItem({ 
  category, 
  selectedCategories, 
  toggleCategory, 
  level,
  expandedCategories,
  toggleExpanded
}: CategoryItemProps) {
  const hasChildren = category.children.length > 0;
  const isExpanded = expandedCategories.has(category.id);
  const isSelected = selectedCategories.includes(category.id);
  
  // Check if any descendant is selected
  const hasSelectedDescendant = useMemo(() => {
    const checkDescendants = (node: CategoryNode): boolean => {
      if (selectedCategories.includes(node.id)) return true;
      return node.children.some(child => checkDescendants(child));
    };
    return category.children.some(child => checkDescendants(child));
  }, [category, selectedCategories]);

  return (
    <div className="space-y-1">
      <div 
        className={cn(
          "flex items-center gap-2 rounded-lg border p-2 transition-colors",
          isSelected ? "bg-primary/10 border-primary/30" : "hover:bg-accent/50",
          hasSelectedDescendant && !isSelected && "border-primary/20"
        )}
        style={{ marginLeft: `${level * 16}px` }}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 p-0"
            onClick={() => toggleExpanded(category.id)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <div className="w-6" />
        )}
        
        <Checkbox
          id={category.id}
          checked={isSelected}
          onCheckedChange={() => toggleCategory(category.id)}
        />
        
        <Label 
          htmlFor={category.id} 
          className={cn(
            "flex-1 cursor-pointer text-sm",
            hasChildren && "font-medium"
          )}
        >
          {category.name}
        </Label>
        
        {hasChildren && (
          <Badge variant="outline" className="text-xs">
            {category.children.length}
          </Badge>
        )}
      </div>
      
      {hasChildren && isExpanded && (
        <div className="space-y-1">
          {category.children.map(child => (
            <CategoryItem
              key={child.id}
              category={child}
              selectedCategories={selectedCategories}
              toggleCategory={toggleCategory}
              level={level + 1}
              expandedCategories={expandedCategories}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AssignCategoriesDialog({ legislation, open, onOpenChange }: AssignCategoriesDialogProps) {
  const { data: themes, isLoading: themesLoading } = useThemesWithCategories();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Build category trees for each theme
  const themesWithTrees = useMemo(() => {
    if (!themes) return [];
    return themes.map(theme => ({
      ...theme,
      categoryTree: buildCategoryTree(theme.categories, theme.name)
    }));
  }, [themes]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!legislation) return;

      // Delete existing mappings
      await supabase
        .from("legislation_category_mapping")
        .delete()
        .eq("legislation_id", legislation.id);

      // Insert new mappings
      if (selectedCategories.length > 0) {
        const mappings = selectedCategories.map(catId => ({
          legislation_id: legislation.id,
          category_id: catId,
        }));

        const { error } = await supabase
          .from("legislation_category_mapping")
          .insert(mappings);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      toast({
        title: "Categorias atualizadas",
        description: `${selectedCategories.length} categoria(s) atribuída(s)`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar",
        variant: "destructive",
      });
    },
  });

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const toggleThemeExpanded = (themeId: string) => {
    setExpandedThemes(prev => {
      const next = new Set(prev);
      if (next.has(themeId)) {
        next.delete(themeId);
      } else {
        next.add(themeId);
      }
      return next;
    });
  };

  const toggleCategoryExpanded = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!themes) return;
    const allThemeIds = new Set(themes.map(t => t.id));
    const allCategoryIds = new Set<string>();
    themes.forEach(t => t.categories.forEach(c => allCategoryIds.add(c.id)));
    setExpandedThemes(allThemeIds);
    setExpandedCategories(allCategoryIds);
  };

  const collapseAll = () => {
    setExpandedThemes(new Set());
    setExpandedCategories(new Set());
  };

  // Reset selection when legislation changes
  const handleOpenChange = (open: boolean) => {
    if (open && legislation) {
      setSelectedCategories(legislation.categories.map(c => c.id));
      // Auto-expand themes that have selected categories
      const themesWithSelected = new Set<string>();
      const categoriesWithSelected = new Set<string>();
      
      legislation.categories.forEach(cat => {
        // Find the theme for this category
        themes?.forEach(theme => {
          const hasCategory = theme.categories.some(c => c.id === cat.id);
          if (hasCategory) {
            themesWithSelected.add(theme.id);
            // Also expand parent categories
            const findParents = (catId: string) => {
              const category = theme.categories.find(c => c.id === catId);
              if (category?.parent_id) {
                categoriesWithSelected.add(category.parent_id);
                findParents(category.parent_id);
              }
            };
            findParents(cat.id);
          }
        });
      });
      
      setExpandedThemes(themesWithSelected);
      setExpandedCategories(categoriesWithSelected);
    }
    onOpenChange(open);
  };

  // Count selected per theme
  const getThemeSelectedCount = (themeId: string) => {
    const theme = themes?.find(t => t.id === themeId);
    if (!theme) return 0;
    return theme.categories.filter(c => selectedCategories.includes(c.id)).length;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Atribuir Categorias
          </DialogTitle>
          <DialogDescription>
            {legislation?.number} - {legislation?.title}
          </DialogDescription>
        </DialogHeader>

        {themesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Expand/Collapse controls */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expandir Tudo
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Colapsar Tudo
              </Button>
            </div>

            {/* Theme list */}
            <div className="space-y-2">
              {themesWithTrees.map(theme => {
                const isThemeExpanded = expandedThemes.has(theme.id);
                const selectedCount = getThemeSelectedCount(theme.id);
                
                return (
                  <Collapsible 
                    key={theme.id} 
                    open={isThemeExpanded}
                    onOpenChange={() => toggleThemeExpanded(theme.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                        isThemeExpanded ? "bg-accent" : "hover:bg-accent/50",
                        selectedCount > 0 && "border-primary/30"
                      )}>
                        {isThemeExpanded ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                        <span className="font-semibold flex-1">{theme.name}</span>
                        <Badge variant={selectedCount > 0 ? "default" : "secondary"}>
                          {selectedCount} / {theme.categories.length}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 ml-4 space-y-1 pb-2">
                        {theme.categoryTree.map(category => (
                          <CategoryItem
                            key={category.id}
                            category={category}
                            selectedCategories={selectedCategories}
                            toggleCategory={toggleCategory}
                            level={0}
                            expandedCategories={expandedCategories}
                            toggleExpanded={toggleCategoryExpanded}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>

            {/* Selected summary */}
            {selectedCategories.length > 0 && (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium mb-2">Categorias selecionadas:</p>
                <div className="flex flex-wrap gap-1">
                  {selectedCategories.map(catId => {
                    // Find category name and theme
                    let categoryName = "";
                    let themeName = "";
                    themes?.forEach(theme => {
                      const cat = theme.categories.find(c => c.id === catId);
                      if (cat) {
                        categoryName = cat.name;
                        themeName = theme.name;
                      }
                    });
                    return (
                      <Badge 
                        key={catId} 
                        variant="outline" 
                        className="text-xs cursor-pointer hover:bg-destructive/10"
                        onClick={() => toggleCategory(catId)}
                      >
                        {themeName} → {categoryName} ✕
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                {selectedCategories.length} categoria(s) selecionada(s)
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
