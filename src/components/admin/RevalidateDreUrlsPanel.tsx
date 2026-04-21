import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link2, Loader2, Play, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

interface SyncLogRow {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_added: number | null;
  items_updated: number | null;
  error_message: string | null;
}

export function RevalidateDreUrlsPanel() {
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState<number>(500);
  const [starting, setStarting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Fetch latest job (running or recent)
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

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel("revalidate-dre-urls-logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_logs", filter: "sync_type=eq.validate_document_urls" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["revalidate-dre-latest-job"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const isRunning = latestJob?.status === "running";

  const handleStart = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-document-urls", {
        body: { limit, dryRun: false, origin: "PT", background: true },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Falha ao iniciar");
      toast.success(`Revalidação iniciada para até ${limit} URLs do DRE`);
      setActiveJobId(data?.jobId || null);
      refetch();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setStarting(false);
    }
  };

  const processed = latestJob?.items_processed || 0;
  const fixed = latestJob?.items_updated || 0;
  const broken = latestJob?.items_added || 0;
  const progressPct = isRunning && limit > 0 ? Math.min(100, Math.round((processed / limit) * 100)) : 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Revalidar URLs DRE
            </CardTitle>
            <CardDescription>
              Verifica em tempo real quais URLs do Diário da República estão acessíveis e remove as inválidas (404/410).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <Button
              onClick={handleStart}
              disabled={starting || isRunning}
              className="w-full h-9"
            >
              {starting || isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isRunning ? "Revalidação em curso…" : "Revalidar agora"}
            </Button>
          </div>
        </div>

        {/* Live status */}
        {latestJob && (
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
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
              </div>
              <Badge variant={isRunning ? "secondary" : "outline"}>
                {new Date(latestJob.started_at).toLocaleString("pt-PT")}
              </Badge>
            </div>

            {isRunning && (
              <div>
                <Progress value={progressPct} className="h-2" />
                <div className="text-xs text-muted-foreground mt-1">{progressPct}%</div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-background p-2">
                <div className="text-lg font-bold">{processed.toLocaleString("pt-PT")}</div>
                <div className="text-xs text-muted-foreground">Processados</div>
              </div>
              <div className="rounded-md bg-background p-2">
                <div className="text-lg font-bold text-primary">{fixed.toLocaleString("pt-PT")}</div>
                <div className="text-xs text-muted-foreground">Válidos / corrigidos</div>
              </div>
              <div className="rounded-md bg-background p-2">
                <div className="text-lg font-bold text-destructive">{broken.toLocaleString("pt-PT")}</div>
                <div className="text-xs text-muted-foreground">Inválidos / removidos</div>
              </div>
            </div>

            {latestJob.error_message && (
              <div className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
                {latestJob.error_message}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
