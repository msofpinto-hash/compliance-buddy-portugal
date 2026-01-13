import React, { useState, useEffect, forwardRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  Flag, 
  Globe, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  Timer,
  Target,
  Zap,
  Link2
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

interface DetailedProgressPanelProps {
  runningJob?: {
    id: string;
    status: string;
    items_processed: number;
    items_added: number;
    started_at: string;
    error_message: string | null;
  } | null;
}

export const DetailedProgressPanel = forwardRef<HTMLDivElement, DetailedProgressPanelProps>(
  function DetailedProgressPanel({ runningJob }, ref) {
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Query for PT/EU breakdown
  const { data: breakdown, refetch: refetchBreakdown, isLoading } = useQuery({
    queryKey: ["requirements-breakdown-detailed"],
    queryFn: async () => {
      // Get PT counts
      const { count: totalPT } = await supabase
        .from("legislation")
        .select("id", { count: "exact", head: true })
        .eq("origin", "PT");

      // Get EU counts
      const { count: totalEU } = await supabase
        .from("legislation")
        .select("id", { count: "exact", head: true })
        .eq("origin", "EU");

      // Get PT legislation IDs
      const { data: ptLegislation } = await supabase
        .from("legislation")
        .select("id")
        .eq("origin", "PT");
      const ptIds = new Set(ptLegislation?.map(l => l.id) || []);

      // Get EU legislation IDs
      const { data: euLegislation } = await supabase
        .from("legislation")
        .select("id")
        .eq("origin", "EU");
      const euIds = new Set(euLegislation?.map(l => l.id) || []);

      // Get all requirements with legislation_id
      const allRequirements: { legislation_id: string }[] = [];
      let page = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data } = await supabase
          .from("legal_requirements")
          .select("legislation_id")
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (!data || data.length === 0) break;
        allRequirements.push(...data);
        if (data.length < pageSize) break;
        page++;
      }

      // Count PT with requirements
      const ptWithReqs = new Set(
        allRequirements
          .filter(r => ptIds.has(r.legislation_id))
          .map(r => r.legislation_id)
      ).size;

      // Count EU with requirements
      const euWithReqs = new Set(
        allRequirements
          .filter(r => euIds.has(r.legislation_id))
          .map(r => r.legislation_id)
      ).size;

      // Get relations processed count
      const { count: relationsProcessed } = await supabase
        .from("legislation_relations_processed")
        .select("id", { count: "exact", head: true });

      // Get total relations
      const { count: totalRelations } = await supabase
        .from("legislation_relations")
        .select("id", { count: "exact", head: true });

      return {
        pt: {
          total: totalPT || 0,
          withReqs: ptWithReqs,
          pending: (totalPT || 0) - ptWithReqs,
          percent: totalPT ? Math.round((ptWithReqs / totalPT) * 100) : 0,
        },
        eu: {
          total: totalEU || 0,
          withReqs: euWithReqs,
          pending: (totalEU || 0) - euWithReqs,
          percent: totalEU ? Math.round((euWithReqs / totalEU) * 100) : 0,
        },
        relations: {
          processed: relationsProcessed || 0,
          total: (totalPT || 0) + (totalEU || 0),
          pending: ((totalPT || 0) + (totalEU || 0)) - (relationsProcessed || 0),
          created: totalRelations || 0,
        }
      };
    },
    refetchInterval: runningJob ? 10000 : 30000,
  });

  // Refresh handler
  const handleRefresh = () => {
    refetchBreakdown();
    setLastRefresh(new Date());
  };

  // Auto-refresh timestamp
  useEffect(() => {
    if (runningJob) {
      const interval = setInterval(() => {
        setLastRefresh(new Date());
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [runningJob]);

  // Calculate ETA
  const calculateETA = () => {
    if (!runningJob || !runningJob.items_processed || !breakdown) return null;
    
    const processed = runningJob.items_processed;
    const elapsedMs = new Date().getTime() - new Date(runningJob.started_at).getTime();
    const avgTimePerItem = elapsedMs / processed;
    
    // Determine which stage we're in
    const isPT = runningJob.error_message?.includes("PT");
    const isEU = runningJob.error_message?.includes("EU");
    
    let currentRemaining = 0;
    let nextSteps: { name: string; items: number }[] = [];
    
    if (isPT) {
      currentRemaining = Math.max(0, breakdown.pt.pending - processed);
      nextSteps = [
        { name: "EU", items: breakdown.eu.pending },
        { name: "Relações", items: breakdown.relations.pending },
      ];
    } else if (isEU) {
      currentRemaining = Math.max(0, breakdown.eu.pending - processed);
      nextSteps = [
        { name: "Relações", items: breakdown.relations.pending },
      ];
    } else {
      currentRemaining = Math.max(0, (breakdown.pt.pending + breakdown.eu.pending) - processed);
    }
    
    const currentEtaMs = avgTimePerItem * currentRemaining;
    const nextStepsEtaMs = nextSteps.reduce((acc, step) => acc + avgTimePerItem * step.items, 0);
    const totalEtaMs = currentEtaMs + nextStepsEtaMs;
    
    const formatTime = (ms: number) => {
      const mins = Math.ceil(ms / 60000);
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      if (hours > 0) return `${hours}h ${remainingMins}min`;
      return `${mins}min`;
    };
    
    return {
      currentStep: formatTime(currentEtaMs),
      total: formatTime(totalEtaMs),
      speed: Math.round(60000 / avgTimePerItem * 10) / 10, // items per minute
      nextSteps,
    };
  };

  const eta = calculateETA();

  if (isLoading) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card ref={ref} className={`border-2 ${runningJob ? "border-green-500/50 bg-gradient-to-br from-green-50/50 to-blue-50/30" : "border-muted"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" />
            Progresso Detalhado
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Atualizado {formatDistanceToNow(lastRefresh, { addSuffix: true, locale: pt })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh}>
              <RefreshCw className={`h-3 w-3 ${runningJob ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Current Job Status */}
        {runningJob && (
          <div className="p-3 rounded-lg bg-green-100/50 border border-green-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 animate-pulse gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  A executar
                </Badge>
                {runningJob.error_message?.includes("PT") && (
                  <Badge variant="outline" className="gap-1 border-green-500">
                    <Flag className="h-3 w-3" /> PT
                  </Badge>
                )}
                {runningJob.error_message?.includes("EU") && (
                  <Badge variant="outline" className="gap-1 border-blue-500">
                    <Globe className="h-3 w-3" /> EU
                  </Badge>
                )}
              </div>
              <span className="text-sm font-mono text-muted-foreground">
                {runningJob.id.substring(0, 8)}...
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs">Processados</span>
                <span className="font-bold text-lg">{runningJob.items_processed}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs">Requisitos</span>
                <span className="font-bold text-lg text-green-600">{runningJob.items_added}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs">Velocidade</span>
                <span className="font-bold text-lg">{eta?.speed || "—"} <span className="text-xs font-normal">/min</span></span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs">Iniciado</span>
                <span className="font-medium">
                  {formatDistanceToNow(new Date(runningJob.started_at), { addSuffix: true, locale: pt })}
                </span>
              </div>
            </div>
            
            {eta && (
              <div className="mt-3 pt-3 border-t border-green-200 flex items-center gap-4">
                <div className="flex items-center gap-1 text-sm">
                  <Timer className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">ETA etapa atual:</span>
                  <span className="font-semibold">{eta.currentStep}</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-1 text-sm">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">ETA total:</span>
                  <span className="font-semibold text-primary">{eta.total}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PT Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-green-600" />
              <span className="font-medium">🇵🇹 Portugal (DRE)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {breakdown?.pt.withReqs} / {breakdown?.pt.total}
              </span>
              <Badge variant={breakdown?.pt.pending === 0 ? "default" : "secondary"} className={breakdown?.pt.pending === 0 ? "bg-green-600" : ""}>
                {breakdown?.pt.percent}%
              </Badge>
            </div>
          </div>
          <Progress value={breakdown?.pt.percent || 0} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              {breakdown?.pt.withReqs} com requisitos
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              {breakdown?.pt.pending} pendentes
            </span>
          </div>
        </div>

        <Separator />

        {/* EU Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-600" />
              <span className="font-medium">🇪🇺 União Europeia</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {breakdown?.eu.withReqs} / {breakdown?.eu.total}
              </span>
              <Badge variant={breakdown?.eu.pending === 0 ? "default" : "secondary"} className={breakdown?.eu.pending === 0 ? "bg-blue-600" : ""}>
                {breakdown?.eu.percent}%
              </Badge>
            </div>
          </div>
          <Progress value={breakdown?.eu.percent || 0} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              {breakdown?.eu.withReqs} com requisitos
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              {breakdown?.eu.pending} pendentes
            </span>
          </div>
        </div>

        <Separator />

        {/* Relations Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-purple-600" />
              <span className="font-medium">🔗 Relações entre Diplomas</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {breakdown?.relations.processed} / {breakdown?.relations.total}
              </span>
              <Badge variant="secondary">
                {Math.round(((breakdown?.relations.processed || 0) / (breakdown?.relations.total || 1)) * 100)}%
              </Badge>
            </div>
          </div>
          <Progress 
            value={((breakdown?.relations.processed || 0) / (breakdown?.relations.total || 1)) * 100} 
            className="h-2" 
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              {breakdown?.relations.processed} analisados
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-purple-600" />
              {breakdown?.relations.created} relações criadas
            </span>
          </div>
        </div>

        {/* Chain Status */}
        {!runningJob && breakdown && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
            <div className="font-medium mb-2">📋 Resumo</div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className={`text-2xl font-bold ${breakdown.pt.pending === 0 ? "text-green-600" : "text-amber-600"}`}>
                  {breakdown.pt.pending}
                </div>
                <div className="text-xs text-muted-foreground">PT pendentes</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${breakdown.eu.pending === 0 ? "text-green-600" : "text-amber-600"}`}>
                  {breakdown.eu.pending}
                </div>
                <div className="text-xs text-muted-foreground">EU pendentes</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${breakdown.relations.pending === 0 ? "text-green-600" : "text-muted-foreground"}`}>
                  {breakdown.relations.pending}
                </div>
                <div className="text-xs text-muted-foreground">Relações pendentes</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

DetailedProgressPanel.displayName = "DetailedProgressPanel";
