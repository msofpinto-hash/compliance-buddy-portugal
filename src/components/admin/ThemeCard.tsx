import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Edit2 } from "lucide-react";
import { useState } from "react";
import type { ThemeWithCategories } from "@/hooks/useThemes";
import * as Icons from "lucide-react";

interface ThemeCardProps {
  theme: ThemeWithCategories;
  onEditCategory?: (categoryId: string) => void;
}

export function ThemeCard({ theme, onEditCategory }: ThemeCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  // Dynamic icon rendering
  const IconComponent = theme.icon && Icons[theme.icon as keyof typeof Icons] 
    ? (Icons[theme.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>)
    : Icons.Folder;

  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconComponent className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{theme.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{theme.description}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="gap-1"
          >
            {theme.categories.length} subcategorias
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0">
          <div className="mt-3 space-y-2">
            {theme.categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-lg border bg-card/50 p-3"
              >
                <div>
                  <p className="font-medium">{category.name}</p>
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
                    onClick={() => onEditCategory(category.id)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {theme.categories.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Nenhuma subcategoria definida
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
