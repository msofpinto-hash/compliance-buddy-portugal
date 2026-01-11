import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, 
  CheckCircle2, 
  XCircle,
  Clock,
  FileText,
  Download,
  Building2,
  Calendar,
  Send,
  Eye,
  MessageSquare,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";

interface EvidenceRequestWithOrg {
  id: string;
  organization_id: string;
  template_id: string;
  status: string;
  notes: string | null;
  due_date: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  organizations: {
    id: string;
    name: string;
  };
  evidence_templates: {
    id: string;
    group_name: string;
    title: string;
    description: string | null;
  };
}

interface UploadedDocument {
  id: string;
  request_id: string;
  document_id: string;
  created_at: string;
  documents: {
    id: string;
    name: string;
    file_url: string | null;
    validity_date: string | null;
    user_notes: string | null;
  };
}

const STATUS_CONFIG = {
  pending: { label: "Pendente", color: "bg-gray-100 text-gray-800 border-gray-300", icon: Clock },
  submitted: { label: "Submetido", color: "bg-blue-100 text-blue-800 border-blue-300", icon: Send },
  approved: { label: "Aprovado", color: "bg-green-100 text-green-800 border-green-300", icon: CheckCircle2 },
  rejected: { label: "Rejeitado", color: "bg-red-100 text-red-800 border-red-300", icon: XCircle },
};

export function EvidenceReviewPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("submitted");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<EvidenceRequestWithOrg | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // Fetch all evidence requests
  const { data: requests, isLoading } = useQuery({
    queryKey: ["admin-evidence-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_evidence_requests")
        .select(`
          *,
          organizations (id, name),
          evidence_templates (id, group_name, title, description)
        `)
        .order("submitted_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as EvidenceRequestWithOrg[];
    },
  });

  // Fetch organizations for filter
  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch documents for selected request
  const { data: requestDocuments, isLoading: loadingDocs } = useQuery({
    queryKey: ["evidence-review-documents", selectedRequest?.id],
    queryFn: async () => {
      if (!selectedRequest) return [];
      const { data, error } = await supabase
        .from("evidence_request_documents")
        .select(`
          *,
          documents (id, name, file_url, validity_date, user_notes)
        `)
        .eq("request_id", selectedRequest.id);
      if (error) throw error;
      return data as UploadedDocument[];
    },
    enabled: !!selectedRequest,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, notes }: { requestId: string; notes: string }) => {
      const { error } = await supabase
        .from("organization_evidence_requests")
        .update({
          status: "approved",
          notes: notes || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Evidência aprovada", description: "A submissão foi aprovada com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["admin-evidence-requests"] });
      closeDialog();
    },
    onError: (error) => {
      console.error("Error approving:", error);
      toast({ title: "Erro", description: "Não foi possível aprovar a evidência", variant: "destructive" });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, notes }: { requestId: string; notes: string }) => {
      const { error } = await supabase
        .from("organization_evidence_requests")
        .update({
          status: "rejected",
          notes: notes || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Evidência rejeitada", description: "A submissão foi rejeitada." });
      queryClient.invalidateQueries({ queryKey: ["admin-evidence-requests"] });
      closeDialog();
    },
    onError: (error) => {
      console.error("Error rejecting:", error);
      toast({ title: "Erro", description: "Não foi possível rejeitar a evidência", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setReviewDialogOpen(false);
    setSelectedRequest(null);
    setReviewNotes("");
  };

  const openReview = (request: EvidenceRequestWithOrg) => {
    setSelectedRequest(request);
    setReviewNotes(request.notes || "");
    setReviewDialogOpen(true);
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage
      .from("requirement-documents")
      .createSignedUrl(filePath, 3600);
    
    if (error || !data?.signedUrl) {
      toast({ title: "Erro", description: "Não foi possível descarregar o ficheiro", variant: "destructive" });
      return;
    }
    
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = fileName;
    a.click();
  };

  // Filter requests
  const filteredRequests = requests?.filter(r => {
    const matchesSearch = !searchTerm || 
      r.evidence_templates.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.evidence_templates.group_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.organizations.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const matchesOrg = orgFilter === "all" || r.organization_id === orgFilter;
    
    return matchesSearch && matchesStatus && matchesOrg;
  });

  // Group by organization
  const groupedByOrg = filteredRequests?.reduce((acc, request) => {
    const orgName = request.organizations.name;
    if (!acc[orgName]) acc[orgName] = [];
    acc[orgName].push(request);
    return acc;
  }, {} as Record<string, EvidenceRequestWithOrg[]>);

  const toggleOrg = (orgName: string) => {
    const newExpanded = new Set(expandedOrgs);
    if (newExpanded.has(orgName)) {
      newExpanded.delete(orgName);
    } else {
      newExpanded.add(orgName);
    }
    setExpandedOrgs(newExpanded);
  };

  // Stats
  const stats = {
    total: requests?.length || 0,
    pending: requests?.filter(r => r.status === "pending").length || 0,
    submitted: requests?.filter(r => r.status === "submitted").length || 0,
    approved: requests?.filter(r => r.status === "approved").length || 0,
    rejected: requests?.filter(r => r.status === "rejected").length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="border-gray-300">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
            <p className="text-sm text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card className="border-blue-300">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.submitted}</div>
            <p className="text-sm text-muted-foreground">Para Revisão</p>
          </CardContent>
        </Card>
        <Card className="border-green-300">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-sm text-muted-foreground">Aprovados</p>
          </CardContent>
        </Card>
        <Card className="border-red-300">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-sm text-muted-foreground">Rejeitados</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Revisão de Evidências
          </CardTitle>
          <CardDescription>
            Reveja e aprove as evidências documentais submetidas pelos clientes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por título, grupo ou organização..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <config.icon className="h-4 w-4" />
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Organização" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as organizações</SelectItem>
                {organizations?.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredRequests?.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum pedido de evidência encontrado com os filtros selecionados.</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-3">
            {Object.entries(groupedByOrg || {}).map(([orgName, orgRequests]) => {
              const isExpanded = expandedOrgs.has(orgName);
              const submittedCount = orgRequests.filter(r => r.status === "submitted").length;

              return (
                <Collapsible 
                  key={orgName} 
                  open={isExpanded} 
                  onOpenChange={() => toggleOrg(orgName)}
                >
                  <Card>
                    <CardHeader className="p-4">
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center gap-3 text-left hover:bg-accent/50 -m-2 p-2 rounded-lg transition-colors">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div className="flex-1">
                            <h3 className="font-medium">{orgName}</h3>
                            <p className="text-sm text-muted-foreground">
                              {orgRequests.length} pedido(s)
                            </p>
                          </div>
                          {submittedCount > 0 && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                              {submittedCount} para revisão
                            </Badge>
                          )}
                        </button>
                      </CollapsibleTrigger>
                    </CardHeader>

                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-4 space-y-2">
                        {orgRequests.map((request) => {
                          const statusInfo = STATUS_CONFIG[request.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                          const StatusIcon = statusInfo.icon;

                          return (
                            <div 
                              key={request.id}
                              className="flex items-start gap-3 p-3 rounded-lg border hover:bg-accent/30 transition-colors"
                            >
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={statusInfo.color}>
                                    <StatusIcon className="h-3 w-3 mr-1" />
                                    {statusInfo.label}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {request.evidence_templates.group_name}
                                  </span>
                                </div>
                                <p className="font-medium text-sm">{request.evidence_templates.title}</p>
                                {request.submitted_at && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Send className="h-3 w-3" />
                                    Submetido em {format(new Date(request.submitted_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
                                  </p>
                                )}
                                {request.due_date && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Prazo: {format(new Date(request.due_date), "dd/MM/yyyy", { locale: pt })}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant={request.status === "submitted" ? "default" : "outline"}
                                onClick={() => openReview(request)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                {request.status === "submitted" ? "Rever" : "Ver"}
                              </Button>
                            </div>
                          );
                        })}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Revisão de Evidência
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.organizations.name} - {selectedRequest?.evidence_templates.group_name}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              {/* Request Info */}
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">Título</h4>
                  <p>{selectedRequest.evidence_templates.title}</p>
                </div>
                {selectedRequest.evidence_templates.description && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Descrição</h4>
                    <p className="text-sm">{selectedRequest.evidence_templates.description}</p>
                  </div>
                )}
                {selectedRequest.submitted_at && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Data de Submissão</h4>
                    <p className="text-sm">{format(new Date(selectedRequest.submitted_at), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}</p>
                  </div>
                )}
              </div>

              {/* Uploaded Documents */}
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-2">Documentos Submetidos</h4>
                {loadingDocs ? (
                  <Skeleton className="h-16 w-full" />
                ) : requestDocuments?.length === 0 ? (
                  <div className="p-4 border rounded-lg text-center text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum documento submetido</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {requestDocuments?.map((doc) => (
                      <div key={doc.id} className="flex items-start gap-3 p-3 border rounded-lg">
                        <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <p className="font-medium text-sm">{doc.documents.name}</p>
                          {doc.documents.validity_date && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Válido até: {format(new Date(doc.documents.validity_date), "dd/MM/yyyy", { locale: pt })}
                            </p>
                          )}
                          {doc.documents.user_notes && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {doc.documents.user_notes}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => doc.documents.file_url && handleDownload(doc.documents.file_url, doc.documents.name)}
                          disabled={!doc.documents.file_url}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Client Notes */}
              {selectedRequest.notes && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Notas do Cliente</h4>
                  <p className="text-sm p-3 bg-muted rounded-lg">{selectedRequest.notes}</p>
                </div>
              )}

              {/* Review Notes */}
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-1">
                  Notas de Revisão {selectedRequest.status === "submitted" && "(opcional)"}
                </h4>
                <Textarea
                  placeholder="Adicione comentários sobre a revisão..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                  disabled={selectedRequest.status !== "submitted"}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog}>
              Fechar
            </Button>
            {selectedRequest?.status === "submitted" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => rejectMutation.mutate({ requestId: selectedRequest.id, notes: reviewNotes })}
                  disabled={rejectMutation.isPending || approveMutation.isPending}
                >
                  {rejectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-1" />
                  )}
                  Rejeitar
                </Button>
                <Button
                  onClick={() => approveMutation.mutate({ requestId: selectedRequest.id, notes: reviewNotes })}
                  disabled={rejectMutation.isPending || approveMutation.isPending}
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Aprovar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
