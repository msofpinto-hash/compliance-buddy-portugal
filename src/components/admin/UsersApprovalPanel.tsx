import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserCheck, UserX, Users, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
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
import { useAuth } from "@/contexts/AuthContext";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  is_approved: boolean;
  created_at: string;
  approved_at: string | null;
}

export function UsersApprovalPanel() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "approve" | "reject" | null;
    profile: Profile | null;
  }>({ open: false, action: null, profile: null });

  // Fetch all profiles
  const { data: profiles, isLoading } = useQuery({
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

  // Approve user mutation
  const approveMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_approved: true,
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        })
        .eq("id", profileId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Utilizador aprovado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["profiles-approval"] });
      setConfirmDialog({ open: false, action: null, profile: null });
    },
    onError: (error: Error) => {
      toast.error("Erro ao aprovar utilizador: " + error.message);
    },
  });

  // Reject (revoke approval) mutation
  const rejectMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_approved: false,
          approved_at: null,
          approved_by: null,
        })
        .eq("id", profileId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aprovação revogada");
      queryClient.invalidateQueries({ queryKey: ["profiles-approval"] });
      setConfirmDialog({ open: false, action: null, profile: null });
    },
    onError: (error: Error) => {
      toast.error("Erro ao revogar aprovação: " + error.message);
    },
  });

  const pendingUsers = profiles?.filter((p) => !p.is_approved) || [];
  const approvedUsers = profiles?.filter((p) => p.is_approved) || [];

  const handleAction = () => {
    if (!confirmDialog.profile) return;

    if (confirmDialog.action === "approve") {
      approveMutation.mutate(confirmDialog.profile.id);
    } else if (confirmDialog.action === "reject") {
      rejectMutation.mutate(confirmDialog.profile.id);
    }
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
              Estes utilizadores registaram-se e aguardam aprovação para aceder à aplicação
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
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        setConfirmDialog({ open: true, action: "approve", profile })
                      }
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Aprovar
                    </Button>
                  </div>
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
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{profile.full_name || "Sem nome"}</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Aprovado
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">{profile.email}</div>
                    {profile.approved_at && (
                      <div className="text-xs text-muted-foreground">
                        Aprovado em{" "}
                        {format(new Date(profile.approved_at), "d 'de' MMMM 'de' yyyy", {
                          locale: pt,
                        })}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setConfirmDialog({ open: true, action: "reject", profile })
                    }
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Revogar
                  </Button>
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

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === "approve" ? "Aprovar Utilizador" : "Revogar Aprovação"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === "approve" ? (
                <>
                  Tem a certeza que deseja aprovar o acesso de{" "}
                  <strong>{confirmDialog.profile?.full_name || confirmDialog.profile?.email}</strong>?
                  O utilizador poderá aceder à aplicação após esta ação.
                </>
              ) : (
                <>
                  Tem a certeza que deseja revogar o acesso de{" "}
                  <strong>{confirmDialog.profile?.full_name || confirmDialog.profile?.email}</strong>?
                  O utilizador deixará de poder aceder à aplicação.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              className={
                confirmDialog.action === "approve"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {confirmDialog.action === "approve" ? "Aprovar" : "Revogar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
