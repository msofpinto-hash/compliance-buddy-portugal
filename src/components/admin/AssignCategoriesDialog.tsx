import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, ChevronRight, ChevronDown, FolderTree, Search, Sparkles, X, Check, Tags, Layers } from "lucide-react";
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
  fullPath: string;
  themeName: string;
}

function buildCategoryTree(categories: ThemeCategory[], themeName: string): CategoryNode[] {
  const categoryMap = new Map<string, CategoryNode>();
  
  // Create nodes for all categories
  categories.forEach(cat => {
    categoryMap.set(cat.id, { 
      ...cat, 
      children: [],
      path: themeName,
      fullPath: `${themeName} → ${cat.name}`,
      themeName
    });
  });
  
  // Build tree structure and full paths
  const rootCategories: CategoryNode[] = [];
  
  categories.forEach(cat => {
    const node = categoryMap.get(cat.id)!;
    
    if (cat.parent_id && categoryMap.has(cat.parent_id)) {
      const parent = categoryMap.get(cat.parent_id)!;
      node.path = `${parent.path} → ${parent.name}`;
      node.fullPath = `${parent.fullPath} → ${cat.name}`;
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

// Flatten tree for search
function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  let result: CategoryNode[] = [];
  nodes.forEach(node => {
    result.push(node);
    result = [...result, ...flattenTree(node.children)];
  });
  return result;
}

interface CategoryItemProps {
  category: CategoryNode;
  selectedCategories: string[];
  toggleCategory: (id: string) => void;
  level: number;
  expandedCategories: Set<string>;
  toggleExpanded: (id: string) => void;
  highlightText?: string;
}

function CategoryItem({ 
  category, 
  selectedCategories, 
  toggleCategory, 
  level,
  expandedCategories,
  toggleExpanded,
  highlightText
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

  // Highlight matching text
  const highlightName = (name: string) => {
    if (!highlightText) return name;
    const idx = name.toLowerCase().indexOf(highlightText.toLowerCase());
    if (idx === -1) return name;
    return (
      <>
        {name.slice(0, idx)}
        <mark className="bg-yellow-200 rounded px-0.5">{name.slice(idx, idx + highlightText.length)}</mark>
        {name.slice(idx + highlightText.length)}
      </>
    );
  };

  return (
    <div className="space-y-0.5">
      <div 
        className={cn(
          "flex items-center gap-2 rounded-lg border p-2 transition-all cursor-pointer",
          isSelected 
            ? "bg-primary/10 border-primary/40 shadow-sm" 
            : "hover:bg-accent/50 border-transparent hover:border-border",
          hasSelectedDescendant && !isSelected && "border-primary/20 bg-primary/5"
        )}
        style={{ marginLeft: `${level * 20}px` }}
        onClick={() => toggleCategory(category.id)}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(category.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : (
          <div className="w-5 shrink-0" />
        )}
        
        <div className={cn(
          "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
          isSelected 
            ? "bg-primary border-primary" 
            : "border-muted-foreground/30"
        )}>
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
        
        <span className={cn(
          "flex-1 text-sm truncate",
          hasChildren ? "font-medium" : "",
          isSelected && "font-medium"
        )}>
          {highlightName(category.name)}
        </span>
        
        {hasChildren && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
            {category.children.length}
          </Badge>
        )}
      </div>
      
      {hasChildren && isExpanded && (
        <div className="space-y-0.5">
          {category.children.map(child => (
            <CategoryItem
              key={child.id}
              category={child}
              selectedCategories={selectedCategories}
              toggleCategory={toggleCategory}
              level={level + 1}
              expandedCategories={expandedCategories}
              toggleExpanded={toggleExpanded}
              highlightText={highlightText}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Search result item (flat display with full path)
function SearchResultItem({
  category,
  isSelected,
  onToggle,
  highlightText
}: {
  category: CategoryNode;
  isSelected: boolean;
  onToggle: () => void;
  highlightText: string;
}) {
  const highlightName = (name: string) => {
    const idx = name.toLowerCase().indexOf(highlightText.toLowerCase());
    if (idx === -1) return name;
    return (
      <>
        {name.slice(0, idx)}
        <mark className="bg-yellow-200 rounded px-0.5">{name.slice(idx, idx + highlightText.length)}</mark>
        {name.slice(idx + highlightText.length)}
      </>
    );
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-all",
        isSelected 
          ? "bg-primary/10 border-primary/40 shadow-sm" 
          : "hover:bg-accent/50 border-transparent hover:border-border"
      )}
      onClick={onToggle}
    >
      <div className={cn(
        "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
        isSelected 
          ? "bg-primary border-primary" 
          : "border-muted-foreground/30"
      )}>
        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{highlightName(category.name)}</p>
        <p className="text-xs text-muted-foreground truncate">{category.path}</p>
      </div>
    </div>
  );
}

// Suggestion chip for AI-suggested categories
function SuggestionChip({
  category,
  isSelected,
  onToggle
}: {
  category: { id: string; name: string; themeName: string; matchReason: string };
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <Badge
      variant={isSelected ? "default" : "outline"}
      className={cn(
        "cursor-pointer transition-all gap-1.5 py-1.5 px-3",
        isSelected 
          ? "bg-primary hover:bg-primary/90" 
          : "hover:bg-accent hover:border-primary/50"
      )}
      onClick={onToggle}
    >
      {isSelected ? <Check className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      <span>{category.name}</span>
      <span className="text-[10px] opacity-70">({category.themeName})</span>
    </Badge>
  );
}

export function AssignCategoriesDialog({ legislation, open, onOpenChange }: AssignCategoriesDialogProps) {
  const { data: themes, isLoading: themesLoading } = useThemesWithCategories();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("suggestions");
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

  // All categories flattened for search
  const allCategoriesFlat = useMemo(() => {
    let result: CategoryNode[] = [];
    themesWithTrees.forEach(theme => {
      result = [...result, ...flattenTree(theme.categoryTree)];
    });
    return result;
  }, [themesWithTrees]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return allCategoriesFlat
      .filter(cat => 
        cat.name.toLowerCase().includes(term) ||
        cat.fullPath.toLowerCase().includes(term) ||
        (cat.keywords || []).some(k => k.toLowerCase().includes(term))
      )
      .slice(0, 20);
  }, [allCategoriesFlat, searchTerm]);

  // AI-suggested categories based on legislation title/summary
  const suggestedCategories = useMemo(() => {
    if (!legislation || !themes) return [];
    
    const titleLower = (legislation.title || "").toLowerCase();
    const summaryLower = (legislation.summary || "").toLowerCase();
    const numberLower = (legislation.number || "").toLowerCase();
    const combinedText = `${titleLower} ${summaryLower} ${numberLower}`;
    
    const suggestions: { id: string; name: string; themeName: string; matchReason: string; score: number }[] = [];
    
    themes.forEach(theme => {
      theme.categories.forEach(cat => {
        let score = 0;
        let matchReason = "";
        
        // Check category name match
        if (combinedText.includes(cat.name.toLowerCase())) {
          score += 10;
          matchReason = `Contém "${cat.name}"`;
        }
        
        // Check keywords match
        const matchedKeywords = (cat.keywords || []).filter(k => 
          combinedText.includes(k.toLowerCase())
        );
        if (matchedKeywords.length > 0) {
          score += matchedKeywords.length * 5;
          matchReason = matchReason || `Palavras-chave: ${matchedKeywords.slice(0, 2).join(", ")}`;
        }
        
        // Check theme name match
        if (combinedText.includes(theme.name.toLowerCase())) {
          score += 3;
        }
        
        if (score > 0) {
          suggestions.push({
            id: cat.id,
            name: cat.name,
            themeName: theme.name,
            matchReason,
            score
          });
        }
      });
    });
    
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [legislation, themes]);

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

  const toggleCategory = useCallback((categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  }, []);

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
      setSearchTerm("");
      setActiveTab(legislation.categories.length === 0 ? "suggestions" : "tree");
      
      // Auto-expand themes that have selected categories
      const themesWithSelected = new Set<string>();
      const categoriesWithSelected = new Set<string>();
      
      legislation.categories.forEach(cat => {
        themes?.forEach(theme => {
          const hasCategory = theme.categories.some(c => c.id === cat.id);
          if (hasCategory) {
            themesWithSelected.add(theme.id);
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

  // Get full info for selected categories
  const selectedCategoriesInfo = useMemo(() => {
    return selectedCategories.map(catId => {
      const cat = allCategoriesFlat.find(c => c.id === catId);
      return cat ? { id: catId, name: cat.name, themeName: cat.themeName, fullPath: cat.fullPath } : null;
    }).filter(Boolean) as { id: string; name: string; themeName: string; fullPath: string }[];
  }, [selectedCategories, allCategoriesFlat]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-4xl flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Atribuir Categorias
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            <span className="font-medium">{legislation?.number}</span> - {legislation?.title}
          </DialogDescription>
        </DialogHeader>

        {themesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Search bar - always visible */}
            <div className="px-6 py-3 border-b bg-muted/30">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar categorias por nome ou palavras-chave..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10"
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
            </div>

            {/* Main content area */}
            <div className="flex-1 min-h-0 flex">
              {/* Left panel - Category selection */}
              <div className="flex-1 min-w-0 border-r flex flex-col">
                {searchTerm ? (
                  // Search results view
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-1">
                      {searchResults.length > 0 ? (
                        searchResults.map(cat => (
                          <SearchResultItem
                            key={cat.id}
                            category={cat}
                            isSelected={selectedCategories.includes(cat.id)}
                            onToggle={() => toggleCategory(cat.id)}
                            highlightText={searchTerm}
                          />
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>Nenhuma categoria encontrada</p>
                          <p className="text-xs">Tente outros termos de pesquisa</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  // Tabbed view (suggestions / tree)
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
                      <TabsTrigger 
                        value="suggestions" 
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Sugestões
                        {suggestedCategories.length > 0 && (
                          <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                            {suggestedCategories.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger 
                        value="tree"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2.5"
                      >
                        <Layers className="h-4 w-4 mr-2" />
                        Todas as Categorias
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="suggestions" className="flex-1 m-0 min-h-0">
                      <ScrollArea className="h-full">
                        <div className="p-4">
                          {suggestedCategories.length > 0 ? (
                            <div className="space-y-4">
                              <p className="text-sm text-muted-foreground">
                                Categorias sugeridas com base no título e resumo:
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {suggestedCategories.map(cat => (
                                  <SuggestionChip
                                    key={cat.id}
                                    category={cat}
                                    isSelected={selectedCategories.includes(cat.id)}
                                    onToggle={() => toggleCategory(cat.id)}
                                  />
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground pt-2">
                                Clique nas sugestões para selecionar ou use a aba "Todas as Categorias" para navegar manualmente.
                              </p>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-muted-foreground">
                              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p>Sem sugestões automáticas</p>
                              <p className="text-xs">Use a pesquisa ou navegue manualmente</p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>

                    <TabsContent value="tree" className="flex-1 m-0 min-h-0 flex flex-col">
                      {/* Expand/collapse controls */}
                      <div className="flex gap-2 p-3 border-b bg-muted/20">
                        <Button variant="outline" size="sm" onClick={expandAll}>
                          Expandir Tudo
                        </Button>
                        <Button variant="outline" size="sm" onClick={collapseAll}>
                          Colapsar Tudo
                        </Button>
                      </div>
                      
                      <ScrollArea className="flex-1">
                        <div className="p-4 space-y-2">
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
                                    "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all",
                                    isThemeExpanded ? "bg-accent border-accent" : "hover:bg-accent/50",
                                    selectedCount > 0 && "border-primary/40 bg-primary/5"
                                  )}>
                                    {isThemeExpanded ? (
                                      <ChevronDown className="h-5 w-5 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-5 w-5 shrink-0" />
                                    )}
                                    <Tags className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="font-semibold flex-1">{theme.name}</span>
                                    <Badge variant={selectedCount > 0 ? "default" : "secondary"}>
                                      {selectedCount} / {theme.categories.length}
                                    </Badge>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="mt-1 ml-2 space-y-0.5 pb-2">
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
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                )}
              </div>

              {/* Right panel - Selected categories */}
              <div className="w-72 flex-shrink-0 flex flex-col bg-muted/20">
                <div className="p-4 border-b">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Selecionadas
                    <Badge variant="secondary" className="ml-auto">{selectedCategories.length}</Badge>
                  </h4>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-1.5">
                    {selectedCategoriesInfo.length > 0 ? (
                      selectedCategoriesInfo.map(cat => (
                        <div
                          key={cat.id}
                          className="flex items-start gap-2 p-2 rounded-lg bg-background border group hover:border-destructive/50 cursor-pointer transition-colors"
                          onClick={() => toggleCategory(cat.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{cat.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{cat.themeName}</p>
                          </div>
                          <X className="h-4 w-4 text-muted-foreground group-hover:text-destructive shrink-0 mt-0.5" />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <Tags className="h-6 w-6 mx-auto mb-2 opacity-50" />
                        <p>Nenhuma categoria selecionada</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t bg-background">
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
