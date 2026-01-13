import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Download,
  Flag,
  FileText,
  Calendar,
  Building2,
  Globe
} from "lucide-react";

interface LegislationUpdate {
  title?: string;
  summary?: string;
  entity?: string;
  document_url?: string;
  publication_date?: string;
}

interface ProcessResult {
  id: string;
  number: string;
  success: boolean;
  updates?: LegislationUpdate;
  error?: string;
}

interface SyncLogProgress {
  id: string;
  status: string;
  items_processed: number;
  items_added: number; // total items
  items_updated: number;
  error_message: string | null;
}

interface CompleteAutoImportedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompleteAutoImportedDialog({ open, onOpenChange }: CompleteAutoImportedDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [limit, setLimit] = useState(10);
  const [dryRun, setDryRun] = useState(false);
  const [includePT, setIncludePT] = useState(true);
  const [includeEU, setIncludeEU] = useState(true);
  const [results, setResults] = useState<ProcessResult[] | null>(null);
  const [stats, setStats] = useState<{
    processed: number;
    successful: number;
    failed: number;
    totalUpdated: number;
    totalUrlsFound: number;
    totalMetadataExtracted: number;
  } | null>(null);
  
  // Real-time progress tracking
  const [syncLogId, setSyncLogId] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<SyncLogProgress | null>(null);
  const [currentItem, setCurrentItem] = useState<string | null>(null);

  // Subscribe to sync_log updates for real-time progress
  useEffect(() => {
    if (!syncLogId || !isProcessing) return;

    const channel = supabase
      .channel(`sync-progress-${syncLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sync_logs',
          filter: `id=eq.${syncLogId}`,
        },
        (payload) => {
          const newData = payload.new as SyncLogProgress;
          setLiveProgress(newData);
          
          // Extract current item from error_message (used as progress message)
          if (newData.error_message?.startsWith('Processando:')) {
            setCurrentItem(newData.error_message.replace('Processando: ', ''));
          } else if (newData.error_message?.startsWith('Erro:')) {
            setCurrentItem(newData.error_message);
          }
          
          // Check if completed
          if (newData.status === 'completed') {
            setIsProcessing(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncLogId, isProcessing]);

  const handleComplete = async () => {
    setIsProcessing(true);
    setResults(null);
    setStats(null);
    setLiveProgress(null);
    setCurrentItem(null);
    setSyncLogId(null);

    try {
      const { data, error } = await supabase.functions.invoke("complete-auto-imported-legislation", {
        body: { 
          limit, 
          dryRun,
          includePT,
          includeEU,
          fixDates: true,
        },
      });

      if (error) throw error;

      if (data.success) {
        // Store syncLogId for real-time tracking (if not dry run)
        if (data.syncLogId && !dryRun) {
          setSyncLogId(data.syncLogId);
        }
        
        setResults(data.results);
        setStats({
          processed: data.processed,
          successful: data.successful,
          failed: data.failed,
          totalUpdated: data.totalUpdated,
          totalUrlsFound: data.totalUrlsFound,
          totalMetadataExtracted: data.totalMetadataExtracted,
        });

        toast({
          title: dryRun ? "Simulação concluída" : "Diplomas completados",
          description: `${data.totalUpdated} diplomas atualizados, ${data.totalUrlsFound} URLs encontrados, ${data.totalMetadataExtracted} metadados extraídos`,
        });

        if (!dryRun) {
          queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
          queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
        }
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Complete auto-imported error:", error);
      toast({
        title: "Erro ao completar diplomas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getUpdateSummary = (updates?: LegislationUpdate) => {
    if (!updates || Object.keys(updates).length === 0) return null;
    
    const items: { icon: React.ReactNode; label: string; value: string }[] = [];
    
    if (updates.document_url) {
      items.push({ 
        icon: <Download className="h-3 w-3" />, 
        label: "URL", 
        value: "Encontrado" 
      });
    }
    if (updates.summary) {
      items.push({ 
        icon: <FileText className="h-3 w-3" />, 
        label: "Sumário", 
        value: updates.summary.substring(0, 60) + (updates.summary.length > 60 ? "..." : "") 
      });
    }
    if (updates.entity) {
      items.push({ 
        icon: <Building2 className="h-3 w-3" />, 
        label: "Entidade", 
        value: updates.entity 
      });
    }
    if (updates.publication_date) {
      items.push({ 
        icon: <Calendar className="h-3 w-3" />, 
        label: "Data", 
        value: updates.publication_date 
      });
    }
    if (updates.title && !updates.title.includes("Publicação:")) {
      items.push({ 
        icon: <FileText className="h-3 w-3" />, 
        label: "Título", 
        value: updates.title.substring(0, 60) + (updates.title.length > 60 ? "..." : "") 
      });
    }
    
    return items;
  };

  // Calculate progress percentage
  const progressPercent = liveProgress && liveProgress.items_added > 0
    ? Math.round((liveProgress.items_processed / liveProgress.items_added) * 100)
    : (stats ? 100 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Completar Diplomas Auto-Importados
          </DialogTitle>
          <DialogDescription>
            Completa dados de diplomas criados automaticamente durante a extração de relações, buscando URL e metadados no DRE/EUR-Lex.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="limit">Diplomas a processar</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-24"
                disabled={isProcessing}
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="include-pt"
                  checked={includePT}
                  onCheckedChange={setIncludePT}
                  disabled={isProcessing}
                />
                <Label htmlFor="include-pt" className="cursor-pointer flex items-center gap-1">
                  <Flag className="h-3 w-3 text-green-600" />
                  PT
                </Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Switch
                  id="include-eu"
                  checked={includeEU}
                  onCheckedChange={setIncludeEU}
                  disabled={isProcessing}
                />
                <Label htmlFor="include-eu" className="cursor-pointer flex items-center gap-1">
                  <Globe className="h-3 w-3 text-blue-600" />
                  EU
                </Label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="dry-run"
                checked={dryRun}
                onCheckedChange={setDryRun}
                disabled={isProcessing}
              />
              <Label htmlFor="dry-run" className="cursor-pointer">
                Simulação
              </Label>
            </div>

            <Button
              onClick={handleComplete}
              disabled={isProcessing || (!includePT && !includeEU)}
              className="gap-2"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isProcessing ? "A processar..." : dryRun ? "Simular" : "Completar Diplomas"}
            </Button>
          </div>

          {/* Info banner */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm">
            <Flag className="h-4 w-4 flex-shrink-0" />
            <span>
              Esta função procura diplomas com dados incompletos (sem URL, sumário com "Diploma referenciado", ou título igual ao número) e busca os dados no DRE/EUR-Lex.
            </span>
          </div>

          {!dryRun && !isProcessing && !results && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <Download className="h-4 w-4 flex-shrink-0" />
              <span>
                Os diplomas serão atualizados na base de dados com os dados encontrados.
              </span>
            </div>
          )}

          {/* Real-time Progress */}
          {isProcessing && (
            <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium">A processar diplomas...</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {liveProgress ? `${liveProgress.items_processed}/${liveProgress.items_added}` : 'Iniciando...'}
                </span>
              </div>
              
              <Progress value={progressPercent} className="h-2" />
              
              {currentItem && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <span className="truncate">{currentItem}</span>
                </div>
              )}
              
              {liveProgress && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Processados:</span>{' '}
                    <span className="font-medium">{liveProgress.items_processed}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Atualizados:</span>{' '}
                    <span className="font-medium text-green-600">{liveProgress.items_updated}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          {stats && !isProcessing && (
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
              <div className="text-center">
                <p className="text-2xl font-bold">{stats.processed}</p>
                <p className="text-sm text-muted-foreground">Diplomas processados</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.totalUpdated}</p>
                <p className="text-sm text-muted-foreground">{dryRun ? "A atualizar" : "Atualizados"}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.totalMetadataExtracted}</p>
                <p className="text-sm text-muted-foreground">Metadados extraídos</p>
              </div>
            </div>
          )}

          {/* Results */}
          {results && results.length > 0 && !isProcessing && (
            <ScrollArea className="flex-1 rounded border">
              <div className="p-4 space-y-3">
                {results.map((result, index) => {
                  const updateItems = getUpdateSummary(result.updates);
                  
                  return (
                    <div 
                      key={index}
                      className="p-4 rounded-lg bg-background border"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {result.error ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : updateItems && updateItems.length > 0 ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <span className="h-4 w-4 rounded-full bg-muted" />
                          )}
                          <span className="font-medium">{result.number}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {result.error ? (
                            <Badge variant="destructive" className="text-xs">{result.error}</Badge>
                          ) : updateItems && updateItems.length > 0 ? (
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              {updateItems.length} campos
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Sem alterações</Badge>
                          )}
                        </div>
                      </div>
                      
                      {updateItems && updateItems.length > 0 && (
                        <div className="space-y-1 pl-6 text-sm">
                          {updateItems.map((item, itemIdx) => (
                            <div 
                              key={itemIdx} 
                              className="flex items-start gap-2 text-muted-foreground"
                            >
                              {item.icon}
                              <span className="font-medium">{item.label}:</span>
                              <span className="text-foreground truncate">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {results && results.length === 0 && !isProcessing && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p>Não há diplomas incompletos para processar!</p>
              <p className="text-sm">Todos os diplomas auto-importados já têm dados completos.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
