import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Building2, Plus, Edit, Trash2, FileText, Sparkles, Layers, Crown, BookOpen, BarChart3, Shield, FileCheck, Eye, Download, Copy, FolderTree, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tables } from "@/integrations/supabase/types";
import { AssignLegislationDialog, OrganizationLegislationBadge } from "./AssignLegislationDialog";
import { AssignThemesDialog, OrganizationThemesBadge } from "./AssignThemesDialog";
import { CopyOrganizationSettingsDialog } from "./CopyOrganizationSettingsDialog";
import { ExportReportDialog } from "./ExportReportDialog";
import { OrganizationLogoUpload } from "./OrganizationLogoUpload";
import { ClientDetailView } from "./ClientDetailView";
import { OrganizationComplianceProgress } from "./OrganizationComplianceProgress";
import { OrganizationDetailsDialog } from "./OrganizationDetailsDialog";

type Organization = Tables<"organizations">;

export function ClientsPanel() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [detailViewOrg, setDetailViewOrg] = useState<Organization | null>(null);
  const [assignLegislationOrg, setAssignLegislationOrg] = useState<Organization | null>(null);
  const [assignThemesOrg, setAssignThemesOrg] = useState<Organization | null>(null);
  const [copySettingsOrg, setCopySettingsOrg] = useState<Organization | null>(null);
  const [exportReportOrg, setExportReportOrg] = useState<Organization | null>(null);
  const [detailsOrg, setDetailsOrg] = useState<Organization | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDescription, setNewOrgDescription] = useState("");
  const [newOrgLogoUrl, setNewOrgLogoUrl] = useState<string | null>(null);
  const [newOrgServiceType, setNewOrgServiceType] = useState<string>("");
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [editingThemes, setEditingThemes] = useState<string[]>([]);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");

  const serviceTypes = [
    { value: "essencial", label: "Essencial", fullLabel: "Conformidade Legal Essencial", description: "Acesso básico à legislação", color: "bg-slate-100 text-slate-700 border-slate-200", icon: FileText },
    { value: "continua", label: "Contínua", fullLabel: "Conformidade Legal Contínua", description: "Acompanhamento contínuo", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Layers },
    { value: "avancada", label: "Avançada", fullLabel: "Conformidade Legal Avançada", description: "Funcionalidades avançadas", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Sparkles },
    { value: "dedicada", label: "Dedicada", fullLabel: "Conformidade Legal Dedicada", description: "Acompanhamento técnico permanente", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Crown },
  ];

  const getServiceTypeBadge = (serviceType: string | null) => {
    if (!serviceType) return null;
    const type = serviceTypes.find(t => t.value === serviceType);
    if (!type) return null;
    const Icon = type.icon;
    return (
      <Badge variant="outline" className={`${type.color} border text-xs gap-1`}>
        <Icon className="h-3 w-3" />
        {type.label}
      </Badge>
    );
  };

  // Fetch themes
  const { data: themes } = useQuery({
    queryKey: ["themes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch organizations
  const { data: organizations, isLoading } = useQuery({
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

  // Filter organizations based on search and service type
  const filteredOrganizations = organizations?.filter((org) => {
    const matchesSearch = searchQuery === "" || 
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (org.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesServiceType = serviceTypeFilter === "all" || 
      (org as any).service_type === serviceTypeFilter;
    
    return matchesSearch && matchesServiceType;
  }) || [];

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async () => {
      const { data: org, error } = await supabase
        .from("organizations")
        .insert({
          name: newOrgName,
          description: newOrgDescription || null,
          service_type: newOrgServiceType || null,
        } as any)
        .select()
        .single();
      
      if (error) throw error;

      if (selectedThemes.length > 0) {
        const themeInserts = selectedThemes.map(themeId => ({
          organization_id: org.id,
          theme_id: themeId,
        }));
        
        const { error: themeError } = await supabase
          .from("organization_themes")
          .insert(themeInserts);
        
        if (themeError) console.error("Error assigning themes:", themeError);
      }

      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organization-themes"] });
      toast.success("Organização criada com sucesso");
      setIsCreateOpen(false);
      setNewOrgName("");
      setNewOrgDescription("");
      setNewOrgServiceType("");
      setSelectedThemes([]);
    },
    onError: (error) => {
      toast.error("Erro ao criar organização: " + error.message);
    },
  });

  // Update organization mutation
  const updateOrgMutation = useMutation({
    mutationFn: async () => {
      if (!editingOrg) return;
      
      const { error } = await supabase
        .from("organizations")
        .update({
          name: newOrgName,
          description: newOrgDescription || null,
          logo_url: newOrgLogoUrl,
        })
        .eq("id", editingOrg.id);
      
      if (error) throw error;

      await supabase
        .from("organization_themes")
        .delete()
        .eq("organization_id", editingOrg.id);
      
      if (editingThemes.length > 0) {
        const themeInserts = editingThemes.map(themeId => ({
          organization_id: editingOrg.id,
          theme_id: themeId,
        }));
        
        await supabase
          .from("organization_themes")
          .insert(themeInserts);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organization-themes"] });
      toast.success("Organização atualizada com sucesso");
      setEditingOrg(null);
      setNewOrgName("");
      setNewOrgDescription("");
      setNewOrgLogoUrl(null);
      setEditingThemes([]);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar organização: " + error.message);
    },
  });

  // Delete organization mutation
  const deleteOrgMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("organizations")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organização eliminada com sucesso");
    },
    onError: (error) => {
      toast.error("Erro ao eliminar organização: " + error.message);
    },
  });

  const handleEdit = async (org: Organization) => {
    setEditingOrg(org);
    setNewOrgName(org.name);
    setNewOrgDescription(org.description || "");
    setNewOrgLogoUrl((org as any).logo_url || null);
    
    const { data: orgThemes } = await supabase
      .from("organization_themes")
      .select("theme_id")
      .eq("organization_id", org.id);
    
    setEditingThemes(orgThemes?.map(t => t.theme_id) || []);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (detailViewOrg) {
    return (
      <ClientDetailView
        organization={detailViewOrg}
        onBack={() => setDetailViewOrg(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-amber-100/70 via-orange-100/50 to-yellow-100/40 dark:from-amber-900/35 dark:via-orange-900/25 dark:to-yellow-900/20 border border-amber-200/50 dark:border-amber-800/35">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-stone-800 dark:text-stone-100">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            Gestão de Clientes
          </h2>
          <p className="text-amber-700/70 dark:text-amber-400/70 mt-1">
            Gerir organizações e utilizadores clientes
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Organização
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Organização</DialogTitle>
              <DialogDescription>
                Adicione uma nova organização cliente ao sistema.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Organização</Label>
                <Input
                  id="name"
                  placeholder="Ex: Empresa ABC, Lda."
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-type">Tipo de Serviço</Label>
                <Select value={newOrgServiceType} onValueChange={setNewOrgServiceType}>
                  <SelectTrigger id="service-type">
                    <SelectValue placeholder="Selecione o tipo de serviço..." />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <div className="flex flex-col">
                              <span className="font-medium">{type.fullLabel}</span>
                              <span className="text-xs text-muted-foreground">{type.description}</span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <FolderTree className="h-4 w-4" />
                  Temas
                </Label>
                <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30">
                  {themes?.map((theme) => (
                    <div key={theme.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`theme-${theme.id}`}
                        checked={selectedThemes.includes(theme.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedThemes(prev => [...prev, theme.id]);
                          } else {
                            setSelectedThemes(prev => prev.filter(id => id !== theme.id));
                          }
                        }}
                      />
                      <label
                        htmlFor={`theme-${theme.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {theme.name}
                      </label>
                    </div>
                  ))}
                  {(!themes || themes.length === 0) && (
                    <p className="text-sm text-muted-foreground col-span-2">Nenhum tema configurado</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  placeholder="Breve descrição da organização..."
                  value={newOrgDescription}
                  onChange={(e) => setNewOrgDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => createOrgMutation.mutate()}
                disabled={!newOrgName.trim() || createOrgMutation.isPending}
              >
                {createOrgMutation.isPending ? "A criar..." : "Criar Organização"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Organizações
              </CardTitle>
              <CardDescription>
                {filteredOrganizations.length} de {organizations?.length || 0} organizações
              </CardDescription>
            </div>
            
            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por nome..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Tipo de Serviço" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {serviceTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          {type.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrganizations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              {organizations?.length === 0 ? (
                <>
                  <p>Nenhuma organização criada</p>
                  <p className="text-sm">Clique em "Nova Organização" para começar</p>
                </>
              ) : (
                <>
                  <p>Nenhuma organização encontrada</p>
                  <p className="text-sm">Tente ajustar os filtros de pesquisa</p>
                  <Button 
                    variant="link" 
                    className="mt-2"
                    onClick={() => {
                      setSearchQuery("");
                      setServiceTypeFilter("all");
                    }}
                  >
                    Limpar filtros
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrganizations.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors gap-4"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          className="font-medium truncate hover:text-amber-600 hover:underline cursor-pointer transition-colors text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailsOrg(org);
                          }}
                          title="Clique para ver/editar dados da organização"
                        >
                          {org.name}
                        </button>
                        {getServiceTypeBadge((org as any).service_type)}
                        <OrganizationThemesBadge organizationId={org.id} />
                        <OrganizationLegislationBadge organizationId={org.id} />
                      </div>
                      {org.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {org.description}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Compliance Progress Indicator */}
                  <div className="hidden md:block w-32 shrink-0">
                    <OrganizationComplianceProgress organizationId={org.id} compact />
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-8 gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
                      title="Gerir Cliente"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailViewOrg(org);
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Gerir
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Exportar Relatórios"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExportReportOrg(org);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Copiar Configurações"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCopySettingsOrg(org);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Atribuir Temas"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssignThemesOrg(org);
                      }}
                    >
                      <FolderTree className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Atribuir Diplomas"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssignLegislationOrg(org);
                      }}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(org);
                      }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar Organização</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem a certeza que deseja eliminar "{org.name}"? Esta ação não pode ser revertida.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteOrgMutation.mutate(org.id)}
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Organization Dialog */}
      <Dialog open={!!editingOrg} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Organização</DialogTitle>
            <DialogDescription>
              Altere os dados da organização.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {editingOrg && (
              <OrganizationLogoUpload
                organizationId={editingOrg.id}
                currentLogoUrl={newOrgLogoUrl}
                onLogoChange={setNewOrgLogoUrl}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome da Organização</Label>
              <Input
                id="edit-name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <FolderTree className="h-4 w-4" />
                Temas
              </Label>
              <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30">
                {themes?.map((theme) => (
                  <div key={theme.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-theme-${theme.id}`}
                      checked={editingThemes.includes(theme.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setEditingThemes(prev => [...prev, theme.id]);
                        } else {
                          setEditingThemes(prev => prev.filter(id => id !== theme.id));
                        }
                      }}
                    />
                    <label
                      htmlFor={`edit-theme-${theme.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {theme.name}
                    </label>
                  </div>
                ))}
                {(!themes || themes.length === 0) && (
                  <p className="text-sm text-muted-foreground col-span-2">Nenhum tema configurado</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição (opcional)</Label>
              <Textarea
                id="edit-description"
                value={newOrgDescription}
                onChange={(e) => setNewOrgDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrg(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => updateOrgMutation.mutate()}
              disabled={!newOrgName.trim() || updateOrgMutation.isPending}
            >
              {updateOrgMutation.isPending ? "A guardar..." : "Guardar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Legislation Dialog */}
      {assignLegislationOrg && (
        <AssignLegislationDialog
          organization={assignLegislationOrg}
          open={!!assignLegislationOrg}
          onOpenChange={(open) => !open && setAssignLegislationOrg(null)}
        />
      )}

      {/* Assign Themes Dialog */}
      {assignThemesOrg && (
        <AssignThemesDialog
          organization={assignThemesOrg}
          open={!!assignThemesOrg}
          onOpenChange={(open) => !open && setAssignThemesOrg(null)}
        />
      )}

      {/* Copy Settings Dialog */}
      <CopyOrganizationSettingsDialog
        sourceOrganization={copySettingsOrg}
        open={!!copySettingsOrg}
        onOpenChange={(open) => !open && setCopySettingsOrg(null)}
      />

      {/* Export Report Dialog */}
      {exportReportOrg && (
        <ExportReportDialog
          organizationId={exportReportOrg.id}
          organizationName={exportReportOrg.name}
          open={!!exportReportOrg}
          onOpenChange={(open) => !open && setExportReportOrg(null)}
        />
      )}

      {/* Organization Details Dialog */}
      <OrganizationDetailsDialog
        organization={detailsOrg}
        open={!!detailsOrg}
        onOpenChange={(open) => !open && setDetailsOrg(null)}
      />
    </div>
  );
}
