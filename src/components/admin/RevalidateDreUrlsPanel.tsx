import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Link2, Loader2, Play, CheckCircle2, AlertTriangle, RefreshCw,
  CheckCheck, XCircle, ArrowRightLeft, Timer, Bug, ExternalLink, Eye, RotateCcw, CalendarClock,
} from "lucide-react";

interface SyncLogRow {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_added: number | null;   // valid count (validate-document-urls semantics)
  items_updated: number | null; // invalid/cleared count
  error_message: string | null;
}

interface InvalidResult {
  id: string;
  legislation_id: string;
  number: string | null;
  title: string | null;
  document_url: string;
  status_code: number | null;
  error_message: string | null;
  cleared: boolean;
  checked_at: string;
}

function parseStats(msg: string | null) {
  const stats = { valid: 0, invalid: 0, redirect: 0, timeout: 0, error: 0 };
  if (!msg) return stats;
  const re = /(Valid|Invalid|Redirect|Timeout|Error):\s*(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg)) !== null) {
    const k = m[1].toLowerCase() as keyof typeof stats;
    stats[k] = parseInt(m[2], 10);
  }
  return stats;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT");
}

function duration(start: string, end: string | null) {
  const endMs = end ? new Date(end).getTime() : Date.now();
  const ms = endMs - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function RevalidateDreUrlsPanel() {
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState<number>(500);
  const [starting, setStarting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tick, setTick] = useState(0); // forces re-render for live duration

  // Latest job
  const { data: latestJob, refetch } = useQuery({
    queryKey: ["revalidate-dre-latest-job"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("*")
        .eq("sync_type", "validate_document_urls")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as SyncLogRow | null;
    },
    refetchInterval: 2000,
  });

  // Recent history (5)
  const { data: history } = useQuery({
    queryKey: ["revalidate-dre-history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("*")
        .eq("sync_type", "validate_document_urls")
        .order("started_at", { ascending: false })
        .limit(5);
      return (data || []) as SyncLogRow[];
    },
    refetchInterval: 5000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("revalidate-dre-urls-logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_logs", filter: "sync_type=eq.validate_document_urls" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["revalidate-dre-latest-job"] });
          queryClient.invalidateQueries({ queryKey: ["revalidate-dre-history"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const isRunning = latestJob?.status === "running";

  // Live timer for running jobs
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  const stats = useMemo(() => parseStats(latestJob?.error_message ?? null), [latestJob?.error_message]);
  const processed = latestJob?.items_processed || 0;
  const valid = latestJob?.items_added || stats.valid;
  const invalid = latestJob?.items_updated || stats.invalid;
  const redirects = stats.redirect;
  const timeouts = stats.timeout;
  const errors = stats.error;

  const targetTotal = isRunning ? limit : (processed || limit);
  const doneCount = processed || (valid + invalid + redirects + timeouts + errors);
  const progressPct = isRunning
    ? Math.min(99, Math.round((doneCount / Math.max(1, targetTotal)) * 100))
    : 100;

  // Invalid results for details dialog (current job)
  const { data: invalidResults, isLoading: loadingDetails } = useQuery({
    queryKey: ["revalidate-dre-invalid", latestJob?.id],
    queryFn: async () => {
      if (!latestJob?.id) return [];
      const { data } = await supabase
        .from("url_validation_results")
        .select("*")
        .eq("job_id", latestJob.id)
        .in("status", ["invalid", "error", "timeout"])
        .order("checked_at", { ascending: false })
        .limit(200);
      return (data || []) as InvalidResult[];
    },
    enabled: detailsOpen && !!latestJob?.id,
  });

  // Retry candidates: timeout/error from latest job (always loaded for the retry button)
  const { data: retryCandidates } = useQuery({
    queryKey: ["revalidate-dre-retry-candidates", latestJob?.id],
    queryFn: async () => {
      if (!latestJob?.id) return [] as { legislation_id: string }[];
      const { data } = await supabase
        .from("url_validation_results")
        .select("legislation_id")
        .eq("job_id", latestJob.id)
        .in("status", ["timeout", "error"])
        .limit(2000);
      return (data || []) as { legislation_id: string }[];
    },
    enabled: !!latestJob?.id && !isRunning,
  });

  // Global coverage across all DRE URLs ever validated
  const { data: coverage } = useQuery({
    queryKey: ["revalidate-dre-coverage"],
    queryFn: async () => {
      // Total DRE eligible
      const { count: totalDre } = await supabase
        .from("legislation")
        .select("id", { count: "exact", head: true })
        .not("document_url", "is", null)
        .neq("document_url", "")
        .or("origin.eq.PT,origin.eq.dre,origin.is.null")
        .or("no_digital_version.is.null,no_digital_version.eq.false");

      // Fetch all results ordered by checked_at DESC and keep only the most recent per legislation_id
      const pageSize = 1000;
      const latestByLeg = new Map<string, { status: string; checked_at: string }>();
      let from = 0;
      // Cap at 50k rows to avoid runaway loops
      for (let i = 0; i < 50; i++) {
        const { data: page, error } = await supabase
          .from("url_validation_results")
          .select("legislation_id,status,checked_at")
          .order("checked_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) break;
        const rows = page || [];
        for (const r of rows as any[]) {
          const prev = latestByLeg.get(r.legislation_id);
          if (!prev || new Date(r.checked_at) > new Date(prev.checked_at)) {
            latestByLeg.set(r.legislation_id, { status: r.status, checked_at: r.checked_at });
          }
        }
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      const totals = { valid: 0, redirect: 0, invalid: 0, timeout: 0, error: 0 };
      latestByLeg.forEach((v) => {
        if (v.status in totals) (totals as any)[v.status]++;
      });
      const checked = latestByLeg.size;
      return { totalDre: totalDre || 0, checked, ...totals };
    },
    refetchInterval: 15000,
  });

  // Latest scheduled (cron) revalidation run
  const { data: lastCronRun } = useQuery({
    queryKey: ["revalidate-dre-cron-last"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("id, status, started_at, completed_at, items_processed, items_added, items_updated, error_message")
        .eq("sync_type", "cron_revalidate_dre_urls")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as SyncLogRow | null;
    },
    refetchInterval: 30000,
  });

  // Compute next Sunday 03:00 UTC
  const nextCronRun = useMemo(() => {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      3, 0, 0, 0
    ));
    const dayOfWeek = next.getUTCDay(); // 0 = Sunday
    let daysUntilSunday = (7 - dayOfWeek) % 7;
    if (daysUntilSunday === 0 && now.getTime() >= next.getTime()) {
      daysUntilSunday = 7;
    }
    next.setUTCDate(next.getUTCDate() + daysUntilSunday);
    return next;
  }, []);

  const retryAvailable = retryCandidates?.length ?? 0;
  const [retryLimit, setRetryLimit] = useState<number>(200);
  useEffect(() => {
    if (retryAvailable > 0) setRetryLimit((prev) => Math.min(prev || 200, retryAvailable));
  }, [retryAvailable]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-document-urls", {
        body: { limit, dryRun: false, origin: "PT", background: true },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Falha ao iniciar");
      toast.success(`Revalidação iniciada para até ${limit} URLs do DRE`);
      refetch();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setStarting(false);
    }
  };

  const handleRetry = async () => {
    if (!retryCandidates || retryCandidates.length === 0) return;
    const ids = retryCandidates
      .map((r) => r.legislation_id)
      .slice(0, Math.max(1, Math.min(retryLimit, retryCandidates.length)));
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-document-urls", {
        body: { legislationIds: ids, limit: ids.length, dryRun: false, background: true },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Falha ao iniciar");
      toast.success(`A reprocessar ${ids.length} URLs com timeout/erro`);
      refetch();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Correção automática de URLs DRE
            </CardTitle>
            <CardDescription>
              Verifica em tempo real os URLs do Diário da República e remove os inválidos (404/410).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="grid grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5 col-span-1">
            <Label htmlFor="limit" className="text-xs text-muted-foreground">Quantidade a validar</Label>
            <Input
              id="limit"
              type="number"
              min={50}
              max={5000}
              step={50}
              value={limit}
              onChange={(e) => setLimit(Math.max(50, Math.min(5000, Number(e.target.value) || 500)))}
              disabled={isRunning}
              className="h-9"
            />
          </div>
          <div className="col-span-2">
            <Button onClick={handleStart} disabled={starting || isRunning} className="w-full h-9">
              {starting || isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isRunning ? "Revalidação em curso…" : "Iniciar correção"}
            </Button>
          </div>
        </div>

        {/* Global coverage */}
        {coverage && (
          <div className="rounded-lg border p-3 bg-gradient-to-br from-primary/5 to-transparent space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <CheckCheck className="h-4 w-4 text-primary" />
                Cobertura global do DRE
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{coverage.checked.toLocaleString("pt-PT")}</span>
                {" / "}
                {coverage.totalDre.toLocaleString("pt-PT")} URLs validadas
                {" "}
                <span className="font-semibold text-primary">
                  ({coverage.totalDre > 0 ? Math.round((coverage.checked / coverage.totalDre) * 100) : 0}%)
                </span>
              </div>
            </div>
            <Progress
              value={coverage.totalDre > 0 ? (coverage.checked / coverage.totalDre) * 100 : 0}
              className="h-2"
            />
            <div className="grid grid-cols-5 gap-2 text-center pt-1">
              <div className="rounded bg-background border p-1.5">
                <div className="text-sm font-bold text-primary">{coverage.valid.toLocaleString("pt-PT")}</div>
                <div className="text-[9px] text-muted-foreground uppercase">Válidas</div>
              </div>
              <div className="rounded bg-background border p-1.5">
                <div className="text-sm font-bold text-amber-600">{coverage.redirect.toLocaleString("pt-PT")}</div>
                <div className="text-[9px] text-muted-foreground uppercase">Redirect</div>
              </div>
              <div className="rounded bg-background border p-1.5">
                <div className="text-sm font-bold text-destructive">{coverage.invalid.toLocaleString("pt-PT")}</div>
                <div className="text-[9px] text-muted-foreground uppercase">Inválidas</div>
              </div>
              <div className="rounded bg-background border p-1.5">
                <div className="text-sm font-bold">{coverage.timeout.toLocaleString("pt-PT")}</div>
                <div className="text-[9px] text-muted-foreground uppercase">
                  Timeout {coverage.checked > 0 ? `(${((coverage.timeout / coverage.checked) * 100).toFixed(1)}%)` : ""}
                </div>
              </div>
              <div className="rounded bg-background border p-1.5">
                <div className="text-sm font-bold">{coverage.error.toLocaleString("pt-PT")}</div>
                <div className="text-[9px] text-muted-foreground uppercase">
                  Erro {coverage.checked > 0 ? `(${((coverage.error / coverage.checked) * 100).toFixed(1)}%)` : ""}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Scheduled (cron) revalidation banner */}
        <div className="rounded-lg border p-3 bg-gradient-to-br from-secondary/30 to-transparent space-y-1.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Revalidação automática semanal
            </div>
            <Badge variant="outline" className="text-[10px]">domingos 03:00 UTC</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-background border p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Última execução</div>
              {lastCronRun ? (
                <div className="space-y-0.5 mt-0.5">
                  <div className="font-medium">{fmtDate(lastCronRun.started_at)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {lastCronRun.status === "running"
                      ? `A correr — ${lastCronRun.items_processed || 0} lotes despachados`
                      : `${lastCronRun.items_added || 0} jobs · ${lastCronRun.items_updated || 0} URLs alvo`}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground mt-0.5">Ainda não correu</div>
              )}
            </div>
            <div className="rounded bg-background border p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Próxima execução</div>
              <div className="font-medium mt-0.5">{fmtDate(nextCronRun.toISOString())}</div>
              <div className="text-[11px] text-muted-foreground">
                {Math.ceil((nextCronRun.getTime() - Date.now()) / (24 * 60 * 60 * 1000))} dia(s)
              </div>
            </div>
          </div>
        </div>

        {!isRunning && retryAvailable > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <RotateCcw className="h-4 w-4 text-amber-700" />
              <span className="font-medium text-amber-900">
                {retryAvailable} URL{retryAvailable === 1 ? "" : "s"} com timeout/erro na última execução
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="col-span-1 space-y-1">
                <Label htmlFor="retryLimit" className="text-[11px] text-muted-foreground">Quantidade a reprocessar</Label>
                <Input
                  id="retryLimit"
                  type="number"
                  min={1}
                  max={retryAvailable}
                  step={50}
                  value={retryLimit}
                  onChange={(e) => setRetryLimit(Math.max(1, Math.min(retryAvailable, Number(e.target.value) || 1)))}
                  disabled={starting}
                  className="h-8"
                />
              </div>
              <div className="col-span-2">
                <Button
                  onClick={handleRetry}
                  disabled={starting || retryAvailable === 0}
                  variant="outline"
                  className="w-full h-8 border-amber-400 hover:bg-amber-100"
                >
                  {starting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5 mr-2" />
                  )}
                  Tentar novamente ({Math.min(retryLimit, retryAvailable)})
                </Button>
              </div>
            </div>
          </div>
        )}
        {latestJob && (
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30" data-tick={tick}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : latestJob.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm font-medium">
                  {isRunning ? "Em progresso" : latestJob.status === "completed" ? "Concluído" : "Erro"}
                </span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {latestJob.id.slice(0, 8)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{fmtDate(latestJob.started_at)}</span>
                <Badge variant="secondary" className="gap-1">
                  <Timer className="h-3 w-3" />
                  {duration(latestJob.started_at, latestJob.completed_at)}
                </Badge>
              </div>
            </div>

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">
                  {doneCount.toLocaleString("pt-PT")} / {targetTotal.toLocaleString("pt-PT")} URLs
                </span>
                <span className="font-medium">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>

            {/* Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              <div className="rounded-md bg-background p-2 border">
                <CheckCheck className="h-4 w-4 mx-auto text-primary mb-1" />
                <div className="text-lg font-bold text-primary">{valid.toLocaleString("pt-PT")}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Válidas</div>
              </div>
              <div className="rounded-md bg-background p-2 border">
                <ArrowRightLeft className="h-4 w-4 mx-auto text-amber-600 mb-1" />
                <div className="text-lg font-bold text-amber-600">{redirects.toLocaleString("pt-PT")}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Redirect</div>
              </div>
              <div className="rounded-md bg-background p-2 border">
                <XCircle className="h-4 w-4 mx-auto text-destructive mb-1" />
                <div className="text-lg font-bold text-destructive">{invalid.toLocaleString("pt-PT")}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Limpas</div>
              </div>
              <div className="rounded-md bg-background p-2 border">
                <Timer className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <div className="text-lg font-bold">{timeouts.toLocaleString("pt-PT")}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Timeout</div>
              </div>
              <div className="rounded-md bg-background p-2 border">
                <Bug className="h-4 w-4 mx-auto text-destructive mb-1" />
                <div className="text-lg font-bold">{errors.toLocaleString("pt-PT")}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Erros</div>
              </div>
            </div>

            {/* Details + raw message */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {latestJob.error_message && (
                <div className="text-[11px] text-muted-foreground font-mono truncate flex-1 min-w-0">
                  {latestJob.error_message}
                </div>
              )}
              <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Ver detalhes
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Detalhes da execução</DialogTitle>
                    <DialogDescription>
                      Job <span className="font-mono">{latestJob.id.slice(0, 8)}</span> · iniciado {fmtDate(latestJob.started_at)} · duração {duration(latestJob.started_at, latestJob.completed_at)}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      <div className="rounded bg-muted p-2"><div className="font-bold text-primary">{valid}</div>Válidas</div>
                      <div className="rounded bg-muted p-2"><div className="font-bold text-amber-600">{redirects}</div>Redirect</div>
                      <div className="rounded bg-muted p-2"><div className="font-bold text-destructive">{invalid}</div>Limpas</div>
                      <div className="rounded bg-muted p-2"><div className="font-bold">{timeouts}</div>Timeout</div>
                      <div className="rounded bg-muted p-2"><div className="font-bold">{errors}</div>Erros</div>
                    </div>
                    <div className="text-sm font-medium">
                      URLs com problema {invalidResults ? `(${invalidResults.length})` : ""}
                    </div>
                    <ScrollArea className="h-[400px] rounded border">
                      {loadingDetails ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> A carregar…
                        </div>
                      ) : !invalidResults || invalidResults.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                          Sem URLs com problemas nesta execução.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {invalidResults.map((r) => (
                            <div key={r.id} className="p-2.5 text-xs space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="destructive" className="text-[10px]">
                                  {r.status_code || "ERR"}
                                </Badge>
                                {r.cleared && <Badge variant="outline" className="text-[10px]">Removido</Badge>}
                                <span className="font-medium truncate">{r.number || "—"}</span>
                                <span className="text-muted-foreground truncate">{r.title || ""}</span>
                              </div>
                              <a
                                href={r.document_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline break-all flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                {r.document_url}
                              </a>
                              {r.error_message && (
                                <div className="text-destructive break-words">{r.error_message}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {/* History strip */}
        {history && history.length > 1 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Execuções recentes</div>
            <div className="space-y-1">
              {history.slice(1).map((h) => {
                const s = parseStats(h.error_message);
                return (
                  <div key={h.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded border bg-background">
                    <div className="flex items-center gap-2 min-w-0">
                      {h.status === "completed" ? (
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      <span className="text-muted-foreground truncate">{fmtDate(h.started_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-primary">{(h.items_added || s.valid)}✓</span>
                      <span className="text-amber-600">{s.redirect}↗</span>
                      <span className="text-destructive">{(h.items_updated || s.invalid)}✗</span>
                      <Badge variant="outline" className="text-[10px]">{duration(h.started_at, h.completed_at)}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
