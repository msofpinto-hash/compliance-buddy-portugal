import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Link as LinkIcon, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Search,
  Download,
  FileText,
  ExternalLink
} from "lucide-react";

interface ScrapedData {
  title?: string;
  summary?: string;
  number?: string;
  publication_date?: string;
  effective_date?: string;
  entity?: string;
  source?: string;
  origin?: string;
}

interface ImportLegislationByUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportLegislationByUrlDialog({ open, onOpenChange }: ImportLegislationByUrlDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState<ScrapedData | null>(null);
  const [existingLegislation, setExistingLegislation] = useState<any | null>(null);
  const [step, setStep] = useState<"input" | "preview" | "success">("input");
  
  // Editable fields
  const [editedData, setEditedData] = useState<ScrapedData>({});

  const detectUrlType = (url: string): { type: "dre" | "eurlex" | "unknown"; origin: string } => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("dre.pt") || lowerUrl.includes("diariodarepublica.pt")) {
      return { type: "dre", origin: "PT" };
    }
    if (lowerUrl.includes("eur-lex.europa.eu")) {
      return { type: "eurlex", origin: "EU" };
    }
    return { type: "unknown", origin: "PT" };
  };

  const checkExistingLegislation = async (documentUrl: string) => {
    // Check if this URL already exists
    const { data } = await supabase
      .from("legislation")
      .select("id, number, title, document_url")
      .eq("document_url", documentUrl)
      .maybeSingle();
    
    return data;
  };

  const handleScrape = async () => {
    if (!url.trim()) {
      toast({
        title: "URL em falta",
        description: "Introduza um URL válido",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      toast({
        title: "URL inválido",
        description: "O URL introduzido não é válido",
        variant: "destructive",
      });
      return;
    }

    setIsScraping(true);
    setScrapedData(null);
    setExistingLegislation(null);

    try {
      // First check if URL already exists
      const existing = await checkExistingLegislation(url.trim());
      if (existing) {
        setExistingLegislation(existing);
        setIsScraping(false);
        return;
      }

      const { type, origin } = detectUrlType(url);

      // Use firecrawl-scrape to get metadata
      const response = await supabase.functions.invoke("firecrawl-scrape", {
        body: {
          url: url.trim(),
          options: {
            formats: ["markdown"],
            onlyMainContent: true,
            waitFor: 3000,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Erro no scraping");
      }

      const data = response.data;
      
      if (!data.success) {
        throw new Error(data.error || "Falha ao obter dados do URL");
      }

      // Extract metadata from scraped content
      const metadata = data.data?.metadata || {};
      const markdown = data.data?.markdown || "";
      
      // Parse title and extract number
      let title = metadata.title || metadata["og:title"] || "";
      let summary = metadata.description || metadata["og:description"] || "";
      
      // Try to extract number from title or URL
      let number = "";
      
      // Pattern for Portuguese legislation numbers
      const ptPatterns = [
        /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento|Declaração|Aviso|Parecer|Deliberação|Acórdão)\s*n\.?[ºo°]?\s*[\d\w\-\/]+/i,
        /(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Regulamento)\s*n\.?[ºo°]?\s*[\d]+[A-Z]?[\-\/]\d{4}/i,
      ];
      
      // Pattern for EU legislation
      const euPatterns = [
        /Regulamento\s*(?:\(UE\)|\(CE\))?\s*(?:n\.?[ºo°]?\s*)?\d+\/\d+/i,
        /Diretiva\s*(?:\(UE\)|\(CE\))?\s*\d+\/\d+/i,
        /Decisão\s*(?:\(UE\)|\(CE\))?\s*(?:n\.?[ºo°]?\s*)?\d+\/\d+/i,
      ];
      
      const patterns = origin === "EU" ? euPatterns : ptPatterns;
      
      for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) {
          number = match[0];
          break;
        }
      }
      
      // If no number found, try to extract from URL
      if (!number && type === "dre") {
        // DRE URLs often have the number in the path
        const urlMatch = url.match(/\/(\d+)-(\d{4})-\d+/);
        if (urlMatch) {
          number = `Diploma ${urlMatch[1]}/${urlMatch[2]}`;
        }
      }

      // Clean up title
      if (title.includes(" | ")) {
        title = title.split(" | ")[0].trim();
      }
      if (title.includes(" - DRE")) {
        title = title.replace(/ - DRE$/, "").trim();
      }

      const scraped: ScrapedData = {
        title: title || "Título não disponível",
        summary: summary || "",
        number: number || "Número não identificado",
        publication_date: "",
        effective_date: "",
        entity: "",
        source: type === "eurlex" ? "eurlex" : "dre",
        origin,
      };

      setScrapedData(scraped);
      setEditedData(scraped);
      setStep("preview");

    } catch (error) {
      console.error("Scraping error:", error);
      toast({
        title: "Erro no scraping",
        description: error instanceof Error ? error.message : "Não foi possível extrair dados do URL",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleImport = async () => {
    if (!editedData.number || !editedData.title) {
      toast({
        title: "Dados incompletos",
        description: "O número e título são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Check if number already exists
      const { data: existingByNumber } = await supabase
        .from("legislation")
        .select("id, number, title")
        .eq("number", editedData.number)
        .maybeSingle();

      if (existingByNumber) {
        // Update existing legislation with the URL
        const { error: updateError } = await supabase
          .from("legislation")
          .update({
            document_url: url.trim(),
            summary: editedData.summary || existingByNumber.title,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingByNumber.id);

        if (updateError) throw updateError;

        toast({
          title: "Diploma atualizado",
          description: `URL adicionado ao diploma "${editedData.number}"`,
        });
      } else {
        // Create new legislation
        const { error: insertError } = await supabase
          .from("legislation")
          .insert({
            number: editedData.number,
            title: editedData.title,
            summary: editedData.summary || null,
            document_url: url.trim(),
            publication_date: editedData.publication_date || null,
            effective_date: editedData.effective_date || null,
            entity: editedData.entity || null,
            source: editedData.source || "manual",
            origin: editedData.origin || "PT",
          });

        if (insertError) throw insertError;

        toast({
          title: "Diploma importado",
          description: `"${editedData.number}" foi adicionado à biblioteca`,
        });
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });

      setStep("success");

    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Não foi possível importar o diploma",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading && !isScraping) {
      setUrl("");
      setScrapedData(null);
      setExistingLegislation(null);
      setEditedData({});
      setStep("input");
      onOpenChange(false);
    }
  };

  const handleReset = () => {
    setUrl("");
    setScrapedData(null);
    setExistingLegislation(null);
    setEditedData({});
    setStep("input");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Importar Diploma por URL
          </DialogTitle>
          <DialogDescription>
            Introduza o URL de um diploma para extrair automaticamente os metadados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
          {/* Step 1: URL Input */}
          {step === "input" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">URL do Diploma</Label>
                <div className="flex gap-2">
                  <Input
                    id="url"
                    placeholder="https://diariodarepublica.pt/dr/detalhe/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isScraping}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleScrape}
                    disabled={isScraping || !url.trim()}
                  >
                    {isScraping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Suporta URLs do DRE (diariodarepublica.pt) e EUR-Lex
                </p>
              </div>

              {/* Existing legislation warning */}
              {existingLegislation && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">Este URL já existe na base de dados:</p>
                      <p className="text-sm">{existingLegislation.number} - {existingLegislation.title}</p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  O sistema irá extrair automaticamente o número, título e sumário do diploma a partir da página.
                  Poderá editar os dados antes de importar.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Step 2: Preview & Edit */}
          {step === "preview" && scrapedData && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={editedData.origin === "EU" ? "secondary" : "default"}>
                    {editedData.origin === "EU" ? "🇪🇺 EUR-Lex" : "🇵🇹 DRE"}
                  </Badge>
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    Ver original <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="number">Número do Diploma *</Label>
                  <Input
                    id="number"
                    value={editedData.number || ""}
                    onChange={(e) => setEditedData({ ...editedData, number: e.target.value })}
                    placeholder="Ex: Decreto-Lei n.º 123/2024"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={editedData.title || ""}
                    onChange={(e) => setEditedData({ ...editedData, title: e.target.value })}
                    placeholder="Título do diploma"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="summary">Sumário</Label>
                  <Textarea
                    id="summary"
                    value={editedData.summary || ""}
                    onChange={(e) => setEditedData({ ...editedData, summary: e.target.value })}
                    placeholder="Descrição/sumário do diploma"
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="publication_date">Data de Publicação</Label>
                    <Input
                      id="publication_date"
                      type="date"
                      value={editedData.publication_date || ""}
                      onChange={(e) => setEditedData({ ...editedData, publication_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="effective_date">Data de Entrada em Vigor</Label>
                    <Input
                      id="effective_date"
                      type="date"
                      value={editedData.effective_date || ""}
                      onChange={(e) => setEditedData({ ...editedData, effective_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entity">Entidade Emissora</Label>
                  <Input
                    id="entity"
                    value={editedData.entity || ""}
                    onChange={(e) => setEditedData({ ...editedData, entity: e.target.value })}
                    placeholder="Ex: Ministério da Economia"
                  />
                </div>
              </div>
            </ScrollArea>
          )}

          {/* Step 3: Success */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <div className="text-center">
                <h3 className="text-lg font-medium">Diploma Importado com Sucesso!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  O diploma foi adicionado à biblioteca
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Importar Outro
                </Button>
                <Button onClick={handleClose}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== "success" && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isLoading || isScraping}>
              Cancelar
            </Button>
            {step === "preview" && (
              <>
                <Button variant="ghost" onClick={handleReset} disabled={isLoading}>
                  Voltar
                </Button>
                <Button onClick={handleImport} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      A importar...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Importar Diploma
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
