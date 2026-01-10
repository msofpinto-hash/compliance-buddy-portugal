import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, Folder, FolderOpen, X, Tags } from "lucide-react";
import { ThemeWithCategories, ThemeCategory } from "@/hooks/useThemes";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CategoryTreeFilterProps {
  themes: ThemeWithCategories[];
  selectedThemeId: string | null;
  selectedCategoryId: string | null;
  onThemeSelect: (themeId: string | null) => void;
  onCategorySelect: (categoryId: string | null) => void;
}

interface CategoryNodeProps {
  category: ThemeCategory;
  allCategories: ThemeCategory[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string) => void;
  level: number;
}

function CategoryNode({ category, allCategories, selectedCategoryId, onSelect, level }: CategoryNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const children = allCategories.filter(c => c.parent_id === category.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedCategoryId === category.id;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-sm",
          isSelected && "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onSelect(category.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-accent rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {hasChildren ? (
          isExpanded ? <FolderOpen className="h-4 w-4 text-muted-foreground" /> : <Folder className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Tags className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="truncate">{category.name}</span>
      </div>
      
      {isExpanded && hasChildren && (
        <div>
          {children.map(child => (
            <CategoryNode
              key={child.id}
              category={child}
              allCategories={allCategories}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTreeFilter({
  themes,
  selectedThemeId,
  selectedCategoryId,
  onThemeSelect,
  onCategorySelect
}: CategoryTreeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());

  const selectedTheme = themes.find(t => t.id === selectedThemeId);
  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    for (const theme of themes) {
      const cat = theme.categories.find(c => c.id === selectedCategoryId);
      if (cat) return { ...cat, themeName: theme.name };
    }
    return null;
  }, [themes, selectedCategoryId]);

  const hasFilter = selectedThemeId || selectedCategoryId;

  const toggleTheme = (themeId: string) => {
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

  const handleThemeSelect = (themeId: string) => {
    onThemeSelect(themeId);
    onCategorySelect(null);
    setIsOpen(false);
  };

  const handleCategorySelect = (categoryId: string) => {
    // Find which theme this category belongs to
    for (const theme of themes) {
      if (theme.categories.some(c => c.id === categoryId)) {
        onThemeSelect(theme.id);
        break;
      }
    }
    onCategorySelect(categoryId);
    setIsOpen(false);
  };

  const clearFilter = () => {
    onThemeSelect(null);
    onCategorySelect(null);
  };

  const getButtonLabel = () => {
    if (selectedCategory) {
      return `${selectedCategory.themeName} → ${selectedCategory.name}`;
    }
    if (selectedTheme) {
      return selectedTheme.name;
    }
    return "Tema / Categoria";
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={hasFilter ? "default" : "outline"}
          size="sm"
          className="gap-2"
        >
          <Tags className="h-4 w-4" />
          <span className="max-w-[200px] truncate">{getButtonLabel()}</span>
          {hasFilter && (
            <X
              className="h-3 w-3 ml-1 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                clearFilter();
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="font-medium text-sm">Filtrar por tema/categoria</div>
          <p className="text-xs text-muted-foreground mt-1">
            Clique num tema para filtrar, ou expanda para ver subcategorias
          </p>
        </div>
        
        <ScrollArea className="h-[300px]">
          <div className="p-2 space-y-1">
            {themes.map(theme => {
              const isExpanded = expandedThemes.has(theme.id);
              const isThemeSelected = selectedThemeId === theme.id && !selectedCategoryId;
              const rootCategories = theme.categories.filter(c => !c.parent_id);
              const hasCategories = rootCategories.length > 0;

              return (
                <div key={theme.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-accent font-medium text-sm",
                      isThemeSelected && "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                    onClick={() => handleThemeSelect(theme.id)}
                  >
                    {hasCategories ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTheme(theme.id);
                        }}
                        className="p-0.5 hover:bg-accent rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}
                    {isExpanded ? (
                      <FolderOpen className="h-4 w-4" />
                    ) : (
                      <Folder className="h-4 w-4" />
                    )}
                    <span className="truncate">{theme.name}</span>
                  </div>
                  
                  {isExpanded && hasCategories && (
                    <div className="ml-2 border-l pl-1">
                      {rootCategories.map(cat => (
                        <CategoryNode
                          key={cat.id}
                          category={cat}
                          allCategories={theme.categories}
                          selectedCategoryId={selectedCategoryId}
                          onSelect={handleCategorySelect}
                          level={0}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
        
        {hasFilter && (
          <div className="p-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                clearFilter();
                setIsOpen(false);
              }}
            >
              Limpar filtro
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
