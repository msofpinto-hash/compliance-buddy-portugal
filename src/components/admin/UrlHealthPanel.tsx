import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Link,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Shield,
  Search,
  Wrench,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Extend lucide with missing icons
const LinkBreakIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
    <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
    <line x1="8" x2="8" y1="2" y2="5" />
    <line x1="2" x2="5" y1="8" y2="8" />
    <line x1="16" x2="16" y1="19" y2="22" />
    <line x1="19" x2="22" y1="16" y2="16" />
  </svg>
);

export function UrlHealthPanel() {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<string>("all");
  const [mode, setMode] = useState<string>("all");

  // Fetch URL health statistics using RPC for accurate counts
  const { data: stats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["url-health-stats"],
    queryFn: async () => {
      // Use separate queries with proper filtering
      const [
        withUrlResult,
        withoutUrlResult,
        ptWithUrlResult,
        ptWithoutUrlResult,
        euWithUrlResult,
        euWithoutUrlResult,
        noDigitalResult,
      ] = await Promise.all([
        // With URL (not null and not empty)
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .not("document_url", "is", null)
          .neq("document_url", ""),
        // Without URL (null or empty) AND not marked as no_digital_version
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .or("document_url.is.null,document_url.eq.")
          .neq("no_digital_version", true),
        // PT with URL
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .in("origin", ["PT", "dre"])
          .not("document_url", "is", null)
          .neq("document_url", ""),
        // PT without URL
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .in("origin", ["PT", "dre"])
          .or("document_url.is.null,document_url.eq.")
          .neq("no_digital_version", true),
        // EU with URL
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .in("origin", ["EU", "eurlex"])
          .not("document_url", "is", null)
          .neq("document_url", ""),
        // EU without URL
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .in("origin", ["EU", "eurlex"])
          .or("document_url.is.null,document_url.eq.")
          .neq("no_digital_version", true),
        // Marked as no digital version
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .eq("no_digital_version", true),
      ]);

      return {
        withUrl: withUrlResult.count || 0,
        withoutUrl: withoutUrlResult.count || 0,
        ptWithUrl: ptWithUrlResult.count || 0,
        ptWithoutUrl: ptWithoutUrlResult.count || 0,
        euWithUrl: euWithUrlResult.count || 0,
        euWithoutUrl: euWithoutUrlResult.count || 0,
        noDigitalVersion: noDigitalResult.count || 0,
      };
    },
    refetchInterval: 30000,
  });

  // Check for running URL fix job
  const { data: runningJob } = useQuery({
    queryKey: ["url-fix-running-job"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("*")
        .eq("sync_type", "fix_broken_urls")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 3000,
  });

  // Start URL fix mutation
  const fixUrlsMutation = useMutation({
    mutationFn: async (params: { origin?: string; mode: string; limit: number }) => {
      const { data, error } = await supabase.functions.invoke("fix-broken-urls", {
        body: {
          origin: params.origin === "all" ? undefined : params.origin,
          mode: params.mode,
          limit: params.limit,
          background: true,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Job iniciado: ${data.total} diplomas a processar`);
      queryClient.invalidateQueries({ queryKey: ["url-fix-running-job"] });
      queryClient.invalidateQueries({ queryKey: ["active-jobs-banner"] });
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const total = (stats?.withUrl || 0) + (stats?.withoutUrl || 0);
  const coveragePercent = total > 0 ? Math.round((stats?.withUrl || 0) / total * 100) : 0;

  const handleStartFix = () => {
    const limit = mode === "recover" ? 200 : 100;
    fixUrlsMutation.mutate({
      origin: origin === "all" ? undefined : origin,
      mode,
      limit,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Saúde de URLs
            </CardTitle>
            <CardDescription>
              Monitorização e correção de links para documentos legislativos
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Running job indicator */}
        {runningJob && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <div className="flex-1">
              <div className="text-sm font-medium">Correção de URLs em progresso</div>
              <div className="text-xs text-muted-foreground">
                {runningJob.items_processed || 0} processados • {runningJob.items_added || 0} recuperados
              </div>
            </div>
            <Badge variant="secondary">Em curso</Badge>
          </div>
        )}

        {/* Overall Coverage */}
        <div className="p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-medium">Cobertura de URLs</span>
            </div>
            <span className={`text-2xl font-bold ${coveragePercent >= 80 ? "text-green-600" : coveragePercent >= 50 ? "text-amber-600" : "text-red-600"}`}>
              {coveragePercent}%
            </span>
          </div>
          <Progress value={coveragePercent} className="h-2 mb-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{stats?.withUrl?.toLocaleString("pt-PT")} com URL</span>
            <span>{stats?.withoutUrl?.toLocaleString("pt-PT")} sem URL</span>
          </div>
        </div>

        {/* Stats by Origin */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border bg-green-500/5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🇵🇹</span>
              <span className="font-medium">Portugal (DRE)</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-green-600 font-bold text-lg">
                  {stats?.ptWithUrl?.toLocaleString("pt-PT")}
                </div>
                <div className="text-xs text-muted-foreground">Com URL</div>
              </div>
              <div>
                <div className="text-amber-600 font-bold text-lg">
                  {stats?.ptWithoutUrl?.toLocaleString("pt-PT")}
                </div>
                <div className="text-xs text-muted-foreground">Sem URL</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border bg-blue-500/5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🇪🇺</span>
              <span className="font-medium">União Europeia</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-green-600 font-bold text-lg">
                  {stats?.euWithUrl?.toLocaleString("pt-PT")}
                </div>
                <div className="text-xs text-muted-foreground">Com URL</div>
              </div>
              <div>
                <div className="text-amber-600 font-bold text-lg">
                  {stats?.euWithoutUrl?.toLocaleString("pt-PT")}
                </div>
                <div className="text-xs text-muted-foreground">Sem URL</div>
              </div>
            </div>
          </div>
        </div>

        {/* No digital version notice */}
        {(stats?.noDigitalVersion || 0) > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-sm">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span>
              {stats?.noDigitalVersion} diplomas marcados como sem versão digital disponível
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Ações de Correção</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Origem</label>
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                  <SelectItem value="EU">🇪🇺 UE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Modo</label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Validar + Recuperar</SelectItem>
                  <SelectItem value="validate">Apenas Validar</SelectItem>
                  <SelectItem value="recover">Apenas Recuperar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleStartFix}
                disabled={fixUrlsMutation.isPending || !!runningJob}
                className="w-full h-9"
              >
                {fixUrlsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                Iniciar
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-2">
              <Search className="h-3 w-3" />
              <span><strong>Validar:</strong> Verifica se URLs existentes estão acessíveis (404/410 = limpa)</span>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="h-3 w-3" />
              <span><strong>Recuperar:</strong> Tenta gerar URLs para diplomas sem link</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
