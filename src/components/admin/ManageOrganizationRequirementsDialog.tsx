import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, AlertTriangle, Clock, FileText, Building2, Scale, Filter } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Organization {
  id: string;
  name: string;
}

interface ManageOrganizationRequirementsDialogProps {
  organization: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LegalRequirement {
  id: string;
  legislation_id: string;
  article: string | null;
  requirement_text: string;
  notes: string | null;
  legislation?: {
    id: string;
    number: string;
    title: string;
  };
}

interface Applicability {
  id: string;
  organization_id: string;
  requirement_id: string;
  is_applicable: boolean;
  compliance_status: string | null;
  notes: string | null;
}

const COMPLIANCE_OPTIONS = [
  { value: "conforme", label: "Conforme", color: "success", icon: CheckCircle2 },
  { value: "nao_conforme", label: "Não Conforme", color: "destructive", icon: AlertTriangle },
  { value: "em_curso", label: "Em Avaliação", color: "warning", icon: Clock },
];

export function ManageOrganizationRequirementsDialog({
  organization,
  open,
  onOpenChange,
}: ManageOrganizationRequirementsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedLegislationId, setSelectedLegislationId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch organization's assigned legislation
  const { data: orgLegislation } = useQuery({
    queryKey: ["org-legislation-list", organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      const { data, error } = await supabase
        .from("organization_legislation")
        .select(`
          legislation_id,
          legislation(id, number, title)
        `)
        .eq("organization_id", organization.id);
      if (error) throw error;
      return data;
    },
    enabled: !!organization && open,
  });

  // Fetch all requirements for the organization's assigned legislation
  const { data: requirements, isLoading: loadingRequirements } = useQuery({
    queryKey: ["org-requirements", organization?.id],
    queryFn: async () => {
      if (!organization || !orgLegislation?.length) return [];
      
      const legislationIds = orgLegislation.map(ol => ol.legislation_id);
      
      const { data, error } = await supabase
        .from("legal_requirements")
        .select(`
          id,
          legislation_id,
          article,
          requirement_text,
          notes,
          legislation(id, number, title)
        `)
        .in("legislation_id", legislationIds)
        .order("legislation_id")
        .order("article");
      
      if (error) throw error;
      return data as LegalRequirement[];
    },
    enabled: !!organization && !!orgLegislation?.length && open,
  });

  // Fetch existing applicabilities
  const { data: applicabilities, isLoading: loadingApplicabilities } = useQuery({
    queryKey: ["org-applicabilities-full", organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      const { data, error } = await supabase
        .from("applicabilities")
        .select("*")
        .eq("organization_id", organization.id);
      if (error) throw error;
      return data as Applicability[];
    },
    enabled: !!organization && open,
  });

  // Create/update applicability mutation
  const updateApplicabilityMutation = useMutation({
    mutationFn: async ({
      requirementId,
      isApplicable,
      complianceStatus,
      notes,
    }: {
      requirementId: string;
      isApplicable: boolean;
      complianceStatus: string;
      notes?: string;
    }) => {
      if (!organization) throw new Error("No organization selected");

      const existing = applicabilities?.find(a => a.requirement_id === requirementId);

      if (existing) {
        const { error } = await supabase
          .from("applicabilities")
          .update({
            is_applicable: isApplicable,
            compliance_status: complianceStatus,
            notes: notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("applicabilities").insert({
          organization_id: organization.id,
          requirement_id: requirementId,
          is_applicable: isApplicable,
          compliance_status: complianceStatus,
          notes: notes || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-applicabilities-full", organization?.id] });
      queryClient.invalidateQueries({ queryKey: ["org-applicabilities"] });
      toast({ title: "Conformidade atualizada" });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar",
        variant: "destructive",
      });
    },
  });

  // Get applicability for a requirement
  const getApplicability = (requirementId: string) => {
    return applicabilities?.find(a => a.requirement_id === requirementId);
  };

  // Filter requirements
  const filteredRequirements = requirements?.filter(req => {
    if (selectedLegislationId !== "all" && req.legislation_id !== selectedLegislationId) {
      return false;
    }
    if (statusFilter !== "all") {
      const app = getApplicability(req.id);
      if (statusFilter === "pending" && app) return false;
      if (statusFilter === "conforme" && app?.compliance_status !== "conforme") return false;
      if (statusFilter === "nao_conforme" && app?.compliance_status !== "nao_conforme") return false;
      if (statusFilter === "em_curso" && app?.compliance_status !== "em_curso") return false;
    }
    return true;
  });

  // Group requirements by legislation
  const groupedRequirements = filteredRequirements?.reduce((acc, req) => {
    const legId = req.legislation_id;
    if (!acc[legId]) {
      acc[legId] = {
        legislation: req.legislation,
        requirements: [],
      };
    }
    acc[legId].requirements.push(req);
    return acc;
  }, {} as Record<string, { legislation: any; requirements: LegalRequirement[] }>);

  // Calculate stats
  const stats = {
    total: requirements?.length || 0,
    pending: requirements?.filter(r => !getApplicability(r.id)).length || 0,
    conforme: requirements?.filter(r => getApplicability(r.id)?.compliance_status === "conforme").length || 0,
    naoConforme: requirements?.filter(r => getApplicability(r.id)?.compliance_status === "nao_conforme").length || 0,
    emCurso: requirements?.filter(r => getApplicability(r.id)?.compliance_status === "em_curso").length || 0,
  };

  const isLoading = loadingRequirements || loadingApplicabilities;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Gestão de Requisitos
          </DialogTitle>
          <DialogDescription>
            {organization?.name} - Defina a conformidade para cada requisito legal
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-2xl font-bold text-muted-foreground">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pendente</div>
          </Card>
          <Card className="p-3 text-center bg-green-500/10">
            <div className="text-2xl font-bold text-green-600">{stats.conforme}</div>
            <div className="text-xs text-muted-foreground">Conforme</div>
          </Card>
          <Card className="p-3 text-center bg-yellow-500/10">
            <div className="text-2xl font-bold text-yellow-600">{stats.emCurso}</div>
            <div className="text-xs text-muted-foreground">Em Avaliação</div>
          </Card>
          <Card className="p-3 text-center bg-red-500/10">
            <div className="text-2xl font-bold text-red-600">{stats.naoConforme}</div>
            <div className="text-xs text-muted-foreground">Não Conforme</div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <Select value={selectedLegislationId} onValueChange={setSelectedLegislationId}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por diploma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Diplomas</SelectItem>
                {orgLegislation?.map(ol => (
                  <SelectItem key={ol.legislation_id} value={ol.legislation_id}>
                    {(ol.legislation as any)?.number} - {(ol.legislation as any)?.title?.substring(0, 50)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="pending">Pendente</TabsTrigger>
                <TabsTrigger value="conforme">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Conforme
                </TabsTrigger>
                <TabsTrigger value="nao_conforme">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Não Conf.
                </TabsTrigger>
                <TabsTrigger value="em_curso">
                  <Clock className="h-3 w-3 mr-1" />
                  Em Aval.
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Requirements List */}
        <div className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !requirements?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum requisito disponível</p>
              <p className="text-sm">Atribua diplomas à organização e defina os requisitos legais</p>
            </div>
          ) : !filteredRequirements?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum requisito encontrado com os filtros selecionados</p>
              <Button variant="link" onClick={() => { setStatusFilter("all"); setSelectedLegislationId("all"); }}>
                Limpar filtros
              </Button>
            </div>
          ) : (
            Object.entries(groupedRequirements || {}).map(([legId, group]) => (
              <div key={legId} className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">{group.legislation?.number}</Badge>
                  <span className="text-sm font-medium truncate">{group.legislation?.title}</span>
                </div>

                <div className="space-y-3 pl-2">
                  {group.requirements.map(req => {
                    const app = getApplicability(req.id);
                    const currentStatus = app?.compliance_status || "pending";

                    return (
                      <Card key={req.id}>
                        <CardContent className="pt-4 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-1">
                              {req.article && (
                                <Badge variant="outline" className="text-xs">
                                  {req.article}
                                </Badge>
                              )}
                              <p className="text-sm">{req.requirement_text}</p>
                              {req.notes && (
                                <p className="text-xs text-muted-foreground italic">{req.notes}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex gap-2">
                              {COMPLIANCE_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                const isSelected = currentStatus === opt.value;
                                return (
                                  <Button
                                    key={opt.value}
                                    size="sm"
                                    variant={isSelected ? "default" : "outline"}
                                    className={`gap-1 ${isSelected ? (opt.value === "conforme" ? "bg-green-600 hover:bg-green-700" : opt.value === "nao_conforme" ? "bg-red-600 hover:bg-red-700" : "bg-yellow-600 hover:bg-yellow-700") : ""}`}
                                    onClick={() => updateApplicabilityMutation.mutate({
                                      requirementId: req.id,
                                      isApplicable: true,
                                      complianceStatus: opt.value,
                                      notes: app?.notes || undefined,
                                    })}
                                    disabled={updateApplicabilityMutation.isPending}
                                  >
                                    <Icon className="h-3.5 w-3.5" />
                                    {opt.label}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Notes field */}
                          <NotesField
                            requirementId={req.id}
                            initialNotes={app?.notes || ""}
                            complianceStatus={app?.compliance_status || "em_curso"}
                            onSave={(notes) => updateApplicabilityMutation.mutate({
                              requirementId: req.id,
                              isApplicable: true,
                              complianceStatus: app?.compliance_status || "em_curso",
                              notes,
                            })}
                            isPending={updateApplicabilityMutation.isPending}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Notes field component with local state
function NotesField({
  requirementId,
  initialNotes,
  complianceStatus,
  onSave,
  isPending,
}: {
  requirementId: string;
  initialNotes: string;
  complianceStatus: string;
  onSave: (notes: string) => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing && !notes) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
        onClick={() => setIsEditing(true)}
      >
        + Adicionar observações
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Observações sobre a conformidade..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="text-sm"
      />
      {notes !== initialNotes && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              onSave(notes);
              setIsEditing(false);
            }}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Guardar Notas
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setNotes(initialNotes);
              setIsEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
