import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  Search, 
  Folder, 
  FolderOpen,
  ListChecks,
  Flag,
  Globe,
  ExternalLink,
  Loader2,
  Eye,
  X,
  Leaf,
  Shield,
  Zap,
  Award,
  Heart,
  Tags,
  type LucideIcon
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useThemesWithCategories, ThemeCategory, ThemeWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories, type LegislationWithCategories } from "@/hooks/useLegislation";
import { ManageRequirementsDialog } from "./ManageRequirementsDialog";
import { useIsMobile } from "@/hooks/use-mobile";

// Theme color configurations
const themeColors: Record<string, { bg: string; text: string; border: string; icon: LucideIcon }> = {
  "Ambiente": { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200", icon: Leaf },
  "SST": { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", border: "border-orange-200", icon: Shield },
  "Segurança e Saúde no Trabalho": { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-400", border: "border-orange-200", icon: Shield },
  "Energia": { bg: "bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-400", border: "border-yellow-200", icon: Zap },
  "Qualidade": { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200", icon: Award },
  "Segurança": { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-200", icon: Shield },
  "Conciliação Familiar e Profissional": { bg: "bg-pink-500/10", text: "text-pink-700 dark:text-pink-400", border: "border-pink-200", icon: Heart },
};

const getThemeConfig = (themeName: string) => {
  return themeColors[themeName] || { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20", icon: Tags };
};

interface LegislationRequirement {
  id: string;
  article: string | null;
  requirement_text: string;
  display_order: number | null;
}

interface CategoryTreeNode extends ThemeCategory {
  children: CategoryTreeNode[];
  legislationCount: number;
}

// Build category tree with hierarchy
function buildCategoryTree(
  categories: ThemeCategory[], 
  legislation: LegislationWithCategories[] | undefined,
  themeName: string
): CategoryTreeNode[] {
  const categoryLegislationMap = new Map<string, number>();
  
  // Count legislation per category
  legislation?.forEach(leg => {
    leg.categories.forEach(cat => {
      if (cat.theme_name === themeName) {
        categoryLegislationMap.set(cat.id, (categoryLegislationMap.get(cat.id) || 0) + 1);
      }
    });
  });
  
  const nodesById = new Map<string, CategoryTreeNode>();
  
  // Create nodes
  categories.forEach(cat => {
    nodesById.set(cat.id, {
      ...cat,
      children: [],
      legislationCount: categoryLegislationMap.get(cat.id) || 0,
    });
  });
  
  // Build tree
  const roots: CategoryTreeNode[] = [];
  categories.forEach(cat => {
    const node = nodesById.get(cat.id)!;
    if (cat.parent_id && nodesById.has(cat.parent_id)) {
      nodesById.get(cat.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  
  // Sort children by name
  const sortChildren = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    nodes.forEach(n => sortChildren(n.children));
  };
  sortChildren(roots);
  
  return roots;
}

// Recursive category tree item component
function CategoryTreeItem({
  node,
  level,
  selectedCategoryId,
  onSelect,
  expandedCategories,
  onToggleExpand,
}: {
  node: CategoryTreeNode;
  level: number;
  selectedCategoryId: string | null;
  onSelect: (id: string) => void;
  expandedCategories: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedCategories.has(node.id);
  const isSelected = selectedCategoryId === node.id;
  
  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors text-sm ${
          isSelected 
            ? "bg-primary/10 text-primary font-medium" 
            : "hover:bg-muted/50"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : (
          <span className="w-5" />
        )}
        
        {hasChildren ? (
          isExpanded ? <FolderOpen className="h-3.5 w-3.5 text-amber-600" /> : <Folder className="h-3.5 w-3.5 text-amber-600" />
        ) : (
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        
        <span className="flex-1 truncate">{node.name}</span>
        
        {node.legislationCount > 0 && (
          <Badge variant="secondary" className="text-xs h-5 px-1.5">
            {node.legislationCount}
          </Badge>
        )}
      </div>
      
      {hasChildren && isExpanded && (
        <div>
          {node.children.map(child => (
            <CategoryTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
              expandedCategories={expandedCategories}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GlobalApplicabilityPanel() {
  const isMobile = useIsMobile();
  const { data: themes, isLoading: themesLoading } = useThemesWithCategories();
  const { data: legislation, isLoading: legislationLoading } = useLegislationWithCategories();
  
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedLegislation, setExpandedLegislation] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [requirementsDialogLeg, setRequirementsDialogLeg] = useState<LegislationWithCategories | null>(null);
  
  // Fetch requirements for expanded legislation
  const expandedLegIds = Array.from(expandedLegislation);
  const { data: requirementsMap } = useQuery({
    queryKey: ["legislation-requirements", expandedLegIds],
    queryFn: async () => {
      if (expandedLegIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from("legal_requirements")
        .select("*")
        .in("legislation_id", expandedLegIds)
        .order("display_order", { ascending: true, nullsFirst: false });
      
      if (error) throw error;
      
      const map: Record<string, LegislationRequirement[]> = {};
      data?.forEach(req => {
        if (!map[req.legislation_id]) map[req.legislation_id] = [];
        map[req.legislation_id].push(req);
      });
      return map;
    },
    enabled: expandedLegIds.length > 0,
  });

  // Get the selected theme
  const selectedTheme = useMemo(() => {
    if (!selectedThemeId || !themes) return null;
    return themes.find(t => t.id === selectedThemeId);
  }, [selectedThemeId, themes]);

  // Build category tree for selected theme
  const categoryTree = useMemo(() => {
    if (!selectedTheme) return [];
    return buildCategoryTree(selectedTheme.categories || [], legislation, selectedTheme.name);
  }, [selectedTheme, legislation]);

  // Get all category IDs in subtree (for filtering by parent category)
  const getSubtreeCategoryIds = (categoryId: string): Set<string> => {
    const ids = new Set<string>([categoryId]);
    const findChildren = (parentId: string) => {
      selectedTheme?.categories?.forEach(cat => {
        if (cat.parent_id === parentId) {
          ids.add(cat.id);
          findChildren(cat.id);
        }
      });
    };
    findChildren(categoryId);
    return ids;
  };

  // Filter legislation by selected category (including subcategories)
  const filteredLegislation = useMemo(() => {
    if (!legislation) return [];
    
    let result = legislation;
    
    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(leg =>
        leg.title.toLowerCase().includes(term) ||
        leg.number.toLowerCase().includes(term) ||
        leg.summary?.toLowerCase().includes(term)
      );
    }
    
    // Filter by category (including all subcategories)
    if (selectedCategoryId && selectedTheme) {
      const subtreeIds = getSubtreeCategoryIds(selectedCategoryId);
      result = result.filter(leg =>
        leg.categories.some(cat => subtreeIds.has(cat.id))
      );
    } else if (selectedTheme) {
      // Filter by theme name
      result = result.filter(leg =>
        leg.categories.some(cat => cat.theme_name === selectedTheme.name)
      );
    }
    
    return result.slice(0, 100);
  }, [legislation, searchTerm, selectedCategoryId, selectedTheme]);

  const toggleTheme = (id: string) => {
    setExpandedThemes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLegislation = (id: string) => {
    setExpandedLegislation(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedThemeId(null);
    setSelectedCategoryId(null);
    setSearchTerm("");
  };

  const isLoading = themesLoading || legislationLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-[280px_1fr]"}`}>
      {/* Left sidebar - Theme & Category Tree */}
      <Card className={isMobile ? "" : "h-[calc(100vh-280px)]"}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Temas & Categorias</h3>
            {(selectedThemeId || selectedCategoryId) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs">
                <X className="h-3 w-3 mr-1" />
                Limpar
              </Button>
            )}
          </div>
          
          <ScrollArea className={isMobile ? "h-48" : "h-[calc(100vh-360px)]"}>
            <div className="space-y-1">
              {themes?.map(theme => {
                const config = getThemeConfig(theme.name);
                const Icon = config.icon;
                const isExpanded = expandedThemes.has(theme.id);
                const isSelected = selectedThemeId === theme.id && !selectedCategoryId;
                const legCount = legislation?.filter(l => 
                  l.categories.some(c => c.theme_name === theme.name)
                ).length || 0;
                const tree = buildCategoryTree(theme.categories || [], legislation, theme.name);
                
                return (
                  <div key={theme.id}>
                    <div
                      className={`flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer transition-colors ${
                        isSelected 
                          ? `${config.bg} ${config.text} font-medium` 
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => {
                        setSelectedThemeId(theme.id);
                        setSelectedCategoryId(null);
                        if (!expandedThemes.has(theme.id)) {
                          toggleTheme(theme.id);
                        }
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTheme(theme.id);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <Icon className={`h-4 w-4 ${config.text}`} />
                      <span className="flex-1 text-sm truncate">{theme.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {legCount}
                      </Badge>
                    </div>
                    
                    {isExpanded && tree.length > 0 && (
                      <div className="ml-2 border-l border-muted pl-1">
                        {tree.map(node => (
                          <CategoryTreeItem
                            key={node.id}
                            node={node}
                            level={0}
                            selectedCategoryId={selectedCategoryId}
                            onSelect={(id) => {
                              setSelectedThemeId(theme.id);
                              setSelectedCategoryId(id);
                            }}
                            expandedCategories={expandedCategories}
                            onToggleExpand={toggleCategory}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right side - Legislation list */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar legislação..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
        
        {/* Breadcrumb */}
        {(selectedTheme || selectedCategoryId) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {selectedTheme && (
              <>
                <Badge variant="outline" className={`${getThemeConfig(selectedTheme.name).bg} ${getThemeConfig(selectedTheme.name).text}`}>
                  {selectedTheme.name}
                </Badge>
                {selectedCategoryId && (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    <Badge variant="secondary">
                      {selectedTheme.categories?.find(c => c.id === selectedCategoryId)?.name}
                    </Badge>
                  </>
                )}
              </>
            )}
            <span className="ml-auto">{filteredLegislation.length} diplomas</span>
          </div>
        )}

        {/* Legislation list */}
        <ScrollArea className={isMobile ? "h-[calc(100vh-380px)]" : "h-[calc(100vh-340px)]"}>
          <div className="space-y-2 pr-2">
            {!selectedTheme ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tags className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Selecione um tema</p>
                <p className="text-sm">Escolha um tema na árvore para ver a legislação associada</p>
              </div>
            ) : filteredLegislation.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma legislação encontrada.</p>
              </div>
            ) : (
              filteredLegislation.map(leg => {
                const isExpanded = expandedLegislation.has(leg.id);
                const requirements = requirementsMap?.[leg.id] || [];
                const isRevoked = !!(leg as any).revocation_date;
                
                return (
                  <Card 
                    key={leg.id} 
                    className={`overflow-hidden transition-all ${
                      isRevoked ? "opacity-60 bg-muted/30" : ""
                    }`}
                  >
                    <Collapsible open={isExpanded} onOpenChange={() => toggleLegislation(leg.id)}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-start gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 mt-0.5">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <Badge 
                                variant="outline" 
                                className={`text-xs shrink-0 ${
                                  leg.origin === "PT" 
                                    ? "bg-green-500/10 text-green-700 border-green-300" 
                                    : "bg-blue-500/10 text-blue-700 border-blue-300"
                                }`}
                              >
                                {leg.origin === "PT" ? <><Flag className="h-3 w-3 mr-1" />PT</> : <><Globe className="h-3 w-3 mr-1" />UE</>}
                              </Badge>
                              <span className="text-xs font-medium text-muted-foreground truncate">{leg.number}</span>
                              {isRevoked && <Badge variant="destructive" className="text-xs">Revogado</Badge>}
                            </div>
                            <h4 className="text-sm font-medium line-clamp-2">{leg.title}</h4>
                            
                            {/* Show categories from other themes */}
                            {leg.categories.filter(c => c.theme_name !== selectedTheme?.name).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {leg.categories.filter(c => c.theme_name !== selectedTheme?.name).slice(0, 2).map(cat => (
                                  <Badge key={cat.id} variant="outline" className="text-xs">
                                    {cat.theme_name}: {cat.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 shrink-0">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link to={`/legislacao/${leg.id}`}>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent>Ver detalhes</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            
                            {leg.document_url && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a href={leg.document_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </Button>
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent>Abrir documento</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="border-t px-3 py-3 bg-muted/20">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <ListChecks className="h-4 w-4" />
                              Requisitos ({requirements.length})
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRequirementsDialogLeg(leg);
                              }}
                              className="h-7 text-xs gap-1.5"
                            >
                              <FileText className="h-3 w-3" />
                              <span className="hidden sm:inline">Gerir</span>
                            </Button>
                          </div>
                          
                          {requirements.length > 0 ? (
                            <div className="space-y-2">
                              {requirements.slice(0, 10).map(req => (
                                <div key={req.id} className="flex items-start gap-2 p-2 rounded-md bg-background border text-sm">
                                  <div className="flex-1 min-w-0">
                                    {req.article && (
                                      <span className="text-xs font-medium text-muted-foreground">{req.article}</span>
                                    )}
                                    <p className="text-sm line-clamp-2">{req.requirement_text}</p>
                                  </div>
                                </div>
                              ))}
                              {requirements.length > 10 && (
                                <p className="text-xs text-muted-foreground text-center py-2">
                                  +{requirements.length - 10} requisitos
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Nenhum requisito extraído.
                            </p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
      
      {requirementsDialogLeg && (
        <ManageRequirementsDialog
          legislation={requirementsDialogLeg}
          open={!!requirementsDialogLeg}
          onOpenChange={(open) => !open && setRequirementsDialogLeg(null)}
        />
      )}
    </div>
  );
}
