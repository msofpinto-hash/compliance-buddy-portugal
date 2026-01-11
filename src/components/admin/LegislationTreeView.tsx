import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  Folder, 
  FolderOpen, 
  Flag, 
  Globe,
  Eye,
  ExternalLink,
  Tags,
  Building2
} from "lucide-react";
import { Link } from "react-router-dom";
import { useThemesWithCategories, ThemeCategory, ThemeWithCategories } from "@/hooks/useThemes";
import { type LegislationWithCategories } from "@/hooks/useLegislation";
import { LegislationTimeline } from "./LegislationTimeline";
import { LegislationRelationsBadges } from "./LegislationRelationsBadges";

interface LegislationTreeViewProps {
  legislation: LegislationWithCategories[];
  onSelectLegislation?: (leg: LegislationWithCategories) => void;
}

interface CategoryNode {
  category: ThemeCategory;
  children: CategoryNode[];
  legislation: LegislationWithCategories[];
}

export function LegislationTreeView({ legislation, onSelectLegislation }: LegislationTreeViewProps) {
  const { data: themesWithCategories, isLoading } = useThemesWithCategories();
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Create a map of legislation by category
  const legislationByCategory = useMemo(() => {
    const map = new Map<string, LegislationWithCategories[]>();
    
    legislation.forEach(leg => {
      leg.categories.forEach(cat => {
        if (!map.has(cat.id)) {
          map.set(cat.id, []);
        }
        map.get(cat.id)!.push(leg);
      });
    });
    
    return map;
  }, [legislation]);

  // Build category tree for a theme
  const buildCategoryTree = (categories: ThemeCategory[], parentId: string | null = null): CategoryNode[] => {
    return categories
      .filter(cat => cat.parent_id === parentId)
      .map(cat => ({
        category: cat,
        children: buildCategoryTree(categories, cat.id),
        legislation: legislationByCategory.get(cat.id) || []
      }))
      .sort((a, b) => a.category.name.localeCompare(b.category.name, 'pt'));
  };

  // Get the tree for the selected theme
  const selectedTheme = themesWithCategories?.find(t => t.id === selectedThemeId);
  const categoryTree = useMemo(() => {
    if (!selectedTheme) return [];
    return buildCategoryTree(selectedTheme.categories);
  }, [selectedTheme, legislationByCategory]);

  // Count total legislation in a category (including children)
  const countLegislation = (node: CategoryNode): number => {
    let count = node.legislation.length;
    node.children.forEach(child => {
      count += countLegislation(child);
    });
    return count;
  };

  // Get all legislation for selected category (including children)
  const getAllLegislationForCategory = (node: CategoryNode): LegislationWithCategories[] => {
    let allLegislation = [...node.legislation];
    node.children.forEach(child => {
      allLegislation = [...allLegislation, ...getAllLegislationForCategory(child)];
    });
    // Remove duplicates
    const seen = new Set<string>();
    return allLegislation.filter(leg => {
      if (seen.has(leg.id)) return false;
      seen.add(leg.id);
      return true;
    });
  };

  // Get currently displayed legislation
  const displayedLegislation = useMemo(() => {
    if (!selectedCategoryId || !categoryTree.length) return [];
    
    const findNode = (nodes: CategoryNode[], id: string): CategoryNode | null => {
      for (const node of nodes) {
        if (node.category.id === id) return node;
        const found = findNode(node.children, id);
        if (found) return found;
      }
      return null;
    };
    
    const node = findNode(categoryTree, selectedCategoryId);
    if (!node) return [];
    
    return getAllLegislationForCategory(node);
  }, [selectedCategoryId, categoryTree]);

  const toggleCategory = (categoryId: string) => {
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

  const renderCategoryNode = (node: CategoryNode, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedCategories.has(node.category.id);
    const isSelected = selectedCategoryId === node.category.id;
    const count = countLegislation(node);

    return (
      <div key={node.category.id}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-accent/50 transition-colors ${
            isSelected ? 'bg-primary/10 text-primary' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            setSelectedCategoryId(node.category.id);
            if (hasChildren) {
              toggleCategory(node.category.id);
            }
          }}
        >
          {hasChildren ? (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleCategory(node.category.id);
              }}
              className="p-0.5 hover:bg-accent rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-amber-500" />
            ) : (
              <Folder className="h-4 w-4 text-amber-500" />
            )
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
          
          <span className="flex-1 text-sm truncate">{node.category.name}</span>
          
          {count > 0 && (
            <Badge variant="secondary" className="text-xs h-5">
              {count}
            </Badge>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderCategoryNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">A carregar temas...</div>;
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-300px)]">
      {/* Theme selector */}
      <Card className="w-64 flex-shrink-0">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Temas</CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <div className="space-y-1">
            {themesWithCategories?.map(theme => {
              const themeCount = legislation.filter(leg => 
                leg.categories.some(cat => 
                  theme.categories.some(tc => tc.id === cat.id)
                )
              ).length;
              
              return (
                <button
                  key={theme.id}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-left transition-colors ${
                    selectedThemeId === theme.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'hover:bg-accent'
                  }`}
                  onClick={() => {
                    setSelectedThemeId(theme.id);
                    setSelectedCategoryId(null);
                    setExpandedCategories(new Set());
                  }}
                >
                  <span className="text-sm font-medium truncate">{theme.name}</span>
                  <Badge variant={selectedThemeId === theme.id ? "secondary" : "outline"} className="text-xs">
                    {themeCount}
                  </Badge>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Category tree */}
      {selectedTheme && (
        <Card className="w-80 flex-shrink-0">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tags className="h-4 w-4" />
              {selectedTheme.name}
            </CardTitle>
            <CardDescription className="text-xs">
              Categorias e subcategorias
            </CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="h-[calc(100vh-420px)]">
              <div className="space-y-0.5">
                {categoryTree.map(node => renderCategoryNode(node))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Legislation list */}
      <Card className="flex-1 min-w-0">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Legislação
            {selectedCategoryId && displayedLegislation.length > 0 && (
              <Badge variant="outline">{displayedLegislation.length}</Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            {selectedCategoryId 
              ? "Diplomas na categoria selecionada"
              : selectedThemeId 
                ? "Selecione uma categoria à esquerda"
                : "Selecione um tema para começar"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[calc(100vh-420px)]">
            {displayedLegislation.length > 0 ? (
              <div className="space-y-2">
                {displayedLegislation.map(leg => (
                  <div
                    key={leg.id}
                    className="rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline"
                            className={
                              leg.origin === 'PT' 
                                ? 'bg-green-500/10 text-green-700 border-green-300' 
                                : 'bg-blue-500/10 text-blue-700 border-blue-300'
                            }
                          >
                            {leg.origin === 'PT' ? (
                              <><Flag className="h-3 w-3 mr-1" />DRE</>
                            ) : (
                              <><Globe className="h-3 w-3 mr-1" />EUR-Lex</>
                            )}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {leg.number}
                          </span>
                        </div>
                        
                        <Link 
                          to={`/legislacao/${leg.id}`} 
                          className="font-medium text-sm hover:text-primary hover:underline transition-colors line-clamp-2"
                        >
                          {leg.title}
                        </Link>
                        
                        {leg.entity && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {leg.entity}
                          </p>
                        )}

                        <LegislationTimeline
                          publicationDate={leg.publication_date}
                          effectiveDate={leg.effective_date}
                          revocationDate={(leg as any).revocation_date}
                        />

                        <LegislationRelationsBadges relations={leg.relations} />
                      </div>
                      
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/legislacao/${leg.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {leg.document_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p className="text-sm">
                  {selectedCategoryId 
                    ? "Nenhuma legislação nesta categoria"
                    : "Selecione uma categoria para ver os diplomas"
                  }
                </p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
