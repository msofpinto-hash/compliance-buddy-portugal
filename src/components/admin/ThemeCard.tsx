import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Edit2, Plus, FolderTree, FileText } from "lucide-react";
import { useState } from "react";
import type { ThemeWithCategories, ThemeCategory } from "@/hooks/useThemes";
import * as Icons from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Theme images mapping
import themeAmbiente from "@/assets/theme-ambiente.png";
import themeSst from "@/assets/theme-sst.png";
import themeEnergia from "@/assets/theme-energia.png";
import themeQualidade from "@/assets/theme-qualidade.png";
import themeSeguranca from "@/assets/theme-seguranca.png";
import themeGeral from "@/assets/theme-geral.png";

const themeImages: Record<string, string> = {
  ambiente: themeAmbiente,
  sst: themeSst,
  energia: themeEnergia,
  qualidade: themeQualidade,
  seguranca: themeSeguranca,
  segurança: themeSeguranca,
  geral: themeGeral,
};

const getThemeImage = (themeName: string): string => {
  const normalizedName = themeName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  for (const [key, image] of Object.entries(themeImages)) {
    const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalizedName.includes(normalizedKey)) {
      return image;
    }
  }
  
  return themeGeral;
};

interface ThemeCardProps {
  theme: ThemeWithCategories;
  onEditTheme?: (theme: ThemeWithCategories) => void;
  onEditCategory?: (category: ThemeCategory) => void;
  onAddCategory?: (theme: ThemeWithCategories, parentCategory?: ThemeCategory) => void;
}

// Recursive component for category hierarchy
interface CategoryItemProps {
  category: ThemeCategory;
  allCategories: ThemeCategory[];
  level: number;
  onEditCategory?: (category: ThemeCategory) => void;
  onAddSubcategory?: (parentCategory: ThemeCategory) => void;
  legislationCounts: Record<string, number>;
}

function CategoryItem({ 
  category, 
  allCategories, 
  level, 
  onEditCategory,
  onAddSubcategory,
  legislationCounts 
}: CategoryItemProps) {
  const [expanded, setExpanded] = useState(level < 2); // Auto-expand first 2 levels
  const subcategories = allCategories.filter(cat => cat.parent_id === category.id);
  const hasSubcategories = subcategories.length > 0;
  const legislationCount = legislationCounts[category.id] || 0;

  return (
    <div className="space-y-2">
      <div 
        className={`flex items-center justify-between rounded-lg border p-2 ${
          level === 0 ? 'bg-card/50 p-3' : 'bg-muted/30'
        } hover:bg-accent/30 transition-colors`}
      >
        <div className="flex items-center gap-2 flex-1">
          {hasSubcategories && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
          {!hasSubcategories && <div className="w-6" />}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`${level === 0 ? 'font-medium' : 'text-sm font-medium'}`}>
                {category.name}
              </p>
              {hasSubcategories && (
                <Badge variant="outline" className="text-xs shrink-0">
                  <FolderTree className="mr-1 h-3 w-3" />
                  {subcategories.length}
                </Badge>
              )}
              {legislationCount > 0 && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  <FileText className="mr-1 h-3 w-3" />
                  {legislationCount}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {category.keywords?.slice(0, level === 0 ? 4 : 3).map((keyword, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs bg-muted">
                  {keyword}
                </Badge>
              ))}
              {category.keywords && category.keywords.length > (level === 0 ? 4 : 3) && (
                <Badge variant="outline" className="text-xs">
                  +{category.keywords.length - (level === 0 ? 4 : 3)}
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          {onAddSubcategory && (
            <Button
              variant="ghost"
              size="icon"
              className={level === 0 ? 'h-8 w-8' : 'h-6 w-6'}
              onClick={() => onAddSubcategory(category)}
              title="Adicionar subcategoria"
            >
              <Plus className={level === 0 ? 'h-4 w-4' : 'h-3 w-3'} />
            </Button>
          )}
          {onEditCategory && (
            <Button
              variant="ghost"
              size="icon"
              className={level === 0 ? 'h-8 w-8' : 'h-6 w-6'}
              onClick={() => onEditCategory(category)}
              title="Editar categoria"
            >
              <Edit2 className={level === 0 ? 'h-4 w-4' : 'h-3 w-3'} />
            </Button>
          )}
        </div>
      </div>

      {/* Recursive subcategories */}
      {hasSubcategories && expanded && (
        <div className="ml-6 space-y-2 border-l-2 border-muted pl-4">
          {subcategories.map((sub) => (
            <CategoryItem
              key={sub.id}
              category={sub}
              allCategories={allCategories}
              level={level + 1}
              onEditCategory={onEditCategory}
              onAddSubcategory={onAddSubcategory}
              legislationCounts={legislationCounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ThemeCard({ theme, onEditTheme, onEditCategory, onAddCategory }: ThemeCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  // Dynamic icon rendering
  const IconComponent = theme.icon && Icons[theme.icon as keyof typeof Icons] 
    ? (Icons[theme.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>)
    : Icons.Folder;

  // Get theme image
  const themeImage = getThemeImage(theme.name);

  // Get top-level categories only
  const topLevelCategories = theme.categories.filter(cat => !cat.parent_id);

  // Fetch legislation counts for all categories in this theme
  const { data: legislationCounts = {} } = useQuery({
    queryKey: ["category-legislation-counts", theme.id],
    queryFn: async () => {
      const categoryIds = theme.categories.map(c => c.id);
      if (categoryIds.length === 0) return {};

      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select("category_id")
        .in("category_id", categoryIds);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach(row => {
        counts[row.category_id] = (counts[row.category_id] || 0) + 1;
      });
      return counts;
    },
    enabled: expanded,
  });

  const handleAddSubcategory = (parentCategory: ThemeCategory) => {
    if (onAddCategory) {
      onAddCategory(theme, parentCategory);
    }
  };

  return (
    <Card className="transition-all hover:shadow-md overflow-hidden">
      {/* Theme image banner */}
      <div className="relative h-24 w-full overflow-hidden">
        <img 
          src={themeImage} 
          alt={theme.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
      </div>
      
      <CardHeader className="pb-2 -mt-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background shadow-lg border text-primary">
              <IconComponent className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{theme.name}</CardTitle>
                {onEditTheme && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onEditTheme(theme)}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{theme.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onAddCategory && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddCategory(theme)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Categoria
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="gap-1"
            >
              {theme.categories.length} categorias
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0">
          <div className="mt-3 space-y-2">
            {topLevelCategories.map((category) => (
              <CategoryItem
                key={category.id}
                category={category}
                allCategories={theme.categories}
                level={0}
                onEditCategory={onEditCategory}
                onAddSubcategory={handleAddSubcategory}
                legislationCounts={legislationCounts}
              />
            ))}
            {theme.categories.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Nenhuma categoria definida
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
