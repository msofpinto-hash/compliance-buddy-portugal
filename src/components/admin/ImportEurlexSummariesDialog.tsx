import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FileText, CheckCircle2, XCircle, ChevronRight, ChevronDown, Square, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ImportEurlexSummariesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ResultItem {
  id: string;
  number: string;
  success: boolean;
  summary?: string;
  error?: string;
}

export function ImportEurlexSummariesDialog({ open, onOpenChange }: ImportEurlexSummariesDialogProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [limit, setLimit] = useState(20);
  const [dryRun, setDryRun] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ResultItem[]>([]);
  const [summary, setSummary] = useState({ found: 0, failed: 0, processed: 0 });
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setResults([]);
      setProgress({ current: 0, total: 0 });
      setSummary({ found: 0, failed: 0, processed: 0 });
      setExpandedItems(new Set());
      setAllExpanded(false);
      setSearchFilter("");
    }
  }, [open]);

  const handleStart = async () => {
    setIsRunning(true);
    setResults([]);
    setProgress({ current: 0, total: 0 });
    setSummary({ found: 0, failed: 0, processed: 0 });

    abortControllerRef.current = new AbortController();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-eurlex-summaries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ limit, dryRun, stream: true }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "start") {
                setProgress({ current: 0, total: event.total });
              } else if (event.type === "progress") {
                setProgress({ current: event.current, total: event.total });
                if (event.item) {
                  setResults(prev => [...prev, event.item]);
                }
              } else if (event.type === "complete") {
                setSummary(event.summary);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Error:", error);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
  };

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllExpanded = () => {
    if (allExpanded) {
      setExpandedItems(new Set());
    } else {
      setExpandedItems(new Set(results.map(r => r.id)));
    }
    setAllExpanded(!allExpanded);
  };

  const filteredResults = results.filter(r => 
    r.number.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.summary?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Importar Sumários EUR-Lex
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Extrai sumários das páginas EUR-Lex para diplomas EU sem descrição
            <Badge variant="outline" className="ml-2">~146 sem sumário</Badge>
          </p>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Controls */}
          {!isRunning && results.length === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="limit">Limite de diplomas</Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 20)}
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="dryRun"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                />
                <Label htmlFor="dryRun">Simular (não guardar)</Label>
              </div>
            </div>
          )}

          {/* Progress */}
          {(isRunning || results.length > 0) && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progresso: {progress.current} / {progress.total}</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <Progress value={progressPercent} />
            </div>
          )}

          {/* Summary Stats */}
          {(isRunning || results.length > 0) && (
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{summary.processed || progress.current}</div>
                <div className="text-xs text-muted-foreground">Processados</div>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{summary.found || results.filter(r => r.success).length}</div>
                <div className="text-xs text-muted-foreground">Encontrados</div>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{summary.failed || results.filter(r => !r.success).length}</div>
                <div className="text-xs text-muted-foreground">Não encontrados</div>
              </div>
            </div>
          )}

          {/* Results List */}
          {results.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <Input
                  placeholder="Pesquisar por número ou sumário..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="flex-1"
                />
                <Button variant="ghost" size="sm" onClick={toggleAllExpanded}>
                  {allExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {allExpanded ? "Colapsar" : "Expandir"}
                </Button>
              </div>
              
              <div className="text-sm text-muted-foreground mb-2">
                Resultados ({filteredResults.length})
              </div>
              
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-4">
                  {filteredResults.map((result) => (
                    <Collapsible
                      key={result.id}
                      open={expandedItems.has(result.id)}
                      onOpenChange={() => toggleItem(result.id)}
                    >
                      <div className={`border rounded-lg ${result.success ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'}`}>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50">
                            {expandedItems.has(result.id) ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                            {result.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                            )}
                            <span className="font-medium text-sm flex-1 truncate">{result.number}</span>
                            <Badge variant={result.success ? "default" : "destructive"} className="shrink-0">
                              {result.success ? "Encontrado" : "Não encontrado"}
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 pb-3 pt-0">
                            {result.success && result.summary && (
                              <p className="text-sm text-muted-foreground bg-background p-2 rounded">
                                {result.summary}
                              </p>
                            )}
                            {!result.success && result.error && (
                              <p className="text-sm text-red-600">{result.error}</p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {isRunning ? (
            <Button variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4 mr-2" />
              Parar
            </Button>
          ) : (
            <Button onClick={handleStart} disabled={results.length > 0}>
              {results.length > 0 ? "Concluído" : "Iniciar Importação"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
