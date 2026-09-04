import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Download, Loader2, Eye, Trash2, RefreshCw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
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

interface Props {
  auditId: string;
  /** Render as an embedded block inside a dialog (no outer card styling) */
  variant?: "card" | "plain";
  /** Allow admins to attach new files (e.g. atas mensais) */
  allowUpload?: boolean;
  /** Label used in the upload button */
  uploadLabel?: string;
}

type Doc = { id: string; name: string; file_url: string };

/** Documents attached to an audit / monthly legal compliance verification. */
export function AuditDocumentsList({
  auditId,
  variant = "card",
  allowUpload = false,
  uploadLabel = "Anexar documentos",
}: Props) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Doc | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState<Doc | null>(null);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(
    null,
  );

  const { data: docs, isLoading } = useQuery({
    queryKey: ["audit-documents", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_documents")
        .select("id, document_id, documents(id, name, file_url)")
        .eq("audit_id", auditId);
      if (error) throw error;
      return (data || [])
        .map((row: any) => row.documents)
        .filter(Boolean) as Doc[];
    },
  });

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    try {
      const { data: audit, error: aErr } = await supabase
        .from("audits")
        .select("organization_id")
        .eq("id", auditId)
        .maybeSingle();
      if (aErr) throw aErr;
      if (!audit?.organization_id) throw new Error("Auditoria sem organização");

      for (const file of Array.from(files)) {
        const path = `audits/${auditId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage
          .from("requirement-documents")
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: docRow, error: docErr } = await supabase
          .from("documents")
          .insert({
            organization_id: audit.organization_id,
            name: file.name,
            file_url: path,
            category: "auditoria",
          })
          .select("id")
          .single();
        if (docErr) throw docErr;
        const { error: linkErr } = await supabase
          .from("audit_documents")
          .insert({ audit_id: auditId, document_id: docRow.id });
        if (linkErr) throw linkErr;
      }
      toast({
        title: "Documentos anexados",
        description: `${files.length} ficheiro(s) associados à verificação`,
      });
      queryClient.invalidateQueries({ queryKey: ["audit-documents", auditId] });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro",
        description: err?.message || "Não foi possível anexar os documentos",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const canUpload = allowUpload && isAdmin;

  const uploadBar = canUpload ? (
    <div className="flex items-center gap-2">
      <input
        ref={uploadInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          e.target.value = "";
          if (files && files.length) handleUpload(files);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={uploading}
        onClick={() => uploadInput.current?.click()}
      >
        {uploading ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="mr-1 h-3.5 w-3.5" />
        )}
        {uploadLabel}
      </Button>
    </div>
  ) : null;

  const signedUrl = async (doc: Doc) => {
    const path = doc.file_url.replace(/^.*requirement-documents\//, "");
    const { data, error } = await supabase.storage
      .from("requirement-documents")
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw error ?? new Error("sem URL");
    return data.signedUrl;
  };

  const run = async (doc: Doc, mode: "preview" | "download") => {
    setOpening(doc.id + mode);
    try {
      const url = await signedUrl(doc);
      if (mode === "preview") setPreview({ name: doc.name, url });
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro",
        description: "Não foi possível abrir o documento",
        variant: "destructive",
      });
    } finally {
      setOpening(null);
    }
  };

  const storagePath = (doc: Doc) =>
    doc.file_url.replace(/^.*requirement-documents\//, "");

  const handleDelete = async (doc: Doc) => {
    setBusy(doc.id);
    try {
      await supabase.storage
        .from("requirement-documents")
        .remove([storagePath(doc)]);
      await supabase.from("audit_documents").delete().eq("audit_id", auditId).eq("document_id", doc.id);
      await supabase.from("audit_requirement_documents").delete().eq("document_id", doc.id);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
      toast({ title: "Anexo eliminado", description: doc.name });
      queryClient.invalidateQueries({ queryKey: ["audit-documents", auditId] });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro", description: "Não foi possível eliminar o anexo", variant: "destructive" });
    } finally {
      setBusy(null);
      setToDelete(null);
    }
  };

  const handleReplaceFile = async (file: File) => {
    const doc = replacing;
    if (!doc) return;
    setBusy(doc.id);
    try {
      const path = `audits/${auditId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("requirement-documents")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("documents")
        .update({ name: file.name, file_url: path })
        .eq("id", doc.id);
      if (error) throw error;
      await supabase.storage.from("requirement-documents").remove([storagePath(doc)]);
      toast({ title: "Anexo substituído", description: file.name });
      queryClient.invalidateQueries({ queryKey: ["audit-documents", auditId] });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro", description: "Não foi possível substituir o anexo", variant: "destructive" });
    } finally {
      setBusy(null);
      setReplacing(null);
    }
  };

  if (isLoading) return null;

  if (!docs || docs.length === 0) {
    if (variant === "plain" || canUpload) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Sem documentação associada a esta verificação.
          </p>
          {uploadBar}
        </div>
      );
    }
    return null;
  }

  const body = (
    <div className="space-y-2">
      {uploadBar}
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{doc.name}</span>
          </span>
          <span className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                run(doc, "preview");
              }}
              disabled={opening === doc.id + "preview"}
            >
              {opening === doc.id + "preview" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="mr-1 h-3.5 w-3.5" />
              )}
              Pré-visualizar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                run(doc, "download");
              }}
              disabled={opening === doc.id + "download"}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Exportar
            </Button>
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === doc.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setReplacing(doc);
                    replaceInput.current?.click();
                  }}
                  title="Substituir anexo"
                >
                  {busy === doc.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  )}
                  Substituir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy === doc.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete(doc);
                  }}
                  title="Eliminar anexo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {isAdmin && (
        <input
          ref={replaceInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleReplaceFile(file);
          }}
        />
      )}
      {variant === "card" ? (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Documentos ({docs.length})
          </p>
          {body}
        </div>
      ) : (
        body
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              O ficheiro "{toDelete?.name}" será removido permanentemente desta auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && handleDelete(toDelete)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate text-base">
              {preview?.name}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-2">
              <iframe
                src={preview.url}
                title={preview.name}
                className="h-[70vh] w-full rounded-md border bg-background"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(preview.url, "_blank", "noopener,noreferrer")
                  }
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Exportar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
