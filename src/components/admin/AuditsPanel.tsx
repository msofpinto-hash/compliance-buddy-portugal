import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AddAuditRequirementsDialog } from "./AddAuditRequirementsDialog";
import { AuditRequirementCard } from "./AuditRequirementCard";
import { AuditFindingsEditor } from "./AuditFindingsEditor";
import { 
  ClipboardCheck, 
  Plus, 
  Calendar, 
  User, 
  FileText, 
  Building,
  Loader2,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Download
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

const statusConfig = {
  planned: { label: "Planeada", color: "bg-blue-100 text-blue-700 border-blue-300", icon: Clock },
  in_progress: { label: "Em Curso", color: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertCircle },
  pending_approval: { label: "Em Aprovação", color: "bg-purple-100 text-purple-700 border-purple-300", icon: FileText },
  closed: { label: "Encerrada", color: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle2 },
  cancelled: { label: "Cancelada", color: "bg-gray-100 text-gray-700 border-gray-300", icon: XCircle },
};

interface CreateAuditDialogProps {
  organizations: any[];
  onCreated: () => void;
}

function CreateAuditDialog({ organizations, onCreated }: CreateAuditDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    organization_id: "",
    title: "",
    description: "",
    auditor: "",
    audit_date: "",
  });

  const handleCreate = async () => {
    if (!form.organization_id || !form.title) {
      toast({ title: "Erro", description: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.from("audits").insert({
        organization_id: form.organization_id,
        title: form.title,
        description: form.description || null,
        auditor: form.auditor || null,
        audit_date: form.audit_date || null,
        created_by: user?.id,
        status: "planned",
      });

      if (error) throw error;

      toast({ title: "Auditoria criada", description: "A auditoria foi criada com sucesso" });
      setForm({ organization_id: "", title: "", description: "", auditor: "", audit_date: "" });
      setOpen(false);
      onCreated();
    } catch (error) {
      console.error("Error creating audit:", error);
      toast({ title: "Erro", description: "Não foi possível criar a auditoria", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Auditoria
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Auditoria</DialogTitle>
          <DialogDescription>
            Crie uma nova auditoria para avaliar a conformidade legal
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="org">Organização *</Label>
            <Select value={form.organization_id} onValueChange={(v) => setForm({ ...form, organization_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a organização" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Auditoria Ambiental Q1 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição e âmbito da auditoria"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="auditor">Auditor</Label>
              <Input
                id="auditor"
                value={form.auditor}
                onChange={(e) => setForm({ ...form, auditor: e.target.value })}
                placeholder="Nome do auditor"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Data da Auditoria</Label>
              <Input
                id="date"
                type="date"
                value={form.audit_date}
                onChange={(e) => setForm({ ...form, audit_date: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Auditoria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AuditsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAudit, setSelectedAudit] = useState<string | null>(null);

  // Fetch organizations
  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch audits
  const { data: audits, isLoading: loadingAudits, refetch: refetchAudits } = useQuery({
    queryKey: ["audits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select(`
          *,
          organizations(id, name),
          audit_requirements(id)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch audit details
  const { data: auditDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ["audit-details", selectedAudit],
    queryFn: async () => {
      if (!selectedAudit) return null;
      const { data, error } = await supabase
        .from("audits")
        .select(`
          *,
          organizations(id, name),
          audit_requirements(
            *,
            legal_requirements(id, article, requirement_text),
            legislation(id, number, title)
          )
        `)
        .eq("id", selectedAudit)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedAudit,
  });

  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const handleGenerateReport = async (auditId: string, auditTitle: string) => {
    setIsGeneratingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-compliance-report", {
        body: { reportType: "audit", auditId },
      });

      if (error) throw error;

      // Create blob and download
      const blob = new Blob([data], { type: "text/html" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-auditoria-${auditTitle.replace(/[^a-zA-Z0-9]/g, "-")}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: "Relatório gerado", description: "O relatório foi descarregado com sucesso" });
    } catch (error) {
      console.error("Error generating report:", error);
      toast({ title: "Erro", description: "Não foi possível gerar o relatório", variant: "destructive" });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleStatusChange = async (auditId: string, newStatus: "planned" | "in_progress" | "pending_approval" | "closed" | "cancelled") => {
    try {
      const { error } = await supabase
        .from("audits")
        .update({ status: newStatus })
        .eq("id", auditId);
      if (error) throw error;
      toast({ title: "Estado atualizado" });
      refetchAudits();
      queryClient.invalidateQueries({ queryKey: ["audit-details", auditId] });
    } catch (error) {
      toast({ title: "Erro ao atualizar estado", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            Módulo de Auditorias
          </h2>
          <p className="text-muted-foreground">
            Gerencie auditorias de conformidade legal
          </p>
        </div>
        {organizations && <CreateAuditDialog organizations={organizations} onCreated={refetchAudits} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Audits List */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Auditorias</CardTitle>
              <CardDescription>{audits?.length || 0} auditorias registadas</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAudits ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : audits && audits.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <div className="divide-y">
                    {audits.map((audit: any) => {
                      const status = statusConfig[audit.status as keyof typeof statusConfig];
                      const StatusIcon = status?.icon || Clock;
                      return (
                        <button
                          key={audit.id}
                          onClick={() => setSelectedAudit(audit.id)}
                          className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                            selectedAudit === audit.id ? "bg-muted" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{audit.title}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Building className="h-3 w-3" />
                                {audit.organizations?.name}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className={`text-xs ${status?.color}`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status?.label}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {audit.audit_requirements?.length || 0} requisitos
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma auditoria registada</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Audit Details */}
        <div className="lg:col-span-2">
          {selectedAudit ? (
            loadingDetails ? (
              <Card>
                <CardContent className="py-12">
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ) : auditDetails ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{auditDetails.title}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Building className="h-4 w-4" />
                          {auditDetails.organizations?.name}
                        </CardDescription>
                      </div>
                      <Select
                        value={auditDetails.status}
                        onValueChange={(v) => handleStatusChange(auditDetails.id, v as "planned" | "in_progress" | "pending_approval" | "closed" | "cancelled")}
                        disabled={auditDetails.status === "closed"}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planeada</SelectItem>
                          <SelectItem value="in_progress">Em Curso</SelectItem>
                          <SelectItem value="pending_approval">Em Aprovação</SelectItem>
                          <SelectItem value="closed">Encerrada</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateReport(auditDetails.id, auditDetails.title)}
                        disabled={isGeneratingReport}
                        className="gap-2"
                      >
                        {isGeneratingReport ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Relatório PDF
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {auditDetails.auditor && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Auditor:</span>
                          <span>{auditDetails.auditor}</span>
                        </div>
                      )}
                      {auditDetails.audit_date && (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Data:</span>
                          <span>{format(new Date(auditDetails.audit_date), "d MMMM yyyy", { locale: pt })}</span>
                        </div>
                      )}
                    </div>
                    {auditDetails.description && (
                      <p className="text-sm text-muted-foreground mt-4">{auditDetails.description}</p>
                    )}
                  </CardContent>
                </Card>

                {/* Findings and Recommendations */}
                <AuditFindingsEditor
                  auditId={auditDetails.id}
                  findings={auditDetails.findings}
                  recommendations={auditDetails.recommendations}
                  interlocutors={(auditDetails as any).interlocutors}
                  methodology={(auditDetails as any).methodology}
                  strengths={(auditDetails as any).strengths}
                  weaknesses={(auditDetails as any).weaknesses}
                  executiveSummary={(auditDetails as any).executive_summary}
                  onUpdated={() => {
                    queryClient.invalidateQueries({ queryKey: ["audit-details", selectedAudit] });
                    refetchAudits();
                  }}
                />

                {/* Requirements in Audit */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Requisitos em Auditoria
                        </CardTitle>
                        <CardDescription>
                          Requisitos aplicáveis incluídos nesta auditoria
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {auditDetails.audit_requirements?.length || 0} requisitos
                        </Badge>
                        <AddAuditRequirementsDialog
                          auditId={auditDetails.id}
                          organizationId={auditDetails.organization_id}
                          existingRequirementIds={auditDetails.audit_requirements?.map((ar: any) => ar.requirement_id) || []}
                          onAdded={() => {
                            queryClient.invalidateQueries({ queryKey: ["audit-details", selectedAudit] });
                            refetchAudits();
                          }}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {auditDetails.audit_requirements?.length > 0 ? (
                      <div className="space-y-3">
                        {auditDetails.audit_requirements.map((ar: any) => (
                          <AuditRequirementCard
                            key={ar.id}
                            requirement={ar}
                            organizationId={auditDetails.organization_id}
                            onUpdated={() => {
                              queryClient.invalidateQueries({ queryKey: ["audit-details", selectedAudit] });
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p className="mb-2">Nenhum requisito adicionado</p>
                        <p className="text-xs">
                          Os requisitos aplicáveis serão adicionados automaticamente
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Selecione uma auditoria</p>
                <p className="text-sm">Escolha uma auditoria da lista para ver os detalhes</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
