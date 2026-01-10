import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserCheck, Users, Clock, CheckCircle2, XCircle, Building2, Plus, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  is_approved: boolean;
  created_at: string;
  approved_at: string | null;
}

interface Organization {
  id: string;
  name: string;
}

interface UserRole {
  user_id: string;
  organization_id: string;
  organizations: { name: string } | null;
}

interface UserWithOrgs extends Profile {
  organizations: { id: string; name: string }[];
}

export function UsersApprovalPanel() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [approveDialog, setApproveDialog] = useState<{
    open: boolean;
    profile: Profile | null;
    mode: "approve" | "edit";
  }>({ open: false, profile: null, mode: "approve" });
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [revokeDialog, setRevokeDialog] = useState<{
    open: boolean;
    profile: UserWithOrgs | null;
  }>({ open: false, profile: null });

  // Fetch all profiles
  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ["profiles-approval"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, is_approved, created_at, approved_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Profile[];
    },
  });

  // Fetch organizations
  const { data: organizations, isLoading: loadingOrgs } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return data as Organization[];
    },
  });

  // Fetch user roles to get organization assignments
  const { data: userRoles } = useQuery({
    queryKey: ["user-roles-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select(`
          user_id,
          organization_id,
          role,
          organizations:organization_id (name)
        `)
        .eq("role", "client");

      if (error) throw error;
      return data as UserRole[];
    },
  });

  // Approve/Update user mutation - assigns to multiple organizations
  const approveMutation = useMutation({
    mutationFn: async ({ profileId, organizationIds, isEdit }: { profileId: string; organizationIds: string[]; isEdit: boolean }) => {
      // Always remove existing client roles first to prevent duplicates
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", profileId)
        .eq("role", "client");

      if (deleteError) throw deleteError;

      // Add user roles for each organization
      if (organizationIds.length > 0) {
        const rolesToInsert = organizationIds.map((orgId) => ({
          user_id: profileId,
          organization_id: orgId,
          role: "client" as const,
        }));

        const { error: roleError } = await supabase
          .from("user_roles")
          .insert(rolesToInsert);

        if (roleError) throw roleError;
      }

      // Update profile as approved (or revoke if no orgs selected in edit mode)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          is_approved: organizationIds.length > 0,
          approved_at: organizationIds.length > 0 ? new Date().toISOString() : null,
          approved_by: organizationIds.length > 0 ? user?.id : null,
        })
        .eq("id", profileId);

      if (profileError) throw profileError;
    },
    onSuccess: (_, variables) => {
      const message = variables.isEdit 
        ? "Organizações atualizadas com sucesso" 
        : "Utilizador aprovado e associado às organizações";
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ["profiles-approval"] });
      queryClient.invalidateQueries({ queryKey: ["user-roles-all"] });
      setApproveDialog({ open: false, profile: null, mode: "approve" });
      setSelectedOrgIds(new Set());
    },
    onError: (error: Error) => {
      toast.error("Erro: " + error.message);
    },
  });

  // Revoke access mutation
  const revokeMutation = useMutation({
    mutationFn: async (profileId: string) => {
      // Remove all user roles
      const { error: roleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", profileId)
        .eq("role", "client");

      if (roleError) throw roleError;

      // Update profile as not approved
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          is_approved: false,
          approved_at: null,
          approved_by: null,
        })
        .eq("id", profileId);

      if (profileError) throw profileError;
    },
    onSuccess: () => {
      toast.success("Acesso revogado");
      queryClient.invalidateQueries({ queryKey: ["profiles-approval"] });
      queryClient.invalidateQueries({ queryKey: ["user-roles-all"] });
      setRevokeDialog({ open: false, profile: null });
    },
    onError: (error: Error) => {
      toast.error("Erro ao revogar acesso: " + error.message);
    },
  });

  // Combine profiles with their organizations (multiple)
  const usersWithOrgs: UserWithOrgs[] = (profiles || []).map((profile) => {
    const roles = userRoles?.filter((r) => r.user_id === profile.id) || [];
    const orgs = roles
      .filter((r) => r.organization_id && r.organizations)
      .map((r) => ({
        id: r.organization_id,
        name: r.organizations!.name,
      }));
    return {
      ...profile,
      organizations: orgs,
    };
  });

  const pendingUsers = usersWithOrgs.filter((p) => !p.is_approved);
  const approvedUsers = usersWithOrgs.filter((p) => p.is_approved);

  const isLoading = loadingProfiles || loadingOrgs;

  const handleOpenApproveDialog = (profile: Profile, mode: "approve" | "edit") => {
    setApproveDialog({ open: true, profile, mode });
    
    // Pre-select existing organizations if editing
    if (mode === "edit") {
      const existingOrgs = userRoles
        ?.filter((r) => r.user_id === profile.id)
        .map((r) => r.organization_id) || [];
      setSelectedOrgIds(new Set(existingOrgs));
    } else {
      setSelectedOrgIds(new Set());
    }
  };

  const toggleOrgSelection = (orgId: string) => {
    setSelectedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Utilizadores</CardDescription>
            <CardTitle className="text-3xl">{profiles?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={pendingUsers.length > 0 ? "border-amber-300 bg-amber-50/50" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Pendentes de Aprovação
            </CardDescription>
            <CardTitle className={`text-3xl ${pendingUsers.length > 0 ? "text-amber-600" : ""}`}>
              {pendingUsers.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Aprovados
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{approvedUsers.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <Clock className="h-5 w-5" />
              Utilizadores Pendentes
            </CardTitle>
            <CardDescription>
              Aprove estes utilizadores associando-os a uma ou mais organizações
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingUsers.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 p-4"
                >
                  <div className="space-y-1">
                    <div className="font-medium">{profile.full_name || "Sem nome"}</div>
                    <div className="text-sm text-muted-foreground">{profile.email}</div>
                    <div className="text-xs text-muted-foreground">
                      Registado em{" "}
                      {format(new Date(profile.created_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", {
                        locale: pt,
                      })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleOpenApproveDialog(profile, "approve")}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <UserCheck className="h-4 w-4 mr-1" />
                    Aprovar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approved Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Utilizadores Aprovados
          </CardTitle>
          <CardDescription>
            Utilizadores com acesso ativo à aplicação
          </CardDescription>
        </CardHeader>
        <CardContent>
          {approvedUsers.length > 0 ? (
            <div className="space-y-3">
              {approvedUsers.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{profile.full_name || "Sem nome"}</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Aprovado
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">{profile.email}</div>
                    {profile.organizations.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {profile.organizations.map((org) => (
                          <Badge 
                            key={org.id} 
                            variant="outline" 
                            className="bg-blue-50 text-blue-700 border-blue-300"
                          >
                            <Building2 className="h-3 w-3 mr-1" />
                            {org.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {profile.approved_at && (
                      <div className="text-xs text-muted-foreground">
                        Aprovado em{" "}
                        {format(new Date(profile.approved_at), "d 'de' MMMM 'de' yyyy", {
                          locale: pt,
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenApproveDialog(profile, "edit")}
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRevokeDialog({ open: true, profile })}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Revogar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Nenhum utilizador aprovado ainda</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approve/Edit Dialog - Select Multiple Organizations */}
      <Dialog
        open={approveDialog.open}
        onOpenChange={(open) => {
          setApproveDialog((prev) => ({ ...prev, open }));
          if (!open) setSelectedOrgIds(new Set());
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {approveDialog.mode === "edit" ? "Editar Organizações" : "Aprovar Utilizador"}
            </DialogTitle>
            <DialogDescription>
              {approveDialog.mode === "edit" 
                ? "Altere as organizações às quais o utilizador tem acesso."
                : "Selecione uma ou mais organizações às quais o utilizador terá acesso."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="font-medium">{approveDialog.profile?.full_name || "Sem nome"}</div>
              <div className="text-sm text-muted-foreground">{approveDialog.profile?.email}</div>
            </div>

            <div className="space-y-2">
              <Label>Organizações</Label>
              <ScrollArea className="h-64 rounded-md border p-3">
                {organizations?.length === 0 ? (
                  <p className="text-sm text-amber-600 text-center py-4">
                    Não existem organizações. Crie uma primeiro no separador "Clientes".
                  </p>
                ) : (
                  <div className="space-y-2">
                    {organizations?.map((org) => (
                      <div
                        key={org.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedOrgIds.has(org.id)
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => toggleOrgSelection(org.id)}
                      >
                        <Checkbox
                          checked={selectedOrgIds.has(org.id)}
                          onCheckedChange={() => toggleOrgSelection(org.id)}
                        />
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{org.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {selectedOrgIds.size} organização(ões) selecionada(s)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApproveDialog({ open: false, profile: null, mode: "approve" });
                setSelectedOrgIds(new Set());
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (approveDialog.profile) {
                  approveMutation.mutate({
                    profileId: approveDialog.profile.id,
                    organizationIds: Array.from(selectedOrgIds),
                    isEdit: approveDialog.mode === "edit",
                  });
                }
              }}
              disabled={selectedOrgIds.size === 0 || approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {approveDialog.mode === "edit" ? "Guardar Alterações" : "Aprovar e Associar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog
        open={revokeDialog.open}
        onOpenChange={(open) => setRevokeDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar Acesso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja revogar o acesso de{" "}
              <strong>{revokeDialog.profile?.full_name || revokeDialog.profile?.email}</strong>?
              O utilizador deixará de poder aceder à aplicação e será desassociado de todas as organizações
              {revokeDialog.profile?.organizations && revokeDialog.profile.organizations.length > 0 && (
                <> ({revokeDialog.profile.organizations.map((o) => o.name).join(", ")})</>
              )}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revokeDialog.profile) {
                  revokeMutation.mutate(revokeDialog.profile.id);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Revogar Acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
