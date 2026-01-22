import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FolderTree, Search, Loader2, ChevronRight, ChevronDown, 
  Palette, Save, Edit2, FileText 
} from "lucide-react";
import { useCategoriesWithThemeLinks, useUpdateCategoryThemeLinks, type ThemeCategoryWithLinks, type Theme } from "@/hooks/useThemes";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CategoryRowProps {
  category: ThemeCategoryWithLinks;
  allCategories: ThemeCategoryWithLinks[];
  themes: Theme[];
  level: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  legislationCounts: Record<string, number>;
}

function CategoryRow({ 
  category, 
  allCategories, 
  themes,
  level, 
  expandedIds, 
  onToggleExpand,
  selectedCategoryId,
  onSelectCategory,
  legislationCounts,
}: CategoryRowProps) {
  const children = allCategories.filter(c => c.parent_id === category.id);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds.has(category.id);
  const isSelected = selectedCategoryId === category.id;
  const legCount = legislationCounts[category.id] || 0;

  // Get primary theme (the original theme_id)
  const primaryTheme = themes.find(t => t.id === category.theme_id);
  
  // Get all linked theme names
  const linkedThemes = themes.filter(t => category.linkedThemeIds.includes(t.id));

  return (
    <>
      <div 
        className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
          isSelected 
            ? "bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700" 
            : "hover:bg-muted/50"
        }`}
        style={{ paddingLeft: `${12 + level * 20}px` }}
        onClick={() => onSelectCategory(category.id)}
      >
        {hasChildren ? (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggleExpand(category.id); }}
            className="p-0.5 hover:bg-muted rounded"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        
        <FolderTree className="h-4 w-4 text-amber-600 shrink-0" />
        
        <span className="flex-1 truncate font-medium text-sm">{category.name}</span>
        
        {legCount > 0 && (
          <Badge variant="secondary" className="text-xs shrink-0">
            <FileText className="h-3 w-3 mr-1" />
            {legCount}
          </Badge>
        )}
        
        {linkedThemes.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {linkedThemes.slice(0, 2).map(theme => (
              <Badge 
                key={theme.id} 
                variant="outline" 
                className="text-[10px] px-1.5 py-0"
              >
                {theme.name.substring(0, 3)}
              </Badge>
            ))}
            {linkedThemes.length > 2 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                +{linkedThemes.length - 2}
              </Badge>
            )}
          </div>
        )}
      </div>
      
      {isExpanded && children.map(child => (
        <CategoryRow
          key={child.id}
          category={child}
          allCategories={allCategories}
          themes={themes}
          level={level + 1}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={onSelectCategory}
          legislationCounts={legislationCounts}
        />
      ))}
    </>
  );
}

export function CategoryManagementPanel() {
  const { data, isLoading, error } = useCategoriesWithThemeLinks();
  const updateThemeLinks = useUpdateCategoryThemeLinks();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [pendingThemeIds, setPendingThemeIds] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Get legislation counts per category
  const { data: legislationCounts } = useQuery({
    queryKey: ["legislation-counts-by-category"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select("category_id");
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      (data || []).forEach(row => {
        counts[row.category_id] = (counts[row.category_id] || 0) + 1;
      });
      return counts;
    },
  });

  const categories = data?.categories || [];
  const themes = data?.themes || [];

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const term = searchTerm.toLowerCase();
    return categories.filter(c => 
      c.name.toLowerCase().includes(term) ||
      c.keywords?.some(k => k.toLowerCase().includes(term))
    );
  }, [categories, searchTerm]);

  // Get root categories (no parent or parent is not in filtered set)
  const rootCategories = useMemo(() => {
    if (searchTerm.trim()) {
      // When searching, show all matching as roots
      return filteredCategories;
    }
    return filteredCategories.filter(c => !c.parent_id);
  }, [filteredCategories, searchTerm]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectCategory = (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (cat) {
      setSelectedCategoryId(id);
      setPendingThemeIds(cat.linkedThemeIds);
      setHasChanges(false);
    }
  };

  const toggleTheme = (themeId: string) => {
    setPendingThemeIds(prev => {
      const next = prev.includes(themeId)
        ? prev.filter(id => id !== themeId)
        : [...prev, themeId];
      setHasChanges(true);
      return next;
    });
  };

  const saveChanges = async () => {
    if (!selectedCategoryId) return;
    
    try {
      await updateThemeLinks.mutateAsync({ 
        categoryId: selectedCategoryId, 
        themeIds: pendingThemeIds 
      });
      toast.success("Temas atualizados com sucesso");
      setHasChanges(false);
    } catch (err) {
      toast.error("Erro ao atualizar temas");
    }
  };

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  // Expand all to find selected
  const expandAll = () => {
    setExpandedIds(new Set(categories.map(c => c.id)));
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
        <CardContent className="py-8 text-center text-destructive">
          Erro ao carregar categorias
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Left: Category Tree */}
      <Card className="bg-gradient-to-br from-amber-50/95 via-orange-50/80 to-yellow-50/70 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/25 border border-amber-200/60 dark:border-amber-800/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderTree className="h-5 w-5 text-amber-600" />
              Categorias ({categories.length})
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expandir tudo
            </Button>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar categorias..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[500px]">
            <div className="space-y-0.5">
              {rootCategories.map(category => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  allCategories={searchTerm.trim() ? filteredCategories : categories}
                  themes={themes}
                  level={0}
                  expandedIds={expandedIds}
                  onToggleExpand={toggleExpand}
                  selectedCategoryId={selectedCategoryId}
                  onSelectCategory={selectCategory}
                  legislationCounts={legislationCounts || {}}
                />
              ))}
              {rootCategories.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma categoria encontrada
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right: Theme Assignment */}
      <Card className="bg-gradient-to-br from-stone-50/95 via-amber-50/80 to-orange-50/70 dark:from-stone-900/50 dark:via-amber-950/40 dark:to-orange-950/30 border border-stone-200/60 dark:border-stone-700/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5 text-amber-600" />
            Temas da Categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedCategory ? (
            <div className="space-y-4">
              {/* Category Info */}
              <div className="p-4 rounded-lg bg-amber-100/50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{selectedCategory.name}</h3>
                    {selectedCategory.keywords && selectedCategory.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedCategory.keywords.map((kw, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline">
                    {legislationCounts?.[selectedCategory.id] || 0} diplomas
                  </Badge>
                </div>
              </div>

              {/* Theme Selection */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Selecione em quais temas esta categoria deve aparecer:
                </p>
                <div className="grid gap-2">
                  {themes.map(theme => {
                    const isChecked = pendingThemeIds.includes(theme.id);
                    const isPrimary = theme.id === selectedCategory.theme_id;
                    
                    return (
                      <div 
                        key={theme.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          isChecked 
                            ? "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700" 
                            : "bg-muted/30 border-transparent hover:border-muted"
                        }`}
                      >
                        <Checkbox
                          id={`theme-${theme.id}`}
                          checked={isChecked}
                          onCheckedChange={() => toggleTheme(theme.id)}
                        />
                        <label 
                          htmlFor={`theme-${theme.id}`}
                          className="flex-1 cursor-pointer flex items-center gap-2"
                        >
                          <span className="font-medium">{theme.name}</span>
                          {isPrimary && (
                            <Badge variant="outline" className="text-[10px]">
                              Original
                            </Badge>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Save Button */}
              {hasChanges && (
                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={saveChanges}
                    disabled={updateThemeLinks.isPending}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  >
                    {updateThemeLinks.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar Alterações
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Edit2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Selecione uma categoria para editar os temas</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
