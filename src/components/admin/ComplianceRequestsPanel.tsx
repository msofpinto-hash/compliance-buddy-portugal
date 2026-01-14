import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle, XCircle, Clock, Building2, User, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface ComplianceRequest {
  id: string;
  applicability_id: string;
  organization_id: string;
  requested_by: string;
  proposed_compliance_status: string | null;
  proposed_applicability_type: string | null;
  proposed_notes: string | null;
  proposed_evidence_files: string[] | null;
  request_reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EnrichedRequest extends ComplianceRequest {
  organization?: { name: string };
  requester?: { full_name: string; email: string };
  applicability?: {
    compliance_status: string | null;
    applicability_type: string | null;
    notes: string | null;
    requirement?: {
      requirement_text: string;
      article: string | null;
      legislation?: {
        number: string;
        title: string;
      };
    };
  };
}

const statusConfig = {
  pending: { label: "Pendente", variant: "outline" as const, icon: Clock },
  approved: { label: "Aprovado", variant: "default" as const, icon: CheckCircle },
  rejected: { label: "Rejeitado", variant: "destructive" as const, icon: XCircle },
};

const complianceStatusLabels: Record<string, string> = {
  conforme: "Conforme",
  nao_conforme: "Não Conforme",
  em_avaliacao: "Em Avaliação",
  em_curso: "Em Curso",
  nao_aplicavel: "Não Aplicável",
};

const applicabilityTypeLabels: Record<string, string> = {
  direta: "Direta",
  indireta: "Indireta",
  condicionada: "Condicionada",
  nao_aplicavel: "Não Aplicável",
  informativo: "Informativo",
  nao_avaliado: "Não Avaliado",
};

export function ComplianceRequestsPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedRequest, setSelectedRequest] = useState<EnrichedRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);

  // Fetch compliance change requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["compliance-requests", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("compliance_change_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with related data
      const enrichedRequests: EnrichedRequest[] = await Promise.all(
        (data || []).map(async (request) => {
          // Get organization
          const { data: org } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", request.organization_id)
            .single();

          // Get requester profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", request.requested_by)
            .single();

          // Get applicability with requirement and legislation
          const { data: applicability } = await supabase
            .from("applicabilities")
            .select(`
              compliance_status,
              applicability_type,
              notes,
              requirement:legal_requirements(
                requirement_text,
                article,
                legislation:legislation(number, title)
              )
            `)
            .eq("id", request.applicability_id)
            .single();

          return {
            ...request,
            organization: org || undefined,
            requester: profile || undefined,
            applicability: applicability as EnrichedRequest["applicability"],
          };
        })
      );

      return enrichedRequests;
    },
  });

  // Mutation to review request
  const reviewMutation = useMutation({
    mutationFn: async ({ 
      requestId, 
      action, 
      notes 
    }: { 
      requestId: string; 
      action: "approve" | "reject"; 
      notes: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update the request status
      const { error: updateError } = await supabase
        .from("compliance_change_requests")
        .update({
          status: action === "approve" ? "approved" : "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq("id", requestId);

      if (updateError) throw updateError;

      // If approved, apply changes to applicabilities
      if (action === "approve" && selectedRequest) {
        const updates: Record<string, unknown> = {};
        
        if (selectedRequest.proposed_compliance_status) {
          updates.compliance_status = selectedRequest.proposed_compliance_status;
        }
        if (selectedRequest.proposed_applicability_type) {
          updates.applicability_type = selectedRequest.proposed_applicability_type;
        }
        if (selectedRequest.proposed_notes !== null) {
          updates.notes = selectedRequest.proposed_notes;
        }
        if (selectedRequest.proposed_evidence_files) {
          updates.evidence_files = selectedRequest.proposed_evidence_files;
        }

        if (Object.keys(updates).length > 0) {
          const { error: applyError } = await supabase
            .from("applicabilities")
            .update(updates)
            .eq("id", selectedRequest.applicability_id);

          if (applyError) throw applyError;
        }
      }

      return { action };
    },
    onSuccess: ({ action }) => {
      toast.success(
        action === "approve" 
          ? "Pedido aprovado e alterações aplicadas" 
          : "Pedido rejeitado"
      );
      queryClient.invalidateQueries({ queryKey: ["compliance-requests"] });
      setIsReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewNotes("");
      setReviewAction(null);
    },
    onError: (error) => {
      toast.error(`Erro ao processar pedido: ${error.message}`);
    },
  });

  const handleReview = (request: EnrichedRequest, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setReviewAction(action);
    setReviewNotes("");
    setIsReviewDialogOpen(true);
  };

  const confirmReview = () => {
    if (!selectedRequest || !reviewAction) return;
    
    reviewMutation.mutate({
      requestId: selectedRequest.id,
      action: reviewAction,
      notes: reviewNotes,
    });
  };

  const pendingCount = requests?.filter(r => r.status === "pending").length || 0;

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-amber-50/95 via-orange-50/80 to-yellow-50/70 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/25 border border-amber-200/60 dark:border-amber-800/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-stone-800 dark:text-stone-100">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
                  <AlertCircle className="h-4 w-4 text-white" />
                </div>
                Pedidos de Alteração de Compliance
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-amber-700/70 dark:text-amber-400/70">
                Reveja e aprove alterações de conformidade propostas por clientes
              </CardDescription>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 border-amber-200/60 dark:border-amber-800/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !requests?.length ? (
            <div className="py-8 text-center text-muted-foreground">
              <Clock className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Nenhum pedido {statusFilter === "pending" ? "pendente" : ""} encontrado</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => {
                const StatusIcon = statusConfig[request.status as keyof typeof statusConfig]?.icon || Clock;
                
                return (
                  <Card key={request.id} className="border-l-4 border-l-primary">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          {/* Header with status */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant={statusConfig[request.status as keyof typeof statusConfig]?.variant || "outline"}>
                              <StatusIcon className="mr-1 h-3 w-3" />
                              {statusConfig[request.status as keyof typeof statusConfig]?.label || request.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(request.created_at), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                            </span>
                          </div>

                          {/* Organization and requester */}
                          <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {request.organization?.name || "Organização desconhecida"}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="h-4 w-4 text-muted-foreground" />
                              {request.requester?.full_name || request.requester?.email || "Utilizador desconhecido"}
                            </span>
                          </div>

                          {/* Legislation and requirement */}
                          {request.applicability?.requirement && (
                            <div className="bg-muted/50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                                <FileText className="h-4 w-4" />
                                {request.applicability.requirement.legislation?.number} - {request.applicability.requirement.legislation?.title}
                              </div>
                              {request.applicability.requirement.article && (
                                <p className="text-xs text-muted-foreground mb-1">
                                  Artigo: {request.applicability.requirement.article}
                                </p>
                              )}
                              <p className="text-sm line-clamp-2">
                                {request.applicability.requirement.requirement_text}
                              </p>
                            </div>
                          )}

                          {/* Proposed changes */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Current values */}
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase">Valores Atuais</p>
                              <div className="text-sm space-y-1">
                                <p>
                                  <span className="text-muted-foreground">Estado:</span>{" "}
                                  {complianceStatusLabels[request.applicability?.compliance_status || ""] || "N/A"}
                                </p>
                                <p>
                                  <span className="text-muted-foreground">Aplicabilidade:</span>{" "}
                                  {applicabilityTypeLabels[request.applicability?.applicability_type || ""] || "N/A"}
                                </p>
                              </div>
                            </div>

                            {/* Proposed values */}
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-primary uppercase">Alterações Propostas</p>
                              <div className="text-sm space-y-1">
                                {request.proposed_compliance_status && (
                                  <p>
                                    <span className="text-muted-foreground">Estado:</span>{" "}
                                    <span className="font-medium text-primary">
                                      {complianceStatusLabels[request.proposed_compliance_status] || request.proposed_compliance_status}
                                    </span>
                                  </p>
                                )}
                                {request.proposed_applicability_type && (
                                  <p>
                                    <span className="text-muted-foreground">Aplicabilidade:</span>{" "}
                                    <span className="font-medium text-primary">
                                      {applicabilityTypeLabels[request.proposed_applicability_type] || request.proposed_applicability_type}
                                    </span>
                                  </p>
                                )}
                                {request.proposed_notes && (
                                  <p>
                                    <span className="text-muted-foreground">Notas:</span>{" "}
                                    <span className="font-medium text-primary">{request.proposed_notes}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Request reason */}
                          {request.request_reason && (
                            <div className="text-sm">
                              <span className="text-muted-foreground">Justificação:</span>{" "}
                              {request.request_reason}
                            </div>
                          )}

                          {/* Review notes if reviewed */}
                          {request.review_notes && (
                            <div className="text-sm bg-muted/30 p-2 rounded">
                              <span className="text-muted-foreground">Notas da revisão:</span>{" "}
                              {request.review_notes}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        {request.status === "pending" && (
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleReview(request, "approve")}
                              className="gap-1"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReview(request, "reject")}
                              className="gap-1"
                            >
                              <XCircle className="h-4 w-4" />
                              Rejeitar
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Aprovar Pedido" : "Rejeitar Pedido"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve"
                ? "Ao aprovar, as alterações serão aplicadas automaticamente."
                : "Ao rejeitar, as alterações não serão aplicadas."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                Notas da Revisão {reviewAction === "reject" && "(obrigatório)"}
              </label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewAction === "approve"
                    ? "Adicione notas opcionais..."
                    : "Explique o motivo da rejeição..."
                }
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsReviewDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmReview}
              disabled={reviewMutation.isPending || (reviewAction === "reject" && !reviewNotes.trim())}
              variant={reviewAction === "approve" ? "default" : "destructive"}
            >
              {reviewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : reviewAction === "approve" ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              {reviewAction === "approve" ? "Confirmar Aprovação" : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
