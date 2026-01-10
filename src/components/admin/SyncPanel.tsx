import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Globe, Flag, FileUp, Upload, FileText, Send, FileSpreadsheet, Link } from "lucide-react";
import { useSyncLogs, useTriggerSync } from "@/hooks/useSyncLogs";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

export function SyncPanel() {
  const { data: syncLogs, isLoading: logsLoading } = useSyncLogs();
  const triggerSync = useTriggerSync();
  const { toast } = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingText, setIsImportingText] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [isImportingLinks, setIsImportingLinks] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [linksContent, setLinksContent] = useState("");
  const [importStats, setImportStats] = useState<{
    totalParsed: number;
    created: number;
    skipped: number;
    mappingsCreated: number;
  } | null>(null);
  const [textImportStats, setTextImportStats] = useState<{
    totalParsed: number;
    created: number;
    skipped: number;
    mappingsCreated: number;
  } | null>(null);
  const [excelImportStats, setExcelImportStats] = useState<{
    totalParsed: number;
    created: number;
    skipped: number;
    mappingsCreated: number;
    errors: number;
  } | null>(null);
  const [linksImportStats, setLinksImportStats] = useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const handleSync = async (syncType: string, source: string = 'dre') => {
    try {
      const result = await triggerSync.mutateAsync({ syncType, source });
      toast({
        title: "Sincronização concluída",
        description: result.message || `${result.itemsAdded} adicionados, ${result.itemsUpdated} atualizados`,
      });
    } catch (error) {
      toast({
        title: "Erro na sincronização",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: "Ficheiro inválido",
        description: "Por favor selecione um ficheiro PDF",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    setImportStats(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          
          // Convert to base64
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          toast({
            title: "Processamento iniciado",
            description: "A extrair texto do PDF... Isto pode demorar alguns minutos.",
          });

          // Call the edge function with PDF content
          const { data, error } = await supabase.functions.invoke('import-pdf-legislation', {
            body: { pdfContent: base64 }
          });

          if (error) throw error;

          if (data.success) {
            setImportStats(data.stats);
            toast({
              title: "Importação concluída!",
              description: `${data.stats.created} diplomas criados, ${data.stats.mappingsCreated} associações a categorias`,
            });
          } else {
            throw new Error(data.error || 'Erro desconhecido');
          }
        } catch (err) {
          console.error('PDF processing error:', err);
          toast({
            title: "Erro no processamento",
            description: err instanceof Error ? err.message : "Erro desconhecido",
            variant: "destructive",
          });
        } finally {
          setIsImporting(false);
        }
      };

      reader.onerror = () => {
        toast({
          title: "Erro ao ler ficheiro",
          description: "Não foi possível ler o ficheiro PDF",
          variant: "destructive",
        });
        setIsImporting(false);
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      setIsImporting(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleTextImport = async () => {
    if (!textContent.trim()) {
      toast({
        title: "Conteúdo vazio",
        description: "Por favor cole o texto do PDF antes de importar",
        variant: "destructive",
      });
      return;
    }

    setIsImportingText(true);
    setTextImportStats(null);

    try {
      toast({
        title: "Processamento iniciado",
        description: "A analisar o texto... Isto pode demorar alguns minutos.",
      });

      const { data, error } = await supabase.functions.invoke('import-pdf-legislation', {
        body: { textContent: textContent }
      });

      if (error) throw error;

      if (data.success) {
        setTextImportStats(data.stats);
        setTextContent(""); // Clear the textarea after success
        toast({
          title: "Importação concluída!",
          description: `${data.stats.created} diplomas criados, ${data.stats.mappingsCreated} associações a categorias`,
        });
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Text import error:', error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsImportingText(false);
    }
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast({
        title: "Ficheiro inválido",
        description: "Por favor selecione um ficheiro Excel (.xlsx ou .xls)",
        variant: "destructive",
      });
      return;
    }

    setIsImportingExcel(true);
    setExcelImportStats(null);

    try {
      toast({
        title: "Processamento iniciado",
        description: "A carregar e analisar o Excel... Isto pode demorar alguns minutos.",
      });

      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          
          // Convert to base64
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Content = btoa(binary);

          // Call edge function with XLSX content
          const { data, error } = await supabase.functions.invoke('import-excel-legislation', {
            body: { xlsxContent: base64Content }
          });

          if (error) throw error;

          if (data.success) {
            setExcelImportStats(data.stats);
            toast({
              title: "Importação concluída!",
              description: `${data.stats.created} diplomas criados, ${data.stats.mappingsCreated} associações a categorias`,
            });
          } else {
            throw new Error(data.error || 'Erro desconhecido');
          }
        } catch (err) {
          console.error('Excel processing error:', err);
          toast({
            title: "Erro no processamento",
            description: err instanceof Error ? err.message : "Erro desconhecido",
            variant: "destructive",
          });
        } finally {
          setIsImportingExcel(false);
        }
      };

      reader.onerror = () => {
        toast({
          title: "Erro ao ler ficheiro",
          description: "Não foi possível ler o ficheiro Excel",
          variant: "destructive",
        });
        setIsImportingExcel(false);
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Excel import error:', error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      setIsImportingExcel(false);
    } finally {
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
    }
  };

  const handleExcelTextImport = async () => {
    if (!textContent.trim()) {
      toast({
        title: "Conteúdo vazio",
        description: "Por favor cole o conteúdo do Excel antes de importar",
        variant: "destructive",
      });
      return;
    }

    setIsImportingExcel(true);
    setExcelImportStats(null);

    try {
      toast({
        title: "Processamento iniciado",
        description: "A analisar o conteúdo... Isto pode demorar alguns minutos.",
      });

      const { data, error } = await supabase.functions.invoke('import-excel-legislation', {
        body: { textContent: textContent }
      });

      if (error) throw error;

      if (data.success) {
        setExcelImportStats(data.stats);
        setTextContent("");
        toast({
          title: "Importação concluída!",
          description: `${data.stats.created} diplomas criados, ${data.stats.mappingsCreated} associações a categorias`,
        });
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Excel text import error:', error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsImportingExcel(false);
    }
  };

  const handleLinksImport = async () => {
    if (!linksContent.trim()) {
      toast({
        title: "Conteúdo vazio",
        description: "Por favor cole os links do DRE antes de importar",
        variant: "destructive",
      });
      return;
    }

    // Parse links - one per line, filter empty lines
    const links = linksContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && (line.includes('dre.pt') || line.includes('diariodarepublica.pt')));

    if (links.length === 0) {
      toast({
        title: "Nenhum link válido",
        description: "Por favor cole links válidos do DRE (dre.pt ou diariodarepublica.pt)",
        variant: "destructive",
      });
      return;
    }

    setIsImportingLinks(true);
    setLinksImportStats(null);

    try {
      toast({
        title: "Processamento iniciado",
        description: `A processar ${links.length} link(s)... Isto pode demorar alguns minutos.`,
      });

      const { data, error } = await supabase.functions.invoke('import-dre-links', {
        body: { links, updateExisting }
      });

      if (error) throw error;

      if (data.success) {
        setLinksImportStats(data.stats);
        setLinksContent("");
        const updatedText = data.stats.updated > 0 ? `, ${data.stats.updated} atualizados` : '';
        toast({
          title: "Importação concluída!",
          description: `${data.stats.created} diplomas criados${updatedText}, ${data.stats.skipped} ignorados`,
        });
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Links import error:', error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsImportingLinks(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20"><CheckCircle2 className="mr-1 h-3 w-3" />Concluído</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Em progresso</Badge>;
      case "failed":
        return <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20"><XCircle className="mr-1 h-3 w-3" />Falhou</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />{status}</Badge>;
    }
  };

  const getSourceBadge = (syncType: string) => {
    if (syncType.includes('eurlex')) {
      return <Badge variant="outline" className="text-blue-600 border-blue-300"><Globe className="mr-1 h-3 w-3" />EUR-Lex</Badge>;
    }
    return <Badge variant="outline" className="text-green-600 border-green-300"><Flag className="mr-1 h-3 w-3" />DRE</Badge>;
  };

  const formatSyncType = (syncType: string) => {
    if (syncType.includes('daily')) return 'Diária';
    if (syncType.includes('monthly')) return 'Mensal';
    return syncType.replace('eurlex-', '').replace('dre-', '');
  };

  return (
    <div className="space-y-6">
      {/* PDF Import */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-purple-600" />
            Importar Legislação (PDF)
          </CardTitle>
          <CardDescription>
            Carregue um relatório PDF de legislação para importar diplomas e associar às categorias existentes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handlePdfUpload}
            className="hidden"
            disabled={isImporting}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isImporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {isImporting ? 'A importar...' : 'Selecionar PDF'}
          </Button>
          
          {importStats && (
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <h4 className="font-medium text-sm">Resultado da Importação:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diplomas analisados:</span>
                  <span className="font-medium">{importStats.totalParsed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novos criados:</span>
                  <span className="font-medium text-green-600">{importStats.created}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Já existentes:</span>
                  <span className="font-medium text-muted-foreground">{importStats.skipped}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categorias associadas:</span>
                  <span className="font-medium text-blue-600">{importStats.mappingsCreated}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Excel Import - File Upload */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Importar Legislação (Excel)
          </CardTitle>
          <CardDescription>
            Carregue um ficheiro Excel (.xlsx) com colunas: Temas | Descritor | Diploma | Sumário | Alterado por | Aplicabilidade | Condição
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelUpload}
            className="hidden"
            disabled={isImportingExcel}
          />
          
          <div className="flex flex-col gap-4">
            <Button
              onClick={() => excelInputRef.current?.click()}
              disabled={isImportingExcel}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isImportingExcel ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isImportingExcel ? 'A importar...' : 'Selecionar Ficheiro Excel'}
            </Button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-emerald-50/30 px-2 text-muted-foreground">ou cole o conteúdo</span>
              </div>
            </div>
            
            <Textarea
              placeholder="Cole aqui o conteúdo da tabela Excel em formato de texto...

Exemplo:
|Q/S/CF|Constituição da República Portuguesa|Lei Constitucional n.º 1/2005|Sétima revisão...||Aplicável||"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              className="min-h-[120px] font-mono text-sm"
              disabled={isImportingExcel}
            />
            
            {textContent.trim() && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {textContent.length.toLocaleString()} caracteres
                </p>
                <Button
                  onClick={handleExcelTextImport}
                  disabled={isImportingExcel || !textContent.trim()}
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  {isImportingExcel ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Importar Texto
                </Button>
              </div>
            )}
          </div>
          
          {excelImportStats && (
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <h4 className="font-medium text-sm">Resultado da Importação:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diplomas analisados:</span>
                  <span className="font-medium">{excelImportStats.totalParsed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novos criados:</span>
                  <span className="font-medium text-green-600">{excelImportStats.created}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Já existentes:</span>
                  <span className="font-medium text-muted-foreground">{excelImportStats.skipped}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categorias associadas:</span>
                  <span className="font-medium text-blue-600">{excelImportStats.mappingsCreated}</span>
                </div>
                {excelImportStats.errors > 0 && (
                  <div className="flex justify-between col-span-2">
                    <span className="text-muted-foreground">Erros:</span>
                    <span className="font-medium text-destructive">{excelImportStats.errors}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Text Import (PDF) */}
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Importar Texto PDF (Formato SIAWISE)
          </CardTitle>
          <CardDescription>
            Cole o texto copiado diretamente de um PDF em formato SIAWISE (categoria em linha própria, seguido de diploma e sumário).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Cole aqui o texto copiado do PDF...

Exemplo de formato esperado:
# Ambiente / Legislação Nacional / Geral / Diplomas Gerais

Portaria n.º 481/2025/1 de 31 de dezembro

Estabelece o regime de apoio à realização de investimentos..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            disabled={isImportingText}
          />
          
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {textContent.length > 0 ? `${textContent.length.toLocaleString()} caracteres` : 'Sem conteúdo'}
            </p>
            <Button
              onClick={handleTextImport}
              disabled={isImportingText || !textContent.trim()}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isImportingText ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isImportingText ? 'A importar...' : 'Importar PDF'}
            </Button>
          </div>
          
          {textImportStats && (
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <h4 className="font-medium text-sm">Resultado da Importação:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diplomas analisados:</span>
                  <span className="font-medium">{textImportStats.totalParsed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novos criados:</span>
                  <span className="font-medium text-green-600">{textImportStats.created}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Já existentes:</span>
                  <span className="font-medium text-muted-foreground">{textImportStats.skipped}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categorias associadas:</span>
                  <span className="font-medium text-blue-600">{textImportStats.mappingsCreated}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DRE Links Import */}
      <Card className="border-teal-200 bg-teal-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-teal-600" />
            Importar Links do DRE
          </CardTitle>
          <CardDescription>
            Cole links diretos do diariodarepublica.pt ou dre.pt (um por linha) para importar a legislação automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Cole aqui os links do DRE (um por linha)...

https://diariodarepublica.pt/dr/detalhe/portaria/15-2026-1002139945
https://diariodarepublica.pt/dr/detalhe/decreto-lei/1-2026-1002139123
https://dre.pt/application/file/..."
            value={linksContent}
            onChange={(e) => setLinksContent(e.target.value)}
            className="min-h-[150px] font-mono text-sm"
            disabled={isImportingLinks}
          />
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                disabled={isImportingLinks}
              />
              <span className="text-muted-foreground">Atualizar diplomas existentes com novos dados</span>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {linksContent.trim() ? `${linksContent.split('\n').filter(l => l.trim()).length} link(s)` : 'Sem links'}
            </p>
            <Button
              onClick={handleLinksImport}
              disabled={isImportingLinks || !linksContent.trim()}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {isImportingLinks ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isImportingLinks ? 'A importar...' : updateExisting ? 'Importar e Atualizar' : 'Importar Links'}
            </Button>
          </div>
          
          {linksImportStats && (
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <h4 className="font-medium text-sm">Resultado da Importação:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Links processados:</span>
                  <span className="font-medium">{linksImportStats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novos criados:</span>
                  <span className="font-medium text-green-600">{linksImportStats.created}</span>
                </div>
                {linksImportStats.updated > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Atualizados:</span>
                    <span className="font-medium text-blue-600">{linksImportStats.updated}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ignorados:</span>
                  <span className="font-medium text-muted-foreground">{linksImportStats.skipped}</span>
                </div>
                {linksImportStats.failed > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Falharam:</span>
                    <span className="font-medium text-destructive">{linksImportStats.failed}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DRE Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-green-600" />
            Diário da República (Portugal)
          </CardTitle>
          <CardDescription>
            Sincronize legislação do Diário da República Eletrónico
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={() => handleSync("daily", "dre")}
            disabled={triggerSync.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {triggerSync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sincronização Diária
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSync("monthly", "dre")}
            disabled={triggerSync.isPending}
            className="border-green-300 text-green-700 hover:bg-green-50"
          >
            {triggerSync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Últimos 30 dias
          </Button>
        </CardContent>
      </Card>

      {/* EUR-Lex Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            Jornal Oficial da UE (EUR-Lex)
          </CardTitle>
          <CardDescription>
            Sincronize legislação europeia do EUR-Lex
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={() => handleSync("daily", "eurlex")}
            disabled={triggerSync.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {triggerSync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Última Semana
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSync("monthly", "eurlex")}
            disabled={triggerSync.isPending}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            {triggerSync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Últimos 90 dias
          </Button>
        </CardContent>
      </Card>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Sincronizações</CardTitle>
          <CardDescription>
            Últimas sincronizações realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : syncLogs && syncLogs.length > 0 ? (
            <div className="space-y-3">
              {syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(log.status)}
                      {getSourceBadge(log.sync_type)}
                      <span className="text-sm font-medium">
                        {formatSyncType(log.sync_type)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(log.started_at), { addSuffix: true, locale: pt })}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    {log.status === "completed" && (
                      <>
                        <p className="text-green-600">+{log.items_added} adicionados</p>
                        <p className="text-blue-600">{log.items_updated} atualizados</p>
                      </>
                    )}
                    {log.error_message && (
                      <p className="text-destructive">{log.error_message}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <RefreshCw className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Nenhuma sincronização realizada ainda</p>
              <p className="text-sm">Execute uma sincronização para ver o histórico</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
