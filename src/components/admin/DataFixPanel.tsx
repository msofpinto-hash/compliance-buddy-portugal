import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Link, Calendar, Type, FileText, Building2, ListChecks, GitBranch,
  ChevronDown, Loader2, Wrench, RefreshCw, Zap, Play
} from "lucide-react";

// Import existing panels
import { UrlHealthPanel } from "./UrlHealthPanel";
import { DateAnomaliesPanel } from "./DateAnomaliesPanel";
import { PdfDataFixPanel } from "./PdfDataFixPanel";
import { DuplicateCleanupPanel } from "./DuplicateCleanupPanel";

export function DataFixPanel() {
  const queryClient = useQueryClient();

  // Fetch quick stats
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["data-fix-stats"],
    queryFn: async () => {
      const [urlsResult, datesResult, titlesResult, summariesResult, entitiesResult] = await Promise.all([
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("document_url", null).eq("no_digital_version", false),
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
    staleTime: 60000,
  });

  const total = (stats?.urls || 0) + (stats?.dates || 0) + (stats?.titles || 0) + 
                (stats?.summaries || 0) + (stats?.entities || 0);

  const handleQuickFix = async (type: string) => {
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
          body = { batchSize: 50, maxBatches: 5 };
          break;
        case "relations":
          functionName = "extract-legislation-relations";
          body = { limit: 100, background: true };
          break;
      }

      const { error } = await supabase.functions.invoke(functionName, { body });
      if (error) throw error;

      toast.success(`Correção de ${type} iniciada em segundo plano`);
      queryClient.invalidateQueries({ queryKey: ["data-fix-stats"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick Stats Overview */}
      <Card className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/50 dark:border-amber-800/30">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-lg">Problemas Detectados</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Badge variant={total > 100 ? "destructive" : total > 0 ? "secondary" : "default"}>
                {total} total
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              <QuickFixCard 
                label="URLs" 
                count={stats?.urls || 0} 
                icon={<Link className="h-4 w-4" />}
                onFix={() => handleQuickFix("urls")}
              />
              <QuickFixCard 
                label="Datas" 
                count={stats?.dates || 0} 
                icon={<Calendar className="h-4 w-4" />}
                onFix={() => handleQuickFix("dates")}
              />
              <QuickFixCard 
                label="Títulos" 
                count={stats?.titles || 0} 
                icon={<Type className="h-4 w-4" />}
                onFix={() => handleQuickFix("titles")}
              />
              <QuickFixCard 
                label="Sumários" 
                count={stats?.summaries || 0} 
                icon={<FileText className="h-4 w-4" />}
                onFix={() => handleQuickFix("summaries")}
              />
              <QuickFixCard 
                label="Entidades" 
                count={stats?.entities || 0} 
                icon={<Building2 className="h-4 w-4" />}
                onFix={() => handleQuickFix("titles")} // Uses same function
              />
              <QuickFixCard 
                label="Requisitos" 
                count={stats?.requirements || 0} 
                icon={<ListChecks className="h-4 w-4" />}
                onFix={() => handleQuickFix("requirements")}
              />
              <QuickFixCard 
                label="Relações" 
                count={stats?.relations || 0} 
                icon={<GitBranch className="h-4 w-4" />}
                onFix={() => handleQuickFix("relations")}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Collapsible Sections for Detailed Tools */}
      <CollapsibleSection
        title="Saúde de URLs"
        description="Validar e recuperar URLs de documentos oficiais"
        icon={<Link className="h-5 w-5 text-blue-600" />}
        badge={stats?.urls}
        defaultOpen={false}
      >
        <UrlHealthPanel />
      </CollapsibleSection>

      <CollapsibleSection
        title="Anomalias de Datas"
        description="Corrigir datas de publicação e vigência suspeitas"
        icon={<Calendar className="h-5 w-5 text-amber-600" />}
        badge={stats?.dates}
        defaultOpen={false}
      >
        <DateAnomaliesPanel />
      </CollapsibleSection>

      <CollapsibleSection
        title="Metadados de PDF"
        description="Completar informação de diplomas importados via PDF"
        icon={<FileText className="h-5 w-5 text-green-600" />}
        defaultOpen={false}
      >
        <PdfDataFixPanel />
      </CollapsibleSection>

      <CollapsibleSection
        title="Limpeza de Duplicados"
        description="Identificar e remover entradas duplicadas"
        icon={<Zap className="h-5 w-5 text-purple-600" />}
        defaultOpen={false}
      >
        <DuplicateCleanupPanel />
      </CollapsibleSection>
    </div>
  );
}

// Quick Fix Card with action button
function QuickFixCard({ 
  label, 
  count, 
  icon, 
  onFix 
}: { 
  label: string; 
  count: number; 
  icon: React.ReactNode;
  onFix: () => void;
}) {
  const [isFixing, setIsFixing] = useState(false);

  const handleFix = () => {
    if (count === 0) return;
    setIsFixing(true);
    onFix();
    // Reset after a short delay (the actual job is async)
    setTimeout(() => setIsFixing(false), 2000);
  };

  return (
    <div 
      className={`relative p-3 rounded-lg cursor-pointer transition-all hover:scale-105 ${
        count === 0 
          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" 
          : count > 50 
            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
            : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
      }`}
      onClick={handleFix}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">{count}</span>
        {count > 0 && !isFixing && (
          <Play className="h-3 w-3 opacity-50" />
        )}
        {isFixing && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
      </div>
    </div>
  );
}

// Reusable collapsible section
function CollapsibleSection({ 
  title, 
  description, 
  icon, 
  badge,
  children, 
  defaultOpen = false 
}: { 
  title: string; 
  description: string; 
  icon: React.ReactNode; 
  badge?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

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
                {badge !== undefined && badge > 0 && (
                  <Badge variant={badge > 50 ? "destructive" : "secondary"}>
                    {badge}
                  </Badge>
                )}
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
