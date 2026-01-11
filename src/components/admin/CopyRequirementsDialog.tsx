import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, Copy, Building2, FileText, AlertTriangle, CheckCircle2, 
  Search, Filter, CheckCheck, X, FolderTree 
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Organization {
  id: string;
  name: string;
}

interface CopyRequirementsDialogProps {
  sourceOrganization: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RequirementWithLegislation {
  id: string;
  article: string | null;
  requirement_text: string;
  legislation_id: string;
  legislation: {
    id: string;
    number: string;
    title: string;
  };
  applicability?: {
    id: string;
    compliance_status: string | null;
    is_applicable: boolean;
    notes: string | null;
    applicability_type: string | null;
  };
}

interface ThemeWithCategories {
  id: string;
  name: string;
  categories: Array<{
    id: string;
    name: string;
    full_path: string;
  }>;
}

export function CopyRequirementsDialog({
  sourceOrganization,
  open,
  onOpenChange,
}: CopyRequirementsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTheme, setFilterTheme] = useState<string>("all");
  const [filterLegislation, setFilterLegislation] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [copyResult, setCopyResult] = useState<number | null>(null);

  // Fetch all organizations
  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch source organization's themes
  const { data: orgThemes } = useQuery({
    queryKey: ["org-themes-for-copy", sourceOrganization?.id],
    queryFn: async () => {
      if (!sourceOrganization) return [];
      const { data, error } = await supabase
        .from("organization_themes")
        .select(`
          theme_id,
          themes(id, name)
        `)
        .eq("organization_id", sourceOrganization.id);
      if (error) throw error;
      return data.map(ot => (ot.themes as any));
    },
    enabled: !!sourceOrganization && open,
  });

  // Fetch source organization's legislation
  const { data: orgLegislation } = useQuery({
    queryKey: ["org-legislation-for-copy", sourceOrganization?.id],
    queryFn: async () => {
      if (!sourceOrganization) return [];
      const { data, error } = await supabase
        .from("organization_legislation")
        .select(`
          legislation_id,
          legislation(id, number, title)
        `)
        .eq("organization_id", sourceOrganization.id);
      if (error) throw error;
      return data;
    },
    enabled: !!sourceOrganization && open,
  });

  // Fetch legislation-category mappings for theme filtering
  const { data: legislationCategories } = useQuery({
    queryKey: ["legislation-categories-mapping"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select(`
          legislation_id,
          category_id,
          theme_categories(id, name, theme_id)
        `);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch requirements with applicabilities for source organization
  const { data: requirements, isLoading: loadingRequirements } = useQuery({
    queryKey: ["org-requirements-for-copy", sourceOrganization?.id],
    queryFn: async () => {
      if (!sourceOrganization || !orgLegislation?.length) return [];
      
      const legislationIds = orgLegislation.map(ol => ol.legislation_id);
      
      // Get requirements
      const { data: reqs, error: reqError } = await supabase
        .from("legal_requirements")
        .select(`
          id,
          article,
          requirement_text,
          legislation_id,
          legislation(id, number, title)
        `)
        .in("legislation_id", legislationIds)
        .order("legislation_id")
        .order("article");
      
      if (reqError) throw reqError;

      // Get applicabilities
      const { data: apps, error: appError } = await supabase
        .from("applicabilities")
        .select("*")
        .eq("organization_id", sourceOrganization.id);
      
      if (appError) throw appError;

      // Combine
      const appMap = new Map(apps?.map(a => [a.requirement_id, a]) || []);
      
      return (reqs as any[]).map(req => ({
        ...req,
        applicability: appMap.get(req.id),
      })) as RequirementWithLegislation[];
    },
    enabled: !!sourceOrganization && !!orgLegislation?.length && open,
  });

  // Build legislation-to-theme mapping
  const legislationThemeMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    legislationCategories?.forEach(lc => {
      const themeId = (lc.theme_categories as any)?.theme_id;
      if (themeId) {
        if (!map.has(lc.legislation_id)) {
          map.set(lc.legislation_id, new Set());
        }
        map.get(lc.legislation_id)!.add(themeId);
      }
    });
    return map;
  }, [legislationCategories]);

  // Filter requirements
  const filteredRequirements = useMemo(() => {
    if (!requirements) return [];
    
    return requirements.filter(req => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          req.requirement_text.toLowerCase().includes(search) ||
          req.article?.toLowerCase().includes(search) ||
          req.legislation.number.toLowerCase().includes(search) ||
          req.legislation.title.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      // Theme filter
      if (filterTheme !== "all") {
        const themeIds = legislationThemeMap.get(req.legislation_id);
        if (!themeIds?.has(filterTheme)) return false;
      }

      // Legislation filter
      if (filterLegislation !== "all" && req.legislation_id !== filterLegislation) {
        return false;
      }

      // Status filter
      if (filterStatus !== "all") {
        const status = req.applicability?.compliance_status;
        if (filterStatus === "pending" && status) return false;
        if (filterStatus === "conforme" && status !== "conforme") return false;
        if (filterStatus === "nao_conforme" && status !== "nao_conforme") return false;
        if (filterStatus === "em_curso" && status !== "em_curso") return false;
      }

      return true;
    });
  }, [requirements, searchTerm, filterTheme, filterLegislation, filterStatus, legislationThemeMap]);

  // Group by legislation
  const groupedRequirements = useMemo(() => {
    const groups = new Map<string, { legislation: any; requirements: RequirementWithLegislation[] }>();
    
    filteredRequirements.forEach(req => {
      if (!groups.has(req.legislation_id)) {
        groups.set(req.legislation_id, {
          legislation: req.legislation,
          requirements: [],
        });
      }
      groups.get(req.legislation_id)!.requirements.push(req);
    });

    return Array.from(groups.values());
  }, [filteredRequirements]);

  // Selection helpers
  const toggleRequirement = (id: string) => {
    const newSet = new Set(selectedRequirements);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedRequirements(newSet);
  };

  const selectAllVisible = () => {
    const ids = filteredRequirements.map(r => r.id);
    setSelectedRequirements(new Set(ids));
  };

  const clearSelection = () => {
    setSelectedRequirements(new Set());
  };

  const selectByLegislation = (legislationId: string) => {
    const ids = filteredRequirements
      .filter(r => r.legislation_id === legislationId)
      .map(r => r.id);
    setSelectedRequirements(prev => {
      const newSet = new Set(prev);
      ids.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  const allVisibleSelected = filteredRequirements.length > 0 && 
    filteredRequirements.every(r => selectedRequirements.has(r.id));

  // Copy mutation
  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!sourceOrganization || !targetOrgId || selectedRequirements.size === 0) {
        throw new Error("Selecione requisitos e organização de destino");
      }

      // Get selected requirements with their applicabilities
      const selectedReqs = requirements?.filter(r => selectedRequirements.has(r.id)) || [];
      
      // Get legislation IDs that need to be assigned
      const legislationIds = [...new Set(selectedReqs.map(r => r.legislation_id))];

      // Ensure legislation is assigned to target org
      const { data: existingLeg } = await supabase
        .from("organization_legislation")
        .select("legislation_id")
        .eq("organization_id", targetOrgId)
        .in("legislation_id", legislationIds);

      const existingLegIds = new Set(existingLeg?.map(l => l.legislation_id) || []);
      const newLegIds = legislationIds.filter(id => !existingLegIds.has(id));

      if (newLegIds.length > 0) {
        const { error: legError } = await supabase
          .from("organization_legislation")
          .insert(newLegIds.map(id => ({
            organization_id: targetOrgId,
            legislation_id: id,
          })));
        if (legError) throw legError;
      }

      // Get existing applicabilities for target org
      const { data: existingApps } = await supabase
        .from("applicabilities")
        .select("requirement_id")
        .eq("organization_id", targetOrgId);

      const existingAppReqIds = new Set(existingApps?.map(a => a.requirement_id) || []);

      // Filter to only new applicabilities
      const appsToCreate = selectedReqs
        .filter(r => r.applicability && !existingAppReqIds.has(r.id))
        .map(r => ({
          organization_id: targetOrgId,
          requirement_id: r.id,
          is_applicable: r.applicability!.is_applicable,
          compliance_status: r.applicability!.compliance_status,
          notes: r.applicability!.notes,
          applicability_type: r.applicability!.applicability_type,
        }));

      if (appsToCreate.length > 0) {
        const { error: appError } = await supabase
          .from("applicabilities")
          .insert(appsToCreate);
        if (appError) throw appError;
      }

      return appsToCreate.length;
    },
    onSuccess: (count) => {
      setCopyResult(count);
      queryClient.invalidateQueries({ queryKey: ["org-applicabilities"] });
      queryClient.invalidateQueries({ queryKey: ["org-legislation-count"] });
      
      toast({
        title: "Requisitos copiados",
        description: `${count} conformidades copiadas para a organização de destino`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao copiar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const handleCopy = () => {
    setCopyResult(null);
    copyMutation.mutate();
  };

  const handleClose = () => {
    setTargetOrgId("");
    setSelectedRequirements(new Set());
    setSearchTerm("");
    setFilterTheme("all");
    setFilterLegislation("all");
    setFilterStatus("all");
    setCopyResult(null);
    onOpenChange(false);
  };

  const availableTargets = organizations?.filter(org => org.id !== sourceOrganization?.id) || [];

  const getStatusBadge = (status: string | null | undefined) => {
    switch (status) {
      case "conforme":
        return <Badge className="bg-green-600 text-xs">Conforme</Badge>;
      case "nao_conforme":
        return <Badge className="bg-red-600 text-xs">Não Conforme</Badge>;
      case "em_curso":
        return <Badge className="bg-yellow-600 text-xs">Em Avaliação</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Pendente</Badge>;
    }
  };

  // Stats
  const stats = {
    total: requirements?.length || 0,
    filtered: filteredRequirements.length,
    selected: selectedRequirements.size,
    withStatus: requirements?.filter(r => r.applicability?.compliance_status).length || 0,
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copiar Requisitos Específicos
          </DialogTitle>
          <DialogDescription>
            Selecione requisitos de "{sourceOrganization?.name}" para copiar para outra organização.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Target Selection */}
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label>Organização de Destino</Label>
              <Select value={targetOrgId} onValueChange={setTargetOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a organização de destino" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map(org => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Stats */}
            <div className="flex gap-2 items-end">
              <Badge variant="outline">{stats.total} total</Badge>
              <Badge variant="outline">{stats.filtered} filtrados</Badge>
              <Badge className="bg-primary">{stats.selected} selecionados</Badge>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar requisitos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <Select value={filterTheme} onValueChange={setFilterTheme}>
              <SelectTrigger className="w-[180px]">
                <FolderTree className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Tema" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Temas</SelectItem>
                {orgThemes?.map(theme => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterLegislation} onValueChange={setFilterLegislation}>
              <SelectTrigger className="w-[200px]">
                <FileText className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Diploma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Diplomas</SelectItem>
                {orgLegislation?.map(ol => (
                  <SelectItem key={ol.legislation_id} value={ol.legislation_id}>
                    {(ol.legislation as any)?.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tabs value={filterStatus} onValueChange={setFilterStatus}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">Todos</TabsTrigger>
                <TabsTrigger value="conforme" className="text-xs">Conforme</TabsTrigger>
                <TabsTrigger value="nao_conforme" className="text-xs">Não Conf.</TabsTrigger>
                <TabsTrigger value="em_curso" className="text-xs">Em Aval.</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Selection Actions */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={(checked) => checked ? selectAllVisible() : clearSelection()}
            />
            <span className="text-sm">
              {selectedRequirements.size > 0 
                ? `${selectedRequirements.size} selecionados` 
                : "Selecionar todos visíveis"}
            </span>
            {selectedRequirements.size > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection} className="gap-1 ml-2">
                <X className="h-3 w-3" />
                Limpar
              </Button>
            )}
          </div>

          {/* Requirements List */}
          <ScrollArea className="flex-1 border rounded-lg">
            <div className="p-4 space-y-4">
              {loadingRequirements ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : groupedRequirements.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum requisito encontrado</p>
                  {(filterTheme !== "all" || filterLegislation !== "all" || filterStatus !== "all" || searchTerm) && (
                    <Button 
                      variant="link" 
                      onClick={() => {
                        setFilterTheme("all");
                        setFilterLegislation("all");
                        setFilterStatus("all");
                        setSearchTerm("");
                      }}
                    >
                      Limpar filtros
                    </Button>
                  )}
                </div>
              ) : (
                groupedRequirements.map(group => (
                  <Card key={group.legislation.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{group.legislation.number}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {group.legislation.title}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => selectByLegislation(group.legislation.id)}
                          className="gap-1 text-xs"
                        >
                          <CheckCheck className="h-3 w-3" />
                          Selecionar todos ({group.requirements.length})
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {group.requirements.map(req => (
                          <div
                            key={req.id}
                            className={`flex items-start gap-3 p-2 rounded border cursor-pointer transition-colors ${
                              selectedRequirements.has(req.id) 
                                ? "bg-primary/10 border-primary" 
                                : "hover:bg-muted/50"
                            }`}
                            onClick={() => toggleRequirement(req.id)}
                          >
                            <Checkbox
                              checked={selectedRequirements.has(req.id)}
                              onCheckedChange={() => toggleRequirement(req.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {req.article && (
                                  <Badge variant="outline" className="text-xs">
                                    {req.article}
                                  </Badge>
                                )}
                                {getStatusBadge(req.applicability?.compliance_status)}
                              </div>
                              <p className="text-sm line-clamp-2">{req.requirement_text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p>Os diplomas serão automaticamente atribuídos à organização de destino se ainda não estiverem.</p>
              <p>Requisitos sem estado de conformidade definido não serão copiados.</p>
            </div>
          </div>

          {/* Result */}
          {copyResult !== null && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="py-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">
                    {copyResult} conformidades copiadas com sucesso!
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {copyResult !== null ? "Fechar" : "Cancelar"}
          </Button>
          {copyResult === null && (
            <Button
              onClick={handleCopy}
              disabled={!targetOrgId || selectedRequirements.size === 0 || copyMutation.isPending}
            >
              {copyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Copiar {selectedRequirements.size} Requisito(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
