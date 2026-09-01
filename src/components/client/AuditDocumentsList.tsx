import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  auditId: string;
}

/** Documents attached to an audit / monthly legal compliance verification. */
export function AuditDocumentsList({ auditId }: Props) {
  const { toast } = useToast();
  const [opening, setOpening] = useState<string | null>(null);

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
        .filter(Boolean) as { id: string; name: string; file_url: string }[];
    },
  });

  const openDoc = async (doc: { id: string; name: string; file_url: string }) => {
    setOpening(doc.id);
    try {
      const path = doc.file_url.replace(/^.*requirement-documents\//, "");
      const { data, error } = await supabase.storage
        .from("requirement-documents")
        .createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
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
  if (!docs || docs.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        Documentos ({docs.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {docs.map((doc) => (
          <Button
            key={doc.id}
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={(e) => {
              e.stopPropagation();
              openDoc(doc);
            }}
            disabled={opening === doc.id}
          >
            {opening === doc.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="max-w-[260px] truncate">{doc.name}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
