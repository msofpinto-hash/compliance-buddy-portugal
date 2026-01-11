import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Search, 
  Upload, 
  FileText, 
  CheckCircle2, 
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  File,
  Download,
  Trash2,
  Loader2,
  Leaf,
  Shield,
  Zap,
  TreePine,
  Heart,
  Users,
  Globe,
  Utensils,
  Award,
  Send,
  CalendarIcon,
  MessageSquare
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface EvidenceRequest {
  id: string;
  organization_id: string;
  template_id: string;
  status: string;
  notes: string | null;
  due_date: string | null;
  submitted_at: string | null;
  created_at: string;
  evidence_templates: {
    id: string;
    group_name: string;
    title: string;
    description: string | null;
    area_ambiente: boolean | null;
    area_qualidade: boolean | null;
    area_seguranca: boolean | null;
    area_seguranca_alimentar: boolean | null;
    area_energia: boolean | null;
    area_florestas: boolean | null;
    area_saude: boolean | null;
    area_conciliacao: boolean | null;
    area_sustentabilidade: boolean | null;
    legislation_references: string | null;
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

const AREA_CONFIG = {
  area_ambiente: { label: "Ambiente", icon: Leaf, color: "bg-green-100 text-green-800" },
  area_qualidade: { label: "Qualidade", icon: Award, color: "bg-blue-100 text-blue-800" },
  area_seguranca: { label: "Segurança", icon: Shield, color: "bg-orange-100 text-orange-800" },
  area_seguranca_alimentar: { label: "Seg. Alimentar", icon: Utensils, color: "bg-amber-100 text-amber-800" },
  area_energia: { label: "Energia", icon: Zap, color: "bg-yellow-100 text-yellow-800" },
  area_florestas: { label: "Florestas", icon: TreePine, color: "bg-emerald-100 text-emerald-800" },
  area_saude: { label: "Saúde", icon: Heart, color: "bg-red-100 text-red-800" },
  area_conciliacao: { label: "Conciliação", icon: Users, color: "bg-purple-100 text-purple-800" },
  area_sustentabilidade: { label: "Sustentabilidade", icon: Globe, color: "bg-teal-100 text-teal-800" },
};

const STATUS_CONFIG = {
  pending: { label: "Pendente", color: "bg-gray-100 text-gray-800", icon: Clock },
  submitted: { label: "Submetido", color: "bg-blue-100 text-blue-800", icon: Send },
  approved: { label: "Aprovado", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  rejected: { label: "Rejeitado", color: "bg-red-100 text-red-800", icon: AlertCircle },
};

interface EvidenceRequestsPanelProps {
  organizationId: string;
}

export function EvidenceRequestsPanel({ organizationId }: EvidenceRequestsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<EvidenceRequest | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [notes, setNotes] = useState("");
  
  // Document upload form state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [hasValidity, setHasValidity] = useState(false);
  const [validityDate, setValidityDate] = useState<Date | undefined>(undefined);
  const [documentNotes, setDocumentNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch evidence requests for this organization
  const { data: requests, isLoading: loadingRequests } = useQuery({
    queryKey: ["evidence-requests", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_evidence_requests")
        .select(`
          *,
          evidence_templates (*)
        `)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EvidenceRequest[];
    },
    enabled: !!organizationId,
  });

  // Fetch uploaded documents for requests
  const { data: requestDocuments } = useQuery({
    queryKey: ["evidence-request-documents", organizationId],
    queryFn: async () => {
      if (!requests?.length) return {};
      
      const requestIds = requests.map(r => r.id);
      const { data, error } = await supabase
        .from("evidence_request_documents")
        .select(`
          *,
          documents (id, name, file_url, validity_date, user_notes)
        `)
        .in("request_id", requestIds);
      
      if (error) throw error;
      
      const byRequest: Record<string, UploadedDocument[]> = {};
      data?.forEach(doc => {
        if (!byRequest[doc.request_id]) byRequest[doc.request_id] = [];
        byRequest[doc.request_id].push(doc as UploadedDocument);
      });
      return byRequest;
    },
    enabled: !!requests?.length,
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ 
      requestId, 
      file, 
      validityDate, 
      userNotes 
    }: { 
      requestId: string; 
      file: File; 
      validityDate?: Date;
      userNotes?: string;
    }) => {
      // First upload to storage
      const filePath = `evidence/${organizationId}/${requestId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("requirement-documents")
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;

      // Create document record with validity and notes
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          name: file.name,
          file_url: filePath,
          organization_id: organizationId,
          uploaded_by: user?.id,
          category: "evidence",
          validity_date: validityDate ? format(validityDate, "yyyy-MM-dd") : null,
          user_notes: userNotes || null,
        })
        .select()
        .single();
      
      if (docError) throw docError;

      // Link document to request
      const { error: linkError } = await supabase
        .from("evidence_request_documents")
        .insert({
          request_id: requestId,
          document_id: doc.id,
          uploaded_by: user?.id,
        });
      
      if (linkError) throw linkError;

      return doc;
    },
    onSuccess: () => {
      toast({ title: "Documento carregado", description: "O documento foi adicionado com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["evidence-request-documents", organizationId] });
      // Reset form
      setPendingFile(null);
      setHasValidity(false);
      setValidityDate(undefined);
      setDocumentNotes("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (error) => {
      console.error("Error uploading document:", error);
      toast({ title: "Erro", description: "Não foi possível carregar o documento", variant: "destructive" });
    },
  });

  // Submit evidence mutation
  const submitMutation = useMutation({
    mutationFn: async ({ requestId, notes }: { requestId: string; notes: string }) => {
      const { error } = await supabase
        .from("organization_evidence_requests")
        .update({
          status: "submitted",
          notes,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Evidência submetida", description: "O pedido foi submetido para revisão." });
      queryClient.invalidateQueries({ queryKey: ["evidence-requests", organizationId] });
      setUploadDialogOpen(false);
      setSelectedRequest(null);
      setNotes("");
    },
    onError: (error) => {
      console.error("Error submitting evidence:", error);
      toast({ title: "Erro", description: "Não foi possível submeter a evidência", variant: "destructive" });
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ documentId, filePath }: { documentId: string; filePath: string }) => {
      // Delete from storage
      await supabase.storage.from("requirement-documents").remove([filePath]);
      
      // Delete link
      await supabase.from("evidence_request_documents").delete().eq("document_id", documentId);
      
      // Delete document record
      const { error } = await supabase.from("documents").delete().eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Documento removido" });
      queryClient.invalidateQueries({ queryKey: ["evidence-request-documents", organizationId] });
    },
    onError: (error) => {
      console.error("Error deleting document:", error);
      toast({ title: "Erro", description: "Não foi possível remover o documento", variant: "destructive" });
    },
  });

  // Filter requests
  const filteredRequests = requests?.filter(r => {
    const matchesSearch = !searchTerm || 
      r.evidence_templates.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.evidence_templates.group_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = !statusFilter || r.status === statusFilter;
    
    const matchesArea = !areaFilter || 
      r.evidence_templates[areaFilter as keyof typeof r.evidence_templates] === true;
    
    return matchesSearch && matchesStatus && matchesArea;
  });

  // Group requests by group_name
  const groupedRequests = filteredRequests?.reduce((acc, request) => {
    const groupName = request.evidence_templates.group_name;
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(request);
    return acc;
  }, {} as Record<string, EvidenceRequest[]>);

  // Calculate stats
  const stats = {
    total: requests?.length || 0,
    pending: requests?.filter(r => r.status === "pending").length || 0,
    submitted: requests?.filter(r => r.status === "submitted").length || 0,
    approved: requests?.filter(r => r.status === "approved").length || 0,
  };

  const progressPercentage = stats.total > 0 
    ? Math.round(((stats.submitted + stats.approved) / stats.total) * 100)
    : 0;

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const handleUploadWithMetadata = async () => {
    if (!selectedRequest || !pendingFile) return;
    setUploadingFile(true);
    try {
      await uploadMutation.mutateAsync({ 
        requestId: selectedRequest.id, 
        file: pendingFile,
        validityDate: hasValidity ? validityDate : undefined,
        userNotes: documentNotes || undefined,
      });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleFileChange = (file: File) => {
    setPendingFile(file);
  };

  const getTemplateAreas = (template: EvidenceRequest["evidence_templates"]) => {
    return Object.entries(AREA_CONFIG)
      .filter(([key]) => template[key as keyof typeof template] === true)
      .map(([key, config]) => ({ key, ...config }));
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

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Evidências Documentais
          </CardTitle>
          <CardDescription>
            Submeta os documentos solicitados para comprovar conformidade
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>{stats.submitted + stats.approved} de {stats.total} pedidos respondidos</span>
              <span className="font-medium">{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-gray-300" />
                <span>Pendentes: {stats.pending}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span>Submetidos: {stats.submitted}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span>Aprovados: {stats.approved}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar pedidos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={areaFilter || "all"} onValueChange={(v) => setAreaFilter(v === "all" ? null : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tema" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os temas</SelectItem>
                {Object.entries(AREA_CONFIG).map(([key, config]) => {
                  const IconComponent = config.icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4" />
                        {config.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}>
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
          </div>
        </CardContent>
      </Card>

      {/* Requests List */}
      {loadingRequests ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {Object.entries(groupedRequests || {}).map(([groupName, groupRequests]) => {
              const isExpanded = expandedGroups.has(groupName);
              const pendingCount = groupRequests.filter(r => r.status === "pending").length;

              return (
                <Collapsible 
                  key={groupName} 
                  open={isExpanded} 
                  onOpenChange={() => toggleGroup(groupName)}
                >
                  <Card>
                    <CardHeader className="p-4">
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center gap-2 text-left hover:bg-accent/50 -m-2 p-2 rounded-lg transition-colors">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <div className="flex-1">
                            <h3 className="font-medium">{groupName}</h3>
                            <p className="text-sm text-muted-foreground">
                              {groupRequests.length} pedidos
                              {pendingCount > 0 && ` • ${pendingCount} pendentes`}
                            </p>
                          </div>
                          {pendingCount > 0 && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                              {pendingCount} por responder
                            </Badge>
                          )}
                        </button>
                      </CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent className="pt-0 px-4 pb-4">
                        <div className="space-y-3 border-t pt-4">
                          {groupRequests.map(request => {
                            const status = STATUS_CONFIG[request.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                            const StatusIcon = status.icon;
                            const areas = getTemplateAreas(request.evidence_templates);
                            const docs = requestDocuments?.[request.id] || [];

                            return (
                              <div 
                                key={request.id}
                                className="p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge className={status.color}>
                                        <StatusIcon className="h-3 w-3 mr-1" />
                                        {status.label}
                                      </Badge>
                                      {request.due_date && (
                                        <Badge variant="outline" className="text-xs">
                                          Prazo: {format(new Date(request.due_date), "dd/MM/yyyy", { locale: pt })}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="font-medium">{request.evidence_templates.title}</p>
                                    {request.evidence_templates.description && (
                                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                        {request.evidence_templates.description}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {areas.map(area => (
                                        <Badge 
                                          key={area.key} 
                                          variant="secondary" 
                                          className={`text-xs ${area.color}`}
                                        >
                                          <area.icon className="h-3 w-3 mr-1" />
                                          {area.label}
                                        </Badge>
                                      ))}
                                    </div>
                                    
                                    {docs.length > 0 && (
                                      <div className="mt-3 space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Documentos anexados:</p>
                                        {docs.map(doc => (
                                          <div key={doc.id} className="text-sm bg-muted/50 rounded px-3 py-2">
                                            <div className="flex items-center gap-2">
                                              <File className="h-3 w-3 shrink-0" />
                                              <span className="flex-1 truncate font-medium">{doc.documents.name}</span>
                                              <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-6 w-6"
                                                onClick={() => handleDownload(doc.documents.file_url!, doc.documents.name)}
                                              >
                                                <Download className="h-3 w-3" />
                                              </Button>
                                            </div>
                                            {(doc.documents.validity_date || doc.documents.user_notes) && (
                                              <div className="mt-1 pl-5 space-y-0.5">
                                                {doc.documents.validity_date && (
                                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <CalendarIcon className="h-3 w-3" />
                                                    Validade: {format(new Date(doc.documents.validity_date), "dd/MM/yyyy", { locale: pt })}
                                                  </p>
                                                )}
                                                {doc.documents.user_notes && (
                                                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                                                    <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                                                    <span>{doc.documents.user_notes}</span>
                                                  </p>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {request.status === "pending" && (
                                    <Button 
                                      size="sm"
                                      onClick={() => {
                                        setSelectedRequest(request);
                                        setUploadDialogOpen(true);
                                      }}
                                    >
                                      <Upload className="h-4 w-4 mr-1" />
                                      Submeter
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {filteredRequests?.length === 0 && !loadingRequests && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <h3 className="font-medium">Nenhum pedido pendente</h3>
            <p className="text-sm text-muted-foreground">
              Todos os pedidos de evidência foram respondidos.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submeter Evidência</DialogTitle>
            <DialogDescription>
              {selectedRequest?.evidence_templates.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Existing documents */}
            {selectedRequest && requestDocuments?.[selectedRequest.id]?.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Documentos anexados</Label>
                <div className="mt-2 space-y-2">
                  {requestDocuments[selectedRequest.id].map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 p-2 rounded border bg-muted/50">
                      <File className="h-4 w-4" />
                      <span className="flex-1 truncate text-sm">{doc.documents.name}</span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => deleteMutation.mutate({ 
                          documentId: doc.document_id, 
                          filePath: doc.documents.file_url! 
                        })}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* File upload */}
            <div className="space-y-3">
              <Label>Adicionar documento</Label>
              
              {/* File selector */}
              {!pendingFile ? (
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                  <div className="flex flex-col items-center justify-center">
                    <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                    <p className="text-sm text-muted-foreground">
                      Clique para selecionar ficheiro
                    </p>
                  </div>
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileChange(file);
                    }}
                  />
                </label>
              ) : (
                <div className="space-y-3">
                  {/* Selected file preview */}
                  <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                    <File className="h-5 w-5 text-primary" />
                    <span className="flex-1 truncate font-medium">{pendingFile.name}</span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setPendingFile(null);
                        setHasValidity(false);
                        setValidityDate(undefined);
                        setDocumentNotes("");
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      Alterar
                    </Button>
                  </div>
                  
                  {/* Validity date toggle and picker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="has-validity" className="text-sm cursor-pointer">
                        Documento tem validade?
                      </Label>
                      <Switch
                        id="has-validity"
                        checked={hasValidity}
                        onCheckedChange={setHasValidity}
                      />
                    </div>
                    
                    {hasValidity && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !validityDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {validityDate ? format(validityDate, "PPP", { locale: pt }) : "Selecionar data de validade"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={validityDate}
                            onSelect={setValidityDate}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  
                  {/* Document notes */}
                  <div>
                    <Label htmlFor="doc-notes" className="text-sm">Comentário sobre o documento (opcional)</Label>
                    <Textarea
                      id="doc-notes"
                      placeholder="Ex: Certificado renovado em 2024..."
                      value={documentNotes}
                      onChange={(e) => setDocumentNotes(e.target.value)}
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  
                  {/* Upload button */}
                  <Button 
                    onClick={handleUploadWithMetadata}
                    disabled={uploadingFile}
                    className="w-full"
                  >
                    {uploadingFile ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Carregar Documento
                  </Button>
                </div>
              )}
            </div>

            {/* Request-level Notes */}
            <div>
              <Label htmlFor="notes">Observações gerais (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Notas gerais sobre esta submissão..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setUploadDialogOpen(false);
              setSelectedRequest(null);
              setNotes("");
              setPendingFile(null);
              setHasValidity(false);
              setValidityDate(undefined);
              setDocumentNotes("");
            }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedRequest) {
                  submitMutation.mutate({ requestId: selectedRequest.id, notes });
                }
              }}
              disabled={submitMutation.isPending || !requestDocuments?.[selectedRequest?.id || ""]?.length}
            >
              {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submeter Evidência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
