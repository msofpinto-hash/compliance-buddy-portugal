import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Upload,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Download
} from "lucide-react";

interface ImportResult {
  number: string;
  url: string;
  success: boolean;
  error?: string;
  legislationId?: string;
}

interface ImportUrlsCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportUrlsCsvDialog({ open, onOpenChange }: ImportUrlsCsvDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvData, setCsvData] = useState<{ number: string; url: string }[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const allExpanded = results.length > 0 && results.every((_, i) => expandedItems.has(i));

  const toggleExpanded = (index: number) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedItems(new Set(results.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedItems(new Set());
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header if present
      const startIndex = lines[0]?.toLowerCase().includes('número') || 
                         lines[0]?.toLowerCase().includes('numero') ||
                         lines[0]?.toLowerCase().includes('url') ? 1 : 0;
      
      const parsed: { number: string; url: string }[] = [];
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Try to split by common delimiters
        let parts: string[];
        if (line.includes('\t')) {
          parts = line.split('\t');
        } else if (line.includes(';')) {
          parts = line.split(';');
        } else {
          parts = line.split(',');
        }
        
        if (parts.length >= 2) {
          const number = parts[0].trim().replace(/^["']|["']$/g, '');
          const url = parts[1].trim().replace(/^["']|["']$/g, '');
          
          if (number && url && url.startsWith('http')) {
            parsed.push({ number, url });
          }
        }
      }
      
      setCsvData(parsed);
      setResults([]);
      
      toast({
        title: "Ficheiro carregado",
        description: `${parsed.length} registos encontrados no CSV`,
      });
    } catch (error) {
      console.error('Error parsing CSV:', error);
      toast({
        title: "Erro ao ler ficheiro",
        description: "Verifique se o formato do CSV está correto",
        variant: "destructive",
      });
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (csvData.length === 0) return;
    
    setIsProcessing(true);
    setResults([]);
    setProgress({ current: 0, total: csvData.length });
    
    const importResults: ImportResult[] = [];
    
    for (let i = 0; i < csvData.length; i++) {
      const { number, url } = csvData[i];
      setProgress({ current: i + 1, total: csvData.length });
      
      try {
        // Try to find legislation by number (exact match first)
        let { data: legislation } = await supabase
          .from('legislation')
          .select('id, number, title')
          .eq('number', number)
          .maybeSingle();
        
        // If not found, try partial match
        if (!legislation) {
          const { data: partialMatch } = await supabase
            .from('legislation')
            .select('id, number, title')
            .ilike('number', `%${number}%`)
            .limit(1)
            .maybeSingle();
          
          legislation = partialMatch;
        }
        
        if (!legislation) {
          importResults.push({
            number,
            url,
            success: false,
            error: 'Diploma não encontrado na base de dados'
          });
          continue;
        }
        
        // Update the document_url
        const { error: updateError } = await supabase
          .from('legislation')
          .update({ 
            document_url: url,
            updated_at: new Date().toISOString()
          })
          .eq('id', legislation.id);
        
        if (updateError) {
          throw updateError;
        }
        
        importResults.push({
          number,
          url,
          success: true,
          legislationId: legislation.id
        });
        
      } catch (error) {
        console.error(`Error importing ${number}:`, error);
        importResults.push({
          number,
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
      }
    }
    
    setResults(importResults);
    setIsProcessing(false);
    
    const successCount = importResults.filter(r => r.success).length;
    
    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
    }
    
    toast({
      title: "Importação concluída",
      description: `${successCount} de ${importResults.length} URLs importados com sucesso`,
    });
  };

  const handleClose = () => {
    if (!isProcessing) {
      setCsvData([]);
      setResults([]);
      setExpandedItems(new Set());
      onOpenChange(false);
    }
  };

  const downloadTemplate = () => {
    const template = 'Número;URL\nDecreto-Lei n.º 123/2024;https://diariodarepublica.pt/dr/detalhe/decreto-lei/123-2024-123456789\nPortaria n.º 456/2023;https://diariodarepublica.pt/dr/detalhe/portaria/456-2023-987654321';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_urls.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  const progressPercentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar URLs via CSV
          </DialogTitle>
          <DialogDescription>
            Importe URLs de diplomas PT a partir de um ficheiro CSV
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* File upload */}
          {csvData.length === 0 && results.length === 0 && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  O ficheiro CSV deve ter duas colunas: <strong>Número</strong> (ex: "Decreto-Lei n.º 123/2024") e <strong>URL</strong> (link completo do DRE).
                  Separadores aceites: vírgula, ponto-e-vírgula ou tabulação.
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Selecionar Ficheiro CSV
                </Button>
                <Button
                  variant="ghost"
                  onClick={downloadTemplate}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Template
                </Button>
              </div>

              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Arraste um ficheiro CSV ou clique no botão acima
                </p>
              </div>
            </div>
          )}

          {/* CSV Preview */}
          {csvData.length > 0 && results.length === 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Pré-visualização ({csvData.length} registos)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCsvData([])}
                >
                  Limpar
                </Button>
              </div>
              
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {csvData.slice(0, 50).map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 p-2 rounded bg-muted/50 text-sm"
                    >
                      <Badge variant="outline" className="shrink-0">
                        {index + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{item.number}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {item.url}
                        </div>
                      </div>
                    </div>
                  ))}
                  {csvData.length > 50 && (
                    <div className="text-center py-2 text-sm text-muted-foreground">
                      ... e mais {csvData.length - 50} registos
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">A importar URLs...</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Progresso: {progress.current} / {progress.total}
                </span>
                <span className="font-medium">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded bg-muted text-center">
                  <div className="text-lg font-bold">{results.length}</div>
                  <div className="text-xs text-muted-foreground">Processados</div>
                </div>
                <div className="p-2 rounded bg-green-500/10 text-center">
                  <div className="text-lg font-bold text-green-600">{successCount}</div>
                  <div className="text-xs text-muted-foreground">Importados</div>
                </div>
                <div className="p-2 rounded bg-red-500/10 text-center">
                  <div className="text-lg font-bold text-red-600">{failedCount}</div>
                  <div className="text-xs text-muted-foreground">Falhados</div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <Label>Resultados ({results.length})</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={allExpanded ? collapseAll : expandAll}
                  disabled={results.length === 0}
                >
                  <ChevronsUpDown className="h-4 w-4 mr-1" />
                  {allExpanded ? "Colapsar" : "Expandir"}
                </Button>
              </div>

              {/* Results List */}
              <ScrollArea className="flex-1 border rounded-lg min-h-0">
                <div className="p-2 space-y-1">
                  {results.map((result, index) => {
                    const isExpanded = expandedItems.has(index);
                    
                    return (
                      <Collapsible
                        key={index}
                        open={isExpanded}
                        onOpenChange={() => toggleExpanded(index)}
                      >
                        <div className={`rounded-lg border transition-colors ${
                          result.success 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-red-500/10 border-red-500/30'
                        }`}>
                          <CollapsibleTrigger asChild>
                            <button className="w-full flex items-start gap-2 p-2 text-left hover:bg-accent/50 rounded-lg transition-colors">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              )}
                              
                              {result.success ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                              )}
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{result.number}</span>
                                  {isExpanded && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                      Detalhes
                                    </Badge>
                                  )}
                                </div>
                                {!result.success && result.error && !isExpanded && (
                                  <div className="text-xs text-red-600 truncate">
                                    {result.error}
                                  </div>
                                )}
                              </div>
                              
                              <Badge variant={result.success ? "default" : "destructive"} className="flex-shrink-0">
                                {result.success ? "OK" : "Erro"}
                              </Badge>
                            </button>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="px-10 pb-3 space-y-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">URL:</Label>
                                <p className="text-sm text-muted-foreground break-all">
                                  {result.url}
                                </p>
                              </div>
                              {result.error && (
                                <div>
                                  <Label className="text-xs text-muted-foreground">Erro:</Label>
                                  <p className="text-sm text-red-600">
                                    {result.error}
                                  </p>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            {results.length > 0 ? "Fechar" : "Cancelar"}
          </Button>
          {csvData.length > 0 && results.length === 0 && (
            <Button onClick={handleImport} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  A importar...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {csvData.length} URLs
                </>
              )}
            </Button>
          )}
          {results.length > 0 && (
            <Button onClick={() => { setCsvData([]); setResults([]); }}>
              Nova Importação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
