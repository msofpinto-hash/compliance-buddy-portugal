import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Building2,
  Search,
  X,
  ChevronsUpDown,
  ChevronsDownUp,
  ListChecks,
  AlertCircle
} from "lucide-react";
import { Link } from "react-router-dom";
import { useThemesWithCategories, ThemeCategory, ThemeWithCategories } from "@/hooks/useThemes";
import { type LegislationWithCategories } from "@/hooks/useLegislation";
import { LegislationTimeline } from "./LegislationTimeline";
import { LegislationRelationsBadges } from "./LegislationRelationsBadges";
import { getLegislationApplicabilityInfo } from "@/components/LegislationApplicabilitySelect";

interface LegislationTreeViewProps {
  legislation: LegislationWithCategories[];
  onSelectLegislation?: (leg: LegislationWithCategories) => void;
  /** If true, hides the internal search/filter bar (use when parent provides filters) */
  hideFilters?: boolean;
  /** If provided, uses this theme ID and hides the themes column */
  externalThemeId?: string | null;
  /** Map of legislation_id -> applicability_type for showing applicability badges */
  applicabilityMap?: Record<string, string>;
}

interface CategoryNode {
  category: ThemeCategory;
  children: CategoryNode[];
  legislation: LegislationWithCategories[];
}

export function LegislationTreeView({ legislation, onSelectLegislation, hideFilters = false, externalThemeId, applicabilityMap }: LegislationTreeViewProps) {
  const { data: themesWithCategories, isLoading } = useThemesWithCategories();
  const [internalSelectedThemeId, setInternalSelectedThemeId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "dre" | "eurlex">("all");
  
  // Use external theme if provided, otherwise use internal state
  const selectedThemeId = externalThemeId !== undefined ? externalThemeId : internalSelectedThemeId;
  const hideThemesColumn = externalThemeId !== undefined;

  // Filter legislation based on search and source
  const filteredLegislation = useMemo(() => {
    return legislation.filter(leg => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        leg.title?.toLowerCase().includes(searchLower) ||
        leg.number?.toLowerCase().includes(searchLower) ||
        leg.entity?.toLowerCase().includes(searchLower);
      
      const matchesSource = sourceFilter === "all" || 
        (sourceFilter === "dre" && leg.source === "dre") ||
        (sourceFilter === "eurlex" && leg.source === "eurlex");
      
      return matchesSearch && matchesSource;
    });
  }, [legislation, searchTerm, sourceFilter]);

  // Create a map of filtered legislation by category
  const legislationByCategory = useMemo(() => {
    const map = new Map<string, LegislationWithCategories[]>();
    
    filteredLegislation.forEach(leg => {
      leg.categories.forEach(cat => {
        if (!map.has(cat.id)) {
          map.set(cat.id, []);
        }
        map.get(cat.id)!.push(leg);
      });
    });
    
    return map;
  }, [filteredLegislation]);

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

  // Get all category IDs for expand/collapse all
  const getAllCategoryIds = (nodes: CategoryNode[]): string[] => {
    let ids: string[] = [];
    nodes.forEach(node => {
      ids.push(node.category.id);
      ids = [...ids, ...getAllCategoryIds(node.children)];
    });
    return ids;
  };

  const expandAll = () => {
    const allIds = getAllCategoryIds(categoryTree);
    setExpandedCategories(new Set(allIds));
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

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
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer hover:bg-accent/50 transition-colors ${
            isSelected ? 'bg-primary/10 text-primary' : ''
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
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
              className="p-0.5 hover:bg-accent rounded shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            )
          ) : (
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          
          <span className="flex-1 text-xs truncate min-w-0" title={node.category.name}>
            {node.category.name}
          </span>
          
          {count > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
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

  const hasFilters = searchTerm || sourceFilter !== "all";

  return (
    <div className="space-y-4">
      {/* Search and Filters - only show if not hidden by parent */}
      {!hideFilters && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por título, número ou entidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-1">
                <Button
                  variant={sourceFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSourceFilter("all")}
                >
                  Todos
                </Button>
                <Button
                  variant={sourceFilter === "dre" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSourceFilter("dre")}
                >
                  <Flag className="h-3 w-3 mr-1" />
                  DRE
                </Button>
                <Button
                  variant={sourceFilter === "eurlex" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSourceFilter("eurlex")}
                >
                  <Globe className="h-3 w-3 mr-1" />
                  EUR-Lex
                </Button>
              </div>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setSourceFilter("all");
                  }}
                  className="text-muted-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpar
                </Button>
              )}

              <div className="text-sm text-muted-foreground ml-auto">
                {filteredLegislation.length} diploma{filteredLegislation.length !== 1 ? "s" : ""}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tree View - 2 column layout */}
      <div className="flex gap-4 items-start">
      {/* Theme selector - only show if not hidden */}
      {!hideThemesColumn && (
        <Card className="w-64 flex-shrink-0">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Temas</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-1">
              {themesWithCategories?.map(theme => {
                const themeCount = filteredLegislation.filter(leg => 
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
                      setInternalSelectedThemeId(theme.id);
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
      )}

      {/* Category tree */}
      {selectedTheme ? (
        <Card className="w-64 min-w-[200px] flex-shrink-0 overflow-hidden">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tags className="h-4 w-4 shrink-0" />
                  Categorias
                </CardTitle>
                <CardDescription className="text-xs truncate">
                  {selectedTheme.name}
                </CardDescription>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={expandAll}
                  title="Expandir tudo"
                >
                  <ChevronsUpDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={collapseAll}
                  title="Colapsar tudo"
                >
                  <ChevronsDownUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2 overflow-hidden">
            <ScrollArea className="h-[calc(100vh-400px)]">
              <div className="space-y-0.5 pr-2">
                {categoryTree.map(node => renderCategoryNode(node))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : hideThemesColumn ? (
        <Card className="w-64 min-w-[200px] flex-shrink-0 overflow-hidden">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tags className="h-4 w-4" />
              Categorias
            </CardTitle>
            <CardDescription className="text-xs">
              Selecione um tema no filtro acima
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex items-center justify-center text-muted-foreground">
            <p className="text-sm text-center">Utilize o filtro "Tema / Categoria" para selecionar um tema</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Legislation list */}
      <Card className="flex-1 min-w-0">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Legislação
            {selectedCategoryId && displayedLegislation.length > 0 && (
              <Badge variant="outline">{displayedLegislation.length}</Badge>
            )}
            {/* Pending evaluation counter */}
            {applicabilityMap && selectedCategoryId && displayedLegislation.length > 0 && (() => {
              const pendingCount = displayedLegislation.filter(
                leg => !applicabilityMap[leg.id] || applicabilityMap[leg.id] === "nao_avaliado"
              ).length;
              return pendingCount > 0 ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {pendingCount}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{pendingCount} diploma{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''} de avaliação</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null;
            })()}
          </CardTitle>
          <CardDescription className="text-xs">
            {selectedCategoryId 
              ? "Diplomas na categoria selecionada"
              : selectedThemeId 
                ? "Selecione uma categoria à esquerda"
                : hideThemesColumn
                  ? "Selecione um tema no filtro acima"
                  : "Selecione um tema para começar"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2 overflow-hidden">
          <ScrollArea className="h-[calc(100vh-400px)]">
            {displayedLegislation.length > 0 ? (
              <div className="space-y-2">
                {displayedLegislation.map(leg => {
                  const requirementsCount = (leg as any).legal_requirements?.length || 0;
                  const applicabilityType = applicabilityMap?.[leg.id];
                  const applicabilityInfo = applicabilityType ? getLegislationApplicabilityInfo(applicabilityType) : null;
                  const showApplicability = applicabilityInfo && applicabilityType !== "nao_avaliado";
                  const isNotEvaluated = applicabilityMap && (!applicabilityType || applicabilityType === "nao_avaliado");
                  
                  return (
                    <div
                      key={leg.id}
                      className={`rounded-lg border p-3 hover:bg-accent/50 transition-colors overflow-hidden ${
                        isNotEvaluated ? 'border-l-4 border-l-amber-400 bg-amber-50/30' : ''
                      }`}
                    >
                      {/* Header row: Source badge + Applicability/Pending + Actions */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <Badge 
                            variant="outline"
                            className={`shrink-0 text-[10px] px-1.5 py-0 h-5 ${
                              leg.origin === 'PT' 
                                ? 'bg-green-500/10 text-green-700 border-green-300' 
                                : 'bg-blue-500/10 text-blue-700 border-blue-300'
                            }`}
                          >
                            {leg.origin === 'PT' ? (
                              <><Flag className="h-2.5 w-2.5 mr-0.5" />DRE</>
                            ) : (
                              <><Globe className="h-2.5 w-2.5 mr-0.5" />EU</>
                            )}
                          </Badge>
                          {showApplicability && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge 
                                    variant="outline"
                                    className={`shrink-0 text-[10px] px-1.5 py-0 h-5 cursor-help ${applicabilityInfo.color}`}
                                  >
                                    {applicabilityInfo.label}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="text-xs">{applicabilityInfo.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {isNotEvaluated && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 shrink-0">
                                    <AlertCircle className="h-3 w-3" />
                                    Pendente
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="text-xs">Este diploma ainda não foi avaliado pela organização.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {requirementsCount > 0 && (
                            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/30">
                              <ListChecks className="h-2.5 w-2.5 mr-0.5" />
                              {requirementsCount}
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild title="Ver detalhes">
                            <Link to={`/legislacao/${leg.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {leg.document_url && (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild title="Abrir documento">
                              <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Number + Title */}
                      <Link 
                        to={`/legislacao/${leg.id}`} 
                        className="block hover:text-primary transition-colors"
                      >
                        <p className="font-semibold text-sm">
                          {leg.number}
                        </p>
                        <p className="text-sm text-foreground/90 line-clamp-2">
                          {leg.title}
                        </p>
                      </Link>
                      
                      {/* Summary */}
                      {(leg as any).summary && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                          {(leg as any).summary}
                        </p>
                      )}
                    </div>
                  );
                })}
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
    </div>
  );
}
