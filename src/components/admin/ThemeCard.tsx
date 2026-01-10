import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Edit2, Plus, FolderTree } from "lucide-react";
import { useState } from "react";
import type { ThemeWithCategories, ThemeCategory } from "@/hooks/useThemes";
import * as Icons from "lucide-react";

interface ThemeCardProps {
  theme: ThemeWithCategories;
  onEditTheme?: (theme: ThemeWithCategories) => void;
  onEditCategory?: (category: ThemeCategory) => void;
  onAddCategory?: (theme: ThemeWithCategories) => void;
}

export function ThemeCard({ theme, onEditTheme, onEditCategory, onAddCategory }: ThemeCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  // Dynamic icon rendering
  const IconComponent = theme.icon && Icons[theme.icon as keyof typeof Icons] 
    ? (Icons[theme.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>)
    : Icons.Folder;

  // Organize categories into hierarchy
  const topLevelCategories = theme.categories.filter(cat => !cat.parent_id);
  const getSubcategories = (parentId: string) => 
    theme.categories.filter(cat => cat.parent_id === parentId);

  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconComponent className="h-5 w-5" />
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
            {topLevelCategories.map((category) => {
              const subcategories = getSubcategories(category.id);
              return (
                <div key={category.id} className="space-y-2">
                  {/* Main Category */}
                  <div className="flex items-center justify-between rounded-lg border bg-card/50 p-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{category.name}</p>
                        {subcategories.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <FolderTree className="mr-1 h-3 w-3" />
                            {subcategories.length} sub
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {category.keywords?.slice(0, 4).map((keyword, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {category.keywords && category.keywords.length > 4 && (
                          <Badge variant="outline" className="text-xs">
                            +{category.keywords.length - 4}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {onEditCategory && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEditCategory(category)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Subcategories */}
                  {subcategories.length > 0 && (
                    <div className="ml-6 space-y-2 border-l-2 border-muted pl-4">
                      {subcategories.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between rounded-lg border bg-muted/30 p-2"
                        >
                          <div>
                            <p className="text-sm font-medium">{sub.name}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {sub.keywords?.slice(0, 3).map((keyword, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {keyword}
                                </Badge>
                              ))}
                              {sub.keywords && sub.keywords.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{sub.keywords.length - 3}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {onEditCategory && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onEditCategory(sub)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
