import { useState, useRef, useEffect } from "react";
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
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Play,
  BarChart3,
  Zap,
  Link,
  FileText,
  Square,
  RefreshCw,
  RotateCcw,
  Download,
  Globe,
  Flag,
  CloudOff,
  Server,
  TrendingUp
} from "lucide-react";
import { exportSimpleExcel } from "@/lib/excelUtils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { DetailedProgressPanel } from "./DetailedProgressPanel";

interface SpeedDataPoint {
  time: string;
  timestamp: number;
  itemsProcessed: number;
  speed: number; // items per minute
  requirementsAdded: number;
}

type OriginFilter = "all" | "PT" | "EU";

interface ExtractionResult {
  legislationId: string;
  legislationNumber?: string;
  requirementsCount: number;
  textLength?: number;
  requirements?: Array<{ article: string; requirement_text: string; notes?: string }>;
  error?: string;
}

interface FailedItem {
  legislationId: string;
  legislationNumber: string;
  error: string;
  retryCount: number;
}

interface ScrapeResult {
  legislationId: string;
  legislationNumber: string;
  requirementsCount: number;
  textLength: number;
  requirements: Array<{ article: string; requirement_text: string; notes?: string }>;
  error?: string;
}

export function RequirementsExtractionPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isExtracting, setIsExtracting] = useState(false);
  const [isContinuousExtracting, setIsContinuousExtracting] = useState(false);
  const [isBackgroundExtracting, setIsBackgroundExtracting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [limit, setLimit] = useState(25);
  const [batchSize, setBatchSize] = useState(100);
  const [parallelBatches, setParallelBatches] = useState(3);
  const [scrapeLimit, setScrapeLimit] = useState(10);
  const [dryRun, setDryRun] = useState(false);
  const [scrapeDryRun, setScrapeDryRun] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [autoRetry, setAutoRetry] = useState(true);
  const [maxRetries, setMaxRetries] = useState(3);
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [scrapeOriginFilter, setScrapeOriginFilter] = useState<OriginFilter>("all");
  const [results, setResults] = useState<ExtractionResult[] | null>(null);
  const [scrapeResults, setScrapeResults] = useState<ScrapeResult[] | null>(null);
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [stats, setStats] = useState<{
    processed: number;
    successful: number;
    failed: number;
    totalRequirements: number;
  } | null>(null);
  const [scrapeStats, setScrapeStats] = useState<{
    processed: number;
    successful: number;
    failed: number;
    totalRequirements: number;
  } | null>(null);
  const [continuousStats, setContinuousStats] = useState<{
    totalProcessed: number;
    totalSuccessful: number;
    totalFailed: number;
    totalRequirements: number;
    batchesCompleted: number;
    retriesPerformed: number;
  } | null>(null);
  const stopContinuousRef = useRef(false);
  const [speedHistory, setSpeedHistory] = useState<SpeedDataPoint[]>([]);
  const lastProcessedRef = useRef<{ count: number; timestamp: number } | null>(null);
  const [autoSequential, setAutoSequential] = useState(true);
  const [pendingSequentialStep, setPendingSequentialStep] = useState<"EU" | "RELATIONS" | null>(null);
  const lastCompletedJobRef = useRef<string | null>(null);

  // Handle URL scraping extraction
  const handleScrapeExtract = async () => {
    setIsScraping(true);
    setScrapeResults(null);
    setScrapeStats(null);

    try {
      const { data, error } = await supabase.functions.invoke("scrape-requirements-from-url", {
        body: { 
          limit: scrapeLimit, 
          dryRun: scrapeDryRun,
          replaceExisting,
          origin: scrapeOriginFilter === "all" ? undefined : scrapeOriginFilter 
        },
      });

      if (error) throw error;

      if (data.success) {
        setScrapeResults(data.results);
        setScrapeStats({
          processed: data.processed,
          successful: data.successful,
          failed: data.failed,
          totalRequirements: data.totalRequirements,
        });

        toast({
          title: scrapeDryRun ? "Simulação concluída" : "Extração via URL concluída",
          description: `${data.successful} diplomas processados, ${data.totalRequirements} requisitos ${scrapeDryRun ? "identificados" : "inseridos"}`,
        });

        if (!scrapeDryRun) {
          queryClient.invalidateQueries({ queryKey: ["requirements-stats"] });
          queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
        }
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Scrape extraction error:", error);
      toast({
        title: "Erro na extração via URL",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  // Query to check for running background jobs
  const { data: runningJob, refetch: refetchRunningJob } = useQuery({
    queryKey: ["running-extraction-job"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("id, status, items_processed, items_added, started_at, error_message")
        .eq("sync_type", "background-requirements-extraction")
        .eq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000, // Check every 5 seconds
  });

  // Query to check for recently completed PT jobs (for auto-sequential)
  const { data: lastCompletedJob } = useQuery({
    queryKey: ["last-completed-extraction-job"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_logs")
        .select("id, status, error_message, completed_at")
        .eq("sync_type", "background-requirements-extraction")
        .in("status", ["completed", "completed_timeout"])
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  // Auto-start next step when current completes (PT → EU → Relations)
  useEffect(() => {
    if (
      autoSequential &&
      pendingSequentialStep &&
      lastCompletedJob?.id &&
      lastCompletedJob.id !== lastCompletedJobRef.current &&
      !runningJob
    ) {
      lastCompletedJobRef.current = lastCompletedJob.id;
      
      if (pendingSequentialStep === "EU") {
        // Auto-start EU extraction
        toast({
          title: "🇪🇺 Iniciando extração EU automaticamente",
          description: "A extração PT terminou. A iniciar extração para legislação europeia...",
        });
        
        const startEUExtraction = async () => {
          setIsBackgroundExtracting(true);
          try {
            const { data, error } = await supabase.functions.invoke("extract-requirements-background", {
              body: { 
                batchSize: batchSize,
                maxBatches: 100,
                origin: "EU",
                useUrl: true
              },
            });

            if (error) throw error;

            if (data.success) {
              toast({
                title: "Extração EU iniciada em segundo plano",
                description: `Job ID: ${data.syncLogId?.substring(0, 8)}...`,
              });
              setPendingSequentialStep("RELATIONS"); // Next step: relations
              refetchRunningJob();
            }
          } catch (error) {
            console.error("Auto EU extraction error:", error);
            toast({
              title: "Erro ao iniciar extração EU automática",
              description: error instanceof Error ? error.message : "Erro desconhecido",
              variant: "destructive",
            });
            setPendingSequentialStep(null);
          } finally {
            setIsBackgroundExtracting(false);
          }
        };
        
        startEUExtraction();
      } else if (pendingSequentialStep === "RELATIONS") {
        // Auto-start relations extraction
        toast({
          title: "🔗 Iniciando extração de relações automaticamente",
          description: "A extração EU terminou. A iniciar extração de relações entre diplomas...",
        });
        
        const startRelationsExtraction = async () => {
          setIsBackgroundExtracting(true);
          try {
            const { data, error } = await supabase.functions.invoke("extract-legislation-relations", {
              body: { 
                limit: 500,
                dryRun: false,
                background: true,
              },
            });

            if (error) throw error;

            toast({
              title: "Extração de relações iniciada em segundo plano",
              description: data.message || "A processar diplomas...",
            });
            setPendingSequentialStep(null); // Finished sequence
            refetchRunningJob();
          } catch (error) {
            console.error("Auto relations extraction error:", error);
            toast({
              title: "Erro ao iniciar extração de relações automática",
              description: error instanceof Error ? error.message : "Erro desconhecido",
              variant: "destructive",
            });
            setPendingSequentialStep(null);
          } finally {
            setIsBackgroundExtracting(false);
          }
        };
        
        startRelationsExtraction();
      }
    }
  }, [lastCompletedJob?.id, runningJob, autoSequential, pendingSequentialStep, batchSize, toast, refetchRunningJob]);

  // Track speed history when job is running
  useEffect(() => {
    if (runningJob && runningJob.items_processed) {
      const now = Date.now();
      const processed = runningJob.items_processed || 0;
      const requirements = runningJob.items_added || 0;
      
      // Calculate speed (items per minute)
      let speed = 0;
      if (lastProcessedRef.current && processed > lastProcessedRef.current.count) {
        const timeDiff = (now - lastProcessedRef.current.timestamp) / 60000; // in minutes
        const itemsDiff = processed - lastProcessedRef.current.count;
        speed = timeDiff > 0 ? Math.round(itemsDiff / timeDiff) : 0;
      }
      
      // Update last processed ref
      lastProcessedRef.current = { count: processed, timestamp: now };
      
      // Add data point if we have speed data
      if (speed > 0) {
        const timeStr = new Date().toLocaleTimeString('pt-PT', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        });
        
        setSpeedHistory(prev => {
          const newHistory = [...prev, {
            time: timeStr,
            timestamp: now,
            itemsProcessed: processed,
            speed,
            requirementsAdded: requirements
          }];
          // Keep last 60 data points (5 minutes at 5 second intervals)
          return newHistory.slice(-60);
        });
      }
    } else if (!runningJob) {
      // Reset when no job is running
      lastProcessedRef.current = null;
    }
  }, [runningJob?.items_processed, runningJob?.items_added]);

  // Clear speed history when new job starts
  useEffect(() => {
    if (runningJob?.id) {
      setSpeedHistory([]);
      lastProcessedRef.current = null;
    }
  }, [runningJob?.id]);

  const { data: dbStats, isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ["requirements-stats", originFilter],
    queryFn: async () => {
      // Get legislation count based on origin filter
      let legislationCountQuery = supabase
        .from("legislation")
        .select("id", { count: "exact", head: true });
      
      if (originFilter === "PT") {
        legislationCountQuery = legislationCountQuery.eq("origin", "PT");
      } else if (originFilter === "EU") {
        legislationCountQuery = legislationCountQuery.eq("origin", "EU");
      }
      
      const { count: totalLegislation } = await legislationCountQuery;

      // Get legislation IDs (need to paginate for accuracy)
      const allLegislationIds: string[] = [];
      let page = 0;
      const pageSize = 1000;
      
      while (true) {
        let query = supabase
          .from("legislation")
          .select("id")
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (originFilter === "PT") {
          query = query.eq("origin", "PT");
        } else if (originFilter === "EU") {
          query = query.eq("origin", "EU");
        }
        
        const { data } = await query;
        if (!data || data.length === 0) break;
        
        allLegislationIds.push(...data.map(l => l.id));
        if (data.length < pageSize) break;
        page++;
      }

      const legislationIds = new Set(allLegislationIds);

      // Get requirements with pagination
      const allRequirements: { legislation_id: string }[] = [];
      page = 0;
      
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

      const uniqueLegislationWithReqs = new Set(
        allRequirements
          .filter(r => legislationIds.has(r.legislation_id))
          .map(r => r.legislation_id)
      );
      
      const totalRequirements = allRequirements.filter(r => legislationIds.has(r.legislation_id)).length;

      return {
        totalLegislation: totalLegislation || 0,
        totalRequirements,
        legislationWithRequirements: uniqueLegislationWithReqs.size,
        legislationWithoutRequirements: (totalLegislation || 0) - uniqueLegislationWithReqs.size,
      };
    },
    refetchInterval: runningJob ? 10000 : false, // Auto-refresh every 10s when job is running
  });

  // Export failed items to Excel
  const handleExportFailedToExcel = async () => {
    if (failedItems.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não há diplomas falhados para exportar.",
      });
      return;
    }

    const exportData = failedItems.map((item, index) => ({
      index: index + 1,
      legislationId: item.legislationId,
      numero: item.legislationNumber,
      erro: item.error,
      tentativas: item.retryCount,
      maxTentativas: maxRetries,
      dataExportacao: new Date().toLocaleString("pt-PT"),
    }));

    const columns = [
      { header: "#", key: "index", width: 5 },
      { header: "ID Legislação", key: "legislationId", width: 40 },
      { header: "Número", key: "numero", width: 25 },
      { header: "Erro", key: "erro", width: 50 },
      { header: "Tentativas", key: "tentativas", width: 12 },
      { header: "Máx. Tentativas", key: "maxTentativas", width: 15 },
      { header: "Data Exportação", key: "dataExportacao", width: 20 },
    ];

    const fileName = `diplomas_falhados_${new Date().toISOString().split("T")[0]}.xlsx`;
    await exportSimpleExcel(exportData, columns, "Diplomas Falhados", fileName);

    toast({
      title: "Exportação concluída",
      description: `${failedItems.length} diplomas exportados para ${fileName}`,
    });
  };

  // Handle retry of failed items
  const handleRetryFailed = async (idsToRetry?: string[]) => {
    const itemsToRetry = idsToRetry 
      ? failedItems.filter(f => idsToRetry.includes(f.legislationId))
      : failedItems.filter(f => f.retryCount < maxRetries);
    
    if (itemsToRetry.length === 0) {
      toast({
        title: "Sem itens para retentar",
        description: "Não há itens falhados elegíveis para retry.",
      });
      return;
    }

    setIsRetrying(true);

    try {
      const legislationIds = itemsToRetry.map(f => f.legislationId);
      
      const { data, error } = await supabase.functions.invoke("extract-requirements", {
        body: { legislationIds, dryRun: false },
      });

      if (error) throw error;

      if (data.success) {
        // Update failed items - remove successful ones, increment retry count for still-failed
        const successfulIds = new Set(
          data.results
            .filter((r: ExtractionResult) => !r.error && r.requirementsCount > 0)
            .map((r: ExtractionResult) => r.legislationId)
        );

        const newFailedItems = failedItems
          .map(item => {
            if (successfulIds.has(item.legislationId)) {
              return null; // Remove from failed list
            }
            if (legislationIds.includes(item.legislationId)) {
              // Find new error if any
              const newResult = data.results.find((r: ExtractionResult) => r.legislationId === item.legislationId);
              return {
                ...item,
                error: newResult?.error || item.error,
                retryCount: item.retryCount + 1,
              };
            }
            return item;
          })
          .filter((item): item is FailedItem => item !== null);

        setFailedItems(newFailedItems);

        toast({
          title: "Retry concluído",
          description: `${data.successful} recuperados, ${data.failed} ainda falhados`,
        });

        queryClient.invalidateQueries({ queryKey: ["requirements-stats"] });
      }
    } catch (error) {
      console.error("Retry error:", error);
      toast({
        title: "Erro no retry",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleExtract = async () => {
    setIsExtracting(true);
    setResults(null);
    setStats(null);

    try {
      const { data, error } = await supabase.functions.invoke("extract-requirements", {
        body: { limit, dryRun, origin: originFilter === "all" ? undefined : originFilter },
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

        // Track failed items
        const newFailedItems = data.results
          .filter((r: ExtractionResult) => r.error)
          .map((r: ExtractionResult) => ({
            legislationId: r.legislationId,
            legislationNumber: r.legislationNumber || r.legislationId.substring(0, 8),
            error: r.error || "Erro desconhecido",
            retryCount: 0,
          }));
        
        setFailedItems(prev => {
          const existingIds = new Set(prev.map(f => f.legislationId));
          const toAdd = newFailedItems.filter((f: FailedItem) => !existingIds.has(f.legislationId));
          return [...prev, ...toAdd];
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

  const handleContinuousExtraction = async () => {
    setIsContinuousExtracting(true);
    stopContinuousRef.current = false;
    setContinuousStats({
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      totalRequirements: 0,
      batchesCompleted: 0,
      retriesPerformed: 0,
    });
    setResults(null);
    setStats(null);
    setFailedItems([]);

    let totalProcessed = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalRequirements = 0;
    let batchesCompleted = 0;
    let retriesPerformed = 0;
    const batchFailedItems: FailedItem[] = [];

    // Helper function to process a single batch with offset
    const processBatch = async (offset: number, batchLimit: number) => {
      const { data, error } = await supabase.functions.invoke("extract-requirements", {
        body: { 
          limit: batchLimit, 
          offset,
          dryRun: false,
          origin: originFilter === "all" ? undefined : originFilter,
        },
      });
      
      if (error) {
        console.error(`Batch error (offset ${offset}):`, error);
        return null;
      }
      
      return data;
    };

    try {
      while (!stopContinuousRef.current) {
        // Check how many are left
        const statsCheck = await refetchStats();
        const remaining = statsCheck.data?.legislationWithoutRequirements || 0;
        
        if (remaining === 0) {
          // Try retrying failed items if auto-retry is enabled
          if (autoRetry && batchFailedItems.length > 0) {
            const retryableItems = batchFailedItems.filter(f => f.retryCount < maxRetries);
            
            if (retryableItems.length > 0) {
              console.log(`Auto-retrying ${retryableItems.length} failed items...`);
              
              const { data } = await supabase.functions.invoke("extract-requirements", {
                body: { 
                  legislationIds: retryableItems.map(f => f.legislationId),
                  dryRun: false 
                },
              });

              if (data?.success) {
                retriesPerformed++;
                
                const successfulIds = new Set(
                  data.results
                    .filter((r: ExtractionResult) => !r.error && r.requirementsCount > 0)
                    .map((r: ExtractionResult) => r.legislationId)
                );

                // Update counts
                totalSuccessful += data.successful;
                totalFailed -= data.successful;
                totalRequirements += data.totalRequirements;

                // Update failed items
                retryableItems.forEach(item => {
                  if (successfulIds.has(item.legislationId)) {
                    const idx = batchFailedItems.findIndex(f => f.legislationId === item.legislationId);
                    if (idx !== -1) batchFailedItems.splice(idx, 1);
                  } else {
                    item.retryCount++;
                  }
                });

                setContinuousStats({
                  totalProcessed,
                  totalSuccessful,
                  totalFailed,
                  totalRequirements,
                  batchesCompleted,
                  retriesPerformed,
                });

                // Continue loop if we still have retryable items
                if (batchFailedItems.some(f => f.retryCount < maxRetries)) {
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  continue;
                }
              }
            }
          }

          toast({
            title: "Extração completa!",
            description: `Todos os diplomas foram processados. Total: ${totalRequirements} requisitos extraídos.`,
          });
          break;
        }

        // Calculate how many parallel batches to run
        const effectiveParallelBatches = Math.min(parallelBatches, Math.ceil(remaining / batchSize));
        const batchPromises: Promise<any>[] = [];
        
        // Create parallel batch promises with different offsets
        for (let i = 0; i < effectiveParallelBatches; i++) {
          const offset = i * batchSize;
          const batchLimit = Math.min(batchSize, remaining - offset);
          if (batchLimit > 0) {
            batchPromises.push(processBatch(offset, batchLimit));
          }
        }

        // Execute all batches in parallel
        console.log(`Processing ${batchPromises.length} parallel batches...`);
        const batchResults = await Promise.all(batchPromises);

        // Aggregate results from all parallel batches
        let batchProcessed = 0;
        let batchSuccessful = 0;
        let batchFailed = 0;
        let batchRequirements = 0;

        for (const data of batchResults) {
          if (data?.success) {
            batchProcessed += data.processed;
            batchSuccessful += data.successful;
            batchFailed += data.failed;
            batchRequirements += data.totalRequirements;

            // Track failed items from this batch
            data.results
              .filter((r: ExtractionResult) => r.error)
              .forEach((r: ExtractionResult) => {
                batchFailedItems.push({
                  legislationId: r.legislationId,
                  legislationNumber: r.legislationNumber || r.legislationId.substring(0, 8),
                  error: r.error || "Erro desconhecido",
                  retryCount: 0,
                });
              });
          }
        }

        totalProcessed += batchProcessed;
        totalSuccessful += batchSuccessful;
        totalFailed += batchFailed;
        totalRequirements += batchRequirements;
        batchesCompleted += effectiveParallelBatches;

        setContinuousStats({
          totalProcessed,
          totalSuccessful,
          totalFailed,
          totalRequirements,
          batchesCompleted,
          retriesPerformed,
        });

        // Small delay between parallel batch rounds
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Store final failed items for manual retry
      setFailedItems(batchFailedItems);

    } catch (error) {
      console.error("Continuous extraction error:", error);
      toast({
        title: "Erro na extração contínua",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsContinuousExtracting(false);
      queryClient.invalidateQueries({ queryKey: ["requirements-stats"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
    }
  };

  const handleStopContinuous = () => {
    stopContinuousRef.current = true;
    toast({
      title: "A parar extração",
      description: "A extração será parada após o lote atual terminar.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Origin Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Filtrar por origem:</Label>
            <Select
              value={originFilter}
              onValueChange={(value) => setOriginFilter(value as OriginFilter)}
              disabled={isContinuousExtracting || isExtracting}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Todos os diplomas
                  </span>
                </SelectItem>
                <SelectItem value="PT">
                  <span className="flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    🇵🇹 Portugal (DRE)
                  </span>
                </SelectItem>
                <SelectItem value="EU">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    🇪🇺 União Europeia
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {originFilter !== "all" && (
              <Badge variant="secondary" className="gap-1">
                {originFilter === "PT" ? "🇵🇹 PT" : "🇪🇺 EU"}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              Total de Diplomas
              {originFilter !== "all" && (
                <Badge variant="outline" className="text-xs ml-1">
                  {originFilter === "PT" ? "🇵🇹" : "🇪🇺"}
                </Badge>
              )}
            </CardDescription>
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

      {/* Detailed Progress Panel */}
      <DetailedProgressPanel runningJob={runningJob} />

      {/* Progress bar */}
      {dbStats && dbStats.totalLegislation > 0 && (
        <Card className={runningJob ? "border-green-500/50 bg-green-50/30" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Progresso da extração</span>
                {runningJob && (
                  <>
                    <Badge variant="default" className="gap-1 bg-green-600 animate-pulse">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      A executar
                    </Badge>
                    {runningJob.error_message?.includes('Origem:') && (
                      <Badge variant="outline" className="gap-1">
                        {runningJob.error_message.includes('PT') && <Flag className="h-3 w-3 text-green-600" />}
                        {runningJob.error_message.includes('EU') && <Globe className="h-3 w-3 text-blue-600" />}
                        {runningJob.error_message.replace('Origem: ', '')}
                      </Badge>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {Math.round((dbStats.legislationWithRequirements / dbStats.totalLegislation) * 100)}%
                </span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => refetchStats()}
                >
                  <RefreshCw className={`h-3 w-3 ${runningJob ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            <Progress 
              value={(dbStats.legislationWithRequirements / dbStats.totalLegislation) * 100} 
              className="h-2"
            />
            {runningJob && dbStats && (
              <div className="mt-3 p-3 bg-muted/50 rounded-md text-sm">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Processados: <strong>{runningJob.items_processed || 0}</strong> | 
                      Requisitos: <strong>{runningJob.items_added || 0}</strong>
                    </span>
                    {runningJob.error_message && (
                      <span className="text-xs text-muted-foreground">
                        {runningJob.error_message}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const processed = runningJob.items_processed || 0;
                    const remaining = dbStats.legislationWithoutRequirements - processed;
                    const elapsedMs = new Date().getTime() - new Date(runningJob.started_at).getTime();
                    const elapsedMin = elapsedMs / 60000;
                    
                    if (processed > 0 && remaining > 0) {
                      const avgTimePerItem = elapsedMs / processed;
                      const estimatedRemainingMs = avgTimePerItem * remaining;
                      const estimatedMin = Math.ceil(estimatedRemainingMs / 60000);
                      const hours = Math.floor(estimatedMin / 60);
                      const mins = estimatedMin % 60;
                      
                      return (
                        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                          <span>
                            ⏱️ Decorrido: {Math.floor(elapsedMin)}min | 
                            Total: {dbStats.legislationWithoutRequirements} | Faltam: ~{remaining} diplomas
                          </span>
                          <span className="font-medium text-primary">
                            Tempo estimado: {hours > 0 ? `${hours}h ${mins}min` : `${mins}min`}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Speed Chart */}
      {runningJob && speedHistory.length > 1 && (
        <Card className="border-blue-500/50 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Velocidade de Processamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={speedHistory} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    label={{ value: 'items/min', angle: -90, position: 'insideLeft', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'speed') return [`${value} diplomas/min`, 'Velocidade'];
                      if (name === 'requirementsAdded') return [value, 'Requisitos'];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Hora: ${label}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="speed" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1}
                    fill="url(#speedGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>
                Média: <strong>
                  {Math.round(speedHistory.reduce((a, b) => a + b.speed, 0) / speedHistory.length)} diplomas/min
                </strong>
              </span>
              <span>
                Pico: <strong>
                  {Math.max(...speedHistory.map(s => s.speed))} diplomas/min
                </strong>
              </span>
              <span>
                Atual: <strong>
                  {speedHistory[speedHistory.length - 1]?.speed || 0} diplomas/min
                </strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/50 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Extração Contínua
          </CardTitle>
          <CardDescription>
            Processa automaticamente todos os diplomas em lotes até terminar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="batch-size">Tamanho do lote</Label>
              <Input
                id="batch-size"
                type="number"
                min={10}
                max={100}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-24"
                disabled={isContinuousExtracting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parallel-batches">Lotes paralelos</Label>
              <Input
                id="parallel-batches"
                type="number"
                min={1}
                max={5}
                value={parallelBatches}
                onChange={(e) => setParallelBatches(Math.max(1, Math.min(5, Number(e.target.value))))}
                className="w-20"
                disabled={isContinuousExtracting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-retries">Máx. retries</Label>
              <Input
                id="max-retries"
                type="number"
                min={1}
                max={5}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value))}
                className="w-20"
                disabled={isContinuousExtracting}
              />
            </div>

            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="auto-retry"
                checked={autoRetry}
                onCheckedChange={setAutoRetry}
                disabled={isContinuousExtracting}
              />
              <Label htmlFor="auto-retry" className="cursor-pointer text-sm">
                Retry automático
              </Label>
            </div>

            {isContinuousExtracting ? (
              <Button
                onClick={handleStopContinuous}
                variant="destructive"
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Parar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  onClick={handleContinuousExtraction}
                  disabled={isExtracting || isBackgroundExtracting || !dbStats?.legislationWithoutRequirements}
                  className="gap-2"
                >
                  <Zap className="h-4 w-4" />
                  Extração no Browser
                </Button>
                <Button
                  onClick={async () => {
                    setIsBackgroundExtracting(true);
                    try {
                      const selectedOrigin = originFilter === "all" ? undefined : originFilter;
                      const { data, error } = await supabase.functions.invoke("extract-requirements-background", {
                        body: { 
                          batchSize, 
                          maxBatches: 100, 
                          origin: selectedOrigin,
                          useUrl: true
                        },
                      });
                      
                      if (error) throw error;
                      
                      // Set pending sequential if starting PT and auto-sequential is enabled
                      if (autoSequential && (selectedOrigin === "PT" || !selectedOrigin)) {
                        setPendingSequentialStep("EU");
                        lastCompletedJobRef.current = null; // Reset to detect new completion
                      }
                      
                      toast({
                        title: "Extração em segundo plano iniciada",
                        description: autoSequential && (selectedOrigin === "PT" || !selectedOrigin)
                          ? "Sequência: PT → EU → Relações"
                          : "Pode fechar esta janela. O progresso será registado em sync_logs.",
                      });
                      
                      refetchRunningJob();
                    } catch (error) {
                      console.error("Background extraction error:", error);
                      toast({
                        title: "Erro ao iniciar extração",
                        description: error instanceof Error ? error.message : "Erro desconhecido",
                        variant: "destructive",
                      });
                    } finally {
                      setIsBackgroundExtracting(false);
                    }
                  }}
                  disabled={isExtracting || isContinuousExtracting || isBackgroundExtracting || !dbStats?.legislationWithoutRequirements}
                  variant="outline"
                  className="gap-2"
                >
                  {isBackgroundExtracting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                  Extração no Servidor
                </Button>
              </div>
            )}
          </div>

          {/* Auto-Sequential Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-green-600" />
                <span className="text-sm">PT</span>
              </div>
              <span className="text-muted-foreground">→</span>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-600" />
                <span className="text-sm">EU</span>
              </div>
              <span className="text-muted-foreground">→</span>
              <div className="flex items-center gap-2">
                <Link className="h-4 w-4 text-purple-600" />
                <span className="text-sm">Relações</span>
              </div>
              <span className="text-sm text-muted-foreground ml-2">
                Extração sequencial automática
              </span>
              {pendingSequentialStep && (
                <Badge variant="secondary" className="animate-pulse">
                  {pendingSequentialStep === "EU" ? "EU pendente" : "Relações pendentes"}
                </Badge>
              )}
            </div>
            <Switch
              checked={autoSequential}
              onCheckedChange={(checked) => {
                setAutoSequential(checked);
                if (!checked) setPendingSequentialStep(null);
              }}
            />
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3">
            <p><strong>Browser:</strong> Mais rápido com lotes paralelos, mas para se fechar a janela.</p>
            <p><strong>Servidor:</strong> Continua mesmo após fechar o browser. Progresso visível em Cron Jobs.</p>
            {autoSequential && (
              <p className="mt-1 text-primary"><strong>Sequencial:</strong> PT → EU → Relações (automático)</p>
            )}
          </div>

          {/* Continuous Stats */}
          {continuousStats && (
            <div className="p-4 rounded-lg bg-background border">
              <div className="flex items-center gap-2 mb-3">
                {isContinuousExtracting && <Loader2 className="h-4 w-4 animate-spin" />}
                <span className="font-medium">
                  {isContinuousExtracting ? "A processar..." : "Extração terminada"}
                </span>
                <Badge variant="outline">Lote {continuousStats.batchesCompleted}</Badge>
                {continuousStats.retriesPerformed > 0 && (
                  <Badge variant="secondary">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {continuousStats.retriesPerformed} retries
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-2xl font-bold">{continuousStats.totalProcessed}</p>
                  <p className="text-sm text-muted-foreground">Processados</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{continuousStats.totalSuccessful}</p>
                  <p className="text-sm text-muted-foreground">Sucesso</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{continuousStats.totalFailed}</p>
                  <p className="text-sm text-muted-foreground">Falhados</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{continuousStats.totalRequirements}</p>
                  <p className="text-sm text-muted-foreground">Requisitos</p>
                </div>
              </div>
            </div>
          )}

          {/* Failed Items with Retry */}
          {failedItems.length > 0 && !isContinuousExtracting && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="font-medium text-red-800">
                    {failedItems.length} diplomas falhados
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExportFailedToExcel}
                    className="gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Exportar Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFailedItems([])}
                    className="gap-1"
                  >
                    Limpar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleRetryFailed()}
                    disabled={isRetrying || failedItems.every(f => f.retryCount >= maxRetries)}
                    className="gap-1"
                  >
                    {isRetrying ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Retentar Todos
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {failedItems.map((item, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-2 rounded bg-white text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{item.legislationNumber}</span>
                        <Badge variant="destructive" className="text-xs">
                          {item.error}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.retryCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {item.retryCount}/{maxRetries} tentativas
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRetryFailed([item.legislationId])}
                          disabled={isRetrying || item.retryCount >= maxRetries}
                          className="h-6 w-6 p-0"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Extraction Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Extração Manual
          </CardTitle>
          <CardDescription>
            Extrai requisitos de um número específico de diplomas
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
                disabled={isContinuousExtracting}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="dry-run"
                checked={dryRun}
                onCheckedChange={setDryRun}
                disabled={isContinuousExtracting}
              />
              <Label htmlFor="dry-run" className="cursor-pointer">
                Modo simulação (não insere dados)
              </Label>
            </div>

            <Button
              onClick={handleExtract}
              disabled={isExtracting || isContinuousExtracting || !dbStats?.legislationWithoutRequirements}
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

          {!dryRun && !isContinuousExtracting && (
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

      {/* URL Scraping Extraction - NEW */}
      <Card className="border-blue-300 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-blue-600" />
            Extração via URL (Scraping)
          </CardTitle>
          <CardDescription>
            Faz scraping da página DRE/EUR-Lex e extrai requisitos do texto completo do diploma.
            Método mais preciso, requer Firecrawl ativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Origin filter for scraping */}
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Filtrar por origem:</Label>
            <Select
              value={scrapeOriginFilter}
              onValueChange={(value) => setScrapeOriginFilter(value as OriginFilter)}
              disabled={isScraping}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Todos os diplomas
                  </span>
                </SelectItem>
                <SelectItem value="PT">
                  <span className="flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    🇵🇹 Portugal (DRE)
                  </span>
                </SelectItem>
                <SelectItem value="EU">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    🇪🇺 União Europeia (EUR-Lex)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {scrapeOriginFilter !== "all" && (
              <Badge variant="secondary" className="gap-1">
                {scrapeOriginFilter === "PT" ? "🇵🇹 PT" : "🇪🇺 EU"}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <Label htmlFor="scrape-limit">Diplomas por lote</Label>
              <Input
                id="scrape-limit"
                type="number"
                min={1}
                max={20}
                value={scrapeLimit}
                onChange={(e) => setScrapeLimit(Number(e.target.value))}
                className="w-24"
                disabled={isScraping}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="scrape-dry-run"
                checked={scrapeDryRun}
                onCheckedChange={setScrapeDryRun}
                disabled={isScraping}
              />
              <Label htmlFor="scrape-dry-run" className="cursor-pointer">
                Modo simulação
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="replace-existing"
                checked={replaceExisting}
                onCheckedChange={setReplaceExisting}
                disabled={isScraping || scrapeDryRun}
              />
              <Label htmlFor="replace-existing" className="cursor-pointer text-sm">
                Substituir requisitos existentes
              </Label>
            </div>

            <Button
              onClick={handleScrapeExtract}
              disabled={isScraping || isContinuousExtracting}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
            >
              {isScraping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {isScraping ? "A extrair..." : scrapeDryRun ? "Simular Scraping" : "Extrair via URL"}
            </Button>
          </div>

          {!scrapeDryRun && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-100 border border-blue-200 text-blue-800 text-sm">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <span>
                Os requisitos serão extraídos do texto completo da página e guardados na base de dados.
              </span>
            </div>
          )}

          {/* Scrape Results */}
          {scrapeStats && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-background border">
                <Link className="h-8 w-8 text-blue-600" />
                <div className="flex-1 grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xl font-bold">{scrapeStats.processed}</p>
                    <p className="text-sm text-muted-foreground">Processados</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{scrapeStats.successful}</p>
                    <p className="text-sm text-muted-foreground">Sucesso</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{scrapeStats.failed}</p>
                    <p className="text-sm text-muted-foreground">Falhados</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{scrapeStats.totalRequirements}</p>
                    <p className="text-sm text-muted-foreground">Requisitos</p>
                  </div>
                </div>
              </div>

              {scrapeResults && scrapeResults.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Detalhes por diploma (com preview dos requisitos):</h4>
                  <ScrollArea className="h-80 rounded border">
                    <div className="p-4 space-y-4">
                      {scrapeResults.map((result, index) => (
                        <div 
                          key={index}
                          className="p-3 rounded-lg bg-background border"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {result.error ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              )}
                              <span className="font-medium text-sm">
                                {result.legislationNumber}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {result.textLength > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {(result.textLength / 1000).toFixed(1)}k chars
                                </Badge>
                              )}
                              {result.error ? (
                                <Badge variant="destructive" className="text-xs">
                                  {result.error}
                                </Badge>
                              ) : (
                                <Badge className="text-xs bg-blue-100 text-blue-800">
                                  {result.requirementsCount} requisitos
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {/* Show extracted requirements preview */}
                          {result.requirements && result.requirements.length > 0 && (
                            <div className="mt-2 pl-6 space-y-1 border-l-2 border-blue-200">
                              {result.requirements.slice(0, 3).map((req, reqIdx) => (
                                <div key={reqIdx} className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{req.article}:</span>{' '}
                                  {req.requirement_text.substring(0, 100)}
                                  {req.requirement_text.length > 100 && '...'}
                                </div>
                              ))}
                              {result.requirements.length > 3 && (
                                <div className="text-xs text-blue-600">
                                  +{result.requirements.length - 3} mais requisitos...
                                </div>
                              )}
                            </div>
                          )}
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
