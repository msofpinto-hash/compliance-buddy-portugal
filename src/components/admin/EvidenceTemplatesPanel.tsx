import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Upload, 
  Search, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  Building2,
  FileText,
  Loader2,
  ChevronDown,
  ChevronRight,
  Leaf,
  Shield,
  Zap,
  TreePine,
  Heart,
  Users,
  Globe,
  Utensils,
  Award
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface EvidenceTemplate {
  id: string;
  group_name: string;
  title: string;
  description: string | null;
  area_ambiente: boolean | null;
  area_qualidade: boolean | null;
  area_seguranca: boolean | null;
  area_seguranca_alimentar: boolean | null;
  area_energia: boolean | null;
  area_florestas: boolean | null;
  area_saude: boolean | null;
  area_conciliacao: boolean | null;
  area_sustentabilidade: boolean | null;
  legislation_references: string | null;
  created_at: string;
}

const AREA_CONFIG = {
  area_ambiente: { label: "Ambiente", icon: Leaf, color: "bg-green-100 text-green-800" },
  area_qualidade: { label: "Qualidade", icon: Award, color: "bg-blue-100 text-blue-800" },
  area_seguranca: { label: "Segurança", icon: Shield, color: "bg-orange-100 text-orange-800" },
  area_seguranca_alimentar: { label: "Seg. Alimentar", icon: Utensils, color: "bg-amber-100 text-amber-800" },
  area_energia: { label: "Energia", icon: Zap, color: "bg-yellow-100 text-yellow-800" },
  area_florestas: { label: "Florestas", icon: TreePine, color: "bg-emerald-100 text-emerald-800" },
  area_saude: { label: "Saúde", icon: Heart, color: "bg-red-100 text-red-800" },
  area_conciliacao: { label: "Conciliação", icon: Users, color: "bg-purple-100 text-purple-800" },
  area_sustentabilidade: { label: "Sustentabilidade", icon: Globe, color: "bg-teal-100 text-teal-800" },
};

export function EvidenceTemplatesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // Fetch evidence templates
  const { data: templates, isLoading: loadingTemplates } = useQuery({
    queryKey: ["evidence-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence_templates")
        .select("*")
        .order("group_name", { ascending: true });
      if (error) throw error;
      return data as EvidenceTemplate[];
    },
  });

  // Fetch organizations
  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing requests count per organization
  const { data: requestCounts } = useQuery({
    queryKey: ["evidence-request-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_evidence_requests")
        .select("organization_id");
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(req => {
        counts[req.organization_id] = (counts[req.organization_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Mutation to assign templates to organization
  const assignMutation = useMutation({
    mutationFn: async ({ orgId, templateIds }: { orgId: string; templateIds: string[] }) => {
      const inserts = templateIds.map(templateId => ({
        organization_id: orgId,
        template_id: templateId,
        status: "pending",
      }));

      const { error } = await supabase
        .from("organization_evidence_requests")
        .upsert(inserts, { onConflict: "organization_id,template_id", ignoreDuplicates: true });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Pedidos atribuídos", description: `${selectedTemplates.length} templates atribuídos com sucesso.` });
      queryClient.invalidateQueries({ queryKey: ["evidence-request-counts"] });
      setAssignDialogOpen(false);
      setSelectedTemplates([]);
      setSelectedOrgId("");
    },
    onError: (error) => {
      console.error("Error assigning templates:", error);
      toast({ title: "Erro", description: "Não foi possível atribuir os templates", variant: "destructive" });
    },
  });

  // Filter templates
  const filteredTemplates = templates?.filter(t => {
    const matchesSearch = !searchTerm || 
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.group_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesArea = !selectedArea || t[selectedArea as keyof EvidenceTemplate] === true;
    
    return matchesSearch && matchesArea;
  });

  // Group templates by group_name
  const groupedTemplates = filteredTemplates?.reduce((acc, template) => {
    if (!acc[template.group_name]) {
      acc[template.group_name] = [];
    }
    acc[template.group_name].push(template);
    return acc;
  }, {} as Record<string, EvidenceTemplate[]>);

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleSelectAll = (groupName: string) => {
    const groupTemplateIds = groupedTemplates?.[groupName]?.map(t => t.id) || [];
    const allSelected = groupTemplateIds.every(id => selectedTemplates.includes(id));
    
    if (allSelected) {
      setSelectedTemplates(prev => prev.filter(id => !groupTemplateIds.includes(id)));
    } else {
      setSelectedTemplates(prev => [...new Set([...prev, ...groupTemplateIds])]);
    }
  };

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplates(prev => 
      prev.includes(templateId) 
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    );
  };

  const getTemplateAreas = (template: EvidenceTemplate) => {
    return Object.entries(AREA_CONFIG)
      .filter(([key]) => template[key as keyof EvidenceTemplate] === true)
      .map(([key, config]) => ({ key, ...config }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Catálogo de Evidências</h2>
          <p className="text-muted-foreground">
            {templates?.length || 0} templates de evidência documental
          </p>
        </div>
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={selectedTemplates.length === 0}>
              <Building2 className="mr-2 h-4 w-4" />
              Atribuir a Organização ({selectedTemplates.length})
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atribuir Templates</DialogTitle>
              <DialogDescription>
                Selecione a organização para atribuir os {selectedTemplates.length} templates selecionados.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label>Organização</Label>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar organização..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations?.map(org => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                      {requestCounts?.[org.id] && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({requestCounts[org.id]} pedidos)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => assignMutation.mutate({ orgId: selectedOrgId, templateIds: selectedTemplates })}
                disabled={!selectedOrgId || assignMutation.isPending}
              >
                {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Atribuir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedArea || ""} onValueChange={(v) => setSelectedArea(v || null)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por área" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as áreas</SelectItem>
                {Object.entries(AREA_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <config.icon className="h-4 w-4" />
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplates.length > 0 && (
              <Button variant="outline" onClick={() => setSelectedTemplates([])}>
                Limpar seleção
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Templates List */}
      {loadingTemplates ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-2">
            {Object.entries(groupedTemplates || {}).map(([groupName, groupTemplates]) => {
              const isExpanded = expandedGroups.has(groupName);
              const groupTemplateIds = groupTemplates.map(t => t.id);
              const selectedCount = groupTemplateIds.filter(id => selectedTemplates.includes(id)).length;
              const allSelected = selectedCount === groupTemplates.length;
              const someSelected = selectedCount > 0 && selectedCount < groupTemplates.length;

              return (
                <Collapsible 
                  key={groupName} 
                  open={isExpanded} 
                  onOpenChange={() => toggleGroup(groupName)}
                >
                  <Card>
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={() => toggleSelectAll(groupName)}
                          className={someSelected ? "opacity-50" : ""}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <CollapsibleTrigger asChild>
                          <button className="flex-1 flex items-center gap-2 text-left hover:bg-accent/50 -m-2 p-2 rounded-lg transition-colors">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <div className="flex-1">
                              <h3 className="font-medium">{groupName}</h3>
                              <p className="text-sm text-muted-foreground">
                                {groupTemplates.length} pedidos de evidência
                                {selectedCount > 0 && ` • ${selectedCount} selecionados`}
                              </p>
                            </div>
                          </button>
                        </CollapsibleTrigger>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent className="pt-0 px-4 pb-4">
                        <div className="space-y-3 border-t pt-4">
                          {groupTemplates.map(template => {
                            const areas = getTemplateAreas(template);
                            return (
                              <div 
                                key={template.id}
                                className={`p-3 rounded-lg border transition-colors ${
                                  selectedTemplates.includes(template.id)
                                    ? "bg-primary/5 border-primary/30"
                                    : "hover:bg-accent/50"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={selectedTemplates.includes(template.id)}
                                    onCheckedChange={() => toggleTemplate(template.id)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{template.title}</p>
                                    {template.description && (
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                        {template.description}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {areas.map(area => (
                                        <Badge 
                                          key={area.key} 
                                          variant="secondary" 
                                          className={`text-xs ${area.color}`}
                                        >
                                          <area.icon className="h-3 w-3 mr-1" />
                                          {area.label}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {filteredTemplates?.length === 0 && !loadingTemplates && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium">Nenhum template encontrado</h3>
            <p className="text-sm text-muted-foreground">
              Ajuste os filtros de pesquisa ou importe novos templates.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
