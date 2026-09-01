import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Download, Loader2, Eye } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  auditId: string;
  /** Render as an embedded block inside a dialog (no outer card styling) */
  variant?: "card" | "plain";
}

type Doc = { id: string; name: string; file_url: string };

/** Documents attached to an audit / monthly legal compliance verification. */
export function AuditDocumentsList({ auditId, variant = "card" }: Props) {
  const { toast } = useToast();
  const [opening, setOpening] = useState<string | null>(null);
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

  if (isLoading) return null;

  if (!docs || docs.length === 0) {
    if (variant === "plain") {
      return (
        <p className="text-sm text-muted-foreground">
          Sem documentação associada a esta auditoria.
        </p>
      );
    }
    return null;
  }

  const body = (
    <div className="space-y-2">
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
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <>
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
