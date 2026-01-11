import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ArrowRight, Clock } from "lucide-react";
import { toast } from "sonner";

interface RequestComplianceChangeDialogProps {
  organizationId: string;
  applicabilityId: string;
  requirementText: string;
  article?: string;
  legislationNumber: string;
  currentComplianceStatus?: string | null;
  currentApplicabilityType?: string | null;
  currentNotes?: string | null;
  trigger?: React.ReactNode;
}

const complianceStatusOptions = [
  { value: "conforme", label: "Conforme" },
  { value: "nao_conforme", label: "Não Conforme" },
  { value: "em_avaliacao", label: "Em Avaliação" },
  { value: "em_curso", label: "Em Curso" },
  { value: "nao_aplicavel", label: "Não Aplicável" },
];

const applicabilityTypeOptions = [
  { value: "direta", label: "Direta" },
  { value: "indireta", label: "Indireta" },
  { value: "condicionada", label: "Condicionada" },
  { value: "nao_aplicavel", label: "Não Aplicável" },
  { value: "informativo", label: "Informativo" },
];

const statusLabels: Record<string, string> = {
  conforme: "Conforme",
  nao_conforme: "Não Conforme",
  em_avaliacao: "Em Avaliação",
  em_curso: "Em Curso",
  nao_aplicavel: "Não Aplicável",
  direta: "Direta",
  indireta: "Indireta",
  condicionada: "Condicionada",
  informativo: "Informativo",
  nao_avaliado: "Não Avaliado",
};

export function RequestComplianceChangeDialog({
  organizationId,
  applicabilityId,
  requirementText,
  article,
  legislationNumber,
  currentComplianceStatus,
  currentApplicabilityType,
  currentNotes,
  trigger,
}: RequestComplianceChangeDialogProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [proposedComplianceStatus, setProposedComplianceStatus] = useState<string>("");
  const [proposedApplicabilityType, setProposedApplicabilityType] = useState<string>("");
  const [proposedNotes, setProposedNotes] = useState<string>("");
  const [requestReason, setRequestReason] = useState<string>("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Check if there's already a pending request for this applicability
      const { data: existingRequest } = await supabase
        .from("compliance_change_requests")
        .select("id")
        .eq("applicability_id", applicabilityId)
        .eq("status", "pending")
        .maybeSingle();

      if (existingRequest) {
        throw new Error("Já existe um pedido pendente para este requisito");
      }

      const { error } = await supabase
        .from("compliance_change_requests")
        .insert({
          applicability_id: applicabilityId,
          organization_id: organizationId,
          requested_by: user.id,
          proposed_compliance_status: proposedComplianceStatus || null,
          proposed_applicability_type: proposedApplicabilityType || null,
          proposed_notes: proposedNotes || null,
          request_reason: requestReason,
          status: "pending",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido de alteração submetido com sucesso");
      queryClient.invalidateQueries({ queryKey: ["compliance-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-compliance-requests"] });
      setIsOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao submeter pedido");
    },
  });

  const resetForm = () => {
    setProposedComplianceStatus("");
    setProposedApplicabilityType("");
    setProposedNotes("");
    setRequestReason("");
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) resetForm();
  };

  const hasChanges = proposedComplianceStatus || proposedApplicabilityType || proposedNotes;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Send className="h-4 w-4" />
            Solicitar Alteração
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Solicitar Alteração de Compliance
          </DialogTitle>
          <DialogDescription>
            O seu pedido será enviado para revisão por um administrador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Context */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline">{legislationNumber}</Badge>
              {article && <Badge variant="secondary">{article}</Badge>}
            </div>
            <p className="text-muted-foreground line-clamp-2">{requirementText}</p>
          </div>

          {/* Current values */}
          <div className="grid grid-cols-2 gap-4 p-3 rounded-lg border">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Estado Atual</p>
              <Badge variant="outline">
                {statusLabels[currentComplianceStatus || ""] || "Não definido"}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Aplicabilidade Atual</p>
              <Badge variant="outline">
                {statusLabels[currentApplicabilityType || ""] || "Não definido"}
              </Badge>
            </div>
          </div>

          {/* Proposed changes */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ArrowRight className="h-4 w-4 text-primary" />
              Alterações Propostas
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="compliance-status">Novo Estado</Label>
                <Select value={proposedComplianceStatus} onValueChange={setProposedComplianceStatus}>
                  <SelectTrigger id="compliance-status">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Manter atual</SelectItem>
                    {complianceStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="applicability-type">Nova Aplicabilidade</Label>
                <Select value={proposedApplicabilityType} onValueChange={setProposedApplicabilityType}>
                  <SelectTrigger id="applicability-type">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Manter atual</SelectItem>
                    {applicabilityTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proposed-notes">Novas Notas (opcional)</Label>
              <Textarea
                id="proposed-notes"
                value={proposedNotes}
                onChange={(e) => setProposedNotes(e.target.value)}
                placeholder="Adicione ou atualize as notas..."
                className="min-h-[60px]"
              />
              {currentNotes && (
                <p className="text-xs text-muted-foreground">
                  Notas atuais: {currentNotes}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">
                Justificação <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Explique o motivo da alteração..."
                className="min-h-[80px]"
                required
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !hasChanges || !requestReason.trim()}
            className="gap-2"
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submeter Pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
