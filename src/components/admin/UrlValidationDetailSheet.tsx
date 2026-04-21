import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { openExternalUrl } from "@/lib/openExternalUrl";

interface SelectedResult {
  id: string;
  legislation_id: string;
  document_url: string;
  number: string | null;
  title: string | null;
  status: string;
  status_code: number | null;
  error_message: string | null;
  cleared: boolean;
  checked_at: string;
}

interface Props {
  result: SelectedResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UrlValidationDetailSheet({ result, open, onOpenChange }: Props) {
  const legislationId = result?.legislation_id;

  // Full legislation details
  const { data: legislation, isLoading: loadingLeg } = useQuery({
    queryKey: ["url-detail-legislation", legislationId],
    enabled: !!legislationId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select(
          "id, number, title, entity, origin, source, summary, document_url, publication_date, effective_date, revocation_date, no_digital_version, created_at, updated_at"
        )
        .eq("id", legislationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Validation history (last 20 checks for this legislation)
  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["url-detail-history", legislationId],
    enabled: !!legislationId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("url_validation_results")
        .select("id, job_id, status, status_code, error_message, cleared, document_url, checked_at")
        .eq("legislation_id", legislationId!)
        .order("checked_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  // Processing failures registered for this legislation
  const { data: failures } = useQuery({
    queryKey: ["url-detail-failures", legislationId],
    enabled: !!legislationId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_processing_failures")
        .select("id, failure_type, failure_reason, source, error_details, retry_count, is_permanent, failed_at, retry_after")
        .eq("legislation_id", legislationId!)
        .order("failed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const statusBadge = (status: string, code?: number | null) => {
    const variant =
      status === "valid" ? "default" :
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

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleString("pt-PT") : "—";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col p-0">
        <SheetHeader className="p-6 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Detalhe da URL
          </SheetTitle>
          <SheetDescription>
            {result ? (
              <span className="font-mono text-xs">{result.number || "—"}</span>
            ) : (
              "Sem seleção"
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {!result ? (
              <div className="text-sm text-muted-foreground">Seleciona um registo para ver detalhes.</div>
            ) : (
              <>
                {/* Current check */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Última verificação
                  </h3>
                  <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      {statusBadge(result.status, result.status_code)}
                      <span className="text-xs text-muted-foreground">{fmtDate(result.checked_at)}</span>
                    </div>
                    <div className="text-sm font-medium">
                      {result.title || <span className="italic text-muted-foreground">sem título</span>}
                    </div>
                    {result.error_message && (
                      <div className="text-xs bg-destructive/5 border border-destructive/20 text-destructive rounded p-2 break-words">
                        {result.error_message}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {result.cleared && <Badge variant="outline">URL removida do diploma</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground break-all border-t pt-2">
                      {result.document_url}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openExternalUrl(result.document_url)}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Abrir URL
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/legislacao/${result.legislation_id}`}>
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          Abrir diploma
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Legislation metadata */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Metadados do diploma</h3>
                  {loadingLeg ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : legislation ? (
                    <div className="rounded-lg border p-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div className="text-muted-foreground">Número</div>
                      <div className="font-mono">{legislation.number || "—"}</div>

                      <div className="text-muted-foreground">Origem</div>
                      <div>{legislation.origin || "—"}</div>

                      <div className="text-muted-foreground">Entidade</div>
                      <div>{legislation.entity || "—"}</div>

                      <div className="text-muted-foreground">Fonte</div>
                      <div>{legislation.source || "—"}</div>

                      <div className="text-muted-foreground">Publicação</div>
                      <div>{legislation.publication_date || "—"}</div>

                      <div className="text-muted-foreground">Vigência</div>
                      <div>{legislation.effective_date || "—"}</div>

                      <div className="text-muted-foreground">Revogação</div>
                      <div>{legislation.revocation_date || "—"}</div>

                      <div className="text-muted-foreground">Sem v. digital</div>
                      <div>{legislation.no_digital_version ? "Sim" : "Não"}</div>

                      <div className="text-muted-foreground">Criado</div>
                      <div>{fmtDate(legislation.created_at)}</div>

                      <div className="text-muted-foreground">Atualizado</div>
                      <div>{fmtDate(legislation.updated_at)}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Diploma não encontrado.</div>
                  )}
                </section>

                <Separator />

                {/* Validation history */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Histórico de validações
                    {history && history.length > 0 && (
                      <Badge variant="secondary" className="ml-1">{history.length}</Badge>
                    )}
                  </h3>
                  {loadingHistory ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : !history || history.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Sem registos anteriores.</div>
                  ) : (
                    <div className="space-y-2">
                      {history.map((h: any) => (
                        <div
                          key={h.id}
                          className="rounded-md border p-2.5 text-xs space-y-1.5 bg-card"
                        >
                          <div className="flex items-center justify-between gap-2">
                            {statusBadge(h.status, h.status_code)}
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmtDate(h.checked_at)}
                            </span>
                          </div>
                          {h.error_message && (
                            <div className="text-destructive break-words">{h.error_message}</div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            {h.cleared && <Badge variant="outline" className="text-[10px]">limpa</Badge>}
                            {h.status === "valid" && (
                              <span className="text-primary inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> ok
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground break-all">{h.document_url}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {failures && failures.length > 0 && (
                  <>
                    <Separator />
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        Falhas de processamento registadas
                        <Badge variant="secondary">{failures.length}</Badge>
                      </h3>
                      <div className="space-y-2">
                        {failures.map((f: any) => (
                          <div key={f.id} className="rounded-md border p-2.5 text-xs space-y-1 bg-card">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {f.failure_type}
                              </Badge>
                              <span className="text-muted-foreground">{fmtDate(f.failed_at)}</span>
                            </div>
                            <div>{f.failure_reason}</div>
                            <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                              {f.source && <span>fonte: {f.source}</span>}
                              <span>tentativas: {f.retry_count}</span>
                              {f.is_permanent && <span className="text-destructive">permanente</span>}
                              {f.retry_after && <span>retry: {fmtDate(f.retry_after)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
