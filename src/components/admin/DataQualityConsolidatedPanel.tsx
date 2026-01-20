import { useState } from "react";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Database, 
  Link2, 
  Calendar, 
  ChevronDown, 
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Layers,
  FileQuestion,
  FolderTree,
} from "lucide-react";
import { DataQualityPanel } from "./DataQualityPanel";
import { UrlHealthPanel } from "./UrlHealthPanel";
import { DateAnomaliesPanel } from "./DateAnomaliesPanel";
import { AnimatedStatCard } from "./AnimatedStatCard";
import { MaintenanceThemeBrowser } from "./MaintenanceThemeBrowser";

export function DataQualityConsolidatedPanel() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["browse"]));

  const toggleSection = (section: string) => {
    const newSet = new Set(openSections);
    if (newSet.has(section)) {
      newSet.delete(section);
    } else {
      newSet.add(section);
    }
    setOpenSections(newSet);
  };

  // Fetch comprehensive stats
  const { data: stats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["maintenance-stats"],
    queryFn: async () => {
      const [
        missingUrlData,
        dateAnomaliesData,
        noCategoriesData,
        genericTitlesData,
        problemsData,
      ] = await Promise.all([
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .or("document_url.is.null,document_url.eq.")
          .or("no_digital_version.is.null,no_digital_version.eq.false"),
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .is("publication_date", null),
        supabase.rpc("get_legislation_without_categories_count"),
        // Generic titles (pending import)
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .or("title.ilike.%Documento %,title.ilike.%Diploma referenciado%,title.ilike.%a aguardar importação%"),
        // Problems: missing origin
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .or("origin.is.null,origin.not.in.(PT,EU)"),
      ]);

      const noCategories = typeof noCategoriesData.data === 'number' ? noCategoriesData.data : 0;
      const genericTitles = genericTitlesData.count || 0;
      const missingOrigin = problemsData.count || 0;
      const missingDates = dateAnomaliesData.count || 0;
      
      return {
        missingUrls: missingUrlData.count || 0,
        dateAnomalies: missingDates,
        noCategories,
        genericTitles,
        // Total problems = generic titles + missing origin + missing dates
        totalProblems: genericTitles + missingOrigin + missingDates,
      };
    },
    staleTime: 60000,
  });

  const totalIssues = (stats?.missingUrls || 0) + 
                      (stats?.dateAnomalies || 0) + 
                      (stats?.noCategories || 0);

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Manutenção de Dados
              </CardTitle>
              <CardDescription>
                Correção de problemas e qualidade da base de dados
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : totalIssues === 0 ? (
                <Badge className="bg-green-500/10 text-green-600 border-green-200">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Tudo OK
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {totalIssues} itens a corrigir
                </Badge>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => refetch()} 
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Quick Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <AnimatedStatCard
          label="Sem Categoria"
          value={stats?.noCategories || 0}
          icon={(stats?.noCategories || 0) > 0 ? Layers : undefined}
          iconClassName="text-amber-600"
          titleClassName={(stats?.noCategories || 0) > 0 ? "text-amber-600" : ""}
          className={(stats?.noCategories || 0) > 0 ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : ""}
        />
        <AnimatedStatCard
          label="Importação Pendente"
          value={stats?.genericTitles || 0}
          icon={(stats?.genericTitles || 0) > 0 ? FileQuestion : undefined}
          iconClassName="text-orange-600"
          titleClassName={(stats?.genericTitles || 0) > 0 ? "text-orange-600" : ""}
          className={(stats?.genericTitles || 0) > 0 ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/20" : ""}
        />
        <AnimatedStatCard
          label="Sem URL"
          value={stats?.missingUrls || 0}
          icon={(stats?.missingUrls || 0) > 0 ? Link2 : undefined}
          iconClassName="text-blue-600"
          titleClassName={(stats?.missingUrls || 0) > 0 ? "text-blue-600" : ""}
          className={(stats?.missingUrls || 0) > 0 ? "border-blue-300 bg-blue-50/50 dark:bg-blue-950/20" : ""}
        />
        <AnimatedStatCard
          label="Sem Data"
          value={stats?.dateAnomalies || 0}
          icon={(stats?.dateAnomalies || 0) > 0 ? Calendar : undefined}
          iconClassName="text-red-600"
          titleClassName={(stats?.dateAnomalies || 0) > 0 ? "text-red-600" : ""}
          className={(stats?.dateAnomalies || 0) > 0 ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" : ""}
        />
        <AnimatedStatCard
          label="Total Problemas"
          value={stats?.totalProblems || 0}
          icon={(stats?.totalProblems || 0) > 0 ? AlertTriangle : CheckCircle2}
          iconClassName={(stats?.totalProblems || 0) > 0 ? "text-red-600" : "text-green-600"}
          titleClassName={(stats?.totalProblems || 0) > 0 ? "text-red-600" : "text-green-600"}
          className={(stats?.totalProblems || 0) > 0 ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" : "border-green-300 bg-green-50/50 dark:bg-green-950/20"}
        />
      </div>

      {/* Collapsible Sections */}
      <div className="space-y-3">
        {/* Theme Browser Section */}
        <Collapsible 
          open={openSections.has("browse")} 
          onOpenChange={() => toggleSection("browse")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {openSections.has("browse") ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Corrigir por Tema</span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Layers className="h-3 w-3" />
                    Navegação
                  </Badge>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <MaintenanceThemeBrowser />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Quality Section */}
        <Collapsible 
          open={openSections.has("quality")} 
          onOpenChange={() => toggleSection("quality")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {openSections.has("quality") ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      <span className="font-semibold">Métricas e Requisitos</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <DataQualityPanel />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* URLs Section */}
        <Collapsible 
          open={openSections.has("urls")} 
          onOpenChange={() => toggleSection("urls")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {openSections.has("urls") ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-blue-500" />
                      <span className="font-semibold">Correção de URLs</span>
                    </div>
                  </div>
                  {(stats?.missingUrls || 0) > 0 && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {stats?.missingUrls} sem URL
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <UrlHealthPanel />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Dates Section */}
        <Collapsible 
          open={openSections.has("dates")} 
          onOpenChange={() => toggleSection("dates")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {openSections.has("dates") ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-orange-500" />
                      <span className="font-semibold">Correção de Datas</span>
                    </div>
                  </div>
                  {(stats?.dateAnomalies || 0) > 0 && (
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      {stats?.dateAnomalies} anomalias
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <DateAnomaliesPanel />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}
