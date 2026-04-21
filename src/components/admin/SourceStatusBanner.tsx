import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, X, Zap, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SourceRow = {
  source_name: string;
  status: string;
  blocked_until: string | null;
  error_message: string | null;
  last_failure_at: string | null;
  last_success_at: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  dre_opendata: "DRE OpenData",
  dre_website: "DRE Web",
  firecrawl: "Firecrawl",
  eurlex: "EUR-Lex",
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = new Date(iso).getTime() - Date.now();
  const absMin = Math.round(Math.abs(diffMs) / 60000);
  if (absMin < 1) return diffMs > 0 ? "menos de 1 min" : "agora mesmo";
  if (absMin < 60) return `${absMin} min`;
  const absHr = Math.round(absMin / 60);
  if (absHr < 24) return `${absHr}h`;
  return `${Math.round(absHr / 24)}d`;
}

export function SourceStatusBanner() {
  const [dismissedAt, setDismissedAt] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? sessionStorage.getItem("source-status-banner-dismissed")
      : null
  );

  const { data: sources, refetch } = useQuery({
    queryKey: ["source-status-banner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_source_status")
        .select(
          "source_name, status, blocked_until, error_message, last_failure_at, last_success_at"
        );
      if (error) throw error;
      return (data ?? []) as SourceRow[];
    },
    refetchInterval: 60_000,
  });

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("source-status-banner")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "external_source_status" },
        () => refetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  if (!sources || sources.length === 0) return null;

  const dreOpenData = sources.find((s) => s.source_name === "dre_opendata");
  const dreWeb = sources.find((s) => s.source_name === "dre_website");
  const firecrawl = sources.find((s) => s.source_name === "firecrawl");

  const isBlocked = (s?: SourceRow) =>
    !!s &&
    (s.status === "offline" ||
      (s.blocked_until && new Date(s.blocked_until) > new Date()));
  const isDegraded = (s?: SourceRow) => s?.status === "degraded";

  const openDataDown = isBlocked(dreOpenData);
  const openDataDegraded = isDegraded(dreOpenData);

  // Nothing relevant happening → hide
  if (!openDataDown && !openDataDegraded) return null;

  // Allow per-state dismissal: dismissedAt encodes the state we dismissed
  const stateKey = `${dreOpenData?.status}-${dreOpenData?.blocked_until ?? ""}`;
  if (dismissedAt === stateKey) return null;

  const fallbackOk = !isBlocked(dreWeb) && !isBlocked(firecrawl);
  const blockedUntilLabel = dreOpenData?.blocked_until
    ? formatRelativeTime(dreOpenData.blocked_until)
    : null;

  const handleDismiss = () => {
    sessionStorage.setItem("source-status-banner-dismissed", stateKey);
    setDismissedAt(stateKey);
  };

  // Visual style by severity
  const isCritical = openDataDown;
  const containerClasses = isCritical
    ? "border-destructive/40 bg-destructive/5"
    : "border-amber-500/40 bg-amber-500/5";
  const iconClasses = isCritical ? "text-destructive" : "text-amber-600";
  const Icon = isCritical ? AlertTriangle : Clock;

  return (
    <div className="container mx-auto px-2 pt-3 sm:px-4">
      <div
        role="status"
        aria-live="polite"
        className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:gap-4 sm:p-4 ${containerClasses}`}
      >
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconClasses}`} aria-hidden="true" />

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {isCritical
                ? "DRE OpenData indisponível"
                : "DRE OpenData com falhas intermitentes"}
            </h3>
            <Badge
              variant={isCritical ? "destructive" : "secondary"}
              className="text-[10px] uppercase"
            >
              {dreOpenData?.status}
            </Badge>
            {blockedUntilLabel && isCritical && (
              <span className="text-xs text-muted-foreground">
                Próxima tentativa em {blockedUntilLabel}
              </span>
            )}
          </div>

          <p className="text-xs sm:text-sm text-muted-foreground">
            {isCritical
              ? "A API oficial não está a responder. As tarefas de correção continuam automaticamente através das fontes alternativas abaixo."
              : "A API oficial está a responder com erros pontuais. O sistema usa as fontes alternativas em caso de falha."}
          </p>

          {/* Fallback status row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Fallback ativo:
            </span>
            {[dreWeb, firecrawl].map((src) => {
              if (!src) return null;
              const ok = !isBlocked(src) && !isDegraded(src);
              const label = SOURCE_LABELS[src.source_name] ?? src.source_name;
              return (
                <span
                  key={src.source_name}
                  className="inline-flex items-center gap-1 text-xs"
                >
                  {ok ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5 text-emerald-600"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertTriangle
                      className="h-3.5 w-3.5 text-amber-600"
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-foreground">{label}</span>
                  <span className="text-muted-foreground">
                    ({ok ? "OK" : src.status})
                  </span>
                </span>
              );
            })}
            {!fallbackOk && (
              <Badge variant="destructive" className="text-[10px]">
                Fallback degradado
              </Badge>
            )}
          </div>

          {dreOpenData?.error_message && (
            <p className="text-[11px] text-muted-foreground/80 italic line-clamp-2">
              {dreOpenData.error_message}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Dispensar alerta"
          onClick={handleDismiss}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
