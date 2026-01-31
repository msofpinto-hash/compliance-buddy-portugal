import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FolderTree, Plus, X, ChevronDown, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
  legislationId: string;
}

interface ThemeCategory {
  id: string;
  name: string;
  theme_id: string;
  parent_id: string | null;
}

interface Theme {
  id: string;
  name: string;
}

export function LegislationCategoryEditor({ legislationId }: Props) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // Fetch current mappings
  const { data: currentMappings = [], isLoading: loadingMappings } = useQuery({
    queryKey: ["legislation-category-mappings", legislationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select(`
          id,
          category_id,
          theme_categories (
            id,
            name,
            theme_id,
            parent_id,
            themes (name)
          )
        `)
        .eq("legislation_id", legislationId);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all themes
  const { data: themes = [] } = useQuery({
    queryKey: ["themes-for-category-editor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data as Theme[];
    },
  });

  // Fetch all categories
  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories-for-editor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_categories")
        .select("id, name, theme_id, parent_id")
        .order("name");
      if (error) throw error;
      return data as ThemeCategory[];
    },
  });

  const getCategoriesForTheme = (themeId: string) =>
    allCategories.filter(c => c.theme_id === themeId && !c.parent_id);

  const getSubcategories = (parentId: string) =>
    allCategories.filter(c => c.parent_id === parentId);

  const isAlreadyAssigned = (categoryId: string) =>
    currentMappings.some(m => m.category_id === categoryId);

  const handleAddCategory = async (categoryId: string) => {
    if (isAlreadyAssigned(categoryId)) {
      toast.info("Categoria já associada");
      return;
    }

    try {
      const { error } = await supabase
        .from("legislation_category_mapping")
        .insert({ legislation_id: legislationId, category_id: categoryId });

      if (error) throw error;
      toast.success("Categoria adicionada");
      queryClient.invalidateQueries({ queryKey: ["legislation-category-mappings", legislationId] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation-counts-manual"] });
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  const handleRemoveCategory = async (mappingId: string) => {
    try {
      const { error } = await supabase
        .from("legislation_category_mapping")
        .delete()
        .eq("id", mappingId);

      if (error) throw error;
      toast.success("Categoria removida");
      queryClient.invalidateQueries({ queryKey: ["legislation-category-mappings", legislationId] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation-counts-manual"] });
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  const toggleTheme = (themeId: string) => {
    const newSet = new Set(expandedThemes);
    if (newSet.has(themeId)) newSet.delete(themeId);
    else newSet.add(themeId);
    setExpandedThemes(newSet);
  };

  const toggleCat = (catId: string) => {
    const newSet = new Set(expandedCats);
    if (newSet.has(catId)) newSet.delete(catId);
    else newSet.add(catId);
    setExpandedCats(newSet);
  };

  const renderCategoryOption = (cat: ThemeCategory, level: number = 0) => {
    const subs = getSubcategories(cat.id);
    const hasSubs = subs.length > 0;
    const isExpanded = expandedCats.has(cat.id);
    const assigned = isAlreadyAssigned(cat.id);

    return (
      <div key={cat.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
            assigned ? "opacity-50" : "hover:bg-muted"
          }`}
          style={{ paddingLeft: `${8 + level * 12}px` }}
        >
          {hasSubs && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0"
              onClick={(e) => { e.stopPropagation(); toggleCat(cat.id); }}
            >
              <ChevronDown className={`h-3 w-3 ${isExpanded ? "" : "-rotate-90"}`} />
            </Button>
          )}
          {!hasSubs && <div className="w-5" />}
          <span
            className="flex-1 text-sm truncate"
            onClick={() => !assigned && handleAddCategory(cat.id)}
          >
            {cat.name}
          </span>
          {assigned && <Badge variant="secondary" className="text-[10px]">✓</Badge>}
        </div>
        {hasSubs && isExpanded && subs.map(sub => renderCategoryOption(sub, level + 1))}
      </div>
    );
  };

  if (loadingMappings) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-amber-500" />
          Categorias
        </Label>
        <Popover open={isAdding} onOpenChange={setIsAdding}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-3 w-3 mr-1" />
              Adicionar
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="end">
            <ScrollArea className="h-[300px]">
              <div className="space-y-1">
                {themes.map(theme => {
                  const cats = getCategoriesForTheme(theme.id);
                  const isExpanded = expandedThemes.has(theme.id);
                  return (
                    <div key={theme.id}>
                      <div
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer font-medium text-sm"
                        onClick={() => toggleTheme(theme.id)}
                      >
                        <ChevronDown className={`h-4 w-4 ${isExpanded ? "" : "-rotate-90"}`} />
                        {theme.name}
                      </div>
                      {isExpanded && cats.map(cat => renderCategoryOption(cat, 0))}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {/* Current categories */}
      <div className="flex flex-wrap gap-2">
        {currentMappings.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sem categorias associadas</p>
        ) : (
          currentMappings.map((mapping: any) => (
            <Badge
              key={mapping.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <span className="text-xs text-muted-foreground">
                {mapping.theme_categories?.themes?.name}:
              </span>
              <span>{mapping.theme_categories?.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                onClick={() => handleRemoveCategory(mapping.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}
