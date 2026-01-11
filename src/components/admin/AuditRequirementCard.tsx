import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Save, Loader2, FileText, Link2, ExternalLink, X, Paperclip, Upload, Trash2 } from "lucide-react";

const complianceOptions = [
  { value: "pending", label: "Pendente", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: "compliant", label: "Conforme", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "partial", label: "Parcial", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "non_compliant", label: "Não Conforme", color: "bg-red-100 text-red-700 border-red-300" },
];

interface AuditRequirementCardProps {
  requirement: {
    id: string;
    audit_id: string;
    compliance_status: string | null;
    evidence: string | null;
    findings: string | null;
    applicability_type: string;
    legislation?: { number: string; title: string } | null;
    legal_requirements?: { article: string | null; requirement_text: string } | null;
  };
  organizationId: string;
  onUpdated: () => void;
}

export function AuditRequirementCard({ requirement, organizationId, onUpdated }: AuditRequirementCardProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const [form, setForm] = useState({
    compliance_status: requirement.compliance_status || "pending",
    evidence: requirement.evidence || "",
    findings: requirement.findings || "",
  });

  const currentStatus = complianceOptions.find(o => o.value === form.compliance_status) || complianceOptions[0];

  // Fetch available documents for the organization
  const { data: availableDocuments } = useQuery({
    queryKey: ["documents", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, name, file_url, category")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!organizationId,
  });

  // Fetch linked documents for this audit requirement
  const { data: linkedDocuments, refetch: refetchLinkedDocs } = useQuery({
    queryKey: ["audit-requirement-documents", requirement.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_requirement_documents")
        .select(`
          id,
          document_id,
          documents(id, name, file_url, category)
        `)
        .eq("audit_requirement_id", requirement.id);
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const linkedDocumentIds = linkedDocuments?.map(ld => ld.document_id) || [];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("audit_requirements")
        .update({
          compliance_status: form.compliance_status,
          evidence: form.evidence || null,
          findings: form.findings || null,
        })
        .eq("id", requirement.id);

      if (error) throw error;

      toast({ title: "Avaliação guardada" });
      onUpdated();
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: "Erro ao guardar", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLinkDocument = async (documentId: string) => {
    try {
      const { error } = await supabase
        .from("audit_requirement_documents")
        .insert({
          audit_requirement_id: requirement.id,
          document_id: documentId,
        });

      if (error) throw error;

      toast({ title: "Documento associado" });
      refetchLinkedDocs();
    } catch (error) {
      console.error("Error linking document:", error);
      toast({ title: "Erro ao associar documento", variant: "destructive" });
    }
  };

  const handleUnlinkDocument = async (linkId: string) => {
    try {
      const { error } = await supabase
        .from("audit_requirement_documents")
        .delete()
        .eq("id", linkId);

      if (error) throw error;

      toast({ title: "Documento removido" });
      refetchLinkedDocs();
    } catch (error) {
      console.error("Error unlinking document:", error);
      toast({ title: "Erro ao remover documento", variant: "destructive" });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `audit-evidence/${organizationId}/${requirement.audit_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("requirement-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("requirement-documents")
        .getPublicUrl(filePath);

      // Create document record
      const { data: docData, error: docError } = await supabase
        .from("documents")
        .insert({
          name: file.name,
          file_url: urlData.publicUrl,
          organization_id: organizationId,
          category: "Evidência Auditoria",
          uploaded_by: user?.id,
        })
        .select()
        .single();

      if (docError) throw docError;

      // Link document to audit requirement
      const { error: linkError } = await supabase
        .from("audit_requirement_documents")
        .insert({
          audit_requirement_id: requirement.id,
          document_id: docData.id,
        });

      if (linkError) throw linkError;

      toast({ title: "Documento carregado e associado" });
      refetchLinkedDocs();
      queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({ title: "Erro ao carregar documento", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteDocument = async (linkId: string, documentId: string, fileUrl: string | null) => {
    try {
      // Remove link first
      await supabase
        .from("audit_requirement_documents")
        .delete()
        .eq("id", linkId);

      // Try to delete from storage if it's an audit evidence file
      if (fileUrl && fileUrl.includes("audit-evidence")) {
        const path = fileUrl.split("/requirement-documents/")[1];
        if (path) {
          await supabase.storage.from("requirement-documents").remove([path]);
        }
      }

      // Delete document record if it was created for this audit
      const { data: linkCount } = await supabase
        .from("audit_requirement_documents")
        .select("id")
        .eq("document_id", documentId);

      if (!linkCount || linkCount.length === 0) {
        const { data: doc } = await supabase
          .from("documents")
          .select("category")
          .eq("id", documentId)
          .single();

        if (doc?.category === "Evidência Auditoria") {
          await supabase.from("documents").delete().eq("id", documentId);
        }
      }

      toast({ title: "Documento removido" });
      refetchLinkedDocs();
      queryClient.invalidateQueries({ queryKey: ["documents", organizationId] });
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({ title: "Erro ao remover documento", variant: "destructive" });
    }
  };

  const hasChanges = 
    form.compliance_status !== (requirement.compliance_status || "pending") ||
    form.evidence !== (requirement.evidence || "") ||
    form.findings !== (requirement.findings || "");

  const linkedDocsCount = linkedDocuments?.length || 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  {requirement.legislation?.number}
                </p>
                {requirement.legal_requirements?.article && (
                  <p className="text-sm font-medium text-primary">
                    {requirement.legal_requirements.article}
                  </p>
                )}
                <p className="text-sm mt-1 line-clamp-2">
                  {requirement.legal_requirements?.requirement_text}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {linkedDocsCount > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Paperclip className="h-3 w-3" />
                    {linkedDocsCount}
                  </Badge>
                )}
                <Badge variant="outline" className={currentStatus.color}>
                  {currentStatus.label}
                </Badge>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-4 pt-4 border-t space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Estado de Conformidade</label>
                <Select
                  value={form.compliance_status}
                  onValueChange={(v) => setForm({ ...form, compliance_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {complianceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${option.color.split(" ")[0]}`} />
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Aplicabilidade: {requirement.applicability_type}
                </label>
              </div>
            </div>

            {/* Documents Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Documentos de Evidência
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="gap-1"
                  >
                    {isUploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    Carregar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDocumentSelector(!showDocumentSelector)}
                    className="gap-1"
                  >
                    <Paperclip className="h-3 w-3" />
                    Associar
                  </Button>
                </div>
              </div>

              {/* Linked documents list */}
              {linkedDocuments && linkedDocuments.length > 0 ? (
                <div className="space-y-2">
                  {linkedDocuments.map((link: any) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50 border"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{link.documents?.name}</span>
                        {link.documents?.category && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {link.documents.category}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {link.documents?.file_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-7 w-7 p-0"
                          >
                            <a href={link.documents.file_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                        {link.documents?.category === "Evidência Auditoria" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(link.id, link.document_id, link.documents?.file_url)}
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnlinkDocument(link.id)}
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nenhum documento associado
                </p>
              )}

              {/* Document selector */}
              {showDocumentSelector && (
                <div className="border rounded-md p-3 bg-background">
                  <p className="text-xs font-medium mb-2">Selecione documentos existentes para associar:</p>
                  {availableDocuments && availableDocuments.length > 0 ? (
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-2">
                        {availableDocuments
                          .filter(doc => !linkedDocumentIds.includes(doc.id))
                          .map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer"
                              onClick={() => handleLinkDocument(doc.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate">{doc.name}</span>
                                {doc.category && (
                                  <Badge variant="secondary" className="text-xs shrink-0">
                                    {doc.category}
                                  </Badge>
                                )}
                              </div>
                              <Button variant="ghost" size="sm" className="h-7 gap-1">
                                <Link2 className="h-3 w-3" />
                                Associar
                              </Button>
                            </div>
                          ))}
                        {availableDocuments.filter(doc => !linkedDocumentIds.includes(doc.id)).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">
                            Todos os documentos já estão associados
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhum documento disponível na organização
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Observações de Evidência</label>
              <Textarea
                placeholder="Descreva as evidências de conformidade..."
                value={form.evidence}
                onChange={(e) => setForm({ ...form, evidence: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Constatações</label>
              <Textarea
                placeholder="Registe as constatações da auditoria..."
                value={form.findings}
                onChange={(e) => setForm({ ...form, findings: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !hasChanges}
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
