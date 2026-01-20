import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Building2, FileText, User, Phone, Mail, MapPin, Calendar, Users, Loader2 } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

type Organization = Tables<"organizations">;

interface OrganizationDetailsDialogProps {
  organization: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrganizationDetailsDialog({ organization, open, onOpenChange }: OrganizationDetailsDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dados");
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nipc, setNipc] = useState("");
  const [contractReference, setContractReference] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [address, setAddress] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [responsibleEmail, setResponsibleEmail] = useState("");
  const [responsiblePhone, setResponsiblePhone] = useState("");
  const [notes, setNotes] = useState("");

  // Load organization data
  useEffect(() => {
    if (organization) {
      const org = organization as any;
      setName(org.name || "");
      setDescription(org.description || "");
      setNipc(org.nipc || "");
      setContractReference(org.contract_reference || "");
      setContractStartDate(org.contract_start_date || "");
      setContractEndDate(org.contract_end_date || "");
      setAddress(org.address || "");
      setResponsibleName(org.responsible_name || "");
      setResponsibleEmail(org.responsible_email || "");
      setResponsiblePhone(org.responsible_phone || "");
      setNotes(org.notes || "");
    }
  }, [organization]);

  // Fetch organization users
  const { data: orgUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["org-users", organization?.id],
    queryFn: async () => {
      if (!organization) return [];
      
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("id, user_id, role, created_at")
        .eq("organization_id", organization.id);
      
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];
      
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, user_type, phone")
        .in("id", userIds);
      
      if (profilesError) throw profilesError;
      
      return roles.map(role => ({
        ...role,
        profile: profiles?.find(p => p.id === role.user_id) || null
      }));
    },
    enabled: !!organization && open,
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!organization) return;
      
      const { error } = await supabase
        .from("organizations")
        .update({
          name,
          description: description || null,
          nipc: nipc || null,
          contract_reference: contractReference || null,
          contract_start_date: contractStartDate || null,
          contract_end_date: contractEndDate || null,
          address: address || null,
          responsible_name: responsibleName || null,
          responsible_email: responsibleEmail || null,
          responsible_phone: responsiblePhone || null,
          notes: notes || null,
        } as any)
        .eq("id", organization.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Dados da organização atualizados com sucesso");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar dados: " + error.message);
    },
  });

  if (!organization) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-600" />
            {organization.name}
          </DialogTitle>
          <DialogDescription>
            Dados e informações da organização
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Dados
            </TabsTrigger>
            <TabsTrigger value="contrato" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Contrato
            </TabsTrigger>
            <TabsTrigger value="utilizadores" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Utilizadores
              {orgUsers && orgUsers.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {orgUsers.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="dados" className="mt-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Nome da Organização</Label>
                  <Input
                    id="org-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome da empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nipc">NIPC</Label>
                  <Input
                    id="nipc"
                    value={nipc}
                    onChange={(e) => setNipc(e.target.value)}
                    placeholder="Número de Identificação"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="address" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Morada
                </Label>
                <Textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Morada completa"
                  rows={2}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição da organização"
                  rows={2}
                />
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Responsável
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="responsible-name">Nome</Label>
                    <Input
                      id="responsible-name"
                      value={responsibleName}
                      onChange={(e) => setResponsibleName(e.target.value)}
                      placeholder="Nome do responsável"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsible-email" className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </Label>
                    <Input
                      id="responsible-email"
                      type="email"
                      value={responsibleEmail}
                      onChange={(e) => setResponsibleEmail(e.target.value)}
                      placeholder="email@empresa.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsible-phone" className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      Telefone
                    </Label>
                    <Input
                      id="responsible-phone"
                      value={responsiblePhone}
                      onChange={(e) => setResponsiblePhone(e.target.value)}
                      placeholder="+351 ..."
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="contrato" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contract-ref">Referência do Contrato</Label>
                  <Input
                    id="contract-ref"
                    value={contractReference}
                    onChange={(e) => setContractReference(e.target.value)}
                    placeholder="Ex: CT-2024-001"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contract-start" className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Data de Início
                  </Label>
                  <Input
                    id="contract-start"
                    type="date"
                    value={contractStartDate}
                    onChange={(e) => setContractStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contract-end" className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Data de Fim
                  </Label>
                  <Input
                    id="contract-end"
                    type="date"
                    value={contractEndDate}
                    onChange={(e) => setContractEndDate(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notas / Observações</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas adicionais sobre o contrato ou cliente..."
                  rows={4}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="utilizadores" className="mt-0">
              {isLoadingUsers ? (
                <div className="space-y-3">
                  {[1, 2].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : orgUsers && orgUsers.length > 0 ? (
                <div className="space-y-2">
                  {orgUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-400 font-medium">
                          {user.profile?.full_name?.charAt(0)?.toUpperCase() || user.profile?.email?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="font-medium">
                            {user.profile?.full_name || "Sem nome"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {user.profile?.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {user.profile?.phone && (
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {user.profile.phone}
                          </span>
                        )}
                        <Badge variant="outline" className="capitalize">
                          {user.profile?.user_type || "consulta"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum utilizador associado</p>
                  <p className="text-sm">Os utilizadores podem ser adicionados na aba Utilizadores do menu principal</p>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
        
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={!name.trim() || updateMutation.isPending}
            className="gap-2"
          >
            {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {updateMutation.isPending ? "A guardar..." : "Guardar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
