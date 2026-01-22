import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  Copy, 
  FileText, 
  FolderTree, 
  Tags,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
  Download,
  Leaf,
  Shield,
  Zap,
  Award,
  Heart,
  type LucideIcon
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { useLegislationWithCategories } from "@/hooks/useLegislation";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

interface Organization {
  id: string;
  name: string;
}

// Theme color configurations
const themeColors: Record<string, { bg: string; text: string; icon: LucideIcon }> = {
  "Ambiente": { bg: "bg-emerald-500/10", text: "text-emerald-700", icon: Leaf },
  "SST": { bg: "bg-orange-500/10", text: "text-orange-700", icon: Shield },
  "Segurança e Saúde no Trabalho": { bg: "bg-orange-500/10", text: "text-orange-700", icon: Shield },
  "Energia": { bg: "bg-yellow-500/10", text: "text-yellow-700", icon: Zap },
  "Qualidade": { bg: "bg-blue-500/10", text: "text-blue-700", icon: Award },
  "Segurança": { bg: "bg-red-500/10", text: "text-red-700", icon: Shield },
  "Conciliação Familiar e Profissional": { bg: "bg-pink-500/10", text: "text-pink-700", icon: Heart },
};

const getThemeConfig = (themeName: string) => {
  return themeColors[themeName] || { bg: "bg-primary/10", text: "text-primary", icon: Tags };
};

type ImportMode = "theme" | "category" | "legislation" | "from_client";

export function ClientLegislationImportPanel() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  const [sourceOrgId, setSourceOrgId] = useState<string>("");
  const [importMode, setImportMode] = useState<ImportMode>("theme");
  const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(new Set());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [selectedLegislationIds, setSelectedLegislationIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [includeApplicability, setIncludeApplicability] = useState(true);
  
  // Fetch organizations
  const { data: organizations, isLoading: orgsLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Organization[];
    },
  });
  
  // Fetch themes
  const { data: themes, isLoading: themesLoading } = useThemesWithCategories();
  
  // Fetch legislation
  const { data: legislation, isLoading: legislationLoading } = useLegislationWithCategories();
  
  // Fetch source org stats when in from_client mode
  const { data: sourceOrgStats } = useQuery({
    queryKey: ["source-org-stats", sourceOrgId],
    queryFn: async () => {
      if (!sourceOrgId) return null;
      
      const [themesRes, legislationRes, applicabilitiesRes] = await Promise.all([
        supabase.from("organization_themes").select("theme_id").eq("organization_id", sourceOrgId),
        supabase.from("organization_legislation").select("legislation_id, applicability_type").eq("organization_id", sourceOrgId),
        supabase.from("applicabilities").select("id", { count: "exact", head: true }).eq("organization_id", sourceOrgId),
      ]);
      
      return {
        themes: themesRes.data?.length || 0,
        legislation: legislationRes.data?.length || 0,
        applicabilities: applicabilitiesRes.count || 0,
        legislationIds: new Set(legislationRes.data?.map(l => l.legislation_id) || []),
        themeIds: new Set(themesRes.data?.map(t => t.theme_id) || []),
      };
    },
    enabled: !!sourceOrgId && importMode === "from_client",
  });

  // Target org current stats
  const { data: targetOrgStats } = useQuery({
    queryKey: ["target-org-stats", targetOrgId],
    queryFn: async () => {
      if (!targetOrgId) return null;
      
      const [themesRes, legislationRes] = await Promise.all([
        supabase.from("organization_themes").select("theme_id").eq("organization_id", targetOrgId),
        supabase.from("organization_legislation").select("legislation_id").eq("organization_id", targetOrgId),
      ]);
      
      return {
        existingThemeIds: new Set(themesRes.data?.map(t => t.theme_id) || []),
        existingLegislationIds: new Set(legislationRes.data?.map(l => l.legislation_id) || []),
      };
    },
    enabled: !!targetOrgId,
  });

  // Create a mapping from theme_id to theme_name for filtering
  const themeIdToName = useMemo(() => {
    const map = new Map<string, string>();
    themes?.forEach(theme => map.set(theme.id, theme.name));
    return map;
  }, [themes]);

  // Filtered legislation based on search and mode
  const filteredLegislation = useMemo(() => {
    if (!legislation) return [];
    
    let result = legislation;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(leg =>
        leg.title.toLowerCase().includes(term) ||
        leg.number.toLowerCase().includes(term)
      );
    }
    
    // If theme mode, filter by selected themes (using theme_name matching)
    if (importMode === "theme" && selectedThemeIds.size > 0) {
      const selectedThemeNames = new Set(
        Array.from(selectedThemeIds).map(id => themeIdToName.get(id)).filter(Boolean)
      );
      result = result.filter(leg =>
        leg.categories.some(cat => selectedThemeNames.has(cat.theme_name))
      );
    }
    
    // If category mode, filter by selected categories  
    if (importMode === "category" && selectedCategoryIds.size > 0) {
      result = result.filter(leg =>
        leg.categories.some(cat => selectedCategoryIds.has(cat.id))
      );
    }
    
    return result.slice(0, 200);
  }, [legislation, searchTerm, importMode, selectedThemeIds, selectedCategoryIds]);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!targetOrgId || !user) throw new Error("Selecione a organização de destino");
      
      const results = { themes: 0, legislation: 0, applicabilities: 0 };
      const existingLegislationIds = targetOrgStats?.existingLegislationIds || new Set();
      const existingThemeIds = targetOrgStats?.existingThemeIds || new Set();
      
      // Determine what to import based on mode
      let legislationToImport: string[] = [];
      let themesToImport: string[] = [];
      
      if (importMode === "from_client" && sourceOrgId) {
        // Import from another client
        const { data: sourceLegislation } = await supabase
          .from("organization_legislation")
          .select("legislation_id, applicability_type")
          .eq("organization_id", sourceOrgId);
        
        const { data: sourceThemes } = await supabase
          .from("organization_themes")
          .select("theme_id")
          .eq("organization_id", sourceOrgId);
        
        legislationToImport = sourceLegislation
          ?.filter(l => !existingLegislationIds.has(l.legislation_id))
          .map(l => l.legislation_id) || [];
        
        themesToImport = sourceThemes
          ?.filter(t => !existingThemeIds.has(t.theme_id))
          .map(t => t.theme_id) || [];
        
        // Import applicabilities if requested
        if (includeApplicability && legislationToImport.length > 0) {
          const { data: sourceApplicabilities } = await supabase
            .from("applicabilities")
            .select("*")
            .eq("organization_id", sourceOrgId);
          
          const { data: existingApplicabilities } = await supabase
            .from("applicabilities")
            .select("requirement_id")
            .eq("organization_id", targetOrgId);
          
          const existingReqIds = new Set(existingApplicabilities?.map(a => a.requirement_id) || []);
          const newApplicabilities = sourceApplicabilities
            ?.filter(a => !existingReqIds.has(a.requirement_id))
            .map(a => ({
              organization_id: targetOrgId,
              requirement_id: a.requirement_id,
              is_applicable: a.is_applicable,
              compliance_status: a.compliance_status,
              notes: a.notes,
              applicability_type: a.applicability_type,
            })) || [];
          
          if (newApplicabilities.length > 0) {
            await supabase.from("applicabilities").insert(newApplicabilities);
            results.applicabilities = newApplicabilities.length;
          }
        }
        
      } else if (importMode === "legislation") {
        // Import specific legislation
        legislationToImport = Array.from(selectedLegislationIds)
          .filter(id => !existingLegislationIds.has(id));
        
        // Get themes from selected legislation (using theme_name mapping)
        const selectedLegs = legislation?.filter(l => selectedLegislationIds.has(l.id)) || [];
        const themeNamesInSelected = new Set<string>();
        selectedLegs.forEach(leg => {
          leg.categories.forEach(cat => themeNamesInSelected.add(cat.theme_name));
        });
        // Convert theme names back to IDs
        themes?.forEach(theme => {
          if (themeNamesInSelected.has(theme.name) && !existingThemeIds.has(theme.id)) {
            themesToImport.push(theme.id);
          }
        });
        
      } else if (importMode === "theme") {
        // Import all legislation from selected themes
        themesToImport = Array.from(selectedThemeIds).filter(id => !existingThemeIds.has(id));
        
        // Filter legislation by selected theme names
        const selectedThemeNames = new Set(
          Array.from(selectedThemeIds).map(id => themeIdToName.get(id)).filter(Boolean)
        );
        const legsInThemes = legislation?.filter(leg =>
          leg.categories.some(cat => selectedThemeNames.has(cat.theme_name))
        ) || [];
        legislationToImport = legsInThemes
          .filter(l => !existingLegislationIds.has(l.id))
          .map(l => l.id);
        
      } else if (importMode === "category") {
        // Import all legislation from selected categories
        const categoryThemeMap = new Map<string, string>();
        themes?.forEach(theme => {
          theme.categories?.forEach(cat => {
            categoryThemeMap.set(cat.id, theme.id);
          });
        });
        
        const themeIds = new Set<string>();
        selectedCategoryIds.forEach(catId => {
          const themeId = categoryThemeMap.get(catId);
          if (themeId) themeIds.add(themeId);
        });
        themesToImport = Array.from(themeIds).filter(id => !existingThemeIds.has(id));
        
        const legsInCategories = legislation?.filter(leg =>
          leg.categories.some(cat => selectedCategoryIds.has(cat.id))
        ) || [];
        legislationToImport = legsInCategories
          .filter(l => !existingLegislationIds.has(l.id))
          .map(l => l.id);
      }
      
      // Insert themes
      if (themesToImport.length > 0) {
        await supabase.from("organization_themes").insert(
          themesToImport.map(theme_id => ({
            organization_id: targetOrgId,
            theme_id,
            assigned_by: user.id,
          }))
        );
        results.themes = themesToImport.length;
      }
      
      // Insert legislation
      if (legislationToImport.length > 0) {
        await supabase.from("organization_legislation").insert(
          legislationToImport.map(legislation_id => ({
            organization_id: targetOrgId,
            legislation_id,
            assigned_by: user.id,
          }))
        );
        results.legislation = legislationToImport.length;
      }
      
      return results;
    },
    onSuccess: (results) => {
      const total = results.themes + results.legislation + results.applicabilities;
      
      toast({
        title: "Importação concluída",
        description: `${results.themes} temas, ${results.legislation} diplomas${results.applicabilities ? `, ${results.applicabilities} conformidades` : ""} importados.`,
      });
      
      // Reset selections
      setSelectedThemeIds(new Set());
      setSelectedCategoryIds(new Set());
      setSelectedLegislationIds(new Set());
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["target-org-stats"] });
      queryClient.invalidateQueries({ queryKey: ["org-legislation-count"] });
    },
    onError: (error) => {
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const targetOrg = organizations?.find(o => o.id === targetOrgId);
  const sourceOrg = organizations?.find(o => o.id === sourceOrgId);
  
  // Calculate what will be imported
  const importPreview = useMemo(() => {
    if (!targetOrgStats) return { themes: 0, legislation: 0 };
    
    const existingLegislationIds = targetOrgStats.existingLegislationIds;
    const existingThemeIds = targetOrgStats.existingThemeIds;
    
    if (importMode === "legislation") {
      const newLegs = Array.from(selectedLegislationIds).filter(id => !existingLegislationIds.has(id));
      return { themes: 0, legislation: newLegs.length };
    }
    
    if (importMode === "theme") {
      const selectedThemeNames = new Set(
        Array.from(selectedThemeIds).map(id => themeIdToName.get(id)).filter(Boolean)
      );
      const legsInThemes = legislation?.filter(leg =>
        leg.categories.some(cat => selectedThemeNames.has(cat.theme_name))
      ) || [];
      const newLegs = legsInThemes.filter(l => !existingLegislationIds.has(l.id));
      const newThemes = Array.from(selectedThemeIds).filter(id => !existingThemeIds.has(id));
      return { themes: newThemes.length, legislation: newLegs.length };
    }
    
    if (importMode === "category") {
      const legsInCategories = legislation?.filter(leg =>
        leg.categories.some(cat => selectedCategoryIds.has(cat.id))
      ) || [];
      const newLegs = legsInCategories.filter(l => !existingLegislationIds.has(l.id));
      return { themes: 0, legislation: newLegs.length };
    }
    
    if (importMode === "from_client" && sourceOrgStats) {
      const newLegs = Array.from(sourceOrgStats.legislationIds).filter(id => !existingLegislationIds.has(id));
      const newThemes = Array.from(sourceOrgStats.themeIds).filter(id => !existingThemeIds.has(id));
      return { themes: newThemes.length, legislation: newLegs.length };
    }
    
    return { themes: 0, legislation: 0 };
  }, [targetOrgStats, importMode, selectedThemeIds, selectedCategoryIds, selectedLegislationIds, sourceOrgStats, legislation]);

  const isLoading = orgsLoading || themesLoading || legislationLoading;
  const canImport = targetOrgId && (
    (importMode === "theme" && selectedThemeIds.size > 0) ||
    (importMode === "category" && selectedCategoryIds.size > 0) ||
    (importMode === "legislation" && selectedLegislationIds.size > 0) ||
    (importMode === "from_client" && sourceOrgId)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Target Organization Selection */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4" />
                Organização de Destino
              </Label>
              <Select value={targetOrgId} onValueChange={setTargetOrgId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione a organização..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations?.map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {targetOrg && targetOrgStats && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                <span>Atual:</span>
                <Badge variant="secondary">{targetOrgStats.existingThemeIds.size} temas</Badge>
                <Badge variant="secondary">{targetOrgStats.existingLegislationIds.size} diplomas</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Import Mode Selection */}
      {targetOrgId && (
        <Card>
          <CardContent className="p-3 sm:p-4">
            <Label className="block mb-3 text-sm font-medium">Modo de Importação</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { value: "theme", label: "Por Tema", icon: FolderTree },
                { value: "category", label: "Por Categoria", icon: Tags },
                { value: "legislation", label: "Por Diploma", icon: FileText },
                { value: "from_client", label: "De Outro Cliente", icon: Copy },
              ].map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={importMode === value ? "default" : "outline"}
                  className="h-auto py-2 px-3 flex-col gap-1"
                  onClick={() => {
                    setImportMode(value as ImportMode);
                    setSelectedThemeIds(new Set());
                    setSelectedCategoryIds(new Set());
                    setSelectedLegislationIds(new Set());
                    setSourceOrgId("");
                  }}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mode-specific content */}
      {targetOrgId && importMode === "from_client" && (
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Organização de Origem</Label>
              <Select value={sourceOrgId} onValueChange={setSourceOrgId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione a origem..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations?.filter(o => o.id !== targetOrgId).map(org => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {sourceOrgStats && (
              <div className="bg-muted/50 rounded-md p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {sourceOrg?.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{sourceOrgStats.themes} temas</Badge>
                  <Badge variant="secondary">{sourceOrgStats.legislation} diplomas</Badge>
                  <Badge variant="secondary">{sourceOrgStats.applicabilities} conformidades</Badge>
                </div>
              </div>
            )}
            
            {sourceOrgId && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="includeApplicability"
                  checked={includeApplicability}
                  onCheckedChange={(c) => setIncludeApplicability(!!c)}
                />
                <Label htmlFor="includeApplicability" className="text-sm cursor-pointer">
                  Incluir estados de conformidade
                </Label>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {targetOrgId && importMode === "theme" && (
        <Card>
          <CardContent className="p-3 sm:p-4">
            <Label className="block mb-3 text-sm">Selecione os Temas</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {themes?.map(theme => {
                const config = getThemeConfig(theme.name);
                const Icon = config.icon;
                const isSelected = selectedThemeIds.has(theme.id);
                const legCount = legislation?.filter(l => 
                  l.categories.some(c => c.theme_name === theme.name)
                ).length || 0;
                
                return (
                  <div
                    key={theme.id}
                    onClick={() => {
                      const next = new Set(selectedThemeIds);
                      if (isSelected) next.delete(theme.id);
                      else next.add(theme.id);
                      setSelectedThemeIds(next);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected 
                        ? "border-primary bg-primary/5 ring-1 ring-primary" 
                        : "hover:border-primary/50"
                    }`}
                  >
                    <Checkbox checked={isSelected} className="pointer-events-none" />
                    <Icon className={`h-5 w-5 ${config.text}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{theme.name}</p>
                      <p className="text-xs text-muted-foreground">{legCount} diplomas</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {targetOrgId && importMode === "category" && (
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-3">
            <Label className="block text-sm">Selecione as Categorias</Label>
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {themes?.map(theme => {
                  const config = getThemeConfig(theme.name);
                  const Icon = config.icon;
                  
                  return (
                    <div key={theme.id} className="space-y-1">
                      <div className={`flex items-center gap-2 px-2 py-1 rounded ${config.bg}`}>
                        <Icon className={`h-4 w-4 ${config.text}`} />
                        <span className={`text-sm font-medium ${config.text}`}>{theme.name}</span>
                      </div>
                      <div className="pl-4 space-y-1">
                        {theme.categories?.slice(0, 20).map(cat => {
                          const isSelected = selectedCategoryIds.has(cat.id);
                          const legCount = legislation?.filter(l =>
                            l.categories.some(c => c.id === cat.id)
                          ).length || 0;
                          
                          return (
                            <div
                              key={cat.id}
                              onClick={() => {
                                const next = new Set(selectedCategoryIds);
                                if (isSelected) next.delete(cat.id);
                                else next.add(cat.id);
                                setSelectedCategoryIds(next);
                              }}
                              className={`flex items-center gap-2 p-2 rounded text-sm cursor-pointer transition-all ${
                                isSelected 
                                  ? "bg-primary/10 border border-primary" 
                                  : "hover:bg-muted/50"
                              }`}
                            >
                              <Checkbox checked={isSelected} className="pointer-events-none" />
                              <span className="flex-1 truncate">{cat.name}</span>
                              <Badge variant="secondary" className="text-xs">{legCount}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {targetOrgId && importMode === "legislation" && (
        <Card>
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar diplomas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedLegislationIds.size} selecionados
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedLegislationIds(new Set(filteredLegislation.map(l => l.id)))}
                  className="h-7 text-xs"
                >
                  Selecionar Todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedLegislationIds(new Set())}
                  className="h-7 text-xs"
                >
                  Limpar
                </Button>
              </div>
            </div>
            
            <ScrollArea className="h-64">
              <div className="space-y-1">
                {filteredLegislation.map(leg => {
                  const isSelected = selectedLegislationIds.has(leg.id);
                  const alreadyExists = targetOrgStats?.existingLegislationIds.has(leg.id);
                  
                  return (
                    <div
                      key={leg.id}
                      onClick={() => {
                        if (alreadyExists) return;
                        const next = new Set(selectedLegislationIds);
                        if (isSelected) next.delete(leg.id);
                        else next.add(leg.id);
                        setSelectedLegislationIds(next);
                      }}
                      className={`flex items-center gap-2 p-2 rounded text-sm transition-all ${
                        alreadyExists 
                          ? "opacity-50 cursor-not-allowed" 
                          : isSelected 
                            ? "bg-primary/10 border border-primary cursor-pointer" 
                            : "hover:bg-muted/50 cursor-pointer"
                      }`}
                    >
                      <Checkbox 
                        checked={isSelected || alreadyExists} 
                        disabled={alreadyExists}
                        className="pointer-events-none" 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{leg.number}</p>
                        <p className="truncate text-xs text-muted-foreground">{leg.title}</p>
                      </div>
                      {alreadyExists && (
                        <Badge variant="secondary" className="text-xs shrink-0">Já existe</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Import Preview & Action */}
      {canImport && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">Pronto para importar</p>
                  <p className="text-xs text-muted-foreground">
                    {importPreview.themes > 0 && `${importPreview.themes} temas, `}
                    {importPreview.legislation} diplomas novos para {targetOrg?.name}
                  </p>
                </div>
              </div>
              
              <Button 
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
                className="w-full sm:w-auto gap-2"
              >
                {importMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Importar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
