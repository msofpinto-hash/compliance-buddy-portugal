import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, CheckCircle, XCircle, FileText, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface MyComplianceRequestsPanelProps {
  organizationIds: string[];
}

const statusConfig = {
  pending: { label: "Pendente", variant: "outline" as const, icon: Clock, color: "text-yellow-600" },
  approved: { label: "Aprovado", variant: "default" as const, icon: CheckCircle, color: "text-green-600" },
  rejected: { label: "Rejeitado", variant: "destructive" as const, icon: XCircle, color: "text-red-600" },
};

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

export function MyComplianceRequestsPanel({ organizationIds }: MyComplianceRequestsPanelProps) {
  const { data: requests, isLoading } = useQuery({
    queryKey: ["my-compliance-requests", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];

      const { data, error } = await supabase
        .from("compliance_change_requests")
        .select("*")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      // Enrich with applicability data
      const enrichedRequests = await Promise.all(
        (data || []).map(async (request) => {
          const { data: applicability } = await supabase
            .from("applicabilities")
            .select(`
              compliance_status,
              applicability_type,
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
            applicability,
          };
        })
      );

      return enrichedRequests;
    },
    enabled: organizationIds.length > 0,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Os Meus Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!requests?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Os Meus Pedidos de Alteração
          </CardTitle>
          <CardDescription>
            Acompanhe o estado dos seus pedidos de alteração de compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Ainda não submeteu nenhum pedido</p>
            <p className="text-sm">
              Use o botão "Solicitar Alteração" nos requisitos para pedir mudanças
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Os Meus Pedidos de Alteração
          {pendingCount > 0 && (
            <Badge variant="secondary">{pendingCount} pendente{pendingCount !== 1 ? "s" : ""}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Acompanhe o estado dos seus pedidos de alteração de compliance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {requests.map((request: any) => {
              const StatusIcon = statusConfig[request.status as keyof typeof statusConfig]?.icon || Clock;
              const config = statusConfig[request.status as keyof typeof statusConfig];

              return (
                <div
                  key={request.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Status and date */}
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={config?.variant || "outline"} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {config?.label || request.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(request.created_at), "dd MMM yyyy", { locale: pt })}
                        </span>
                      </div>

                      {/* Legislation info */}
                      {request.applicability?.requirement && (
                        <div className="mb-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">
                              {request.applicability.requirement.legislation?.number}
                            </Badge>
                            {request.applicability.requirement.article && (
                              <span className="text-muted-foreground text-xs">
                                Art. {request.applicability.requirement.article}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                            {request.applicability.requirement.requirement_text}
                          </p>
                        </div>
                      )}

                      {/* Proposed changes */}
                      <div className="flex items-center gap-2 text-xs">
                        <ArrowRight className="h-3 w-3 text-primary" />
                        <span className="text-muted-foreground">Alterações:</span>
                        {request.proposed_compliance_status && (
                          <Badge variant="secondary" className="text-xs">
                            {statusLabels[request.proposed_compliance_status] || request.proposed_compliance_status}
                          </Badge>
                        )}
                        {request.proposed_applicability_type && (
                          <Badge variant="secondary" className="text-xs">
                            {statusLabels[request.proposed_applicability_type] || request.proposed_applicability_type}
                          </Badge>
                        )}
                      </div>

                      {/* Review notes if rejected */}
                      {request.status === "rejected" && request.review_notes && (
                        <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
                          <strong>Motivo:</strong> {request.review_notes}
                        </div>
                      )}

                      {/* Approval note */}
                      {request.status === "approved" && request.review_notes && (
                        <div className="mt-2 p-2 rounded bg-green-500/10 text-green-700 text-xs">
                          <strong>Nota:</strong> {request.review_notes}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
