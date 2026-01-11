import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Upload, 
  FileText, 
  Trash2, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Paperclip,
  Eye,
  X,
  Send
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { RequestComplianceChangeDialog } from "./RequestComplianceChangeDialog";

interface RequirementDocumentsProps {
  organizationId: string;
  requirementId: string;
  requirementText: string;
  article?: string;
  legislationNumber: string;
  complianceStatus?: string;
  isReadOnly?: boolean;
}

interface UploadedFile {
  name: string;
  path: string;
  uploadedAt: string;
  size?: number;
}

export function RequirementDocuments({
  organizationId,
  requirementId,
  requirementText,
  article,
  legislationNumber,
  complianceStatus,
  isReadOnly = false,
}: RequirementDocumentsProps) {
  const queryClient = useQueryClient();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UploadedFile | null>(null);

  // Fetch applicability with evidence files
  const { data: applicability, isLoading } = useQuery({
    queryKey: ["applicability-evidence", organizationId, requirementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applicabilities")
        .select("id, evidence_files, compliance_status, notes")
        .eq("organization_id", organizationId)
        .eq("requirement_id", requirementId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  // Parse evidence files from the stored JSON-like array
  const evidenceFiles: UploadedFile[] = applicability?.evidence_files
    ? (applicability.evidence_files as string[]).map(f => {
        try {
          return typeof f === 'string' ? JSON.parse(f) : f;
        } catch {
          return { name: f, path: f, uploadedAt: new Date().toISOString() };
        }
      })
    : [];

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${organizationId}/${requirementId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("requirement-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create new evidence file entry
      const newFile: UploadedFile = {
        name: file.name,
        path: filePath,
        uploadedAt: new Date().toISOString(),
        size: file.size,
      };

      // Update applicability with new evidence
      const currentFiles = evidenceFiles.map(f => JSON.stringify(f));
      const updatedFiles = [...currentFiles, JSON.stringify(newFile)];

      // Check if applicability exists
      if (applicability?.id) {
        const { error: updateError } = await supabase
          .from("applicabilities")
          .update({ evidence_files: updatedFiles })
          .eq("id", applicability.id);

        if (updateError) throw updateError;
      } else {
        // Create new applicability record if it doesn't exist
        const { error: insertError } = await supabase
          .from("applicabilities")
          .insert({
            organization_id: organizationId,
            requirement_id: requirementId,
            is_applicable: true,
            compliance_status: "em_curso",
            evidence_files: [JSON.stringify(newFile)],
          });

        if (insertError) throw insertError;
      }

      return newFile;
    },
    onSuccess: () => {
      toast.success("Documento carregado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["applicability-evidence", organizationId, requirementId] });
      setIsUploadOpen(false);
      setSelectedFile(null);
    },
    onError: (error) => {
      console.error("Upload error:", error);
      toast.error("Erro ao carregar documento");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (file: UploadedFile) => {
      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from("requirement-documents")
        .remove([file.path]);

      if (deleteError) throw deleteError;

      // Update applicability
      const updatedFiles = evidenceFiles
        .filter(f => f.path !== file.path)
        .map(f => JSON.stringify(f));

      const { error: updateError } = await supabase
        .from("applicabilities")
        .update({ evidence_files: updatedFiles })
        .eq("id", applicability!.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Documento removido");
      queryClient.invalidateQueries({ queryKey: ["applicability-evidence", organizationId, requirementId] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      console.error("Delete error:", error);
      toast.error("Erro ao remover documento");
    },
  });

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      await uploadMutation.mutateAsync(selectedFile);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (file: UploadedFile) => {
    const { data, error } = await supabase.storage
      .from("requirement-documents")
      .download(file.path);

    if (error) {
      toast.error("Erro ao descarregar documento");
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleView = async (file: UploadedFile) => {
    const { data } = await supabase.storage
      .from("requirement-documents")
      .createSignedUrl(file.path, 3600); // 1 hour expiry

    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      toast.error("Erro ao abrir documento");
    }
  };

  const getStatusBadge = () => {
    const status = applicability?.compliance_status || complianceStatus;
    switch (status) {
      case "conforme":
        return <Badge className="gap-1 bg-green-500 hover:bg-green-600"><CheckCircle2 className="h-3 w-3" /> Conforme</Badge>;
      case "nao_conforme":
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Não Conforme</Badge>;
      default:
        return <Badge className="gap-1 bg-yellow-500 hover:bg-yellow-600 text-black">Em Avaliação</Badge>;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="shrink-0">{legislationNumber}</Badge>
              {article && <Badge variant="secondary" className="shrink-0">{article}</Badge>}
              {getStatusBadge()}
            </div>
            <CardDescription className="text-foreground line-clamp-2 mt-2">
              {requirementText}
            </CardDescription>
          </div>
          
          {!isReadOnly && (
            <div className="flex gap-2 shrink-0">
              {applicability?.id && (
                <RequestComplianceChangeDialog
                  organizationId={organizationId}
                  applicabilityId={applicability.id}
                  requirementText={requirementText}
                  article={article}
                  legislationNumber={legislationNumber}
                  currentComplianceStatus={applicability.compliance_status}
                  currentApplicabilityType={null}
                  currentNotes={applicability.notes}
                  trigger={
                    <Button size="sm" variant="ghost" className="gap-2" title="Solicitar alteração">
                      <Send className="h-4 w-4" />
                    </Button>
                  }
                />
              )}
              <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Carregar
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Carregar Evidência</DialogTitle>
                  <DialogDescription>
                    Anexe um documento como evidência de conformidade para este requisito.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="rounded-lg border-2 border-dashed p-6 text-center">
                    <Input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                    />
                    <Label
                      htmlFor="file-upload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Paperclip className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Clique para selecionar um ficheiro
                      </span>
                      <span className="text-xs text-muted-foreground">
                        PDF, Word, Excel ou imagens (máx. 10MB)
                      </span>
                    </Label>
                  </div>

                  {selectedFile && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedFile(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || isUploading}
                    className="w-full gap-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        A carregar...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Carregar Documento
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          )}
        </div>
      </CardHeader>

      {evidenceFiles.length > 0 && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Documentos anexados ({evidenceFiles.length})
            </p>
            <ScrollArea className="max-h-40">
              <div className="space-y-2">
                {evidenceFiles.map((file, index) => (
                  <div
                    key={file.path || index}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(file.uploadedAt), "dd MMM yyyy 'às' HH:mm", { locale: pt })}
                          {file.size && ` • ${formatFileSize(file.size)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleView(file)}
                        title="Visualizar"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDownload(file)}
                        title="Descarregar"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {!isReadOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(file)}
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      )}

      {evidenceFiles.length === 0 && !isReadOnly && (
        <CardContent className="pt-0">
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Sem documentos anexados</p>
            <p className="text-xs">Clique em "Carregar" para adicionar evidências</p>
          </div>
        </CardContent>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Documento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja remover o documento "{deleteTarget?.name}"? 
              Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Remover"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
