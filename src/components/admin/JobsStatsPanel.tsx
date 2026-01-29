import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Activity, CheckCircle2, Hash, Loader2, RefreshCw, Timer, XCircle } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

type SyncLogRow = {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_added: number | null;
  items_updated: number | null;
  error_message: string | null;
};

type TypeBreakdownRow = {
  syncType: string;
  total: number;
  failed: number;
};

function statusBadge(status: string) {
  if (status === "completed") return <Badge variant="secondary">completed</Badge>;
  if (status === "running") return <Badge>running</Badge>;
  if (status === "failed" || status === "completed_with_errors" || status === "completed_timeout") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function avg(values: number[]) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function JobsStatsPanel() {
  const sinceIso = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);

  const query = useQuery({
    queryKey: ["jobs-stats", { sinceIso }],
    queryFn: async () => {
      const [runningRes, completedRes, failedRes, recentRes] = await Promise.all([
        supabase.from("sync_logs").select("id", { count: "exact", head: true }).eq("status", "running"),
        supabase
          .from("sync_logs")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("started_at", sinceIso),
        supabase
          .from("sync_logs")
          .select("id", { count: "exact", head: true })
          .in("status", ["failed", "completed_with_errors", "completed_timeout"])
          .gte("started_at", sinceIso),
        supabase
          .from("sync_logs")
          .select(
            "id,sync_type,status,started_at,completed_at,items_processed,items_added,items_updated,error_message"
          )
          .gte("started_at", sinceIso)
          .order("started_at", { ascending: false })
          .limit(200),
      ]);

      if (runningRes.error) throw runningRes.error;
      if (completedRes.error) throw completedRes.error;
      if (failedRes.error) throw failedRes.error;
      if (recentRes.error) throw recentRes.error;

      const recent = (recentRes.data ?? []) as SyncLogRow[];
      const completedDurationsSec = recent
        .filter((r) => r.status === "completed" && r.completed_at)
        .map((r) => (new Date(r.completed_at as string).getTime() - new Date(r.started_at).getTime()) / 1000)
        .filter((v) => Number.isFinite(v) && v >= 0);

      const avgDurationSec = avg(completedDurationsSec);

      const byType = new Map<string, { total: number; failed: number }>();
      for (const r of recent) {
        const key = r.sync_type;
        const cur = byType.get(key) ?? { total: 0, failed: 0 };
        cur.total += 1;
        if (r.status === "failed" || r.status === "completed_with_errors" || r.status === "completed_timeout") {
          cur.failed += 1;
        }
        byType.set(key, cur);
      }

      const breakdown: TypeBreakdownRow[] = [...byType.entries()]
        .map(([syncType, v]) => ({ syncType, total: v.total, failed: v.failed }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

      return {
        runningNow: runningRes.count ?? 0,
        completed24h: completedRes.count ?? 0,
        failed24h: failedRes.count ?? 0,
        avgDurationSec,
        lastJob: recent[0] ?? null,
        breakdown,
      };
    },
    refetchInterval: (q) => {
      const d = q.state.data as
        | {
            runningNow: number;
          }
        | undefined;
      return (d?.runningNow ?? 0) > 0 ? 5000 : 30000;
    },
  });

  const data = query.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Estatísticas de Jobs
            </CardTitle>
            <CardDescription className="mt-1">
              Últimas 24h (com atualização automática quando há jobs em execução)
            </CardDescription>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="shrink-0"
          >
            {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Top stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Loader2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums">{data?.runningNow ?? (query.isLoading ? "…" : 0)}</div>
                  <div className="text-sm text-muted-foreground">A correr agora</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums">{data?.completed24h ?? (query.isLoading ? "…" : 0)}</div>
                  <div className="text-sm text-muted-foreground">Completed (24h)</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums">{data?.failed24h ?? (query.isLoading ? "…" : 0)}</div>
                  <div className="text-sm text-muted-foreground">Falhas (24h)</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {data?.avgDurationSec != null
                      ? `${Math.round(data.avgDurationSec)}s`
                      : query.isLoading
                        ? "…"
                        : "—"}
                  </div>
                  <div className="text-sm text-muted-foreground">Duração média</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Last job */}
        <div className="rounded-lg border bg-card p-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs truncate">{data?.lastJob?.sync_type ?? "—"}</span>
                {data?.lastJob?.status ? statusBadge(data.lastJob.status) : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data?.lastJob?.started_at
                  ? `Iniciado ${formatDistanceToNow(parseISO(data.lastJob.started_at), { addSuffix: true, locale: pt })}`
                  : "Sem execuções recentes"}
                {data?.lastJob?.items_processed != null ? ` • processed: ${data.lastJob.items_processed}` : ""}
                {data?.lastJob?.items_updated != null ? ` • updated: ${data.lastJob.items_updated}` : ""}
                {data?.lastJob?.items_added != null ? ` • added: ${data.lastJob.items_added}` : ""}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Top tipos (últimas 24h)</div>
            <div className="text-xs text-muted-foreground">total / falhas</div>
          </div>

          {query.isLoading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : data?.breakdown?.length ? (
            <div className="space-y-2">
              {(() => {
                const max = Math.max(...data.breakdown.map((b) => b.total));
                return data.breakdown.map((row) => {
                  const pct = max > 0 ? (row.total / max) * 100 : 0;
                  return (
                    <div key={row.syncType} className="rounded-md border bg-card p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs truncate">{row.syncType}</div>
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground shrink-0">
                          {row.total} / {row.failed}
                        </div>
                      </div>
                      <div className="mt-2">
                        <Progress value={pct} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Sem dados nas últimas 24h.</div>
          )}
        </div>

        {query.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Erro a carregar estatísticas: {(query.error as Error).message}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
