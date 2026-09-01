import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type ApprovalStatus = "pending" | "approved" | "rejected";
type Action = "approved" | "rejected" | "reset";

interface SourceRow {
  id: string;
  source_name: string;
  display_name: string | null;
  base_url: string | null;
  status: string;
  is_official: boolean;
  approval_status: string;
  approval_reason: string | null;
  approved_at: string | null;
}

interface HistoryRow {
  id: string;
  source_id: string;
  source_name: string;
  action: string;
  reason: string | null;
  created_at: string;
}

const STATUS_META: Record<ApprovalStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  approved: {
    label: "Aprovada",
    className: "border-primary/40 bg-primary/10 text-primary",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejeitada",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  pending: {
    label: "Pendente",
    className: "border-muted-foreground/30 bg-muted text-muted-foreground",
    icon: Clock,
  },
};

const ACTION_LABEL: Record<Action, string> = {
  approved: "Aprovada",
  rejected: "Rejeitada",
  reset: "Reposta a pendente",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

export default function FontesOficiais() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ source: SourceRow; action: Action } | null>(null);
  const [reason, setReason] = useState("");

  const { data: sources, isLoading } = useQuery({
    queryKey: ["official-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_source_status")
        .select(
          "id, source_name, display_name, base_url, status, is_official, approval_status, approval_reason, approved_at",
        )
        .order("source_name");
      if (error) throw error;
      return (data ?? []) as SourceRow[];
    },
  });

  const { data: history } = useQuery({
    queryKey: ["source-approval-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("source_approval_history")
        .select("id, source_id, source_name, action, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ source, action, why }: { source: SourceRow; action: Action; why: string }) => {
      const { error: updateError } = await supabase
        .from("external_source_status")
        .update({
          approval_status: action === "reset" ? "pending" : action,
          approval_reason: why || null,
          approved_by: action === "approved" ? user?.id ?? null : null,
          approved_at: action === "approved" ? new Date().toISOString() : null,
          is_official: action === "approved",
        })
        .eq("id", source.id);
      if (updateError) throw updateError;

      const { error: historyError } = await supabase.from("source_approval_history").insert({
        source_id: source.id,
        source_name: source.source_name,
        action,
        reason: why || null,
        performed_by: user?.id ?? null,
      });
      if (historyError) throw historyError;
    },
    onSuccess: () => {
      toast.success("Decisão registada no histórico");
      queryClient.invalidateQueries({ queryKey: ["official-sources"] });
      queryClient.invalidateQueries({ queryKey: ["source-approval-history"] });
      setPending(null);
      setReason("");
    },
    onError: (error: Error) => toast.error(error.message || "Não foi possível registar a decisão"),
  });

  const openDialog = (source: SourceRow, action: Action) => {
    setPending({ source, action });
    setReason("");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Voltar à administração
          </Link>
        </Button>

        <header className="mb-8">
          <h1 className="flex items-center gap-2 font-heading text-3xl font-bold text-foreground">
            <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
            Fontes oficiais
          </h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Aprove ou rejeite as fontes externas de legislação. Apenas fontes aprovadas são apresentadas como
            oficiais na plataforma e nos diálogos de IA. Todas as decisões ficam registadas com motivo.
          </p>
        </header>

        <section aria-labelledby="lista-fontes" className="mb-10">
          <h2 id="lista-fontes" className="sr-only">
            Lista de fontes
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sources?.map((source) => {
                const key = (["approved", "rejected"].includes(source.approval_status)
                  ? source.approval_status
                  : "pending") as ApprovalStatus;
                const meta = STATUS_META[key];
                const StatusIcon = meta.icon;
                return (
                  <Card key={source.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">
                            {source.display_name || source.source_name}
                          </CardTitle>
                          <CardDescription className="mt-1 font-mono text-xs">
                            {source.source_name}
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={meta.className}>
                            <StatusIcon className="mr-1 h-3 w-3" aria-hidden="true" />
                            {meta.label}
                          </Badge>
                          {source.is_official && (
                            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                              <BadgeCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                              Oficial
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {source.base_url && (
                        <a
                          href={source.base_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {source.base_url}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                      <dl className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <dt className="text-muted-foreground">Disponibilidade</dt>
                          <dd className="font-medium capitalize">{source.status}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Última decisão</dt>
                          <dd className="font-medium">{formatDate(source.approved_at)}</dd>
                        </div>
                      </dl>
                      {source.approval_reason && (
                        <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Motivo: </span>
                          {source.approval_reason}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => openDialog(source, "approved")}
                          disabled={source.approval_status === "approved"}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openDialog(source, "rejected")}
                          disabled={source.approval_status === "rejected"}
                        >
                          <XCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                          Rejeitar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDialog(source, "reset")}
                          disabled={source.approval_status === "pending"}
                        >
                          <Clock className="mr-1 h-4 w-4" aria-hidden="true" />
                          Repor pendente
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="historico">
          <Card>
            <CardHeader>
              <CardTitle id="historico" className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5 text-primary" aria-hidden="true" />
                Histórico de aprovações
              </CardTitle>
              <CardDescription>Registo imutável das decisões tomadas sobre cada fonte.</CardDescription>
            </CardHeader>
            <CardContent>
              {!history?.length ? (
                <p className="text-sm text-muted-foreground">Ainda não existem decisões registadas.</p>
              ) : (
                <ul className="divide-y">
                  {history.map((entry) => {
                    const action = (["approved", "rejected", "reset"].includes(entry.action)
                      ? entry.action
                      : "reset") as Action;
                    return (
                      <li key={entry.id} className="flex flex-wrap items-start gap-3 py-3">
                        <Badge
                          variant="outline"
                          className={
                            action === "approved"
                              ? STATUS_META.approved.className
                              : action === "rejected"
                                ? STATUS_META.rejected.className
                                : STATUS_META.pending.className
                          }
                        >
                          {ACTION_LABEL[action]}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {sources?.find((s) => s.id === entry.source_id)?.display_name || entry.source_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {entry.reason || "Sem motivo indicado"}
                          </p>
                        </div>
                        <time className="text-xs text-muted-foreground" dateTime={entry.created_at}>
                          {formatDate(entry.created_at)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.action === "approved"
                ? "Aprovar fonte"
                : pending?.action === "rejected"
                  ? "Rejeitar fonte"
                  : "Repor fonte a pendente"}
            </DialogTitle>
            <DialogDescription>
              {pending?.source.display_name || pending?.source.source_name} — indique o motivo da decisão. Fica
              registado no histórico.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo da decisão (ex.: fonte oficial do Estado português, publicação com valor legal)"
            rows={4}
            aria-label="Motivo da decisão"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!reason.trim() || decide.isPending}
              onClick={() =>
                pending && decide.mutate({ source: pending.source, action: pending.action, why: reason.trim() })
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
