import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Square, 
  FileText,
  Globe,
  Link as LinkIcon,
  BookOpen,
  FolderTree,
  AlertTriangle,
  Sparkles
} from "lucide-react";

interface FixTask {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  result?: { success: number; failed: number };
  error?: string;
}

interface BulkAutoFixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qualityStats: {
    genericTitlesPT: number;
    genericTitlesEU: number;
    missingSummary: number;
    missingUrl: number;
    noRequirements: number;
    noCategories: number;
  };
}

export function BulkAutoFixDialog({
  open,
  onOpenChange,
  qualityStats,
}: BulkAutoFixDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const abortRef = useRef(false);
  
  const [isRunning, setIsRunning] = useState(false);
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set([
    "fix-pt-titles",
    "fix-eu-titles",
    "auto-categorize",
  ]));
  
  const [tasks, setTasks] = useState<FixTask[]>([
    {
      id: "fix-pt-titles",
      name: "Corrigir Títulos PT",
      description: "Extrair títulos completos do DRE via scraping",
      icon: <FileText className="h-4 w-4" />,
      count: qualityStats.genericTitlesPT,
      status: "pending",
    },
    {
      id: "fix-eu-titles",
      name: "Corrigir Títulos EU",
      description: "Extrair títulos do EUR-Lex via API",
      icon: <Globe className="h-4 w-4" />,
      count: qualityStats.genericTitlesEU,
      status: "pending",
    },
    {
      id: "find-missing-urls",
      name: "Encontrar URLs em falta",
      description: "Pesquisar URLs no DRE para diplomas sem link",
      icon: <LinkIcon className="h-4 w-4" />,
      count: qualityStats.missingUrl,
      status: "pending",
    },
    {
      id: "auto-categorize",
      name: "Auto-categorizar",
      description: "Categorizar diplomas via IA baseado em keywords",
      icon: <FolderTree className="h-4 w-4" />,
      count: qualityStats.noCategories,
      status: "pending",
    },
    {
      id: "extract-requirements",
      name: "Extrair Requisitos",
      description: "Extrair requisitos legais via IA (lento)",
      icon: <BookOpen className="h-4 w-4" />,
      count: qualityStats.noRequirements,
      status: "pending",
    },
  ]);

  const toggleTask = (taskId: string) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const updateTask = (taskId: string, updates: Partial<FixTask>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  };

  const runFixPTTitles = async (): Promise<{ success: number; failed: number }> => {
    const batchSize = 50;
    let totalSuccess = 0;
    let totalFailed = 0;
    let processed = 0;

    // Get all PT legislation with generic titles that have valid DRE URLs
    const { data: legislation } = await supabase
      .from("legislation")
      .select("id, number, title, document_url")
      .or("origin.eq.PT,origin.eq.dre")
      .not("document_url", "is", null)
      .like("document_url", "%/dr/detalhe/%")
      .limit(500);

    if (!legislation || legislation.length === 0) {
      return { success: 0, failed: 0 };
    }

    // Filter only those with generic titles
    const genericPattern = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Declaração|Acórdão|Aviso|Parecer)\s+n\.?º?\s/i;
    const toFix = legislation.filter(leg => {
      const titleEqualsNumber = leg.title === leg.number;
      const hasGenericPattern = genericPattern.test(leg.title || '') && 
        (leg.title?.length || 0) < 80 && 
        !leg.title?.includes(' - ');
      return titleEqualsNumber || hasGenericPattern || !leg.title;
    });

    const total = Math.min(toFix.length, 200); // Limit to 200 for safety

    for (let i = 0; i < total && !abortRef.current; i += batchSize) {
      const batch = toFix.slice(i, i + batchSize);
      const ids = batch.map(l => l.id);

      try {
        const { data, error } = await supabase.functions.invoke("reimport-dre-metadata", {
          body: { legislationIds: ids },
        });

        if (error) throw error;
        
        totalSuccess += data?.updated || 0;
        totalFailed += (batch.length - (data?.updated || 0));
        processed += batch.length;
        
        updateTask("fix-pt-titles", {
          result: { success: totalSuccess, failed: totalFailed },
        });
      } catch (err) {
        totalFailed += batch.length;
        console.error("Error fixing PT titles batch:", err);
      }
    }

    return { success: totalSuccess, failed: totalFailed };
  };

  const runFixEUTitles = async (): Promise<{ success: number; failed: number }> => {
    try {
      const { data, error } = await supabase.functions.invoke("fix-eurlex-titles", {
        body: { limit: 200, dryRun: false },
      });

      if (error) throw error;

      return {
        success: data?.summary?.updated || 0,
        failed: data?.summary?.failed || 0,
      };
    } catch (err) {
      console.error("Error fixing EU titles:", err);
      throw err;
    }
  };

  const runFindMissingUrls = async (): Promise<{ success: number; failed: number }> => {
    try {
      const { data, error } = await supabase.functions.invoke("find-missing-dre-urls", {
        body: { limit: 50, dryRun: false },
      });

      if (error) throw error;

      return {
        success: data?.updated || 0,
        failed: data?.failed || 0,
      };
    } catch (err) {
      console.error("Error finding missing URLs:", err);
      throw err;
    }
  };

  const runAutoCategorize = async (): Promise<{ success: number; failed: number }> => {
    try {
      const { data, error } = await supabase.functions.invoke("auto-categorize-legislation", {
        body: { limit: 200 },
      });

      if (error) throw error;

      return {
        success: data?.categorized || 0,
        failed: 0,
      };
    } catch (err) {
      console.error("Error auto-categorizing:", err);
      throw err;
    }
  };

  const runExtractRequirements = async (): Promise<{ success: number; failed: number }> => {
    // This is slow, so we just do a small batch
    try {
      const { data, error } = await supabase.functions.invoke("extract-requirements", {
        body: { limit: 10, origin: "PT" },
      });

      if (error) throw error;

      return {
        success: data?.processed || 0,
        failed: data?.failed || 0,
      };
    } catch (err) {
      console.error("Error extracting requirements:", err);
      throw err;
    }
  };

  const handleStart = async () => {
    setIsRunning(true);
    abortRef.current = false;

    // Reset all selected tasks to pending
    setTasks(prev => prev.map(t => ({
      ...t,
      status: selectedTasks.has(t.id) ? "pending" : "skipped",
      result: undefined,
      error: undefined,
    })));

    const taskRunners: Record<string, () => Promise<{ success: number; failed: number }>> = {
      "fix-pt-titles": runFixPTTitles,
      "fix-eu-titles": runFixEUTitles,
      "find-missing-urls": runFindMissingUrls,
      "auto-categorize": runAutoCategorize,
      "extract-requirements": runExtractRequirements,
    };

    for (const task of tasks) {
      if (abortRef.current) break;
      if (!selectedTasks.has(task.id)) continue;

      setCurrentTask(task.id);
      updateTask(task.id, { status: "running" });

      try {
        const result = await taskRunners[task.id]();
        updateTask(task.id, { 
          status: "completed", 
          result 
        });
      } catch (err) {
        updateTask(task.id, { 
          status: "failed", 
          error: err instanceof Error ? err.message : "Erro desconhecido" 
        });
      }
    }

    setCurrentTask(null);
    setIsRunning(false);

    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
    queryClient.invalidateQueries({ queryKey: ["legislation"] });
    queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });

    toast({
      title: "Correção automática concluída",
      description: "As tarefas de correção foram executadas. Verifique os resultados.",
    });
  };

  const handleStop = () => {
    abortRef.current = true;
    setIsRunning(false);
    setCurrentTask(null);
  };

  const completedTasks = tasks.filter(t => t.status === "completed").length;
  const failedTasks = tasks.filter(t => t.status === "failed").length;
  const totalSelected = selectedTasks.size;
  const progressPercent = totalSelected > 0 
    ? ((completedTasks + failedTasks) / totalSelected) * 100 
    : 0;

  const getStatusIcon = (status: FixTask["status"]) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  const getStatusBadge = (status: FixTask["status"]) => {
    switch (status) {
      case "running":
        return <Badge variant="secondary">A executar...</Badge>;
      case "completed":
        return <Badge className="bg-green-500">Concluído</Badge>;
      case "failed":
        return <Badge variant="destructive">Falhou</Badge>;
      case "skipped":
        return <Badge variant="outline">Ignorado</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Correção Automática em Massa
          </DialogTitle>
          <DialogDescription>
            Selecione as tarefas de correção a executar automaticamente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress */}
          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progresso geral</span>
                <span>{completedTasks + failedTasks}/{totalSelected} tarefas</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          {/* Task List */}
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {tasks.map((task) => (
                <div 
                  key={task.id}
                  className={`p-4 rounded-lg border ${
                    task.status === "running" ? "border-blue-500 bg-blue-500/5" :
                    task.status === "completed" ? "border-green-500/50 bg-green-500/5" :
                    task.status === "failed" ? "border-red-500/50 bg-red-500/5" :
                    task.status === "skipped" ? "border-muted bg-muted/30" :
                    "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={task.id}
                      checked={selectedTasks.has(task.id)}
                      onCheckedChange={() => toggleTask(task.id)}
                      disabled={isRunning}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        <Label 
                          htmlFor={task.id} 
                          className="font-medium cursor-pointer flex items-center gap-2"
                        >
                          {task.icon}
                          {task.name}
                        </Label>
                        {task.count > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {task.count} registos
                          </Badge>
                        )}
                        {getStatusBadge(task.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {task.description}
                      </p>
                      
                      {/* Results */}
                      {task.result && (
                        <div className="mt-2 flex gap-4 text-sm">
                          <span className="text-green-600">
                            ✓ {task.result.success} corrigidos
                          </span>
                          {task.result.failed > 0 && (
                            <span className="text-red-600">
                              ✗ {task.result.failed} falharam
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Error */}
                      {task.error && (
                        <p className="mt-2 text-sm text-red-600">
                          Erro: {task.error}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Summary */}
          {!isRunning && completedTasks > 0 && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium">Resumo:</span>
                <span className="text-green-600">{completedTasks} concluídas</span>
                {failedTasks > 0 && (
                  <span className="text-red-600">{failedTasks} falharam</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          {isRunning ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4 mr-2" />
              Parar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button 
                onClick={handleStart}
                disabled={selectedTasks.size === 0}
              >
                <Play className="h-4 w-4 mr-2" />
                Iniciar Correção ({selectedTasks.size} tarefas)
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
