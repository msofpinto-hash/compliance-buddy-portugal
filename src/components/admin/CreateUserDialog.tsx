import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Building2, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CreateUserDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"client" | "admin">("client");
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());

  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const reset = () => {
    setEmail("");
    setFullName("");
    setPassword("");
    setRole("client");
    setSelectedOrgIds(new Set());
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email,
          password,
          fullName,
          role,
          organizationIds: Array.from(selectedOrgIds),
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Utilizador criado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["profiles-approval"] });
      queryClient.invalidateQueries({ queryKey: ["user-roles-all"] });
      setOpen(false);
      reset();
    },
    onError: (error: Error) => toast.error("Erro ao criar utilizador: " + error.message),
  });

  const toggleOrg = (orgId: string) => {
    setSelectedOrgIds((prev) => {
      const next = new Set(prev);
      next.has(orgId) ? next.delete(orgId) : next.add(orgId);
      return next;
    });
  };

  const canSubmit =
    email.includes("@") &&
    password.length >= 8 &&
    (role === "admin" || selectedOrgIds.size > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700">
          <UserPlus className="h-4 w-4 mr-2" />
          Criar utilizador
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar utilizador</DialogTitle>
          <DialogDescription>
            Crie o acesso, defina o tipo de utilizador e associe-o às empresas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-user-name">Nome</Label>
            <Input
              id="new-user-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome completo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="utilizador@empresa.pt"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-password">Password inicial</Label>
            <Input
              id="new-user-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo de utilizador</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "client" | "admin")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Cliente (acesso ao portal da empresa)</SelectItem>
                <SelectItem value="admin">Administrador (acesso total)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "client" ? (
            <div className="space-y-2">
              <Label>Empresas</Label>
              <ScrollArea className="h-48 rounded-md border p-3">
                {organizations?.length ? (
                  <div className="space-y-2">
                    {organizations.map((org) => (
                      <div
                        key={org.id}
                        onClick={() => toggleOrg(org.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedOrgIds.has(org.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={selectedOrgIds.has(org.id)}
                          onCheckedChange={() => toggleOrg(org.id)}
                        />
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{org.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Não existem empresas criadas.
                  </p>
                )}
              </ScrollArea>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Administradores têm acesso a todas as empresas.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar utilizador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
