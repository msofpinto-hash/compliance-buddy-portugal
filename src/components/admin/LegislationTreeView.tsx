import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { highlightText } from "@/lib/highlightText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  Search,
  X,
  ChevronsUpDown,
  ChevronsDownUp,
  ListChecks,
  AlertCircle,
  Leaf,
  Shield,
  Zap,
  Heart,
  Scale,
  Building2,
  Flame,
  Droplets,
  Wind,
  TreePine,
  Recycle,
  Volume2,
  FileCheck,
  Award,
  Users,
  Briefcase,
  Calendar,
  GitBranch,
  type LucideIcon
} from "lucide-react";
import { Link } from "react-router-dom";
import { useThemesWithCategories, ThemeCategory, ThemeWithCategories } from "@/hooks/useThemes";
import { type LegislationWithCategories } from "@/hooks/useLegislation";
import { getLegislationApplicabilityInfo } from "@/components/LegislationApplicabilitySelect";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import emptySearchImage from "@/assets/empty-search.png";
import treeCategoriesImage from "@/assets/tree-categories.png";

// Theme color configurations
const themeColors: Record<string, { bg: string; text: string; border: string; accent: string; icon: LucideIcon }> = {
  "Ambiente": { 
    bg: "bg-emerald-500/10", 
    text: "text-emerald-700", 
    border: "border-emerald-200",
    accent: "bg-emerald-500",
    icon: Leaf
  },
  "SST": { 
    bg: "bg-orange-500/10", 
    text: "text-orange-700", 
    border: "border-orange-200",
    accent: "bg-orange-500",
    icon: Shield
  },
  "Segurança e Saúde no Trabalho": { 
    bg: "bg-orange-500/10", 
    text: "text-orange-700", 
    border: "border-orange-200",
    accent: "bg-orange-500",
    icon: Shield
  },
  "Energia": { 
    bg: "bg-yellow-500/10", 
    text: "text-yellow-700", 
    border: "border-yellow-200",
    accent: "bg-yellow-500",
    icon: Zap
  },
  "Qualidade": { 
    bg: "bg-blue-500/10", 
    text: "text-blue-700", 
    border: "border-blue-200",
    accent: "bg-blue-500",
    icon: Award
  },
  "Segurança": { 
    bg: "bg-red-500/10", 
    text: "text-red-700", 
    border: "border-red-200",
    accent: "bg-red-500",
    icon: Shield
  },
  "Conciliação Familiar e Profissional": { 
    bg: "bg-pink-500/10", 
    text: "text-pink-700", 
    border: "border-pink-200",
    accent: "bg-pink-500",
    icon: Heart
  },
};

// Category-specific icons based on keywords in name
const getCategoryIcon = (categoryName: string): LucideIcon => {
  const name = categoryName.toLowerCase();
  if (name.includes("água") || name.includes("hidric")) return Droplets;
  if (name.includes("ar") || name.includes("emiss")) return Wind;
  if (name.includes("floresta") || name.includes("natureza")) return TreePine;
  if (name.includes("resíduo")) return Recycle;
  if (name.includes("ruído")) return Volume2;
  if (name.includes("clima")) return Flame;
  if (name.includes("energia")) return Zap;
  if (name.includes("licen")) return FileCheck;
  if (name.includes("risco") || name.includes("preven")) return AlertCircle;
  if (name.includes("esg") || name.includes("sustentab")) return Leaf;
  if (name.includes("segurança") || name.includes("saúde")) return Shield;
  if (name.includes("trabalho") || name.includes("laboral")) return Briefcase;
  if (name.includes("qualidade")) return Award;
  if (name.includes("concilia") || name.includes("famil")) return Users;
  return Folder;
};

const getThemeConfig = (themeName: string) => {
  return themeColors[themeName] || { 
    bg: "bg-primary/10", 
    text: "text-primary", 
    border: "border-primary/20",
    accent: "bg-primary",
    icon: Tags
  };
};

// Helper to detect if title is redundant with number (e.g., "Decreto-Lei n.º 152/2017" appears in both)
const isTitleRedundant = (number: string, title: string): boolean => {
  if (!title || !number) return false;
  
  // Normalize both strings for comparison
  const normalizeForCompare = (s: string) => 
    s.toLowerCase()
      .replace(/[.,\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  
  const normalizedNumber = normalizeForCompare(number);
  const normalizedTitle = normalizeForCompare(title);
  
  // Check if title starts with the number (very common pattern)
  if (normalizedTitle.startsWith(normalizedNumber.split(' de ')[0])) {
    return true;
  }
  
  // Extract the core identifier (e.g., "152/2017" from "Decreto-Lei n.º 152/2017")
  const numberMatch = number.match(/\d+\/\d+/);
  const titleMatch = title.match(/\d+\/\d+/);
  
  if (numberMatch && titleMatch && numberMatch[0] === titleMatch[0]) {
    // Both have the same number like "152/2017", check if title adds value
    // If title is just "Type n.º X/Y - short description" it might be redundant
    const titleWithoutNumber = title.replace(/^[^-–—]+[-–—]\s*/, '').trim();
    if (titleWithoutNumber.length < 30) {
      // Very short additional info, likely not valuable enough to show separately
      return true;
    }
  }
  
  return false;
};

// Helper to split EUR-Lex title at the date, keeping only up to the date as title
// Pattern: "Regulamento (UE) XXXX/YYYY da Comissão, de DD de Mês de AAAA, que fixa..."
const splitEurlexTitle = (title: string): { title: string; rest: string | null } => {
  if (!title) return { title: '', rest: null };
  
  // Match pattern: ", de DD de [month] de YYYY," followed by more content
  // Portuguese months
  const monthPattern = '(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';
  const datePattern = new RegExp(`(,\\s*de\\s+\\d{1,2}\\s+de\\s+${monthPattern}\\s+de\\s+\\d{4})(.*)`, 'i');
  
  const match = title.match(datePattern);
  
  if (match) {
    const titlePart = title.substring(0, match.index! + match[1].length);
    const restPart = match[3]?.trim();
    
    // Clean up the rest part (remove leading comma or "que")
    let cleanRest = restPart?.replace(/^[,\s]+/, '').trim() || null;
    if (cleanRest && cleanRest.toLowerCase().startsWith('que ')) {
      cleanRest = cleanRest.substring(4).trim();
    }
    
    // Capitalize first letter
    if (cleanRest && cleanRest.length > 0) {
      cleanRest = cleanRest.charAt(0).toUpperCase() + cleanRest.slice(1);
    }
    
    return { 
      title: titlePart, 
      rest: cleanRest && cleanRest.length > 10 ? cleanRest : null 
    };
  }
  
  return { title, rest: null };
};

// Helper to detect if summary is redundant with title or number
const isSummaryRedundant = (number: string, title: string, summary: string): boolean => {
  if (!summary) return true;
  
  const normalizeForCompare = (s: string) => 
    s.toLowerCase()
      .replace(/[.,\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  
  const normalizedSummary = normalizeForCompare(summary);
  const normalizedTitle = normalizeForCompare(title || '');
  const normalizedNumber = normalizeForCompare(number || '');
  
  // If summary is very short, it's likely generic
  if (normalizedSummary.length < 20) return true;
  
  // If summary is essentially the same as title
  if (normalizedSummary === normalizedTitle) return true;
  
  // If summary starts with the same text as title (first 40 chars)
  if (normalizedTitle && normalizedSummary.startsWith(normalizedTitle.substring(0, 40))) return true;
  
  // If summary contains the number and is short, it's likely generic
  const numberCore = number?.match(/\d+\/\d+/)?.[0];
  if (numberCore && normalizedSummary.includes(numberCore) && normalizedSummary.length < 60) return true;
  
  return false;
};

interface LegislationTreeViewProps {
  legislation: LegislationWithCategories[];
  onSelectLegislation?: (leg: LegislationWithCategories) => void;
  hideFilters?: boolean;
  externalThemeId?: string | null;
  applicabilityMap?: Record<string, string>;
  externalSearchTerm?: string;
}

interface CategoryNode {
  category: ThemeCategory;
  children: CategoryNode[];
  legislation: LegislationWithCategories[];
}

export function LegislationTreeView({ legislation, onSelectLegislation, hideFilters = false, externalThemeId, applicabilityMap, externalSearchTerm }: LegislationTreeViewProps) {
  const { data: themesWithCategories, isLoading } = useThemesWithCategories();
  const [internalSelectedThemeId, setInternalSelectedThemeId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "dre" | "eurlex">("all");
  
  // Use external search term if provided (from Biblioteca), otherwise use internal
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = externalSearchTerm !== undefined ? () => {} : setInternalSearchTerm;
  
  const selectedThemeId = externalThemeId !== undefined ? externalThemeId : internalSelectedThemeId;
  const hideThemesColumn = externalThemeId !== undefined;

  const filteredLegislation = useMemo(() => {
    return legislation.filter(leg => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        leg.title?.toLowerCase().includes(searchLower) ||
        leg.number?.toLowerCase().includes(searchLower) ||
        leg.entity?.toLowerCase().includes(searchLower) ||
        leg.summary?.toLowerCase().includes(searchLower);
      
      const matchesSource = sourceFilter === "all" || 
        (sourceFilter === "dre" && leg.source === "dre") ||
        (sourceFilter === "eurlex" && leg.source === "eurlex");
      
      return matchesSearch && matchesSource;
    });
  }, [legislation, searchTerm, sourceFilter]);

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

  const selectedTheme = themesWithCategories?.find(t => t.id === selectedThemeId);
  const themeConfig = selectedTheme ? getThemeConfig(selectedTheme.name) : null;
  
  const categoryTree = useMemo(() => {
    if (!selectedTheme) return [];
    return buildCategoryTree(selectedTheme.categories);
  }, [selectedTheme, legislationByCategory]);

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

  const countLegislation = (node: CategoryNode): number => {
    let count = node.legislation.length;
    node.children.forEach(child => {
      count += countLegislation(child);
    });
    return count;
  };

  const getAllLegislationForCategory = (node: CategoryNode): LegislationWithCategories[] => {
    let allLegislation = [...node.legislation];
    node.children.forEach(child => {
      allLegislation = [...allLegislation, ...getAllLegislationForCategory(child)];
    });
    const seen = new Set<string>();
    return allLegislation.filter(leg => {
      if (seen.has(leg.id)) return false;
      seen.add(leg.id);
      return true;
    });
  };

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
    const CategoryIcon = getCategoryIcon(node.category.name);
    const isMainCategory = level === 0;

    return (
      <div key={node.category.id}>
        <div
          className={`flex items-center gap-1.5 py-2 px-2 rounded-lg cursor-pointer transition-all duration-200 ${
            isSelected 
              ? `${themeConfig?.bg} ${themeConfig?.text} shadow-sm` 
              : 'hover:bg-accent/50'
          } ${isMainCategory && !isSelected ? 'bg-muted/50' : ''}`}
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
              className={`p-0.5 rounded shrink-0 transition-colors ${
                isSelected ? 'hover:bg-white/30' : 'hover:bg-accent'
              }`}
            >
              {isExpanded ? (
                <ChevronDown className={`h-4 w-4 ${isMainCategory ? 'text-foreground' : 'text-muted-foreground'}`} />
              ) : (
                <ChevronRight className={`h-4 w-4 ${isMainCategory ? 'text-foreground' : 'text-muted-foreground'}`} />
              )}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          
          <div className={`p-1.5 rounded-md shrink-0 ${
            isSelected 
              ? 'bg-white/30' 
              : isMainCategory 
                ? `${themeConfig?.accent} bg-opacity-20` 
                : themeConfig?.bg || 'bg-muted'
          }`}>
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen className={`h-3.5 w-3.5 ${isSelected ? '' : themeConfig?.text || 'text-amber-500'}`} />
              ) : (
                <CategoryIcon className={`h-3.5 w-3.5 ${isSelected ? '' : themeConfig?.text || 'text-amber-500'}`} />
              )
            ) : (
              <FileText className={`h-3.5 w-3.5 ${isSelected ? '' : 'text-muted-foreground'}`} />
            )}
          </div>
          
          <span className={`flex-1 min-w-0 ${
            isSelected 
              ? '' 
              : isMainCategory 
                ? 'text-foreground font-semibold' 
                : 'text-muted-foreground font-medium'
          } ${isMainCategory ? 'text-sm' : 'text-xs'}`} title={node.category.name}>
            {node.category.name}
          </span>
          
          {count > 0 && (
            <Badge 
              variant="secondary" 
              className={`text-xs h-5 px-2 shrink-0 ${
                isSelected 
                  ? 'bg-white/30 text-current' 
                  : `${themeConfig?.bg} ${themeConfig?.text}`
              }`}
            >
              {count}
            </Badge>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div className="relative ml-4">
            {/* Vertical connecting line */}
            <div 
              className={`absolute top-0 bottom-2 w-0.5 rounded-full ${
                isMainCategory ? themeConfig?.accent : 'bg-border'
              } opacity-30`}
              style={{ left: `${level * 16 + 14}px` }}
            />
            {node.children.map((child, idx) => (
              <div key={child.category.id} className="relative">
                {/* Horizontal connecting line */}
                <div 
                  className={`absolute w-3 h-0.5 rounded-full ${
                    isMainCategory ? themeConfig?.accent : 'bg-border'
                  } opacity-30`}
                  style={{ 
                    left: `${level * 16 + 14}px`,
                    top: '18px'
                  }}
                />
                {renderCategoryNode(child, level + 1)}
              </div>
            ))}
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
      {/* Search and Filters */}
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

      {/* Tree View - 2/3 column layout */}
      <div className="flex gap-4 items-start">
        {/* Theme selector */}
        {!hideThemesColumn && (
          <Card className="w-72 flex-shrink-0">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tags className="h-4 w-4" />
                Temas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="space-y-1">
                {themesWithCategories?.map(theme => {
                  const config = getThemeConfig(theme.name);
                  const ThemeIcon = config.icon;
                  const themeCount = filteredLegislation.filter(leg => 
                    leg.categories.some(cat => 
                      theme.categories.some(tc => tc.id === cat.id)
                    )
                  ).length;
                  const isSelected = selectedThemeId === theme.id;
                  
                  return (
                    <button
                      key={theme.id}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 ${
                        isSelected 
                          ? `${config.bg} ${config.text} ${config.border} border shadow-sm` 
                          : 'hover:bg-accent border border-transparent'
                      }`}
                      onClick={() => {
                        setInternalSelectedThemeId(theme.id);
                        setSelectedCategoryId(null);
                        setExpandedCategories(new Set());
                      }}
                    >
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-white/50' : config.bg}`}>
                        <ThemeIcon className={`h-4 w-4 ${config.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium block truncate">{theme.name}</span>
                        <span className={`text-xs ${isSelected ? 'opacity-80' : 'text-muted-foreground'}`}>
                          {themeCount} diploma{themeCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Category tree */}
        {selectedTheme ? (
          <Card className={`w-96 min-w-[380px] flex-shrink-0 ${themeConfig?.border} border-2`}>
            <CardHeader className={`py-3 px-4 ${themeConfig?.bg} rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <CardTitle className={`text-sm flex items-center gap-2 ${themeConfig?.text}`}>
                    {themeConfig && <themeConfig.icon className="h-4 w-4 shrink-0" />}
                    Categorias
                  </CardTitle>
                  <CardDescription className={`text-xs ${themeConfig?.text} opacity-80`}>
                    {selectedTheme.name}
                  </CardDescription>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${themeConfig?.text} hover:bg-white/30`}
                    onClick={expandAll}
                    title="Expandir tudo"
                  >
                    <ChevronsUpDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${themeConfig?.text} hover:bg-white/30`}
                    onClick={collapseAll}
                    title="Colapsar tudo"
                  >
                    <ChevronsDownUp className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-2">
              <ScrollArea className="max-h-[calc(100vh-300px)]">
                <div className="space-y-0.5 pr-2">
                  {categoryTree.map(node => renderCategoryNode(node))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : hideThemesColumn ? (
          <Card className="w-96 min-w-[380px] flex-shrink-0 overflow-hidden border-dashed">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <Tags className="h-4 w-4" />
                Categorias
              </CardTitle>
              <CardDescription className="text-xs">
                Selecione um tema no filtro acima
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex flex-col items-center justify-center text-muted-foreground">
              <img 
                src={treeCategoriesImage} 
                alt="Selecione um tema" 
                className="w-24 h-24 object-contain opacity-80 mb-3"
              />
              <p className="text-sm text-center">Utilize o filtro "Tema / Categoria" para selecionar um tema</p>
            </CardContent>
          </Card>
        ) : null}

        {/* Legislation list */}
        <Card className="flex-1 min-w-0">
          <CardHeader className="py-3 px-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Legislação
                {selectedCategoryId && displayedLegislation.length > 0 && (
                  <Badge variant="outline" className={themeConfig ? `${themeConfig.bg} ${themeConfig.text}` : ''}>
                    {displayedLegislation.length}
                  </Badge>
                )}
              </CardTitle>
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
                          {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">{pendingCount} diploma{pendingCount !== 1 ? 's' : ''} pendente{pendingCount !== 1 ? 's' : ''} de avaliação</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null;
              })()}
            </div>
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
          <CardContent className="p-2">
            {displayedLegislation.length > 0 ? (
              <ScrollArea className="max-h-[calc(100vh-300px)]">
                <div className="space-y-2 pr-2">
                  {displayedLegislation.map(leg => {
                    const requirementsCount = (leg as any).legal_requirements?.length || 0;
                    const applicabilityType = applicabilityMap?.[leg.id];
                    const applicabilityInfo = applicabilityType ? getLegislationApplicabilityInfo(applicabilityType) : null;
                    const showApplicability = applicabilityInfo && applicabilityType !== "nao_avaliado";
                    const isNotEvaluated = applicabilityMap && (!applicabilityType || applicabilityType === "nao_avaliado");

                    const isRevoked = !!(leg as any).revocation_date;

                    return (
                      <div
                        key={leg.id}
                        className={`rounded-lg border p-3 hover:shadow-md transition-all duration-200 overflow-hidden group ${
                          isNotEvaluated ? "border-l-4 border-l-amber-400" : ""
                        } ${
                          isRevoked
                            ? "bg-muted/50 border-muted opacity-75"
                            : leg.origin === "PT" 
                              ? "hover:border-green-300" 
                              : "hover:border-blue-300"
                        }`}
                      >
                        {/* Header row */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-xs px-2 py-0.5 ${
                                leg.origin === "PT"
                                  ? "bg-green-500/10 text-green-700 border-green-300"
                                  : "bg-blue-500/10 text-blue-700 border-blue-300"
                              }`}
                            >
                              {leg.origin === "PT" ? (
                                <><Flag className="h-3 w-3 mr-1" />DRE</>
                              ) : (
                                <><Globe className="h-3 w-3 mr-1" />EU</>
                              )}
                            </Badge>
                            {showApplicability && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className={`shrink-0 text-xs px-2 py-0.5 cursor-help ${applicabilityInfo.color}`}
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
                            {isRevoked && (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-xs px-2 py-0.5 bg-destructive/10 text-destructive border-destructive/30"
                              >
                                Revogado
                              </Badge>
                            )}
                            {isNotEvaluated && !isRevoked && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 shrink-0">
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
                              <Badge
                                variant="outline"
                                className={`shrink-0 text-xs px-2 py-0.5 ${themeConfig?.bg} ${themeConfig?.text} ${themeConfig?.border}`}
                              >
                                <ListChecks className="h-3 w-3 mr-1" />
                                {requirementsCount}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild title="Ver detalhes">
                              <Link to={`/legislacao/${leg.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            {leg.document_url && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild title="Abrir documento">
                                <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Number + Title */}
                        <Link to={`/legislacao/${leg.id}`} className={`block group-hover:text-primary transition-colors ${isRevoked ? 'text-muted-foreground' : ''}`}>
                          {/* For EUR-Lex: show title bold (with fallback to number). For DRE: number IS the title, show bold */}
                          {leg.origin === 'EU' ? (
                            (() => {
                              const hasGoodTitle = leg.title && !isTitleRedundant(leg.number, leg.title);
                              const splitResult = hasGoodTitle ? splitEurlexTitle(leg.title) : null;
                              // Use the split title if it starts with "Regulamento", "Diretiva", "Decisão", etc.
                              // Otherwise use the full title or fall back to number
                              const startsWithLegalType = splitResult?.title && /^(Regulamento|Diretiva|Decisão|Recomendação)/i.test(splitResult.title);
                              const displayTitle = startsWithLegalType 
                                ? splitResult!.title 
                                : (hasGoodTitle ? leg.title : leg.number);
                              
                              return (
                                <p className={`text-sm font-bold line-clamp-2 ${
                                  isRevoked ? 'line-through decoration-destructive/50 text-muted-foreground' : 'text-foreground'
                                }`}>{displayTitle}</p>
                              );
                            })()
                          ) : (
                            <>
                              <p className={`font-bold text-sm ${isRevoked ? 'line-through decoration-destructive/50' : ''}`}>{leg.number}</p>
                              {/* For DRE, show title below if different from number */}
                              {leg.title && !isTitleRedundant(leg.number, leg.title) && (
                                <p className={`text-sm line-clamp-2 ${
                                  isRevoked ? 'line-through decoration-destructive/50 text-muted-foreground' : 'text-foreground/90'
                                }`}>{leg.title}</p>
                              )}
                            </>
                          )}
                        </Link>

                        {/* Summary + Date - only show if not redundant with title */}
                        <div className="flex items-end justify-between mt-2">
                          {(() => {
                            // For EUR-Lex, use the remainder of the title as summary if no explicit summary
                            const eurlexSummaryPart = leg.origin === 'EU' ? splitEurlexTitle(leg.title).rest : null;
                            const displaySummary = eurlexSummaryPart || (leg as any).summary;
                            
                            if (displaySummary && !isSummaryRedundant(leg.number, leg.title, displaySummary)) {
                              return (
                                <p className="text-xs text-muted-foreground line-clamp-1 flex-1 mr-4">
                                  {highlightText(displaySummary, searchTerm, "bg-yellow-200 text-yellow-900 rounded px-0.5 font-medium")}
                                </p>
                              );
                            }
                            return null;
                          })()}
                          {leg.publication_date && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(leg.publication_date), "dd/MM/yyyy")}
                            </span>
                          )}
                        </div>

                        {/* Relations */}
                        {leg.relations && leg.relations.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-dashed">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <GitBranch className="h-3 w-3 text-muted-foreground" />
                              {leg.relations.slice(0, 3).map((rel) => {
                                const typeStyles: Record<string, { label: string; className: string }> = {
                                  revogado: { label: "Revoga", className: "bg-gray-800 text-white" },
                                  revogacao_parcial: { label: "Rev. Parcial", className: "bg-gray-500 text-white" },
                                  alteracao: { label: "Altera", className: "bg-white border-2 border-gray-400 text-gray-700" },
                                  transposicao: { label: "Transpõe", className: "bg-blue-600 text-white" },
                                  regulamentacao: { label: "Regulamenta", className: "bg-purple-600 text-white" },
                                };
                                const style = typeStyles[rel.relation_type] || { label: rel.relation_type, className: "" };
                                return (
                                  <TooltipProvider key={rel.id} delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Link 
                                          to={`/legislacao/${rel.target_id}`}
                                          className="inline-block"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Badge
                                            className={`text-[10px] cursor-pointer hover:opacity-80 transition-opacity ${style.className}`}
                                          >
                                            <span className="opacity-70 mr-1">{style.label}:</span>
                                            <span className="font-mono">{rel.target_number?.split(' ').slice(0, 3).join(' ')}</span>
                                          </Badge>
                                        </Link>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-xs font-medium">{rel.target_number}</p>
                                        <p className="text-xs text-muted-foreground line-clamp-2">{rel.target_title}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })}
                              {leg.relations.length > 3 && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{leg.relations.length - 3} mais
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <img 
                  src={emptySearchImage} 
                  alt="Sem resultados" 
                  className="w-20 h-20 object-contain mx-auto opacity-80 mb-3"
                />
                <p className="text-sm">
                  {selectedCategoryId ? "Nenhuma legislação nesta categoria" : "Selecione uma categoria para ver os diplomas"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
