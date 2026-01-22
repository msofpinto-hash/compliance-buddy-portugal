import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Link, Calendar, Type, FileText, Building2, ListChecks, GitBranch,
  ChevronDown, Loader2, Wrench, RefreshCw, Zap, Play, Pause, CheckCircle2
} from "lucide-react";

// Import existing panels
import { UrlHealthPanel } from "./UrlHealthPanel";
import { DateAnomaliesPanel } from "./DateAnomaliesPanel";
import { PdfDataFixPanel } from "./PdfDataFixPanel";
import { DuplicateCleanupPanel } from "./DuplicateCleanupPanel";
import { ActiveJobsBanner } from "./ActiveJobsBanner";

interface FixStats {
  urls: number;
  dates: number;
  titles: number;
  summaries: number;
  entities: number;
  requirements: number;
  relations: number;
}

type FixType = "urls" | "dates" | "titles" | "summaries" | "requirements" | "relations";

export function DataFixPanel() {
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [currentFix, setCurrentFix] = useState<FixType | null>(null);

  // Fetch quick stats with auto-refresh when auto-fixing
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["data-fix-stats"],
    queryFn: async (): Promise<FixStats> => {
      const [urlsResult, datesResult, titlesResult, summariesResult, entitiesResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("document_url", null).or("no_digital_version.is.null,no_digital_version.eq.false"),
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("publication_date", null),
        supabase.from("legislation").select("id, title, number").limit(1000),
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .or("summary.is.null,summary.eq."),
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .or("entity.is.null,entity.eq."),
      ]);

      // Count generic titles
      const genericTitles = (titlesResult.data || []).filter(leg => {
        const title = leg.title?.trim() || "";
        const number = leg.number?.trim() || "";
        return !title || title === number || title.length < 20;
      }).length;

      // Get requirements and relations stats
      const [totalLegResult, processedRelationsResult, reqLegResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true }),
        supabase.from("legislation_relations_processed").select("id", { count: "exact", head: true }),
        supabase.from("legal_requirements").select("legislation_id").limit(10000),
      ]);

      const uniqueReqLeg = new Set((reqLegResult.data || []).map(r => r.legislation_id));

      return {
        urls: urlsResult.count || 0,
        dates: datesResult.count || 0,
        titles: genericTitles,
        summaries: summariesResult.count || 0,
        entities: entitiesResult.count || 0,
        requirements: Math.max(0, (totalLegResult.count || 0) - uniqueReqLeg.size),
        relations: Math.max(0, (totalLegResult.count || 0) - (processedRelationsResult.count || 0)),
      };
    },
    staleTime: 10000,
    refetchInterval: isAutoFixing ? 5000 : false,
  });

  const total = (stats?.urls || 0) + (stats?.dates || 0) + (stats?.titles || 0) + 
                (stats?.summaries || 0) + (stats?.entities || 0);

  // Execute a single fix
  const executeFix = useCallback(async (type: FixType): Promise<boolean> => {
    try {
      let functionName = "";
      let body = {};

      switch (type) {
        case "urls":
          functionName = "fix-broken-urls";
          body = { limit: 50, mode: "recover", background: true };
          break;
        case "titles":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "generic_titles", limit: 50, dryRun: false };
          break;
        case "summaries":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "missing_summary", limit: 50, dryRun: false };
          break;
        case "dates":
          functionName = "complete-auto-imported-legislation";
          body = { mode: "missing_dates", limit: 50, dryRun: false };
          break;
        case "requirements":
          functionName = "extract-requirements-background";
          body = { batchSize: 50, maxBatches: 3 };
          break;
        case "relations":
          functionName = "extract-legislation-relations";
          body = { limit: 100, background: true };
          break;
      }

      const { error } = await supabase.functions.invoke(functionName, { body });
      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error(`Fix ${type} failed:`, err);
      return false;
    }
  }, []);

  // Auto-fix loop
  useEffect(() => {
    if (!isAutoFixing || !stats) return;

    const runNextFix = async () => {
      const fixes: { type: FixType; count: number }[] = [
        { type: "urls", count: stats.urls },
        { type: "dates", count: stats.dates },
        { type: "titles", count: stats.titles },
        { type: "summaries", count: stats.summaries },
        { type: "requirements", count: stats.requirements },
        { type: "relations", count: stats.relations },
      ];

      const nextFix = fixes.find(f => f.count > 0);

      if (!nextFix) {
        setIsAutoFixing(false);
        setCurrentFix(null);
        toast.success("Todas as correções automáticas concluídas!");
        return;
      }

      setCurrentFix(nextFix.type);
      await executeFix(nextFix.type);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      refetch();
    };

    const interval = setInterval(runNextFix, 10000);
    runNextFix();

    return () => clearInterval(interval);
  }, [isAutoFixing, stats, executeFix, refetch]);

  const toggleAutoFix = () => {
    if (isAutoFixing) {
      setIsAutoFixing(false);
      setCurrentFix(null);
      toast.info("Correção automática pausada");
    } else {
      setIsAutoFixing(true);
      toast.success("Correção automática iniciada");
    }
  };

  return (
    <div className="space-y-4">
      <ActiveJobsBanner />

      <Card className={`bg-gradient-to-r ${isAutoFixing 
        ? "from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-300 dark:border-green-800" 
        : "from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/50 dark:border-amber-800/30"}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className={`h-5 w-5 ${isAutoFixing ? "text-green-600 animate-pulse" : "text-amber-600"}`} />
              <CardTitle className="text-lg">Correção Automática de Dados</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant={isAutoFixing ? "destructive" : "default"}
                size="sm" 
                onClick={toggleAutoFix}
                className="gap-2"
              >
                {isAutoFixing ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pausar
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Iniciar Correção
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
          {isAutoFixing && currentFix && (
            <div className="flex items-center gap-2 mt-2 text-sm text-green-700 dark:text-green-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>A corrigir: <strong>{currentFix}</strong></span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {isAutoFixing && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Progresso global</span>
                    <span className="font-medium">{total} pendentes</span>
                  </div>
                  <Progress value={100 - (total / Math.max(total + 10, 1) * 100)} className="h-2" />
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                <StatCard label="URLs" count={stats?.urls || 0} icon={<Link className="h-4 w-4" />} isActive={currentFix === "urls"} />
                <StatCard label="Datas" count={stats?.dates || 0} icon={<Calendar className="h-4 w-4" />} isActive={currentFix === "dates"} />
                <StatCard label="Títulos" count={stats?.titles || 0} icon={<Type className="h-4 w-4" />} isActive={currentFix === "titles"} />
                <StatCard label="Sumários" count={stats?.summaries || 0} icon={<FileText className="h-4 w-4" />} isActive={currentFix === "summaries"} />
                <StatCard label="Entidades" count={stats?.entities || 0} icon={<Building2 className="h-4 w-4" />} isActive={false} />
                <StatCard label="Requisitos" count={stats?.requirements || 0} icon={<ListChecks className="h-4 w-4" />} isActive={currentFix === "requirements"} />
                <StatCard label="Relações" count={stats?.relations || 0} icon={<GitBranch className="h-4 w-4" />} isActive={currentFix === "relations"} />
              </div>

              {total === 0 && !isAutoFixing && (
                <div className="mt-4 p-3 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-green-800 dark:text-green-200 font-medium">Todos os dados estão corrigidos!</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CollapsibleSection title="Saúde de URLs" description="Validar e recuperar URLs de documentos oficiais" icon={<Link className="h-5 w-5 text-blue-600" />} badge={stats?.urls}>
        <UrlHealthPanel />
      </CollapsibleSection>

      <CollapsibleSection title="Anomalias de Datas" description="Corrigir datas de publicação e vigência suspeitas" icon={<Calendar className="h-5 w-5 text-amber-600" />} badge={stats?.dates}>
        <DateAnomaliesPanel />
      </CollapsibleSection>

      <CollapsibleSection title="Metadados de PDF" description="Completar informação de diplomas importados via PDF" icon={<FileText className="h-5 w-5 text-green-600" />}>
        <PdfDataFixPanel />
      </CollapsibleSection>

      <CollapsibleSection title="Limpeza de Duplicados" description="Identificar e remover entradas duplicadas" icon={<Zap className="h-5 w-5 text-purple-600" />}>
        <DuplicateCleanupPanel />
      </CollapsibleSection>
    </div>
  );
}

function StatCard({ label, count, icon, isActive }: { label: string; count: number; icon: React.ReactNode; isActive: boolean }) {
  return (
    <div className={`relative p-3 rounded-lg transition-all ${
      isActive ? "bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-500 animate-pulse" 
        : count === 0 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" 
        : count > 50 ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
        : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">{count}</span>
        {count === 0 && <CheckCircle2 className="h-4 w-4 text-green-600" />}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, description, icon, badge, children }: { title: string; description: string; icon: React.ReactNode; badge?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {icon}
                <div>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription className="text-sm">{description}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {badge !== undefined && badge > 0 && <Badge variant={badge > 50 ? "destructive" : "secondary"}>{badge}</Badge>}
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
