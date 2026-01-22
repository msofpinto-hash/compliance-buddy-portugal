import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Filter,
  X,
  Tags,
  Leaf,
  Shield,
  Zap,
  Award,
  Heart,
  type LucideIcon
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useThemesWithCategories, ThemeWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories, type LegislationWithCategories } from "@/hooks/useLegislation";
import { LegislationApplicabilitySelect, getLegislationApplicabilityInfo } from "@/components/LegislationApplicabilitySelect";
import { RequirementApplicabilitySelect, ApplicabilityBadge } from "@/components/RequirementApplicabilitySelect";
import { ManageRequirementsDialog } from "./ManageRequirementsDialog";
import { useIsMobile } from "@/hooks/use-mobile";

// Theme color configurations
const themeColors: Record<string, { bg: string; text: string; border: string; icon: LucideIcon }> = {
  "Ambiente": { bg: "bg-emerald-500/10", text: "text-emerald-700", border: "border-emerald-200", icon: Leaf },
  "SST": { bg: "bg-orange-500/10", text: "text-orange-700", border: "border-orange-200", icon: Shield },
  "Segurança e Saúde no Trabalho": { bg: "bg-orange-500/10", text: "text-orange-700", border: "border-orange-200", icon: Shield },
  "Energia": { bg: "bg-yellow-500/10", text: "text-yellow-700", border: "border-yellow-200", icon: Zap },
  "Qualidade": { bg: "bg-blue-500/10", text: "text-blue-700", border: "border-blue-200", icon: Award },
  "Segurança": { bg: "bg-red-500/10", text: "text-red-700", border: "border-red-200", icon: Shield },
  "Conciliação Familiar e Profissional": { bg: "bg-pink-500/10", text: "text-pink-700", border: "border-pink-200", icon: Heart },
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

export function GlobalApplicabilityPanel() {
  const isMobile = useIsMobile();
  const { data: themes, isLoading: themesLoading } = useThemesWithCategories();
  const { data: legislation, isLoading: legislationLoading } = useLegislationWithCategories();
  
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
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

  // Get categories for selected theme
  const themeCategories = useMemo(() => {
    if (!selectedTheme) return [];
    return selectedTheme.categories || [];
  }, [selectedTheme]);

  // Get theme name from ID for filtering
  const selectedThemeName = useMemo(() => {
    if (!selectedThemeId || !themes) return null;
    return themes.find(t => t.id === selectedThemeId)?.name || null;
  }, [selectedThemeId, themes]);

  // Filter legislation by selected theme/category
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
    
    // Filter by category
    if (selectedCategoryId) {
      result = result.filter(leg =>
        leg.categories.some(cat => cat.id === selectedCategoryId)
      );
    } else if (selectedThemeName) {
      // Filter by theme name (any category in that theme)
      result = result.filter(leg =>
        leg.categories.some(cat => cat.theme_name === selectedThemeName)
      );
    }
    
    return result.slice(0, 100); // Limit for performance
  }, [legislation, searchTerm, selectedThemeId, selectedCategoryId]);

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
    <div className="space-y-4">
      {/* Header with filters - Mobile optimized */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3">
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
            
            {/* Theme & Category filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Select 
                value={selectedThemeId || "all"} 
                onValueChange={(v) => {
                  setSelectedThemeId(v === "all" ? null : v);
                  setSelectedCategoryId(null);
                }}
              >
                <SelectTrigger className="h-9 text-sm flex-1">
                  <SelectValue placeholder="Todos os temas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os temas</SelectItem>
                  {themes?.map(theme => {
                    const config = getThemeConfig(theme.name);
                    const Icon = config.icon;
                    return (
                      <SelectItem key={theme.id} value={theme.id}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          <span>{theme.name}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              
              {selectedThemeId && (
                <Select 
                  value={selectedCategoryId || "all"} 
                  onValueChange={(v) => setSelectedCategoryId(v === "all" ? null : v)}
                >
                  <SelectTrigger className="h-9 text-sm flex-1">
                    <SelectValue placeholder="Todas as categorias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {themeCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {(selectedThemeId || searchTerm) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 px-3 gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Limpar</span>
                </Button>
              )}
            </div>
          </div>
          
          {/* Stats */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t text-sm text-muted-foreground">
            <span>{filteredLegislation.length} diplomas</span>
            {filteredLegislation.length >= 100 && (
              <span className="text-amber-600">(limitado a 100)</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Legislation list with requirements */}
      <ScrollArea className={isMobile ? "h-[calc(100vh-320px)]" : "h-[calc(100vh-400px)]"}>
        <div className="space-y-2 pr-2">
          {filteredLegislation.map(leg => {
            const isExpanded = expandedLegislation.has(leg.id);
            const requirements = requirementsMap?.[leg.id] || [];
            const hasRequirements = requirements.length > 0 || !isExpanded;
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
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      
                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <Badge 
                            variant="outline" 
                            className={`text-xs shrink-0 ${
                              leg.origin === "PT" 
                                ? "bg-green-500/10 text-green-700 border-green-300" 
                                : "bg-blue-500/10 text-blue-700 border-blue-300"
                            }`}
                          >
                            {leg.origin === "PT" ? (
                              <><Flag className="h-3 w-3 mr-1" />PT</>
                            ) : (
                              <><Globe className="h-3 w-3 mr-1" />UE</>
                            )}
                          </Badge>
                          
                          <span className="text-xs font-medium text-muted-foreground truncate">
                            {leg.number}
                          </span>
                          
                          {isRevoked && (
                            <Badge variant="destructive" className="text-xs">Revogado</Badge>
                          )}
                        </div>
                        
                        {/* Title */}
                        <h4 className="text-sm font-medium line-clamp-2">{leg.title}</h4>
                        
                        {/* Categories */}
                        {leg.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {leg.categories.slice(0, 3).map(cat => (
                              <Badge key={cat.id} variant="secondary" className="text-xs">
                                {cat.name}
                              </Badge>
                            ))}
                            {leg.categories.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{leg.categories.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Actions */}
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
                                <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
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
                      {/* Requirements header */}
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
                      
                      {/* Requirements list */}
                      {requirements.length > 0 ? (
                        <div className="space-y-2">
                          {requirements.slice(0, 10).map(req => (
                            <div 
                              key={req.id} 
                              className="flex items-start gap-2 p-2 rounded-md bg-background border text-sm"
                            >
                              <div className="flex-1 min-w-0">
                                {req.article && (
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {req.article}
                                  </span>
                                )}
                                <p className="text-sm line-clamp-2">{req.requirement_text}</p>
                              </div>
                            </div>
                          ))}
                          
                          {requirements.length > 10 && (
                            <p className="text-xs text-muted-foreground text-center py-2">
                              +{requirements.length - 10} requisitos (ver diálogo para todos)
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum requisito extraído. Clique em "Gerir" para adicionar.
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
          
          {filteredLegislation.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma legislação encontrada.</p>
              {(selectedThemeId || searchTerm) && (
                <Button variant="link" onClick={clearFilters} className="mt-2">
                  Limpar filtros
                </Button>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      
      {/* Requirements Dialog */}
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
