import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft,
  User,
  Bell,
  Shield,
  Save,
  Loader2,
  CheckCircle2,
  Camera,
  Mail,
  Phone,
  Building2,
  Calendar
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

export default function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [deadlineAlerts, setDeadlineAlerts] = useState(true);

  // Fetch user profile
  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch user organizations
  const { data: userOrganizations } = useQuery({
    queryKey: ["user-organizations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role, organizations(name)")
        .eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
    }
  }, [profile]);

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async (updates: { full_name: string }) => {
      if (!user?.id) throw new Error("Utilizador não autenticado");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: updates.full_name, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      toast.success("Perfil atualizado com sucesso");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar perfil: " + error.message);
    },
  });

  const handleSave = () => {
    updateProfile.mutate({ full_name: fullName });
  };

  // Get initials for avatar
  const getInitials = () => {
    if (fullName) {
      const parts = fullName.split(" ");
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return fullName.substring(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex items-center gap-4 px-4 py-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Definições</h1>
            <p className="text-sm text-muted-foreground">Gerir as suas preferências e conta</p>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={updateProfile.isPending}
            className="gap-2"
          >
            {updateProfile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="space-y-6">
          {/* Profile Header Card */}
          <Card className="overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
            <CardContent className="relative pt-0 pb-6">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12">
                <div className="relative">
                  <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                    <AvatarFallback className="text-2xl font-semibold bg-primary text-primary-foreground">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <Button 
                    size="icon" 
                    variant="secondary" 
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-md"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 space-y-1">
                  <h2 className="text-2xl font-bold">{fullName || user?.email?.split("@")[0]}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {user?.email}
                    </span>
                    {profile?.is_approved && (
                      <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                        <CheckCircle2 className="h-3 w-3" />
                        Conta verificada
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profile Details Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Informações Pessoais</CardTitle>
                  <CardDescription>Dados do seu perfil</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input 
                    id="fullName" 
                    value={fullName} 
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Introduza o seu nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    value={user?.email || ""} 
                    disabled 
                    className="bg-muted"
                  />
                </div>
              </div>
              
              {userOrganizations && userOrganizations.length > 0 && (
                <div className="space-y-2">
                  <Label>Organizações</Label>
                  <div className="flex flex-wrap gap-2">
                    {userOrganizations.map((org, index) => (
                      <Badge key={index} variant="secondary" className="gap-1.5 py-1.5">
                        <Building2 className="h-3 w-3" />
                        {(org.organizations as any)?.name || "Organização"}
                        <span className="text-xs text-muted-foreground capitalize">
                          ({org.role})
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {profile?.created_at && (
                <div className="pt-2 text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Membro desde {format(new Date(profile.created_at), "d 'de' MMMM 'de' yyyy", { locale: pt })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notifications Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Bell className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle>Notificações</CardTitle>
                  <CardDescription>Preferências de alertas e comunicações</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-notifications" className="font-medium">
                    Notificações por Email
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receber alertas sobre nova legislação
                  </p>
                </div>
                <Switch 
                  id="email-notifications"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Resumo Semanal</Label>
                  <p className="text-sm text-muted-foreground">
                    Receber um resumo semanal de atividades
                  </p>
                </div>
                <Switch 
                  checked={weeklyDigest}
                  onCheckedChange={setWeeklyDigest}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Alertas de Prazo</Label>
                  <p className="text-sm text-muted-foreground">
                    Notificar sobre prazos próximos de vencer
                  </p>
                </div>
                <Switch 
                  checked={deadlineAlerts}
                  onCheckedChange={setDeadlineAlerts}
                />
              </div>
            </CardContent>
          </Card>

          {/* Security Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <Shield className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <CardTitle>Segurança</CardTitle>
                  <CardDescription>Configurações de segurança da conta</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Alterar Password</Label>
                  <p className="text-sm text-muted-foreground">
                    Atualizar a password da sua conta
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Alterar
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-medium">Sessões Ativas</Label>
                  <p className="text-sm text-muted-foreground">
                    Gerir dispositivos conectados
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Ver
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
