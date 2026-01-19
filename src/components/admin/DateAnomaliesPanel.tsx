import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Calendar, AlertTriangle, Search, RefreshCw, CheckCircle2, 
  XCircle, FileX, Loader2, Filter, CalendarX, CalendarClock
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

type AnomalyType = "no_publication" | "jan_1st" | "effective_before_pub" | "no_effective" | "all";

interface DateAnomaly {
  id: string;
  number: string;
  title: string;
  origin: string | null;
  publication_date: string | null;
  effective_date: string | null;
  document_url: string | null;
  no_digital_version: boolean | null;
  anomaly_types: AnomalyType[];
}

const ANOMALY_LABELS: Record<AnomalyType, string> = {
  no_publication: "Sem data publicação",
  jan_1st: "Data 1 de Janeiro",
  effective_before_pub: "Vigência antes publicação",
  no_effective: "Sem data vigência",
  all: "Todas",
};

const ANOMALY_COLORS: Record<AnomalyType, string> = {
  no_publication: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  jan_1st: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  effective_before_pub: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  no_effective: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  all: "bg-gray-100 text-gray-800",
};

export function DateAnomaliesPanel() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anomalyFilter, setAnomalyFilter] = useState<AnomalyType>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch all legislation with potential date issues
  const { data: anomalies, isLoading, refetch } = useQuery({
    queryKey: ["date-anomalies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, origin, publication_date, effective_date, document_url, no_digital_version")
        .or("publication_date.is.null,effective_date.is.null")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Also fetch Jan 1st and effective < publication issues
      const { data: jan1Data, error: jan1Error } = await supabase
        .from("legislation")
        .select("id, number, title, origin, publication_date, effective_date, document_url, no_digital_version")
        .not("publication_date", "is", null)
        .limit(1000);

      if (jan1Error) throw jan1Error;

      // Combine and deduplicate
      const allData = [...(data || []), ...(jan1Data || [])];
      const uniqueMap = new Map<string, DateAnomaly>();

      for (const item of allData) {
        if (uniqueMap.has(item.id)) continue;

        const anomalyTypes: AnomalyType[] = [];
        
        if (!item.publication_date) {
          anomalyTypes.push("no_publication");
        } else {
          const pubDate = new Date(item.publication_date);
          if (pubDate.getMonth() === 0 && pubDate.getDate() === 1) {
            anomalyTypes.push("jan_1st");
          }
        }

        if (!item.effective_date) {
          anomalyTypes.push("no_effective");
        } else if (item.publication_date && item.effective_date) {
          const effDate = new Date(item.effective_date);
          const pubDate = new Date(item.publication_date);
          if (effDate < pubDate) {
            anomalyTypes.push("effective_before_pub");
          }
        }

        if (anomalyTypes.length > 0) {
          uniqueMap.set(item.id, { ...item, anomaly_types: anomalyTypes });
        }
      }

      return Array.from(uniqueMap.values());
    },
    staleTime: 30000,
  });

  // Filter anomalies
  const filteredAnomalies = useMemo(() => {
    if (!anomalies) return [];
    
    return anomalies.filter((a) => {
      if (anomalyFilter !== "all" && !a.anomaly_types.includes(anomalyFilter)) return false;
      if (originFilter !== "all" && a.origin !== originFilter) return false;
      if (searchTerm && !a.number.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !a.title?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [anomalies, anomalyFilter, originFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    if (!anomalies) return { no_publication: 0, jan_1st: 0, effective_before_pub: 0, no_effective: 0 };
    return {
      no_publication: anomalies.filter(a => a.anomaly_types.includes("no_publication")).length,
      jan_1st: anomalies.filter(a => a.anomaly_types.includes("jan_1st")).length,
      effective_before_pub: anomalies.filter(a => a.anomaly_types.includes("effective_before_pub")).length,
      no_effective: anomalies.filter(a => a.anomaly_types.includes("no_effective")).length,
    };
  }, [anomalies]);

  // Batch fix via scraping
  const fixMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const selected = anomalies?.filter(a => ids.includes(a.id)) || [];
      const hasEU = selected.some(a => a.origin === "EU" || a.document_url?.includes("eur-lex"));
      const hasPT = selected.some(a => a.origin === "PT" || a.document_url?.includes("diariodarepublica"));

      const { data, error } = await supabase.functions.invoke("complete-auto-imported-legislation", {
        body: {
          mode: "missing_dates",
          limit: ids.length + 10,
          dryRun: false,
          includePT: hasPT,
          includeEU: hasEU,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Job de correção iniciado em segundo plano");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["date-anomalies"] });
    },
    onError: (error) => {
      toast.error(`Erro ao iniciar correção: ${error.message}`);
    },
  });

  // Mark as no_digital_version
  const markNoDigitalMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("legislation")
        .update({ no_digital_version: true })
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Diplomas marcados como sem versão digital");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["date-anomalies"] });
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  // Toggle selection
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAnomalies.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAnomalies.map(a => a.id)));
    }
  };

  const selectedArray = Array.from(selectedIds);

  return (
    <div className="space-y-4">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card 
          className={`cursor-pointer transition-all ${anomalyFilter === "no_publication" ? "ring-2 ring-red-500" : ""}`}
          onClick={() => setAnomalyFilter(anomalyFilter === "no_publication" ? "all" : "no_publication")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <CalendarX className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.no_publication}</p>
              <p className="text-xs text-muted-foreground">Sem data publicação</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${anomalyFilter === "jan_1st" ? "ring-2 ring-amber-500" : ""}`}
          onClick={() => setAnomalyFilter(anomalyFilter === "jan_1st" ? "all" : "jan_1st")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.jan_1st}</p>
              <p className="text-xs text-muted-foreground">Data 1 Janeiro</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${anomalyFilter === "effective_before_pub" ? "ring-2 ring-orange-500" : ""}`}
          onClick={() => setAnomalyFilter(anomalyFilter === "effective_before_pub" ? "all" : "effective_before_pub")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <CalendarClock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.effective_before_pub}</p>
              <p className="text-xs text-muted-foreground">Vigência inválida</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${anomalyFilter === "no_effective" ? "ring-2 ring-blue-500" : ""}`}
          onClick={() => setAnomalyFilter(anomalyFilter === "no_effective" ? "all" : "no_effective")}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.no_effective}</p>
              <p className="text-xs text-muted-foreground">Sem vigência</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Anomalias de Datas
              <Badge variant="outline">{filteredAnomalies.length}</Badge>
            </CardTitle>
            
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-48"
                />
              </div>
              
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="PT">🇵🇹 PT</SelectItem>
                  <SelectItem value="EU">🇪🇺 EU</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Batch Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">{selectedIds.size} selecionados</span>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={() => fixMutation.mutate(selectedArray)}
                disabled={fixMutation.isPending}
              >
                {fixMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Corrigir via Scraping
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => markNoDigitalMutation.mutate(selectedArray)}
                disabled={markNoDigitalMutation.isPending}
              >
                {markNoDigitalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileX className="h-4 w-4 mr-1" />
                )}
                Sem versão digital
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* List Header */}
          <div className="flex items-center gap-3 px-2 py-1 text-sm font-medium text-muted-foreground border-b">
            <Checkbox 
              checked={selectedIds.size === filteredAnomalies.length && filteredAnomalies.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="w-10">Orig.</span>
            <span className="flex-1">Diploma</span>
            <span className="w-24 text-center">Publicação</span>
            <span className="w-24 text-center">Vigência</span>
            <span className="w-36">Anomalias</span>
          </div>

          {/* List */}
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAnomalies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mb-2 text-green-500" />
                <p>Nenhuma anomalia encontrada!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredAnomalies.map((anomaly) => (
                  <div 
                    key={anomaly.id}
                    className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors ${
                      selectedIds.has(anomaly.id) ? "bg-muted" : ""
                    }`}
                  >
                    <Checkbox
                      checked={selectedIds.has(anomaly.id)}
                      onCheckedChange={() => toggleSelect(anomaly.id)}
                    />
                    <span className="w-10 text-sm">
                      {anomaly.origin === "EU" ? "🇪🇺" : anomaly.origin === "PT" ? "🇵🇹" : "❓"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{anomaly.number}</p>
                      <p className="text-xs text-muted-foreground truncate">{anomaly.title}</p>
                    </div>
                    <span className="w-24 text-center text-sm">
                      {anomaly.publication_date ? (
                        <span className={anomaly.anomaly_types.includes("jan_1st") ? "text-amber-600" : ""}>
                          {format(new Date(anomaly.publication_date), "dd/MM/yyyy")}
                        </span>
                      ) : (
                        <span className="text-red-500">—</span>
                      )}
                    </span>
                    <span className="w-24 text-center text-sm">
                      {anomaly.effective_date ? (
                        <span className={anomaly.anomaly_types.includes("effective_before_pub") ? "text-orange-600" : ""}>
                          {format(new Date(anomaly.effective_date), "dd/MM/yyyy")}
                        </span>
                      ) : (
                        <span className="text-blue-500">—</span>
                      )}
                    </span>
                    <div className="w-36 flex flex-wrap gap-1">
                      {anomaly.anomaly_types.map((type) => (
                        <Badge key={type} variant="secondary" className={`text-xs ${ANOMALY_COLORS[type]}`}>
                          {type === "no_publication" && "Pub."}
                          {type === "jan_1st" && "1 Jan"}
                          {type === "effective_before_pub" && "Vig."}
                          {type === "no_effective" && "S/Vig."}
                        </Badge>
                      ))}
                      {anomaly.no_digital_version && (
                        <Badge variant="outline" className="text-xs">
                          <FileX className="h-3 w-3" />
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
