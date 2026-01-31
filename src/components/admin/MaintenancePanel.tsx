import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Link, Calendar, FileText, Type, Building2, ListChecks,
  RefreshCw, Loader2, Search, CheckCircle2, AlertTriangle,
  ChevronRight, Wrench, Database, ExternalLink, GitBranch,
  Globe, Zap, LinkIcon
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import { PdfDataFixPanel } from "./PdfDataFixPanel";
import { UrlHealthPanel } from "./UrlHealthPanel";
import { DuplicateCleanupPanel } from "./DuplicateCleanupPanel";
import { DataQualityPanel } from "./DataQualityPanel";
import { DateAnomaliesPanel } from "./DateAnomaliesPanel";
import { ActiveJobsBanner } from "./ActiveJobsBanner";

type MaintenanceCategory = "urls" | "dates" | "titles" | "summaries" | "entities" | "requirements" | "relations" | "quality";

interface CategoryInfo {
  id: MaintenanceCategory;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const CATEGORIES: CategoryInfo[] = [
  { id: "urls", label: "URLs", icon: <Link className="h-4 w-4" />, description: "Validar e recuperar URLs de documentos" },
  { id: "dates", label: "Datas", icon: <Calendar className="h-4 w-4" />, description: "Corrigir datas de publicação e vigência" },
  { id: "titles", label: "Títulos", icon: <Type className="h-4 w-4" />, description: "Corrigir títulos genéricos ou incompletos" },
  { id: "summaries", label: "Sumários", icon: <FileText className="h-4 w-4" />, description: "Completar sumários em falta ou curtos" },
  { id: "entities", label: "Entidades", icon: <Building2 className="h-4 w-4" />, description: "Corrigir entidades emissoras" },
  { id: "requirements", label: "Requisitos", icon: <ListChecks className="h-4 w-4" />, description: "Extrair requisitos legais em falta" },
  { id: "relations", label: "Relações", icon: <GitBranch className="h-4 w-4" />, description: "Extrair relações entre diplomas" },
  { id: "quality", label: "Qualidade Geral", icon: <Database className="h-4 w-4" />, description: "Métricas e limpeza geral" },
];

export function MaintenancePanel() {
  const [activeTab, setActiveTab] = useState<MaintenanceCategory>("urls");

  return (
    <div className="space-y-4">
      {/* Active Jobs Banner - visible on all tabs */}
      <ActiveJobsBanner />

      {/* Quick Stats Summary */}
      <MaintenanceQuickStats />

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MaintenanceCategory)}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-gradient-to-r from-amber-100/70 via-orange-100/50 to-yellow-100/40 dark:from-amber-900/35 dark:via-orange-900/25 dark:to-yellow-900/20 border border-amber-200/50 dark:border-amber-800/35 p-1">
          {CATEGORIES.map((cat) => (
            <TabsTrigger 
              key={cat.id} 
              value={cat.id}
              className="gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white text-sm"
            >
              {cat.icon}
              {cat.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="urls" className="mt-4">
          <UrlHealthPanel />
        </TabsContent>

        <TabsContent value="dates" className="mt-4">
          <DateAnomaliesPanel />
        </TabsContent>

        <TabsContent value="titles" className="mt-4">
          <TitleFixPanel />
        </TabsContent>

        <TabsContent value="summaries" className="mt-4">
          <SummaryFixPanel />
        </TabsContent>

        <TabsContent value="entities" className="mt-4">
          <EntityFixPanel />
        </TabsContent>

        <TabsContent value="requirements" className="mt-4">
          <RequirementsExtractionFullPanel />
        </TabsContent>

        <TabsContent value="relations" className="mt-4">
          <RelationsExtractionPanel />
        </TabsContent>

        <TabsContent value="quality" className="mt-4 space-y-6">
          <PdfDataFixPanel />
          <DataQualityPanel />
          <DuplicateCleanupPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Quick stats summary component
function MaintenanceQuickStats() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["maintenance-quick-stats"],
    queryFn: async () => {
      // Parallel queries for counts
      const [urlsResult, datesResult, titlesResult, summariesResult, entitiesResult, requirementsResult, relationsResult] = await Promise.all([
        // URLs missing
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("document_url", null).eq("no_digital_version", false),
        // Dates missing (publication_date null)
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .is("publication_date", null),
        // Titles that are generic (very short or equal to number)
        supabase.from("legislation").select("id, title, number")
          .limit(1000),
        // Summaries missing or too short
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .or("summary.is.null,summary.eq."),
        // Entities missing
        supabase.from("legislation").select("id", { count: "exact", head: true })
          .or("entity.is.null,entity.eq."),
        // Legislation without requirements
        supabase.from("legislation").select("id")
          .limit(2000),
        // Relations pending (legislation count - processed count)
        Promise.all([
          supabase.from("legislation").select("id", { count: "exact", head: true }),
          supabase.from("legislation_relations_processed").select("id", { count: "exact", head: true }),
        ]),
      ]);

      // Count generic titles
      const genericTitles = (titlesResult.data || []).filter(leg => {
        const title = leg.title?.trim() || "";
        const number = leg.number?.trim() || "";
        return !title || title === number || title.length < 20;
      }).length;

      // Get requirements count
      const legIds = (requirementsResult.data || []).map(l => l.id);
      const { count: withReqsCount } = await supabase
        .from("legal_requirements")
        .select("legislation_id", { count: "exact", head: true });
      
      const noRequirements = legIds.length - (withReqsCount || 0);

      // Relations pending
      const [totalLegResult, processedRelationsResult] = relationsResult;
      const pendingRelations = (totalLegResult.count || 0) - (processedRelationsResult.count || 0);

      return {
        urls: urlsResult.count || 0,
        dates: datesResult.count || 0,
        titles: genericTitles,
        summaries: summariesResult.count || 0,
        entities: entitiesResult.count || 0,
        requirements: Math.max(0, noRequirements),
        relations: Math.max(0, pendingRelations),
      };
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar estatísticas...
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = (stats?.urls || 0) + (stats?.dates || 0) + (stats?.titles || 0) + 
                (stats?.summaries || 0) + (stats?.entities || 0);

  return (
    <Card className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/50 dark:border-amber-800/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-lg">Resumo de Manutenção</CardTitle>
          </div>
          <Badge variant={total > 100 ? "destructive" : total > 0 ? "secondary" : "default"} className="text-sm">
            {total} problemas
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          <StatBadge label="URLs" count={stats?.urls || 0} icon={<Link className="h-3 w-3" />} />
          <StatBadge label="Datas" count={stats?.dates || 0} icon={<Calendar className="h-3 w-3" />} />
          <StatBadge label="Títulos" count={stats?.titles || 0} icon={<Type className="h-3 w-3" />} />
          <StatBadge label="Sumários" count={stats?.summaries || 0} icon={<FileText className="h-3 w-3" />} />
          <StatBadge label="Entidades" count={stats?.entities || 0} icon={<Building2 className="h-3 w-3" />} />
          <StatBadge label="Requisitos" count={stats?.requirements || 0} icon={<ListChecks className="h-3 w-3" />} />
          <StatBadge label="Relações" count={stats?.relations || 0} icon={<GitBranch className="h-3 w-3" />} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatBadge({ label, count, icon }: { label: string; count: number; icon: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs ${
      count === 0 
        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" 
        : count > 50 
          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
          : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
    }`}>
      {icon}
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-bold ml-auto">{count}</span>
    </div>
  );
}

// Title Fix Panel
function TitleFixPanel() {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<string>("all");
  const [isFixing, setIsFixing] = useState(false);

  const { data: genericTitles, isLoading, refetch } = useQuery({
    queryKey: ["generic-titles", origin],
    queryFn: async () => {
      let query = supabase
        .from("legislation")
        .select("id, number, title, origin, document_url")
        .limit(200);

      if (origin === "PT") {
        query = query.or("origin.eq.PT,origin.eq.dre");
      } else if (origin === "EU") {
        query = query.or("origin.eq.EU,origin.eq.eurlex");
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter for generic titles
      return (data || []).filter(leg => {
        const title = leg.title?.trim() || "";
        const number = leg.number?.trim() || "";
        return !title || title === number || title.length < 30;
      });
    },
    staleTime: 30000,
  });

  const handleFixTitles = async () => {
    setIsFixing(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-auto-imported-legislation", {
        body: {
          mode: "generic_titles",
          limit: 50,
          dryRun: false,
          includePT: origin === "all" || origin === "PT",
          includeEU: origin === "all" || origin === "EU",
        },
      });

      if (error) throw error;
      toast.success(`Job iniciado: ${data?.jobId || "em execução"}`);
      queryClient.invalidateQueries({ queryKey: ["generic-titles"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-quick-stats"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5 text-amber-600" />
              Títulos Genéricos
            </CardTitle>
            <CardDescription>
              Diplomas com títulos em falta, muito curtos ou iguais ao número
            </CardDescription>
          </div>
          <Badge variant="outline">{genericTitles?.length || 0} encontrados</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
              <SelectItem value="EU">🇪🇺 EU</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>

          <div className="flex-1" />

          <Button onClick={handleFixTitles} disabled={isFixing || !genericTitles?.length}>
            {isFixing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wrench className="h-4 w-4 mr-1" />}
            Corrigir Títulos
          </Button>
        </div>

        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (genericTitles?.length || 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-2 text-green-500" />
              <p>Todos os títulos estão completos!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {genericTitles?.map((leg) => (
                <div key={leg.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <span className="text-sm">{leg.origin === "EU" ? "🇪🇺" : "🇵🇹"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{leg.number}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {leg.title || <span className="italic text-red-500">Sem título</span>}
                    </p>
                  </div>
                  {leg.document_url && (
                    <a href={leg.document_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                      <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Summary Fix Panel
function SummaryFixPanel() {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<string>("all");
  const [mode, setMode] = useState<"missing" | "short">("missing");
  const [isFixing, setIsFixing] = useState(false);

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ["missing-summaries", origin, mode],
    queryFn: async () => {
      let query = supabase
        .from("legislation")
        .select("id, number, title, summary, origin, document_url")
        .limit(200);

      if (origin === "PT") {
        query = query.or("origin.eq.PT,origin.eq.dre");
      } else if (origin === "EU") {
        query = query.or("origin.eq.EU,origin.eq.eurlex");
      }

      if (mode === "missing") {
        query = query.or("summary.is.null,summary.eq.");
      }

      const { data, error } = await query;
      if (error) throw error;

      if (mode === "short") {
        return (data || []).filter(leg => {
          const summary = leg.summary?.trim() || "";
          return summary.length > 0 && summary.length < 100;
        });
      }

      return data || [];
    },
    staleTime: 30000,
  });

  const handleFixSummaries = async () => {
    setIsFixing(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-auto-imported-legislation", {
        body: {
          mode: mode === "missing" ? "missing_summary" : "short_summary",
          limit: 50,
          dryRun: false,
          includePT: origin === "all" || origin === "PT",
          includeEU: origin === "all" || origin === "EU",
        },
      });

      if (error) throw error;
      toast.success(`Job iniciado: ${data?.jobId || "em execução"}`);
      queryClient.invalidateQueries({ queryKey: ["missing-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-quick-stats"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Sumários
            </CardTitle>
            <CardDescription>
              Diplomas sem sumário ou com sumário demasiado curto
            </CardDescription>
          </div>
          <Badge variant="outline">{items?.length || 0} encontrados</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Select value={mode} onValueChange={(v) => setMode(v as "missing" | "short")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="missing">Sem sumário</SelectItem>
              <SelectItem value="short">Sumário curto</SelectItem>
            </SelectContent>
          </Select>

          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
              <SelectItem value="EU">🇪🇺 EU</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>

          <div className="flex-1" />

          <Button onClick={handleFixSummaries} disabled={isFixing || !items?.length}>
            {isFixing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wrench className="h-4 w-4 mr-1" />}
            Completar Sumários
          </Button>
        </div>

        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (items?.length || 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-2 text-green-500" />
              <p>Todos os sumários estão completos!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items?.map((leg) => (
                <div key={leg.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <span className="text-sm mt-0.5">{leg.origin === "EU" ? "🇪🇺" : "🇵🇹"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{leg.number}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {leg.summary || <span className="italic text-red-500">Sem sumário</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Entity Fix Panel
function EntityFixPanel() {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<string>("all");
  const [isFixing, setIsFixing] = useState(false);

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ["missing-entities", origin],
    queryFn: async () => {
      let query = supabase
        .from("legislation")
        .select("id, number, title, entity, origin, document_url")
        .or("entity.is.null,entity.eq.")
        .limit(200);

      if (origin === "PT") {
        query = query.or("origin.eq.PT,origin.eq.dre");
      } else if (origin === "EU") {
        query = query.or("origin.eq.EU,origin.eq.eurlex");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });

  const handleFixEntities = async () => {
    setIsFixing(true);
    try {
      // Use reimport-dre-metadata for PT and reimport-eurlex-dates for EU
      const promises = [];
      
      if (origin === "all" || origin === "PT") {
        promises.push(
          supabase.functions.invoke("reimport-dre-metadata", {
            body: { limit: 50, field: "entity" },
          })
        );
      }
      
      if (origin === "all" || origin === "EU") {
        promises.push(
          supabase.functions.invoke("reimport-eurlex-dates", {
            body: { limit: 50, includeEntity: true },
          })
        );
      }

      await Promise.all(promises);
      toast.success("Jobs de correção iniciados");
      queryClient.invalidateQueries({ queryKey: ["missing-entities"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-quick-stats"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-600" />
              Entidades Emissoras
            </CardTitle>
            <CardDescription>
              Diplomas sem entidade emissora identificada
            </CardDescription>
          </div>
          <Badge variant="outline">{items?.length || 0} encontrados</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Select value={origin} onValueChange={setOrigin}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
              <SelectItem value="EU">🇪🇺 EU</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>

          <div className="flex-1" />

          <Button onClick={handleFixEntities} disabled={isFixing || !items?.length}>
            {isFixing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wrench className="h-4 w-4 mr-1" />}
            Recuperar Entidades
          </Button>
        </div>

        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (items?.length || 0) === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-2 text-green-500" />
              <p>Todas as entidades estão identificadas!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items?.map((leg) => (
                <div key={leg.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <span className="text-sm">{leg.origin === "EU" ? "🇪🇺" : "🇵🇹"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{leg.number}</p>
                    <p className="text-xs text-muted-foreground truncate">{leg.title}</p>
                  </div>
                  <Badge variant="outline" className="text-red-500">Sem entidade</Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Requirements Extraction Quick Panel
function RequirementsExtractionQuickPanel() {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<string>("all");
  const [isExtracting, setIsExtracting] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["requirements-extraction-stats", origin],
    queryFn: async () => {
      // Get legislation count
      let legQuery = supabase.from("legislation").select("id", { count: "exact", head: true });
      if (origin === "PT") {
        legQuery = legQuery.or("origin.eq.PT,origin.eq.dre");
      } else if (origin === "EU") {
        legQuery = legQuery.or("origin.eq.EU,origin.eq.eurlex");
      }
      const { count: totalLeg } = await legQuery;

      // Get legislation with requirements
      const { data: withReqs } = await supabase
        .from("legal_requirements")
        .select("legislation_id")
        .limit(5000);

      const uniqueLegWithReqs = new Set((withReqs || []).map(r => r.legislation_id));

      return {
        total: totalLeg || 0,
        withRequirements: uniqueLegWithReqs.size,
        withoutRequirements: (totalLeg || 0) - uniqueLegWithReqs.size,
      };
    },
    staleTime: 30000,
  });

  const handleExtract = async () => {
    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-requirements-background", {
        body: {
          limit: 20,
          origin: origin === "all" ? undefined : origin,
        },
      });

      if (error) throw error;
      toast.success(`Job de extração iniciado: ${data?.jobId || "em execução"}`);
      queryClient.invalidateQueries({ queryKey: ["requirements-extraction-stats"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const coverage = stats ? Math.round((stats.withRequirements / stats.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-green-600" />
              Extração de Requisitos
            </CardTitle>
            <CardDescription>
              Extrair requisitos legais dos diplomas usando IA
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <p className="text-xs text-muted-foreground">Total Diplomas</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats?.withRequirements || 0}</p>
                <p className="text-xs text-muted-foreground">Com Requisitos</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats?.withoutRequirements || 0}</p>
                <p className="text-xs text-muted-foreground">Sem Requisitos</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Cobertura de Requisitos</span>
                <span className="font-medium">{coverage}%</span>
              </div>
              <Progress value={coverage} className="h-2" />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                  <SelectItem value="EU">🇪🇺 EU</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>

              <div className="flex-1" />

              <Button onClick={handleExtract} disabled={isExtracting}>
                {isExtracting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ListChecks className="h-4 w-4 mr-1" />}
                Extrair Requisitos (20)
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Full Requirements Extraction Panel with URL support
function RequirementsExtractionFullPanel() {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<string>("all");
  const [mode, setMode] = useState<"ai" | "url">("ai");
  const [limit, setLimit] = useState<number>(20);
  const [isExtracting, setIsExtracting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["requirements-extraction-stats-full", origin],
    queryFn: async () => {
      // Get legislation count
      let legQuery = supabase.from("legislation").select("id", { count: "exact", head: true });
      if (origin === "PT") {
        legQuery = legQuery.or("origin.eq.PT,origin.eq.dre");
      } else if (origin === "EU") {
        legQuery = legQuery.or("origin.eq.EU,origin.eq.eurlex");
      }
      const { count: totalLeg } = await legQuery;

      // Get legislation with requirements
      const { data: withReqs } = await supabase
        .from("legal_requirements")
        .select("legislation_id")
        .limit(10000);

      const uniqueLegWithReqs = new Set((withReqs || []).map(r => r.legislation_id));

      // Get legislation with URLs
      const { count: withUrls } = await supabase
        .from("legislation")
        .select("id", { count: "exact", head: true })
        .not("document_url", "is", null);

      return {
        total: totalLeg || 0,
        withRequirements: uniqueLegWithReqs.size,
        withoutRequirements: (totalLeg || 0) - uniqueLegWithReqs.size,
        withUrls: withUrls || 0,
      };
    },
    staleTime: 30000,
  });

  const handleExtractAI = async () => {
    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-requirements-background", {
        body: {
          batchSize: limit,
          maxBatches: 5,
          origin: origin === "all" ? undefined : origin,
          useUrl: false,
        },
      });

      if (error) throw error;
      toast.success(`Job de extração IA iniciado: ${data?.syncLogId?.substring(0, 8) || "em execução"}`);
      queryClient.invalidateQueries({ queryKey: ["requirements-extraction-stats-full"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-quick-stats"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractURL = async () => {
    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-requirements-from-url", {
        body: {
          limit,
          dryRun: false,
          replaceExisting,
          origin: origin === "all" ? undefined : origin,
        },
      });

      if (error) throw error;
      toast.success(`Extração por URL concluída: ${data?.successful || 0} diplomas processados, ${data?.totalRequirements || 0} requisitos extraídos`);
      queryClient.invalidateQueries({ queryKey: ["requirements-extraction-stats-full"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-quick-stats"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const coverage = stats ? Math.round((stats.withRequirements / stats.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-green-600" />
              Extração de Requisitos
            </CardTitle>
            <CardDescription>
              Extrair requisitos legais dos diplomas usando IA ou scraping de URL
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <p className="text-xs text-muted-foreground">Total Diplomas</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats?.withRequirements || 0}</p>
                <p className="text-xs text-muted-foreground">Com Requisitos</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats?.withoutRequirements || 0}</p>
                <p className="text-xs text-muted-foreground">Sem Requisitos</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats?.withUrls || 0}</p>
                <p className="text-xs text-muted-foreground">Com URL</p>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Cobertura de Requisitos</span>
                <span className="font-medium">{coverage}%</span>
              </div>
              <Progress value={coverage} className="h-2" />
            </div>

            {/* Mode Selection */}
            <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
              <Button
                variant={mode === "ai" ? "default" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setMode("ai")}
              >
                <Zap className="h-4 w-4 mr-1" />
                Extração IA
              </Button>
              <Button
                variant={mode === "url" ? "default" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setMode("url")}
              >
                <Globe className="h-4 w-4 mr-1" />
                Extração por URL
              </Button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                  <SelectItem value="EU">🇪🇺 EU</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Label className="text-sm">Limite:</Label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 20))}
                  className="w-20"
                  min={1}
                  max={500}
                />
              </div>

              {mode === "url" && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="replace-existing"
                    checked={replaceExisting}
                    onCheckedChange={setReplaceExisting}
                  />
                  <Label htmlFor="replace-existing" className="text-sm">Substituir existentes</Label>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>

              <div className="flex-1" />

              <Button 
                onClick={mode === "ai" ? handleExtractAI : handleExtractURL} 
                disabled={isExtracting}
              >
                {isExtracting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : mode === "ai" ? (
                  <Zap className="h-4 w-4 mr-1" />
                ) : (
                  <Globe className="h-4 w-4 mr-1" />
                )}
                {mode === "ai" ? "Extrair com IA" : "Extrair por URL"}
              </Button>
            </div>

            {/* Mode description */}
            <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
              {mode === "ai" ? (
                <p><strong>Extração IA:</strong> Usa modelos de IA para extrair requisitos do texto integral dos diplomas. Mais preciso mas mais lento.</p>
              ) : (
                <p><strong>Extração por URL:</strong> Faz scraping direto das URLs dos diplomas (DRE/EUR-Lex) para extrair requisitos estruturados. Mais rápido e utiliza menos recursos.</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Relations Extraction Panel
function RelationsExtractionPanel() {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<string>("all");
  const [limit, setLimit] = useState<number>(100);
  const [isExtracting, setIsExtracting] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["relations-extraction-stats", origin],
    queryFn: async () => {
      // Get total legislation count
      let legQuery = supabase.from("legislation").select("id", { count: "exact", head: true });
      if (origin === "PT") {
        legQuery = legQuery.or("origin.eq.PT,origin.eq.dre");
      } else if (origin === "EU") {
        legQuery = legQuery.or("origin.eq.EU,origin.eq.eurlex");
      }
      const { count: totalLeg } = await legQuery;

      // Get processed count
      const { count: processedCount } = await supabase
        .from("legislation_relations_processed")
        .select("id", { count: "exact", head: true });

      // Get total relations
      const { count: totalRelations } = await supabase
        .from("legislation_relations")
        .select("id", { count: "exact", head: true });

      // Get relations by type
      const { data: relationTypes } = await supabase
        .from("legislation_relations")
        .select("relation_type")
        .limit(10000);

      const typeCounts: Record<string, number> = {};
      (relationTypes || []).forEach(r => {
        typeCounts[r.relation_type] = (typeCounts[r.relation_type] || 0) + 1;
      });

      return {
        total: totalLeg || 0,
        processed: processedCount || 0,
        pending: (totalLeg || 0) - (processedCount || 0),
        totalRelations: totalRelations || 0,
        byType: typeCounts,
      };
    },
    staleTime: 30000,
  });

  const handleExtract = async () => {
    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-legislation-relations", {
        body: {
          limit,
          dryRun: false,
          background: true,
          origin: origin === "all" ? undefined : origin,
        },
      });

      if (error) throw error;
      toast.success(`Job de extração de relações iniciado`);
      queryClient.invalidateQueries({ queryKey: ["relations-extraction-stats"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-quick-stats"] });
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const coverage = stats ? Math.round((stats.processed / stats.total) * 100) : 0;

  // Top relation types
  const topTypes = Object.entries(stats?.byType || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const RELATION_LABELS: Record<string, string> = {
    "altera": "Altera",
    "alterado_por": "Alterado por",
    "revoga": "Revoga",
    "revogado_por": "Revogado por",
    "transpoe": "Transpõe",
    "transposto_por": "Transposto por",
    "regulamenta": "Regulamenta",
    "regulamentado_por": "Regulamentado por",
    "referencia": "Referencia",
    "referenciado_por": "Referenciado por",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-purple-600" />
              Extração de Relações
            </CardTitle>
            <CardDescription>
              Extrair relações entre diplomas (alterações, revogações, transposições)
            </CardDescription>
          </div>
          <Badge variant="outline">{stats?.totalRelations || 0} relações</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <p className="text-xs text-muted-foreground">Total Diplomas</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats?.processed || 0}</p>
                <p className="text-xs text-muted-foreground">Processados</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{stats?.pending || 0}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats?.totalRelations || 0}</p>
                <p className="text-xs text-muted-foreground">Relações</p>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Cobertura de Processamento</span>
                <span className="font-medium">{coverage}%</span>
              </div>
              <Progress value={coverage} className="h-2" />
            </div>

            {/* Relation Types */}
            {topTypes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Tipos de Relação</p>
                <div className="flex flex-wrap gap-2">
                  {topTypes.map(([type, count]) => (
                    <Badge key={type} variant="secondary" className="gap-1">
                      {RELATION_LABELS[type] || type}
                      <span className="font-bold">{count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3 pt-2">
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="PT">🇵🇹 Portugal</SelectItem>
                  <SelectItem value="EU">🇪🇺 EU</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Label className="text-sm">Limite:</Label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 100))}
                  className="w-20"
                  min={1}
                  max={500}
                />
              </div>

              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>

              <div className="flex-1" />

              <Button onClick={handleExtract} disabled={isExtracting || stats?.pending === 0}>
                {isExtracting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <GitBranch className="h-4 w-4 mr-1" />}
                Extrair Relações
              </Button>
            </div>

            {/* Description */}
            <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
              <p><strong>Extração de Relações:</strong> Analisa os diplomas para identificar referências a outros diplomas (alterações, revogações, transposições de diretivas EU, etc.). Para legislação PT usa o painel "Análise Jurídica" do DRE.</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
