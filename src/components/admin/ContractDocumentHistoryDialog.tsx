import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileText, ExternalLink, RotateCcw, Trash2, Loader2, Clock, User } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface ContractDocumentHistoryDialogProps {
  organizationId: string;
  documentType: "proposal" | "purchase_order";
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreVersion: (url: string) => void;
  currentUrl: string | null;
}

interface DocumentVersion {
  id: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  version_number: number;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  uploader_name?: string | null;
}

export function ContractDocumentHistoryDialog({
  organizationId,
  documentType,
  label,
  open,
  onOpenChange,
  onRestoreVersion,
  currentUrl,
}: ContractDocumentHistoryDialogProps) {
  const queryClient = useQueryClient();

  const { data: versions, isLoading } = useQuery({
    queryKey: ["contract-doc-versions", organizationId, documentType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_document_versions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("document_type", documentType)
        .order("version_number", { ascending: false });

      if (error) throw error;

      // Fetch uploader names
      const uploaderIds = [...new Set(data?.filter(v => v.uploaded_by).map(v => v.uploaded_by) || [])];
      let uploaderMap: Record<string, string> = {};

      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", uploaderIds);

        if (profiles) {
          uploaderMap = profiles.reduce((acc, p) => {
            acc[p.id] = p.full_name || p.email;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      return (data || []).map(v => ({
        ...v,
        uploader_name: v.uploaded_by ? uploaderMap[v.uploaded_by] : null,
      })) as DocumentVersion[];
    },
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const version = versions?.find(v => v.id === versionId);
      if (!version) throw new Error("Versão não encontrada");

      // Delete from storage
      try {
        const urlParts = version.file_url.split("/contract-documents/");
        if (urlParts[1]) {
          const filePath = urlParts[1].split("?")[0];
          await supabase.storage.from("contract-documents").remove([filePath]);
        }
      } catch {
        // Continue even if storage delete fails
      }

      // Delete from database
      const { error } = await supabase
        .from("contract_document_versions")
        .delete()
        .eq("id", versionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["contract-doc-versions", organizationId, documentType] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["contract-doc-versions-count", organizationId, documentType] 
      });
      toast.success("Versão eliminada");
    },
    onError: (error) => {
      toast.error("Erro ao eliminar: " + error.message);
    },
  });

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isCurrentVersion = (url: string) => {
    if (!currentUrl) return false;
    // Compare the path part of the URLs (ignoring signed URL parameters)
    const currentPath = currentUrl.split("/contract-documents/")[1]?.split("?")[0];
    const versionPath = url.split("/contract-documents/")[1]?.split("?")[0];
    return currentPath === versionPath;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            Histórico: {label}
          </DialogTitle>
          <DialogDescription>
            Todas as versões do documento
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : versions?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Sem histórico de versões</p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions?.map((version) => (
                <div
                  key={version.id}
                  className={`p-3 rounded-lg border ${
                    isCurrentVersion(version.file_url)
                      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="shrink-0">
                          v{version.version_number}
                        </Badge>
                        {isCurrentVersion(version.file_url) && (
                          <Badge className="bg-amber-600 shrink-0">
                            Atual
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(version.file_size)}
                        </span>
                      </div>
                      <p className="text-sm truncate mt-1" title={version.file_name || undefined}>
                        {version.file_name || "documento"}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(version.created_at), "dd MMM yyyy, HH:mm", { locale: pt })}
                        </span>
                        {version.uploader_name && (
                          <span className="flex items-center gap-1 truncate">
                            <User className="h-3 w-3 shrink-0" />
                            {version.uploader_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                      >
                        <a href={version.file_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      {!isCurrentVersion(version.file_url) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onRestoreVersion(version.file_url)}
                          title="Restaurar esta versão"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deleteMutation.mutate(version.id)}
                        disabled={deleteMutation.isPending}
                        title="Eliminar versão"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
