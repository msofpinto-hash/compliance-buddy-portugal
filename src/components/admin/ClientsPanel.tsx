import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Building2, Plus, Edit, Trash2, Users, Mail, UserPlus, FileText, ClipboardCheck, ClipboardList, Download, Loader2, CheckCircle2, FolderTree, Copy } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { AssignLegislationDialog, OrganizationLegislationBadge } from "./AssignLegislationDialog";
import { ManageOrganizationRequirementsDialog } from "./ManageOrganizationRequirementsDialog";
import { ManageActionPlansDialog } from "./ManageActionPlansDialog";
import { AssignThemesDialog, OrganizationThemesBadge } from "./AssignThemesDialog";
import { CopyOrganizationSettingsDialog } from "./CopyOrganizationSettingsDialog";

// Export report function
async function exportReport(
  organizationId: string, 
  organizationName: string, 
  reportType: "compliance" | "legislation" | "requirements" = "compliance"
) {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-compliance-report`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ organizationId, reportType }),
    }
  );

  if (!response.ok) {
    throw new Error("Falha ao gerar relatório");
  }

  const html = await response.text();
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  
  const filenames: Record<string, string> = {
    compliance: `relatorio-conformidade-${organizationName.replace(/[^a-zA-Z0-9]/g, "-")}.html`,
    legislation: `legislacao-aplicavel-${organizationName.replace(/[^a-zA-Z0-9]/g, "-")}.html`,
    requirements: `requisitos-legais-${organizationName.replace(/[^a-zA-Z0-9]/g, "-")}.html`,
  };
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filenames[reportType];
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type Organization = Tables<"organizations">;

export function ClientsPanel() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [assignLegislationOrg, setAssignLegislationOrg] = useState<Organization | null>(null);
  const [manageRequirementsOrg, setManageRequirementsOrg] = useState<Organization | null>(null);
  const [actionPlansOrg, setActionPlansOrg] = useState<Organization | null>(null);
  const [assignThemesOrg, setAssignThemesOrg] = useState<Organization | null>(null);
  const [copySettingsOrg, setCopySettingsOrg] = useState<Organization | null>(null);
  const [exportingOrgId, setExportingOrgId] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDescription, setNewOrgDescription] = useState("");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");

  const handleExportReport = async (org: Organization, reportType: "compliance" | "legislation" | "requirements" = "compliance") => {
    setExportingOrgId(org.id);
    try {
      await exportReport(org.id, org.name, reportType);
      toast.success("Relatório exportado com sucesso");
    } catch (error) {
      toast.error("Erro ao exportar relatório");
    } finally {
      setExportingOrgId(null);
    }
  };

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

  // Fetch users for selected organization
  const { data: orgUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["org-users", selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg) return [];
      
      const { data, error } = await supabase
        .from("user_roles")
        .select(`
          id,
          user_id,
          role,
          created_at,
          profiles:user_id (
            email,
            full_name
          )
        `)
        .eq("organization_id", selectedOrg.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg,
  });

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .insert({
          name: newOrgName,
          description: newOrgDescription || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organização criada com sucesso");
      setIsCreateOpen(false);
      setNewOrgName("");
      setNewOrgDescription("");
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
        })
        .eq("id", editingOrg.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organização atualizada com sucesso");
      setEditingOrg(null);
      setNewOrgName("");
      setNewOrgDescription("");
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
      if (selectedOrg) setSelectedOrg(null);
    },
    onError: (error) => {
      toast.error("Erro ao eliminar organização: " + error.message);
    },
  });

  // Add user to organization mutation
  const addUserMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrg || !newUserEmail) return;
      
      // First, find the user by email in profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", newUserEmail)
        .single();
      
      if (profileError) {
        throw new Error("Utilizador não encontrado. Verifique se o email está correto e se o utilizador já se registou.");
      }
      
      // Check if user already has a role in this organization
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", profile.id)
        .eq("organization_id", selectedOrg.id)
        .single();
      
      if (existingRole) {
        throw new Error("Este utilizador já pertence a esta organização.");
      }
      
      // Add user role
      const { error } = await supabase
        .from("user_roles")
        .insert({
          user_id: profile.id,
          organization_id: selectedOrg.id,
          role: "client",
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-users", selectedOrg?.id] });
      toast.success("Utilizador adicionado à organização");
      setIsAddUserOpen(false);
      setNewUserEmail("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Remove user from organization mutation
  const removeUserMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("id", roleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-users", selectedOrg?.id] });
      toast.success("Utilizador removido da organização");
    },
    onError: (error) => {
      toast.error("Erro ao remover utilizador: " + error.message);
    },
  });

  const handleEdit = (org: Organization) => {
    setEditingOrg(org);
    setNewOrgName(org.name);
    setNewOrgDescription(org.description || "");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestão de Clientes</h2>
          <p className="text-muted-foreground">
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
            <div className="space-y-4 py-4">
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Organizations List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organizações
            </CardTitle>
            <CardDescription>
              {organizations?.length || 0} organizações registadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {organizations?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma organização criada</p>
                <p className="text-sm">Clique em "Nova Organização" para começar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {organizations?.map((org) => (
                  <div
                    key={org.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedOrg?.id === org.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedOrg(org)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{org.name}</p>
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
                    <div className="flex items-center gap-1">
                      {/* Export Dropdown */}
                      <div className="relative group">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Exportar Relatórios"
                          disabled={exportingOrgId === org.id}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {exportingOrgId === org.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        <div 
                          className="absolute right-0 top-full mt-1 w-56 bg-popover border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="p-1">
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 disabled:opacity-50"
                              onClick={() => handleExportReport(org, "legislation")}
                              disabled={exportingOrgId === org.id}
                            >
                              <FileText className="h-4 w-4" />
                              Lista de Legislação
                            </button>
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 disabled:opacity-50"
                              onClick={() => handleExportReport(org, "requirements")}
                              disabled={exportingOrgId === org.id}
                            >
                              <ClipboardList className="h-4 w-4" />
                              Lista de Requisitos
                            </button>
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-sm flex items-center gap-2 disabled:opacity-50"
                              onClick={() => handleExportReport(org, "compliance")}
                              disabled={exportingOrgId === org.id}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Relatório Completo
                            </button>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Copiar Configurações"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCopySettingsOrg(org);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Planos de Ação"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionPlansOrg(org);
                        }}
                      >
                        <ClipboardList className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Gerir Requisitos"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManageRequirementsOrg(org);
                        }}
                      >
                        <ClipboardCheck className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Atribuir Temas"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssignThemesOrg(org);
                        }}
                      >
                        <FolderTree className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Atribuir Diplomas"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssignLegislationOrg(org);
                        }}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(org);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
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

        {/* Organization Users */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Utilizadores
                </CardTitle>
                <CardDescription>
                  {selectedOrg
                    ? `Utilizadores de ${selectedOrg.name}`
                    : "Selecione uma organização"}
                </CardDescription>
              </div>
              {selectedOrg && (
                <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <UserPlus className="h-4 w-4" />
                      Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Utilizador</DialogTitle>
                      <DialogDescription>
                        Adicione um utilizador existente a {selectedOrg.name}.
                        O utilizador deve já estar registado no sistema.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email do Utilizador</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="exemplo@empresa.pt"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => addUserMutation.mutate()}
                        disabled={!newUserEmail.trim() || addUserMutation.isPending}
                      >
                        {addUserMutation.isPending ? "A adicionar..." : "Adicionar"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedOrg ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Selecione uma organização</p>
                <p className="text-sm">para ver os seus utilizadores</p>
              </div>
            ) : isLoadingUsers ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : orgUsers?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum utilizador nesta organização</p>
                <p className="text-sm">Clique em "Adicionar" para associar utilizadores</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orgUsers?.map((userRole: any) => (
                  <div
                    key={userRole.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {userRole.profiles?.full_name || "Sem nome"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {userRole.profiles?.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{userRole.role}</Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover Utilizador</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem a certeza que deseja remover este utilizador de {selectedOrg.name}?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => removeUserMutation.mutate(userRole.id)}
                            >
                              Remover
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
      </div>

      {/* Edit Organization Dialog */}
      <Dialog open={!!editingOrg} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Organização</DialogTitle>
            <DialogDescription>
              Altere os dados da organização.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome da Organização</Label>
              <Input
                id="edit-name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
              />
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

      {/* Manage Requirements Dialog */}
      <ManageOrganizationRequirementsDialog
        organization={manageRequirementsOrg}
        open={!!manageRequirementsOrg}
        onOpenChange={(open) => !open && setManageRequirementsOrg(null)}
      />

      {/* Action Plans Dialog */}
      <ManageActionPlansDialog
        organization={actionPlansOrg}
        open={!!actionPlansOrg}
        onOpenChange={(open) => !open && setActionPlansOrg(null)}
      />

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
    </div>
  );
}
