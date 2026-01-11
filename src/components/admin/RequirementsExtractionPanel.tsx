import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Brain, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Play,
  BarChart3
} from "lucide-react";

interface ExtractionResult {
  legislationId: string;
  requirementsCount: number;
  error?: string;
}

export function RequirementsExtractionPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isExtracting, setIsExtracting] = useState(false);
  const [limit, setLimit] = useState(10);
  const [dryRun, setDryRun] = useState(true);
  const [results, setResults] = useState<ExtractionResult[] | null>(null);
  const [stats, setStats] = useState<{
    processed: number;
    successful: number;
    failed: number;
    totalRequirements: number;
  } | null>(null);

  // Fetch statistics
  const { data: dbStats, isLoading: loadingStats } = useQuery({
    queryKey: ["requirements-stats"],
    queryFn: async () => {
      const [legislationResult, requirementsResult, withReqsResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true }),
        supabase.from("legal_requirements").select("id", { count: "exact", head: true }),
        supabase.from("legal_requirements").select("legislation_id"),
      ]);

      const uniqueLegislationWithReqs = new Set(
        withReqsResult.data?.map(r => r.legislation_id) || []
      ).size;

      return {
        totalLegislation: legislationResult.count || 0,
        totalRequirements: requirementsResult.count || 0,
        legislationWithRequirements: uniqueLegislationWithReqs,
        legislationWithoutRequirements: (legislationResult.count || 0) - uniqueLegislationWithReqs,
      };
    },
  });

  const handleExtract = async () => {
    setIsExtracting(true);
    setResults(null);
    setStats(null);

    try {
      const { data, error } = await supabase.functions.invoke("extract-requirements", {
        body: { limit, dryRun },
      });

      if (error) throw error;

      if (data.success) {
        setResults(data.results);
        setStats({
          processed: data.processed,
          successful: data.successful,
          failed: data.failed,
          totalRequirements: data.totalRequirements,
        });

        toast({
          title: dryRun ? "Simulação concluída" : "Extração concluída",
          description: `${data.successful} diplomas processados, ${data.totalRequirements} requisitos ${dryRun ? "identificados" : "inseridos"}`,
        });

        if (!dryRun) {
          queryClient.invalidateQueries({ queryKey: ["requirements-stats"] });
          queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
        }
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Extraction error:", error);
      toast({
        title: "Erro na extração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Diplomas</CardDescription>
            <CardTitle className="text-3xl">
              {loadingStats ? <Loader2 className="h-6 w-6 animate-spin" /> : dbStats?.totalLegislation}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com Requisitos</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {loadingStats ? <Loader2 className="h-6 w-6 animate-spin" /> : dbStats?.legislationWithRequirements}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className={dbStats?.legislationWithoutRequirements ? "border-amber-300 bg-amber-50/50" : ""}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              Sem Requisitos
            </CardDescription>
            <CardTitle className="text-3xl text-amber-600">
              {loadingStats ? <Loader2 className="h-6 w-6 animate-spin" /> : dbStats?.legislationWithoutRequirements}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Requisitos</CardDescription>
            <CardTitle className="text-3xl text-blue-600">
              {loadingStats ? <Loader2 className="h-6 w-6 animate-spin" /> : dbStats?.totalRequirements}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Progress bar */}
      {dbStats && dbStats.totalLegislation > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Progresso da extração</span>
              <span className="text-sm font-medium">
                {Math.round((dbStats.legislationWithRequirements / dbStats.totalLegislation) * 100)}%
              </span>
            </div>
            <Progress 
              value={(dbStats.legislationWithRequirements / dbStats.totalLegislation) * 100} 
              className="h-2"
            />
          </CardContent>
        </Card>
      )}

      {/* Extraction Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Extração de Requisitos com IA
          </CardTitle>
          <CardDescription>
            Usa inteligência artificial para analisar diplomas e extrair requisitos legais automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <Label htmlFor="limit">Limite de diplomas</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-24"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="dry-run"
                checked={dryRun}
                onCheckedChange={setDryRun}
              />
              <Label htmlFor="dry-run" className="cursor-pointer">
                Modo simulação (não insere dados)
              </Label>
            </div>

            <Button
              onClick={handleExtract}
              disabled={isExtracting || !dbStats?.legislationWithoutRequirements}
              className="gap-2"
            >
              {isExtracting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isExtracting ? "A extrair..." : dryRun ? "Simular Extração" : "Iniciar Extração"}
            </Button>
          </div>

          {!dryRun && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                Modo de inserção ativo. Os requisitos serão guardados na base de dados.
              </span>
            </div>
          )}

          {/* Results */}
          {stats && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <BarChart3 className="h-8 w-8 text-primary" />
                <div className="flex-1 grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xl font-bold">{stats.processed}</p>
                    <p className="text-sm text-muted-foreground">Processados</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{stats.successful}</p>
                    <p className="text-sm text-muted-foreground">Sucesso</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                    <p className="text-sm text-muted-foreground">Falhados</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{stats.totalRequirements}</p>
                    <p className="text-sm text-muted-foreground">Requisitos</p>
                  </div>
                </div>
              </div>

              {results && results.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Detalhes por diploma:</h4>
                  <ScrollArea className="h-64 rounded border">
                    <div className="p-4 space-y-2">
                      {results.map((result, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-2 rounded bg-background"
                        >
                          <div className="flex items-center gap-2">
                            {result.error ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            <span className="font-mono text-xs text-muted-foreground">
                              {result.legislationId.substring(0, 8)}...
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {result.error ? (
                              <Badge variant="destructive" className="text-xs">
                                {result.error}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                {result.requirementsCount} requisitos
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
