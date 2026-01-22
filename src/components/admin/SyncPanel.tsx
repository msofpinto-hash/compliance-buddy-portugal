import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, Globe, Flag, FileUp, Upload, FileText, Send, FileSpreadsheet, Link, AlertCircle, Filter, Wrench, Type, Calendar, Rocket, StopCircle } from "lucide-react";
import { DuplicateCleanupPanel } from "./DuplicateCleanupPanel";
import { useSyncLogs, useTriggerSync } from "@/hooks/useSyncLogs";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// Use the legacy PDF.js build + bundled worker to avoid cross-origin/module-worker issues
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite ?url import
import pdfWorkerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.js?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export function SyncPanel() {
  const { data: syncLogs, isLoading: logsLoading } = useSyncLogs();
  const triggerSync = useTriggerSync();
  const { toast } = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingText, setIsImportingText] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [isImportingLinks, setIsImportingLinks] = useState(false);
  const [isReimportingIncomplete, setIsReimportingIncomplete] = useState(false);
  const [reimportProgress, setReimportProgress] = useState<{ current: number; total: number } | null>(null);
  const [incompleteCount, setIncompleteCount] = useState<number | null>(null);
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
    requirementsCreated?: number;
  } | null>(null);
  const [liveRequirementsCount, setLiveRequirementsCount] = useState(0);
  const [liveLegislationCount, setLiveLegislationCount] = useState(0);
  const [recentlyImportedLegislation, setRecentlyImportedLegislation] = useState<Array<{
    id: string;
    number: string;
    title: string;
    created_at: string;
  }>>([]);
  const [reimportStats, setReimportStats] = useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [extractRequirementsAI, setExtractRequirementsAI] = useState(true);
  const [reimportDateFrom, setReimportDateFrom] = useState("");
  const [reimportDateTo, setReimportDateTo] = useState("");
  const [reimportType, setReimportType] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [isImportingPreloaded, setIsImportingPreloaded] = useState<string | null>(null);
  const [preloadedImportStats, setPreloadedImportStats] = useState<{
    file: string;
    totalParsed: number;
    created: number;
    skipped: number;
    mappingsCreated: number;
    errors: number;
  } | null>(null);
  
  // Metadata fix states
  const [isFixingEurlexTitles, setIsFixingEurlexTitles] = useState(false);
  const [isFixingDreMetadata, setIsFixingDreMetadata] = useState(false);
  const [eurlexTitlesStats, setEurlexTitlesStats] = useState<{
    processed: number;
    fixed: number;
    failed: number;
  } | null>(null);
  const [dreMetadataStats, setDreMetadataStats] = useState<{
    processed: number;
    fixed: number;
    failed: number;
  } | null>(null);
  const [genericTitlesCount, setGenericTitlesCount] = useState<number | null>(null);
  const [missingDatesCount, setMissingDatesCount] = useState<number | null>(null);
  
  // PDF Import fix states
  const [isFixingPdfImport, setIsFixingPdfImport] = useState(false);
  const [pdfImportIssuesCount, setPdfImportIssuesCount] = useState<number | null>(null);
  const [pdfIncompletePtCount, setPdfIncompletePtCount] = useState<number | null>(null);
  const [pdfIncompleteEuCount, setPdfIncompleteEuCount] = useState<number | null>(null);
  const [isAutoFixingPdfToZero, setIsAutoFixingPdfToZero] = useState(false);
  const [autoFixWave, setAutoFixWave] = useState<{ current: number; max: number } | null>(null);
  const [autoFixCooldownSeconds, setAutoFixCooldownSeconds] = useState<number>(30);
  const [autoFixCooldown, setAutoFixCooldown] = useState<{ remaining: number; total: number } | null>(null);
  const [runningPdfFixJobsCount, setRunningPdfFixJobsCount] = useState<number | null>(null);
  const [maxRunningPdfFixJobs, setMaxRunningPdfFixJobs] = useState<number>(60);
  const [stuckPdfFixThresholdMinutes, setStuckPdfFixThresholdMinutes] = useState<number>(45);
  const [stuckPdfFixJobsCount, setStuckPdfFixJobsCount] = useState<number | null>(null);
  const [isTerminatingStuckPdfFixJobs, setIsTerminatingStuckPdfFixJobs] = useState(false);
  const [confirmTerminateStuckPdfFixJobs, setConfirmTerminateStuckPdfFixJobs] = useState(false);

  const LEGISLATION_TYPES = [
    { value: "all", label: "Todos os tipos" },
    { value: "decreto-lei", label: "Decreto-Lei" },
    { value: "lei", label: "Lei" },
    { value: "portaria", label: "Portaria" },
    { value: "despacho", label: "Despacho" },
    { value: "resolucao", label: "Resolução" },
    { value: "regulamento", label: "Regulamento" },
    { value: "declaracao", label: "Declaração" },
    { value: "aviso", label: "Aviso" },
  ];

  // Play notification sound
  const playNotificationSound = (success: boolean = true) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      if (success) {
        // Success sound: ascending two-tone chime
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15); // E5
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
      } else {
        // Error sound: descending tone
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4
        oscillator.frequency.setValueAtTime(349.23, audioContext.currentTime + 0.15); // F4
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      }
    } catch (e) {
      console.log('Audio not supported');
    }
  };

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

    // Check file size - limit is 30MB for client-side processing
    const maxSizeMB = 30;
    const fileSizeMB = file.size / (1024 * 1024);

    if (fileSizeMB > maxSizeMB) {
      toast({
        title: "Ficheiro demasiado grande",
        description: `O PDF tem ${fileSizeMB.toFixed(1)}MB (limite: ${maxSizeMB}MB). Por favor divida o documento em partes menores.`,
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsImporting(true);
    setImportStats(null);

    try {
      toast({
        title: "Processamento iniciado",
        description: `A extrair texto do PDF (${fileSizeMB.toFixed(1)}MB)... Isto pode demorar alguns minutos.`,
      });

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Use PDF.js to extract text on the client side
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const textParts: string[] = [];

      toast({
        title: "A processar páginas",
        description: `Extraindo texto de ${numPages} páginas...`,
      });

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        textParts.push(pageText);
      }

      const extractedText = textParts.join('\n');
      console.log(`Extracted ${extractedText.length} characters from ${numPages} pages`);
      // Log a sample of the extracted text for debugging format issues
      console.log('PDF text sample (first 2000 chars):', extractedText.substring(0, 2000));

      if (extractedText.length < 100) {
        toast({
          title: "PDF sem texto extraível",
          description: "O PDF parece ser baseado em imagens. Por favor extraia o texto manualmente e use a opção de importar texto.",
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }

      // Check if text is too large - need to split into chunks
      const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk to be safe
      
      if (extractedText.length > MAX_CHUNK_SIZE) {
        toast({
          title: "Ficheiro grande detectado",
          description: `A dividir ${Math.round(extractedText.length / 1024 / 1024)}MB em partes para processamento...`,
        });

        // Split text into chunks at logical boundaries (newlines or multiple spaces)
        const chunks: string[] = [];
        let currentPos = 0;
        
        while (currentPos < extractedText.length) {
          let endPos = Math.min(currentPos + MAX_CHUNK_SIZE, extractedText.length);
          
          // Try to find a good break point (newline or multiple spaces)
          if (endPos < extractedText.length) {
            const searchStart = Math.max(endPos - 1000, currentPos);
            const searchText = extractedText.substring(searchStart, endPos);
            const lastBreak = Math.max(
              searchText.lastIndexOf('\n'),
              searchText.lastIndexOf('    ') // Multiple spaces often separate entries
            );
            if (lastBreak > 0) {
              endPos = searchStart + lastBreak;
            }
          }
          
          chunks.push(extractedText.substring(currentPos, endPos));
          currentPos = endPos;
        }

        console.log(`Split into ${chunks.length} chunks`);
        
        let totalCreated = 0;
        let totalSkipped = 0;
        let totalMappings = 0;

        for (let i = 0; i < chunks.length; i++) {
          toast({
            title: `A processar parte ${i + 1}/${chunks.length}`,
            description: `Chunk de ${Math.round(chunks[i].length / 1024)}KB...`,
          });

          const { data, error } = await supabase.functions.invoke('import-pdf-legislation', {
            body: { textContent: chunks[i] }
          });

          if (error) {
            console.error(`Chunk ${i + 1} error:`, error);
            continue;
          }

          if (data.background) {
            toast({
              title: `Parte ${i + 1}/${chunks.length} em processamento`,
              description: 'A processar em segundo plano...',
            });
          }
        }

        toast({
          title: "Importação iniciada",
          description: `${chunks.length} partes enviadas para processamento em segundo plano.`,
        });
        
      } else {
        toast({
          title: "Texto extraído",
          description: `${extractedText.length} caracteres extraídos. A importar legislação...`,
        });

        // Send extracted text to edge function (runs in background)
        const { data, error } = await supabase.functions.invoke('import-pdf-legislation', {
          body: { textContent: extractedText }
        });

        if (error) throw error;

        if (data.background) {
          toast({
            title: "Importação iniciada em segundo plano",
            description: `A processar ${Math.round(extractedText.length / 1000)}K caracteres. Receberá uma notificação quando terminar.`,
          });
          setImportStats(null);
        } else if (data.success) {
          setImportStats(data.stats);
          toast({
            title: "Importação concluída!",
            description: `${data.stats.created} diplomas criados, ${data.stats.mappingsCreated} associações a categorias`,
          });
        } else {
          throw new Error(data.error || 'Erro desconhecido');
        }
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

  // Import pre-loaded Excel files from public/data
  const handlePreloadedExcelImport = async (fileName: string, themeName: string) => {
    setIsImportingPreloaded(fileName);
    setPreloadedImportStats(null);

    try {
      toast({
        title: "A carregar ficheiro",
        description: `A importar ${fileName}...`,
      });

      // Fetch the file from public/data
      const response = await fetch(`/data/${fileName}`);
      if (!response.ok) {
        throw new Error(`Ficheiro não encontrado: ${fileName}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      // Convert to base64
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Content = btoa(binary);

      toast({
        title: "Processamento iniciado",
        description: `A analisar ${fileName}... Isto pode demorar alguns minutos.`,
      });

      // Call edge function with XLSX content and theme name
      const { data, error } = await supabase.functions.invoke('import-excel-legislation', {
        body: { xlsxContent: base64Content, themeName }
      });

      if (error) throw error;

      if (data.success) {
        setPreloadedImportStats({
          file: fileName,
          ...data.stats
        });
        toast({
          title: "Importação concluída!",
          description: `${data.stats.created} diplomas criados de ${fileName}`,
        });
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Preloaded Excel import error:', error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsImportingPreloaded(null);
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
    setLiveRequirementsCount(0);
    setLiveLegislationCount(0);
    setRecentlyImportedLegislation([]);

    // Set up realtime subscription to track requirements being created
    const requirementsChannel = supabase
      .channel('requirements-import-progress')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'legal_requirements'
        },
        () => {
          setLiveRequirementsCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'legislation'
        },
        (payload) => {
          setLiveLegislationCount(prev => prev + 1);
          // Add to recently imported list (keep last 10)
          const newLeg = payload.new as { id: string; number: string; title: string; created_at: string };
          setRecentlyImportedLegislation(prev => [
            { 
              id: newLeg.id, 
              number: newLeg.number || 'Sem número', 
              title: newLeg.title || 'Sem título',
              created_at: newLeg.created_at
            },
            ...prev
          ].slice(0, 10));
        }
      )
      .subscribe();

    try {
      toast({
        title: "Processamento iniciado",
        description: `A processar ${links.length} link(s)... Isto pode demorar alguns minutos.`,
      });

      const { data, error } = await supabase.functions.invoke('import-dre-links', {
        body: { links, updateExisting, extractRequirementsAI }
      });

      if (error) throw error;

      if (data.success) {
        setLinksImportStats(data.stats);
        setLinksContent("");
        const updatedText = data.stats.updated > 0 ? `, ${data.stats.updated} atualizados` : '';
        const reqText = data.stats.requirementsCreated > 0 ? `, ${data.stats.requirementsCreated} requisitos` : '';
        
        // Play success sound
        playNotificationSound(true);
        
        toast({
          title: "Importação concluída!",
          description: `${data.stats.created} diplomas criados${updatedText}${reqText}`,
        });
      } else {
        throw new Error(data.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Links import error:', error);
      
      // Play error sound
      playNotificationSound(false);
      
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      // Clean up realtime subscription
      supabase.removeChannel(requirementsChannel);
      setIsImportingLinks(false);
    }
  };

  const getIncompleteFilters = () => {
    return {
      dateFrom: reimportDateFrom || null,
      dateTo: reimportDateTo || null,
      type: reimportType !== "all" ? reimportType : null,
    };
  };

  const fetchIncompleteWithFilters = async (limit?: number) => {
    const filters = getIncompleteFilters();
    
    let query = supabase
      .from("legislation")
      .select("document_url")
      .or("summary.is.null,summary.eq.")
      .not("document_url", "is", null)
      .like("document_url", "%diariodarepublica.pt%");
    
    if (filters.dateFrom) {
      query = query.gte("publication_date", filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte("publication_date", filters.dateTo);
    }
    if (filters.type) {
      query = query.ilike("number", `%${filters.type}%`);
    }
    
    if (limit) {
      query = query.limit(limit);
    }
    
    return query;
  };

  const fetchIncompleteCountWithFilters = async () => {
    const filters = getIncompleteFilters();
    
    let query = supabase
      .from("legislation")
      .select("*", { count: "exact", head: true })
      .or("summary.is.null,summary.eq.")
      .not("document_url", "is", null)
      .like("document_url", "%diariodarepublica.pt%");
    
    if (filters.dateFrom) {
      query = query.gte("publication_date", filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte("publication_date", filters.dateTo);
    }
    if (filters.type) {
      query = query.ilike("number", `%${filters.type}%`);
    }
    
    return query;
  };

  const fetchIncompleteCount = async () => {
    const { count, error } = await fetchIncompleteCountWithFilters();
    
    if (!error && count !== null) {
      setIncompleteCount(count);
    }
  };

  // Fetch count on mount and when filters change
  useEffect(() => {
    fetchIncompleteCount();
    fetchMetadataCounts();
    fetchPdfIncompleteCounts();
  }, [reimportDateFrom, reimportDateTo, reimportType]);

  // Keep a lightweight polling of running/stuck pdf fix jobs (so we can block safely)
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const [running, stuck] = await Promise.all([
        fetchRunningPdfFixJobsCount(),
        fetchStuckPdfFixJobsCount(stuckPdfFixThresholdMinutes),
      ]);
      if (cancelled) return;
      setRunningPdfFixJobsCount(running);
      setStuckPdfFixJobsCount(stuck);
    };

    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [maxRunningPdfFixJobs, stuckPdfFixThresholdMinutes]);

  // Fetch metadata counts
  const fetchMetadataCounts = async () => {
    // Count EUR-Lex with generic titles
    const { count: eurlexCount } = await supabase
      .from("legislation")
      .select("*", { count: "exact", head: true })
      .eq("origin", "EU")
      .like("title", "Documento %");
    
    if (eurlexCount !== null) {
      setGenericTitlesCount(eurlexCount);
    }

    // Count DRE with missing dates  
    const { count: dreCount } = await supabase
      .from("legislation")
      .select("*", { count: "exact", head: true })
      .eq("origin", "PT")
      .is("publication_date", null);
    
    if (dreCount !== null) {
      setMissingDatesCount(dreCount);
    }
    
    // Count PDF imports with issues (invalid dates, missing URLs, missing summaries)
    const { count: pdfCount } = await supabase
      .from("legislation")
      .select("*", { count: "exact", head: true })
      .eq("source", "pdf-import")
      .or("document_url.is.null,summary.is.null");
    
    if (pdfCount !== null) {
      setPdfImportIssuesCount(pdfCount);
    }
  };

  const fetchRunningPdfFixJobsCount = async (): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from("sync_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running")
        .eq("sync_type", "fix_pdf_import");

      if (error) throw error;
      return count ?? 0;
    } catch (e) {
      console.error("fetchRunningPdfFixJobsCount error:", e);
      return 0;
    }
  };

  const fetchStuckPdfFixJobsCount = async (thresholdMinutes: number): Promise<number> => {
    try {
      const cutoffIso = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("sync_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running")
        .eq("sync_type", "fix_pdf_import")
        .lt("started_at", cutoffIso);

      if (error) throw error;
      return count ?? 0;
    } catch (e) {
      console.error("fetchStuckPdfFixJobsCount error:", e);
      return 0;
    }
  };

  const terminateStuckPdfFixJobs = async (thresholdMinutes: number) => {
    setIsTerminatingStuckPdfFixJobs(true);
    try {
      const cutoffIso = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("sync_logs")
        .select("id")
        .eq("status", "running")
        .eq("sync_type", "fix_pdf_import")
        .lt("started_at", cutoffIso)
        .limit(200);

      if (error) throw error;
      const ids = (data || []).map((r: any) => r.id).filter(Boolean);

      if (ids.length === 0) {
        toast({
          title: "Sem jobs presos",
          description: `Não existem jobs fix_pdf_import com mais de ${thresholdMinutes} minutos.`,
        });
        return;
      }

      const { error: updateError } = await supabase
        .from("sync_logs")
        .update({
          status: "completed_timeout",
          completed_at: new Date().toISOString(),
          error_message: `Marcado como timeout pelo utilizador - job preso (>${thresholdMinutes}m)`,
        })
        .in("id", ids);

      if (updateError) throw updateError;

      toast({
        title: "Jobs marcados como timeout",
        description: `${ids.length} job(s) fix_pdf_import marcados como completed_timeout.`,
      });
    } catch (e) {
      console.error("terminateStuckPdfFixJobs error:", e);
      toast({
        title: "Erro ao terminar jobs",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsTerminatingStuckPdfFixJobs(false);
      setConfirmTerminateStuckPdfFixJobs(false);
      // refresh counters
      fetchRunningPdfFixJobsCount().then(setRunningPdfFixJobsCount);
      fetchStuckPdfFixJobsCount(stuckPdfFixThresholdMinutes).then(setStuckPdfFixJobsCount);
    }
  };

  const fetchPdfIncompleteCounts = async (): Promise<{ pt: number; eu: number }> => {
    try {
      // Incompletos PDF = registos source='pdf-import' com campos essenciais em falta.
      const base = () =>
        supabase
          .from("legislation")
          .select("id", { count: "exact", head: true })
          .eq("source", "pdf-import")
          .or(
            [
              "document_url.is.null",
              "summary.is.null",
              "publication_date.is.null",
              "effective_date.is.null",
              "origin.is.null",
            ].join(",")
          );

      const [{ count: ptCount }, { count: euCount }] = await Promise.all([
        base().eq("origin", "PT"),
        base().eq("origin", "EU"),
      ]);

      setPdfIncompletePtCount(ptCount ?? 0);
      setPdfIncompleteEuCount(euCount ?? 0);
      return { pt: ptCount ?? 0, eu: euCount ?? 0 };
    } catch (e) {
      console.error("fetchPdfIncompleteCounts error:", e);
      return { pt: 0, eu: 0 };
    }
  };

  const launchPdfFixJobs = async (parallelJobs: number) => {
    const runningNow = await fetchRunningPdfFixJobsCount();
    setRunningPdfFixJobsCount(runningNow);
    if (runningNow >= maxRunningPdfFixJobs) {
      toast({
        title: "Demasiados jobs em execução",
        description: `Já existem ${runningNow} jobs a correr (limite: ${maxRunningPdfFixJobs}). Aguarde ou aumente o limite.`,
        variant: "destructive",
      });
      return { ok: 0, failed: parallelJobs };
    }

    const perJobLimit = 50;

    const results = await Promise.allSettled(
      Array.from({ length: parallelJobs }).map(() =>
        supabase.functions.invoke("complete-auto-imported-legislation", {
          body: {
            mode: "pdf_import_fix",
            limit: perJobLimit,
            includePT: true,
            includeEU: true,
            fixDates: true,
            background: true,
          },
        })
      )
    );

    const ok = results.filter((r) => r.status === "fulfilled" && !(r.value as any)?.error).length;
    const failed = results.length - ok;
    return { ok, failed };
  };

  const handleFixEurlexTitles = async () => {
    setIsFixingEurlexTitles(true);
    setEurlexTitlesStats(null);

    let totalProcessed = 0;
    let totalFixed = 0;
    let totalFailed = 0;

    try {
      toast({
        title: "Correção iniciada",
        description: "A corrigir títulos genéricos EUR-Lex...",
      });

      // Run in batches until all are fixed
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('fix-eurlex-titles', {
          body: { batchSize: 50 }
        });

        if (error) {
          console.error('Fix titles error:', error);
          break;
        }

        if (data.success) {
          totalProcessed += data.processed || 0;
          totalFixed += data.fixed || 0;
          totalFailed += data.failed || 0;

          // Check if there are more to process
          const { count } = await supabase
            .from("legislation")
            .select("*", { count: "exact", head: true })
            .eq("origin", "EU")
            .like("title", "Documento %");

          if (!count || count === 0) {
            hasMore = false;
          }
        } else {
          break;
        }

        // Small delay between batches
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setEurlexTitlesStats({
        processed: totalProcessed,
        fixed: totalFixed,
        failed: totalFailed,
      });

      fetchMetadataCounts();

      toast({
        title: "Correção concluída!",
        description: `${totalFixed} títulos corrigidos`,
      });

    } catch (error) {
      console.error('Fix titles error:', error);
      toast({
        title: "Erro na correção",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingEurlexTitles(false);
    }
  };

  const handleFixDreMetadata = async () => {
    setIsFixingDreMetadata(true);
    setDreMetadataStats(null);

    let totalProcessed = 0;
    let totalFixed = 0;
    let totalFailed = 0;

    try {
      toast({
        title: "Correção iniciada",
        description: "A corrigir metadados DRE...",
      });

      // Run in batches
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.functions.invoke('fix-legislation-metadata', {
          body: { batchSize: 30, source: 'dre' }
        });

        if (error) {
          console.error('Fix metadata error:', error);
          break;
        }

        if (data.success) {
          totalProcessed += data.processed || 0;
          totalFixed += data.fixed || 0;
          totalFailed += data.failed || 0;

          // Check if there are more to process
          const { count } = await supabase
            .from("legislation")
            .select("*", { count: "exact", head: true })
            .eq("origin", "PT")
            .is("publication_date", null);

          if (!count || count === 0) {
            hasMore = false;
          }
        } else {
          break;
        }

        // Small delay between batches
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setDreMetadataStats({
        processed: totalProcessed,
        fixed: totalFixed,
        failed: totalFailed,
      });

      fetchMetadataCounts();

      toast({
        title: "Correção concluída!",
        description: `${totalFixed} diplomas corrigidos`,
      });

    } catch (error) {
      console.error('Fix metadata error:', error);
      toast({
        title: "Erro na correção",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingDreMetadata(false);
    }
  };

  // Handle PDF Import data fix
  const handleFixPdfImportData = async () => {
    setIsFixingPdfImport(true);

    try {
      toast({
        title: "Correção iniciada em segundo plano",
        description: "A corrigir dados importados do PDF (datas, URLs, sumários)...",
      });

      const { data, error } = await supabase.functions.invoke('complete-auto-imported-legislation', {
        body: { 
          mode: 'pdf_import_fix',
          limit: 200,
          includePT: true,
          includeEU: true,
          fixDates: true,
          background: true
        }
      });

      if (error) {
        throw error;
      }

      if (data.background) {
        toast({
          title: "Correção em segundo plano",
          description: `A processar ${data.pendingCount || 'vários'} diplomas. Receberá uma notificação quando terminar.`,
        });
      } else {
        toast({
          title: "Correção concluída!",
          description: data.message || "Dados corrigidos com sucesso",
        });
        fetchMetadataCounts();
      }

    } catch (error) {
      console.error('Fix PDF import error:', error);
      toast({
        title: "Erro na correção",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingPdfImport(false);
    }
  };

  const handleFixPdfImportDataBurst = async (parallelJobs: number = 20) => {
    setIsFixingPdfImport(true);

    try {
      toast({
        title: `A lançar ${parallelJobs} jobs em paralelo`,
        description: "Isto acelera a correção (cada job tem timeout por item e não deve ficar preso).",
      });

      const { ok, failed } = await launchPdfFixJobs(parallelJobs);

      toast({
        title: "Jobs lançados",
        description: `${ok}/${parallelJobs} iniciados${failed ? ` (${failed} falharam)` : ""}. Acompanhe no banner de jobs e no histórico.`,
        variant: failed ? "destructive" : undefined,
      });

      // Refresh counts soon (the jobs will update data asynchronously)
      setTimeout(() => {
        fetchMetadataCounts();
        fetchPdfIncompleteCounts();
      }, 1500);
    } catch (error) {
      console.error("Fix PDF import burst error:", error);
      toast({
        title: "Erro ao lançar jobs",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingPdfImport(false);
    }
  };

  const handleFixPdfImportToZero = async () => {
    if (isAutoFixingPdfToZero || isFixingPdfImport) return;

    setIsAutoFixingPdfToZero(true);
    const maxWaves = 6;
    setAutoFixWave({ current: 0, max: maxWaves });
    setAutoFixCooldown(null);

    try {
      toast({
        title: "Auto-correção iniciada",
        description: "Vou lançar vagas e reavaliar contagens. O processamento continua em segundo plano.",
      });

      let counts = await fetchPdfIncompleteCounts();

      for (let wave = 1; wave <= maxWaves; wave++) {
        setAutoFixWave({ current: wave, max: maxWaves });

        const currentTotal = counts.pt + counts.eu;
        if (currentTotal === 0) break;

        // Smart cool-down: if limit reached, wait N seconds and retry
        let runningNow = await fetchRunningPdfFixJobsCount();
        setRunningPdfFixJobsCount(runningNow);
        let cooldownAttempts = 0;
        const maxCooldownAttempts = 5;

        while (runningNow >= maxRunningPdfFixJobs && cooldownAttempts < maxCooldownAttempts) {
          cooldownAttempts += 1;
          const total = Math.max(0, Math.floor(autoFixCooldownSeconds));

          if (total === 0) break;

          toast({
            title: "Limite atingido",
            description: `Vou aguardar ${total}s e voltar a tentar lançar a vaga (jobs a correr: ${runningNow}/${maxRunningPdfFixJobs}).`,
          });

          for (let remaining = total; remaining > 0; remaining -= 1) {
            setAutoFixCooldown({ remaining, total });
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 1000));
          }
          setAutoFixCooldown(null);

          // Re-check
          // eslint-disable-next-line no-await-in-loop
          runningNow = await fetchRunningPdfFixJobsCount();
          setRunningPdfFixJobsCount(runningNow);
        }

        if (runningNow >= maxRunningPdfFixJobs) {
          toast({
            title: "Ainda no limite",
            description: `Mantém-se ${runningNow} jobs a correr (limite: ${maxRunningPdfFixJobs}). Parei a automação por agora.`,
            variant: "destructive",
          });
          break;
        }

        await launchPdfFixJobs(20);

        // Pausa para evitar demasiada concorrência e dar tempo aos jobs
        await new Promise((r) => setTimeout(r, 12000));
        counts = await fetchPdfIncompleteCounts();

        const newTotal = counts.pt + counts.eu;
        if (newTotal === 0) break;
      }

      toast({
        title: "Vagas lançadas",
        description: "Atualiza as contagens em 1-2 minutos para confirmar que chegou a zero.",
      });
    } catch (e) {
      console.error("handleFixPdfImportToZero error:", e);
      toast({
        title: "Erro na auto-correção",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsAutoFixingPdfToZero(false);
      setAutoFixWave(null);
      setAutoFixCooldown(null);
    }
  };

  const handleReimportIncomplete = async () => {
    setIsReimportingIncomplete(true);
    setReimportStats(null);
    setReimportProgress(null);

    const BATCH_SIZE = 20;
    let totalProcessed = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    try {
      // First, get the total count with filters
      const { count: totalCount, error: countError } = await fetchIncompleteCountWithFilters();

      if (countError) throw countError;

      if (!totalCount || totalCount === 0) {
        toast({
          title: "Nenhum diploma incompleto",
          description: "Nenhum diploma corresponde aos filtros selecionados",
        });
        setIsReimportingIncomplete(false);
        return;
      }

      setReimportProgress({ current: 0, total: totalCount });

      const filterDesc = [];
      if (reimportType !== "all") filterDesc.push(reimportType);
      if (reimportDateFrom || reimportDateTo) filterDesc.push("período filtrado");
      const filterText = filterDesc.length > 0 ? ` (${filterDesc.join(", ")})` : "";

      toast({
        title: "Reimportação iniciada",
        description: `A processar ${totalCount} diploma(s)${filterText} em lotes de ${BATCH_SIZE}...`,
      });

      let hasMore = true;
      let batchNumber = 0;

      while (hasMore) {
        // Fetch next batch of incomplete legislation with filters
        const { data: incomplete, error: fetchError } = await fetchIncompleteWithFilters(BATCH_SIZE);

        if (fetchError) throw fetchError;

        if (!incomplete || incomplete.length === 0) {
          hasMore = false;
          break;
        }

        const links = incomplete
          .map(l => l.document_url)
          .filter((url): url is string => url !== null);

        if (links.length === 0) {
          hasMore = false;
          break;
        }

        batchNumber++;
        console.log(`Processing batch ${batchNumber} with ${links.length} links`);

        const { data, error } = await supabase.functions.invoke('import-dre-links', {
          body: { links, updateExisting: true }
        });

        if (error) {
          console.error(`Batch ${batchNumber} error:`, error);
          totalFailed += links.length;
        } else if (data.success) {
          totalProcessed += data.stats.total || 0;
          totalCreated += data.stats.created || 0;
          totalUpdated += data.stats.updated || 0;
          totalSkipped += data.stats.skipped || 0;
          totalFailed += data.stats.failed || 0;
        }

        setReimportProgress({ current: totalProcessed, total: totalCount });

        // If we got fewer than BATCH_SIZE, we're done
        if (incomplete.length < BATCH_SIZE) {
          hasMore = false;
        }

        // Small delay between batches to avoid rate limiting
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setReimportStats({
        total: totalProcessed,
        created: totalCreated,
        updated: totalUpdated,
        skipped: totalSkipped,
        failed: totalFailed,
      });

      fetchIncompleteCount(); // Refresh count

      toast({
        title: "Reimportação concluída!",
        description: `${totalUpdated} diplomas atualizados, ${totalCreated} criados`,
      });

    } catch (error) {
      console.error('Reimport error:', error);
      toast({
        title: "Erro na reimportação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsReimportingIncomplete(false);
      setReimportProgress(null);
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

  const pdfFixBlocked = (runningPdfFixJobsCount ?? 0) >= maxRunningPdfFixJobs;

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
          {preloadedImportStats && (
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <h4 className="font-medium text-sm">Resultado da Importação ({preloadedImportStats.file}):</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diplomas analisados:</span>
                  <span className="font-medium">{preloadedImportStats.totalParsed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novos criados:</span>
                  <span className="font-medium text-green-600">{preloadedImportStats.created}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Já existentes:</span>
                  <span className="font-medium text-muted-foreground">{preloadedImportStats.skipped}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categorias associadas:</span>
                  <span className="font-medium text-blue-600">{preloadedImportStats.mappingsCreated}</span>
                </div>
                {preloadedImportStats.errors > 0 && (
                  <div className="flex justify-between col-span-2">
                    <span className="text-muted-foreground">Erros:</span>
                    <span className="font-medium text-destructive">{preloadedImportStats.errors}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pre-loaded Excel Files Import */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-amber-600" />
            Importar Ficheiros Pré-carregados
          </CardTitle>
          <CardDescription>
            Importe legislação dos ficheiros Excel pré-configurados com temas e categorias mapeadas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={() => handlePreloadedExcelImport('Requisitos_legais_S.xlsx', 'Segurança')}
              disabled={isImportingPreloaded !== null}
              className="bg-amber-600 hover:bg-amber-700 h-auto py-4"
            >
              {isImportingPreloaded === 'Requisitos_legais_S.xlsx' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              <div className="text-left">
                <div className="font-medium">Segurança (S)</div>
                <div className="text-xs opacity-80">Requisitos_legais_S.xlsx</div>
              </div>
            </Button>
            
            <Button
              onClick={() => handlePreloadedExcelImport('Requisitos_legais_S2.xlsx', 'Segurança')}
              disabled={isImportingPreloaded !== null}
              className="bg-amber-600 hover:bg-amber-700 h-auto py-4"
            >
              {isImportingPreloaded === 'Requisitos_legais_S2.xlsx' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              <div className="text-left">
                <div className="font-medium">Segurança 2 (S2)</div>
                <div className="text-xs opacity-80">Requisitos_legais_S2.xlsx</div>
              </div>
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            💡 Diplomas já existentes serão ignorados automaticamente (verificação por número do diploma)
          </p>
        </CardContent>
      </Card>

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
          
          <div className="flex flex-col gap-2">
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={extractRequirementsAI}
                onChange={(e) => setExtractRequirementsAI(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                disabled={isImportingLinks}
              />
              <span className="text-muted-foreground">Extrair requisitos legais automaticamente via IA</span>
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

          {/* Live progress indicator during import */}
          {isImportingLinks && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                <h4 className="font-medium text-sm text-teal-800">Importação em progresso...</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center p-3 rounded-lg bg-white border border-teal-100">
                  <span className="text-2xl font-bold text-green-600">{liveLegislationCount}</span>
                  <span className="text-xs text-muted-foreground">Diplomas criados</span>
                </div>
                {extractRequirementsAI && (
                  <div className="flex flex-col items-center p-3 rounded-lg bg-white border border-teal-100">
                    <span className="text-2xl font-bold text-purple-600">{liveRequirementsCount}</span>
                    <span className="text-xs text-muted-foreground">Requisitos extraídos</span>
                  </div>
                )}
              </div>
              
              {/* Recently imported legislation list */}
              {recentlyImportedLegislation.length > 0 && (
                <div className="mt-3 pt-3 border-t border-teal-200">
                  <h5 className="text-xs font-medium text-teal-700 mb-2">Últimos diplomas importados:</h5>
                  <div className="max-h-[150px] overflow-y-auto space-y-1.5">
                    {recentlyImportedLegislation.map((leg) => (
                      <div 
                        key={leg.id} 
                        className="flex items-start gap-2 p-2 rounded bg-white border border-teal-100 text-xs animate-in slide-in-from-top-2 duration-300"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-teal-900 truncate">{leg.number}</p>
                          <p className="text-muted-foreground truncate">{leg.title}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
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
                {linksImportStats.requirementsCreated !== undefined && linksImportStats.requirementsCreated > 0 && (
                  <div className="flex justify-between col-span-2 pt-2 border-t">
                    <span className="text-muted-foreground">Requisitos extraídos (IA):</span>
                    <span className="font-medium text-purple-600">{linksImportStats.requirementsCreated}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reimport Incomplete Legislation */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Reimportar Diplomas Incompletos
          </CardTitle>
          <CardDescription>
            Reimporta automaticamente todos os diplomas do DRE que não têm sumário preenchido
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filtros
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Tipo de Diploma</label>
                <Select 
                  value={reimportType} 
                  onValueChange={setReimportType}
                  disabled={isReimportingIncomplete}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos os tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGISLATION_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Data de Publicação (desde)</label>
                <Input
                  type="date"
                  value={reimportDateFrom}
                  onChange={(e) => setReimportDateFrom(e.target.value)}
                  disabled={isReimportingIncomplete}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Data de Publicação (até)</label>
                <Input
                  type="date"
                  value={reimportDateTo}
                  onChange={(e) => setReimportDateTo(e.target.value)}
                  disabled={isReimportingIncomplete}
                  className="h-9"
                />
              </div>
            </div>
            {(reimportType !== "all" || reimportDateFrom || reimportDateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReimportType("all");
                  setReimportDateFrom("");
                  setReimportDateTo("");
                }}
                disabled={isReimportingIncomplete}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Limpar filtros
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              {reimportProgress ? (
                <span className="text-muted-foreground">
                  A processar: <span className="font-medium text-amber-600">{reimportProgress.current}</span> de <span className="font-medium">{reimportProgress.total}</span> diplomas
                </span>
              ) : incompleteCount !== null ? (
                <span className="text-muted-foreground">
                  <span className="font-medium text-amber-600">{incompleteCount}</span> diploma(s) com dados incompletos
                  {(reimportType !== "all" || reimportDateFrom || reimportDateTo) && (
                    <span className="text-xs ml-1">(filtrado)</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">A verificar...</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={fetchIncompleteCount}
                disabled={isReimportingIncomplete}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
              <Button
                onClick={handleReimportIncomplete}
                disabled={isReimportingIncomplete || incompleteCount === 0}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isReimportingIncomplete ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {isReimportingIncomplete ? `A reimportar...` : 'Reimportar Filtrados'}
              </Button>
            </div>
          </div>
          
          {reimportProgress && (
            <div className="space-y-2">
              <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${Math.round((reimportProgress.current / reimportProgress.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {Math.round((reimportProgress.current / reimportProgress.total) * 100)}% concluído
              </p>
            </div>
          )}
          
          {reimportStats && (
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <h4 className="font-medium text-sm">Resultado da Reimportação:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diplomas processados:</span>
                  <span className="font-medium">{reimportStats.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Atualizados:</span>
                  <span className="font-medium text-blue-600">{reimportStats.updated}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Novos criados:</span>
                  <span className="font-medium text-green-600">{reimportStats.created}</span>
                </div>
                {reimportStats.failed > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Falharam:</span>
                    <span className="font-medium text-destructive">{reimportStats.failed}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata Fix */}
      <Card className="border-violet-200 bg-violet-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-violet-600" />
            Correção de Metadados
          </CardTitle>
          <CardDescription>
            Corrija títulos genéricos e datas em falta nos diplomas importados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* EUR-Lex Titles */}
            <div className="rounded-lg border bg-white p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-blue-600" />
                <h4 className="font-medium text-sm">Títulos EUR-Lex</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Corrige títulos genéricos (ex: "Documento 32025D0001") buscando os títulos reais do EUR-Lex
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {genericTitlesCount !== null ? (
                    <span>
                      <span className="font-medium text-blue-600">{genericTitlesCount}</span> títulos genéricos
                    </span>
                  ) : (
                    <span className="text-muted-foreground">A verificar...</span>
                  )}
                </span>
                <Button
                  onClick={handleFixEurlexTitles}
                  disabled={isFixingEurlexTitles || genericTitlesCount === 0}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isFixingEurlexTitles ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Type className="mr-2 h-3 w-3" />
                  )}
                  {isFixingEurlexTitles ? 'A corrigir...' : 'Corrigir Títulos'}
                </Button>
              </div>
              {eurlexTitlesStats && (
                <div className="text-xs space-y-1 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Corrigidos:</span>
                    <span className="font-medium text-green-600">{eurlexTitlesStats.fixed}</span>
                  </div>
                  {eurlexTitlesStats.failed > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Falharam:</span>
                      <span className="font-medium text-destructive">{eurlexTitlesStats.failed}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* DRE Metadata */}
            <div className="rounded-lg border bg-white p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-green-600" />
                <h4 className="font-medium text-sm">Metadados DRE</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Corrige datas de publicação em falta nos diplomas do Diário da República
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {missingDatesCount !== null ? (
                    <span>
                      <span className="font-medium text-green-600">{missingDatesCount}</span> sem data
                    </span>
                  ) : (
                    <span className="text-muted-foreground">A verificar...</span>
                  )}
                </span>
                <Button
                  onClick={handleFixDreMetadata}
                  disabled={isFixingDreMetadata || missingDatesCount === 0}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isFixingDreMetadata ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Calendar className="mr-2 h-3 w-3" />
                  )}
                  {isFixingDreMetadata ? 'A corrigir...' : 'Corrigir Datas'}
                </Button>
              </div>
              {dreMetadataStats && (
                <div className="text-xs space-y-1 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Corrigidos:</span>
                    <span className="font-medium text-green-600">{dreMetadataStats.fixed}</span>
                  </div>
                  {dreMetadataStats.failed > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Falharam:</span>
                      <span className="font-medium text-destructive">{dreMetadataStats.failed}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* PDF Import Data Fix */}
            <div className="rounded-lg border bg-white p-4 space-y-3 border-orange-200">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-orange-600" />
                <h4 className="font-medium text-sm">Correção de Dados PDF</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Corrige dados incompletos/inválidos da importação PDF: datas, URLs e sumários
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  {pdfImportIssuesCount !== null ? (
                    <span>
                      <span className="font-medium text-orange-600">{pdfImportIssuesCount}</span> com problemas
                    </span>
                  ) : (
                    <span className="text-muted-foreground">A verificar...</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Button
                      onClick={handleFixPdfImportToZero}
                      disabled={isFixingPdfImport || isAutoFixingPdfToZero || pdfImportIssuesCount === 0 || pdfFixBlocked || !!autoFixCooldown}
                      size="sm"
                      variant="outline"
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    >
                      {(isAutoFixingPdfToZero || isFixingPdfImport) ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : autoFixCooldown ? (
                        <Clock className="mr-2 h-3 w-3" />
                      ) : (
                        <Rocket className="mr-2 h-3 w-3" />
                      )}
                      {isAutoFixingPdfToZero ? "A lançar vagas..." : autoFixCooldown ? `Cool-down ${autoFixCooldown.remaining}s` : "Corrigir até zero"}
                    </Button>
                    {autoFixCooldown && (
                      <Badge 
                        variant="outline" 
                        className="absolute -top-2 -right-2 bg-orange-100 border-orange-300 text-orange-700 text-[10px] px-1.5 py-0.5 animate-pulse"
                      >
                        Em espera
                      </Badge>
                    )}
                  </div>

                  <div className="relative">
                    <Button
                      onClick={() => handleFixPdfImportDataBurst(20)}
                      disabled={isFixingPdfImport || pdfImportIssuesCount === 0 || pdfFixBlocked || !!autoFixCooldown}
                      size="sm"
                      variant="outline"
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    >
                      {isFixingPdfImport ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : autoFixCooldown ? (
                        <Clock className="mr-2 h-3 w-3" />
                      ) : (
                        <Rocket className="mr-2 h-3 w-3" />
                      )}
                      {isFixingPdfImport ? "A lançar..." : autoFixCooldown ? `${autoFixCooldown.remaining}s` : "Lançar 20 jobs"}
                    </Button>
                    {autoFixCooldown && (
                      <Badge 
                        variant="outline" 
                        className="absolute -top-2 -right-2 bg-orange-100 border-orange-300 text-orange-700 text-[10px] px-1.5 py-0.5 animate-pulse"
                      >
                        Em espera
                      </Badge>
                    )}
                  </div>

                  <div className="relative">
                    <Button
                      onClick={handleFixPdfImportData}
                      disabled={isFixingPdfImport || pdfImportIssuesCount === 0 || pdfFixBlocked || !!autoFixCooldown}
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700"
                    >
                      {isFixingPdfImport ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : autoFixCooldown ? (
                        <Clock className="mr-2 h-3 w-3" />
                      ) : (
                        <Wrench className="mr-2 h-3 w-3" />
                      )}
                      {isFixingPdfImport ? "A corrigir..." : autoFixCooldown ? `${autoFixCooldown.remaining}s` : "Corrigir Dados"}
                    </Button>
                    {autoFixCooldown && (
                      <Badge 
                        variant="outline" 
                        className="absolute -top-2 -right-2 bg-orange-100 border-orange-300 text-orange-700 text-[10px] px-1.5 py-0.5 animate-pulse"
                      >
                        Em espera
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Incompletos (PDF):</span>
                <Badge variant="outline" className="border-orange-200">
                  PT: <span className="ml-1 font-medium text-orange-700">{pdfIncompletePtCount ?? "—"}</span>
                </Badge>
                <Badge variant="outline" className="border-orange-200">
                  EU: <span className="ml-1 font-medium text-orange-700">{pdfIncompleteEuCount ?? "—"}</span>
                </Badge>
                {autoFixWave && (
                  <span className="ml-auto">Vaga {autoFixWave.current}/{autoFixWave.max}</span>
                )}
                {autoFixCooldown && (
                  <span className="ml-auto flex items-center gap-2 animate-fade-in">
                    <span>Cool-down: {autoFixCooldown.remaining}s</span>
                    <Progress
                      value={
                        autoFixCooldown.total > 0
                          ? Math.round(
                              ((autoFixCooldown.total - autoFixCooldown.remaining) /
                                autoFixCooldown.total) *
                                100
                            )
                          : 0
                      }
                      className="h-2 w-24"
                    />
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>Jobs ativos (PDF fix):</span>
                  <Badge variant="outline" className="border-orange-200">
                    <span className="font-medium text-orange-700">{runningPdfFixJobsCount ?? "—"}</span>
                  </Badge>
                  {pdfFixBlocked && (
                    <Badge variant="outline" className="border-orange-200">
                      Limite atingido
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Limite:</span>
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    value={maxRunningPdfFixJobs}
                    onChange={(e) => setMaxRunningPdfFixJobs(Math.max(0, Number(e.target.value || 0)))}
                    className="h-8 w-24"
                    disabled={isFixingPdfImport || isAutoFixingPdfToZero}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>Cool-down:</span>
                  <Badge variant="outline" className="border-orange-200">
                    <span className="font-medium text-orange-700">{autoFixCooldownSeconds}s</span>
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>N (s):</span>
                  <Input
                    type="number"
                    min={0}
                    step={5}
                    value={autoFixCooldownSeconds}
                    onChange={(e) => setAutoFixCooldownSeconds(Math.max(0, Number(e.target.value || 0)))}
                    className="h-8 w-24"
                    disabled={isFixingPdfImport || isAutoFixingPdfToZero}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>Jobs presos:</span>
                  <Badge variant="outline" className="border-orange-200">
                    <span className="font-medium text-orange-700">{stuckPdfFixJobsCount ?? "—"}</span>
                  </Badge>
                  <span className="text-muted-foreground">(&gt;{stuckPdfFixThresholdMinutes} min)</span>
                </div>

                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>N (min):</span>
                  <Input
                    type="number"
                    min={1}
                    step={5}
                    value={stuckPdfFixThresholdMinutes}
                    onChange={(e) => setStuckPdfFixThresholdMinutes(Math.max(1, Number(e.target.value || 1)))}
                    className="h-8 w-24"
                    disabled={isFixingPdfImport || isAutoFixingPdfToZero || isTerminatingStuckPdfFixJobs}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    disabled={(stuckPdfFixJobsCount ?? 0) === 0 || isTerminatingStuckPdfFixJobs}
                    onClick={() => setConfirmTerminateStuckPdfFixJobs(true)}
                  >
                    {isTerminatingStuckPdfFixJobs ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <StopCircle className="mr-2 h-3 w-3" />
                    )}
                    Terminar jobs presos
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                fetchMetadataCounts();
                fetchPdfIncompleteCounts();
                fetchRunningPdfFixJobsCount();
                fetchStuckPdfFixJobsCount(stuckPdfFixThresholdMinutes);
                toast({
                  title: "A atualizar",
                  description: "Contagens atualizadas com sucesso.",
                });
              }}
              disabled={isFixingEurlexTitles || isFixingDreMetadata}
              className="border-violet-300 text-violet-700 hover:bg-violet-50"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar Contagens
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmTerminateStuckPdfFixJobs} onOpenChange={setConfirmTerminateStuckPdfFixJobs}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminar jobs presos (PDF fix)?</AlertDialogTitle>
            <AlertDialogDescription>
              Vou marcar como <strong>completed_timeout</strong> todos os jobs <strong>fix_pdf_import</strong> em
              estado <strong>running</strong> com mais de <strong>{stuckPdfFixThresholdMinutes} minutos</strong>.
              <br />
              <br />
              <strong>Nota:</strong> isto apenas marca o estado na base de dados; o processo em segundo plano pode
              ainda estar a executar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTerminatingStuckPdfFixJobs}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => terminateStuckPdfFixJobs(stuckPdfFixThresholdMinutes)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isTerminatingStuckPdfFixJobs ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <StopCircle className="mr-2 h-4 w-4" />
              )}
              Terminar como Timeout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

    {/* Duplicate Cleanup Panel */}
    <DuplicateCleanupPanel />
  </div>
);
}
