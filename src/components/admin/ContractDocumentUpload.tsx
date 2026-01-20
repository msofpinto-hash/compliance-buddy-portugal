import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Loader2, ExternalLink, History, Clock } from "lucide-react";
import { ContractDocumentHistoryDialog } from "./ContractDocumentHistoryDialog";

interface ContractDocumentUploadProps {
  organizationId: string;
  label: string;
  currentUrl: string | null;
  onUrlChange: (url: string | null) => void;
  documentType: "proposal" | "purchase_order";
}

export function ContractDocumentUpload({
  organizationId,
  label,
  currentUrl,
  onUrlChange,
  documentType,
}: ContractDocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch version count
  const { data: versionCount = 0, refetch: refetchVersions } = useQuery({
    queryKey: ["contract-doc-versions-count", organizationId, documentType],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contract_document_versions")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("document_type", documentType);
      
      if (error) throw error;
      return count || 0;
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipo de ficheiro não suportado. Use PDF, Word, JPEG ou PNG.");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("O ficheiro é demasiado grande. Tamanho máximo: 10MB");
      return;
    }

    setIsUploading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Get next version number
      const { data: lastVersion } = await supabase
        .from("contract_document_versions")
        .select("version_number")
        .eq("organization_id", organizationId)
        .eq("document_type", documentType)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      const nextVersion = (lastVersion?.version_number || 0) + 1;

      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${organizationId}/${documentType}_v${nextVersion}_${Date.now()}.${fileExt}`;

      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from("contract-documents")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get signed URL (valid for 1 year)
      const { data: signedData } = await supabase.storage
        .from("contract-documents")
        .createSignedUrl(fileName, 365 * 24 * 60 * 60);

      if (signedData?.signedUrl) {
        // Save version to database
        const { error: versionError } = await supabase
          .from("contract_document_versions")
          .insert({
            organization_id: organizationId,
            document_type: documentType,
            file_url: signedData.signedUrl,
            file_name: file.name,
            file_size: file.size,
            version_number: nextVersion,
            uploaded_by: user?.id,
          });

        if (versionError) throw versionError;

        onUrlChange(signedData.signedUrl);
        refetchVersions();
        toast.success(`Documento v${nextVersion} carregado com sucesso`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao carregar documento";
      toast.error(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (!currentUrl) return;

    setIsDeleting(true);
    try {
      // Just clear the current URL, but keep the history
      onUrlChange(null);
      toast.success("Documento atual removido (histórico mantido)");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao remover documento";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestoreVersion = (url: string) => {
    onUrlChange(url);
    setShowHistory(false);
    toast.success("Versão restaurada");
  };

  const getFileName = (url: string) => {
    try {
      const path = url.split("/contract-documents/")[1]?.split("?")[0];
      if (path) {
        const parts = path.split("/");
        return parts[parts.length - 1];
      }
    } catch {
      // ignore
    }
    return "documento";
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5" />
        {label}
        {versionCount > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            ({versionCount} {versionCount === 1 ? "versão" : "versões"})
          </span>
        )}
      </Label>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        className="hidden"
      />

      {currentUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
            <FileText className="h-5 w-5 text-amber-600 shrink-0" />
            <span className="text-sm truncate flex-1" title={getFileName(currentUrl)}>
              {getFileName(currentUrl)}
            </span>
            <div className="flex gap-1 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                asChild
              >
                <a href={currentUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleRemove}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Nova versão
            </Button>
            {versionCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowHistory(true)}
              >
                <History className="h-3.5 w-3.5" />
                Histórico
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                A carregar...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Carregar documento
              </>
            )}
          </Button>
          {versionCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-muted-foreground"
              onClick={() => setShowHistory(true)}
            >
              <Clock className="h-3.5 w-3.5" />
              Ver {versionCount} {versionCount === 1 ? "versão anterior" : "versões anteriores"}
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        PDF, Word, JPEG ou PNG (máx. 10MB)
      </p>

      <ContractDocumentHistoryDialog
        organizationId={organizationId}
        documentType={documentType}
        label={label}
        open={showHistory}
        onOpenChange={setShowHistory}
        onRestoreVersion={handleRestoreVersion}
        currentUrl={currentUrl}
      />
    </div>
  );
}
