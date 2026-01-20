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
} from "lucide-react";
import { DataQualityPanel } from "./DataQualityPanel";
import { UrlHealthPanel } from "./UrlHealthPanel";
import { DateAnomaliesPanel } from "./DateAnomaliesPanel";

export function DataQualityConsolidatedPanel() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["quality"]));

  const toggleSection = (section: string) => {
    const newSet = new Set(openSections);
    if (newSet.has(section)) {
      newSet.delete(section);
    } else {
      newSet.add(section);
    }
    setOpenSections(newSet);
  };

  // Fetch quick stats for badges
  const { data: quickStats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["quality-quick-stats"],
    queryFn: async () => {
      const [
        missingUrlData,
        dateAnomaliesData,
        noCategoriesData,
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
      ]);

      return {
        missingUrls: missingUrlData.count || 0,
        dateAnomalies: dateAnomaliesData.count || 0,
        noCategories: typeof noCategoriesData.data === 'number' ? noCategoriesData.data : 0,
      };
    },
    staleTime: 60000,
  });

  const totalIssues = (quickStats?.missingUrls || 0) + 
                      (quickStats?.dateAnomalies || 0) + 
                      (quickStats?.noCategories || 0);

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Qualidade de Dados
              </CardTitle>
              <CardDescription>
                Monitorização e correção de problemas na base de dados
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
                  {totalIssues} problemas
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

      {/* Collapsible Sections */}
      <div className="space-y-3">
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
                      <span className="font-semibold">Métricas Gerais</span>
                    </div>
                  </div>
                  {(quickStats?.noCategories || 0) > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      {quickStats?.noCategories} sem categoria
                    </Badge>
                  )}
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
                      <span className="font-semibold">URLs de Documentos</span>
                    </div>
                  </div>
                  {(quickStats?.missingUrls || 0) > 0 && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {quickStats?.missingUrls} sem URL
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
                      <span className="font-semibold">Anomalias de Datas</span>
                    </div>
                  </div>
                  {(quickStats?.dateAnomalies || 0) > 0 && (
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      {quickStats?.dateAnomalies} sem data
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
