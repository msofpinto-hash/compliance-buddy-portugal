import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { openExternalUrl } from "@/lib/openExternalUrl";

type StatusFilter = "invalid" | "all";

export function InvalidUrlsTable() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("invalid");

  // Latest validation job
  const { data: latestJob } = useQuery({
    queryKey: ["invalid-urls-latest-job"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("id, started_at, status")
        .eq("sync_type", "validate_document_urls")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  const jobId = latestJob?.id;

  const { data: results, isLoading } = useQuery({
    queryKey: ["invalid-urls-results", jobId, statusFilter],
    enabled: !!jobId,
    queryFn: async () => {
      let q = supabase
        .from("url_validation_results")
        .select("id, number, title, document_url, status, status_code, error_message, cleared, checked_at, legislation_id")
        .eq("job_id", jobId!)
        .order("checked_at", { ascending: false })
        .limit(500);

      if (statusFilter === "invalid") {
        q = q.in("status", ["invalid", "timeout", "error"]);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime updates while a job is running
  useEffect(() => {
    if (!jobId) return;
    const channel = supabase
      .channel(`url-validation-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "url_validation_results", filter: `job_id=eq.${jobId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["invalid-urls-results", jobId, statusFilter] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, statusFilter, queryClient]);

  const statusBadge = (status: string, code?: number | null) => {
    const variant =
      status === "invalid" ? "destructive" :
      status === "timeout" ? "secondary" :
      status === "error" ? "outline" :
      status === "redirect" ? "secondary" : "default";
    return (
      <Badge variant={variant as any} className="font-mono text-[10px]">
        {status}{code ? ` ${code}` : ""}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              URLs inválidas / removidas
            </CardTitle>
            <CardDescription>
              {jobId ? (
                <>Resultados do último job de validação ({new Date(latestJob!.started_at).toLocaleString("pt-PT")})</>
              ) : (
                <>Sem jobs de validação registados ainda. Corre uma revalidação para preencher esta tabela.</>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              size="sm"
              variant={statusFilter === "invalid" ? "default" : "outline"}
              onClick={() => setStatusFilter("invalid")}
            >
              Só problemáticas
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              Todas
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !results || results.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            {jobId ? "Nenhum registo para o filtro atual." : "Sem dados."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[140px]">Número</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="w-[80px]">Limpa</TableHead>
                  <TableHead className="w-[140px] text-right">Auditar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{statusBadge(r.status, r.status_code)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.number || "—"}</TableCell>
                    <TableCell className="max-w-[420px] truncate" title={r.title || ""}>
                      {r.title || <span className="text-muted-foreground italic">sem título</span>}
                    </TableCell>
                    <TableCell>
                      {r.cleared ? (
                        <Badge variant="outline" className="text-[10px]">removida</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.document_url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openExternalUrl(r.document_url)}
                            title="Abrir URL original"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          title="Abrir diploma no admin"
                        >
                          <Link to={`/legislacao/${r.legislation_id}`}>
                            <FileText className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {results.length === 500 && (
              <div className="text-xs text-muted-foreground mt-2 text-center">
                A mostrar os 500 resultados mais recentes.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
