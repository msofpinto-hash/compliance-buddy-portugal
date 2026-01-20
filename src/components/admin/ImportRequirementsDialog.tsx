import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Link, FileText, Brain, Check, X, Import, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ExtractedRequirement {
  article: string;
  requirement_text: string;
  selected: boolean;
}

interface ImportRequirementsDialogProps {
  legislationId: string;
  legislationNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRequirementsCount: number;
}

export function ImportRequirementsDialog({
  legislationId,
  legislationNumber,
  open,
  onOpenChange,
  existingRequirementsCount,
}: ImportRequirementsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<"url" | "text">("text");
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [extractedRequirements, setExtractedRequirements] = useState<ExtractedRequirement[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Extract requirements from URL
  const extractFromUrlMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("import-requirements-from-source", {
        body: {
          legislationId,
          source: "url",
          url: url.trim(),
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro na extração");

      return data.requirements as Array<{ article: string; requirement_text: string }>;
    },
    onSuccess: (requirements) => {
      setExtractedRequirements(requirements.map((r) => ({ ...r, selected: true })));
      toast({
        title: "Requisitos extraídos",
        description: `${requirements.length} requisitos encontrados`,
      });
    },
    onError: (error) => {
      console.error("URL extraction error:", error);
      toast({
        title: "Erro na extração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  // Extract requirements from pasted text
  const extractFromTextMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("import-requirements-from-source", {
        body: {
          legislationId,
          source: "text",
          text: pastedText.trim(),
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro na extração");

      return data.requirements as Array<{ article: string; requirement_text: string }>;
    },
    onSuccess: (requirements) => {
      setExtractedRequirements(requirements.map((r) => ({ ...r, selected: true })));
      toast({
        title: "Requisitos extraídos",
        description: `${requirements.length} requisitos encontrados`,
      });
    },
    onError: (error) => {
      console.error("Text extraction error:", error);
      toast({
        title: "Erro na extração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  // Import selected requirements to database
  const importMutation = useMutation({
    mutationFn: async () => {
      const selectedReqs = extractedRequirements.filter((r) => r.selected);
      if (selectedReqs.length === 0) throw new Error("Nenhum requisito selecionado");

      // If replacing, delete existing requirements first
      if (replaceExisting && existingRequirementsCount > 0) {
        const { error: deleteError } = await supabase
          .from("legal_requirements")
          .delete()
          .eq("legislation_id", legislationId);

        if (deleteError) throw deleteError;
      }

      // Get max display_order
      const { data: existingReqs } = await supabase
        .from("legal_requirements")
        .select("display_order")
        .eq("legislation_id", legislationId)
        .order("display_order", { ascending: false })
        .limit(1);

      const maxOrder = existingReqs?.[0]?.display_order || 0;

      // Insert new requirements
      const toInsert = selectedReqs.map((req, index) => ({
        legislation_id: legislationId,
        article: req.article || null,
        requirement_text: req.requirement_text,
        display_order: maxOrder + index + 1,
      }));

      const { error: insertError } = await supabase
        .from("legal_requirements")
        .insert(toInsert);

      if (insertError) throw insertError;

      return selectedReqs.length;
    },
    onSuccess: (count) => {
      toast({
        title: "Requisitos importados",
        description: `${count} requisitos adicionados com sucesso`,
      });
      queryClient.invalidateQueries({ queryKey: ["legal-requirements", legislationId] });
      queryClient.invalidateQueries({ queryKey: ["requirements-stats"] });
      handleClose();
    },
    onError: (error) => {
      console.error("Import error:", error);
      toast({
        title: "Erro na importação",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setUrl("");
    setPastedText("");
    setExtractedRequirements([]);
    setReplaceExisting(false);
    onOpenChange(false);
  };

  const toggleRequirement = (index: number) => {
    setExtractedRequirements((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    );
  };

  const selectAll = () => {
    setExtractedRequirements((prev) => prev.map((r) => ({ ...r, selected: true })));
  };

  const deselectAll = () => {
    setExtractedRequirements((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  const selectedCount = extractedRequirements.filter((r) => r.selected).length;
  const isExtracting = extractFromUrlMutation.isPending || extractFromTextMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="h-5 w-5" />
            Importar Requisitos
          </DialogTitle>
          <DialogDescription>
            Importe requisitos de um URL ou cole o texto diretamente para o diploma:{" "}
            <strong>{legislationNumber}</strong>
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "url" | "text")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="text" className="gap-2">
              <FileText className="h-4 w-4" />
              Colar Texto
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-2">
              <Link className="h-4 w-4" />
              Via URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="flex-1 flex flex-col min-h-0 mt-4">
            {extractedRequirements.length === 0 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Cole o texto do diploma</Label>
                  <Textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Cole aqui o texto do diploma, incluindo artigos, anexos, ou qualquer conteúdo que deseje extrair requisitos..."
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>
                <Button
                  onClick={() => extractFromTextMutation.mutate()}
                  disabled={isExtracting || !pastedText.trim()}
                  className="w-full gap-2"
                >
                  {extractFromTextMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4" />
                  )}
                  Extrair Requisitos via IA
                </Button>
              </div>
            ) : (
              <RequirementsPreview
                requirements={extractedRequirements}
                selectedCount={selectedCount}
                existingRequirementsCount={existingRequirementsCount}
                replaceExisting={replaceExisting}
                setReplaceExisting={setReplaceExisting}
                toggleRequirement={toggleRequirement}
                selectAll={selectAll}
                deselectAll={deselectAll}
                onImport={() => importMutation.mutate()}
                onBack={() => setExtractedRequirements([])}
                isImporting={importMutation.isPending}
              />
            )}
          </TabsContent>

          <TabsContent value="url" className="flex-1 flex flex-col min-h-0 mt-4">
            {extractedRequirements.length === 0 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>URL do documento</Label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://diariodarepublica.pt/... ou https://eur-lex.europa.eu/..."
                    type="url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cole o URL do DRE, EUR-Lex, ou qualquer página que contenha o texto do diploma
                  </p>
                </div>
                <Button
                  onClick={() => extractFromUrlMutation.mutate()}
                  disabled={isExtracting || !url.trim()}
                  className="w-full gap-2"
                >
                  {extractFromUrlMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4" />
                  )}
                  Extrair Requisitos do URL
                </Button>
              </div>
            ) : (
              <RequirementsPreview
                requirements={extractedRequirements}
                selectedCount={selectedCount}
                existingRequirementsCount={existingRequirementsCount}
                replaceExisting={replaceExisting}
                setReplaceExisting={setReplaceExisting}
                toggleRequirement={toggleRequirement}
                selectAll={selectAll}
                deselectAll={deselectAll}
                onImport={() => importMutation.mutate()}
                onBack={() => setExtractedRequirements([])}
                isImporting={importMutation.isPending}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Subcomponent for previewing extracted requirements
function RequirementsPreview({
  requirements,
  selectedCount,
  existingRequirementsCount,
  replaceExisting,
  setReplaceExisting,
  toggleRequirement,
  selectAll,
  deselectAll,
  onImport,
  onBack,
  isImporting,
}: {
  requirements: ExtractedRequirement[];
  selectedCount: number;
  existingRequirementsCount: number;
  replaceExisting: boolean;
  setReplaceExisting: (v: boolean) => void;
  toggleRequirement: (index: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  onImport: () => void;
  onBack: () => void;
  isImporting: boolean;
}) {
  return (
    <div className="flex flex-col min-h-0 flex-1 space-y-4">
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Requisitos Extraídos</CardTitle>
              <CardDescription>
                {selectedCount} de {requirements.length} selecionados
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                <Check className="h-3 w-3 mr-1" />
                Todos
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                <X className="h-3 w-3 mr-1" />
                Nenhum
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="py-0">
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2 pb-4">
              {requirements.map((req, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    req.selected
                      ? "bg-primary/5 border-primary/30"
                      : "bg-muted/30 border-muted opacity-60"
                  }`}
                  onClick={() => toggleRequirement(index)}
                >
                  <Checkbox
                    checked={req.selected}
                    onCheckedChange={() => toggleRequirement(index)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {req.article || "Geral"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {req.requirement_text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {existingRequirementsCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 text-sm">
            <p>
              Este diploma já tem <strong>{existingRequirementsCount}</strong> requisitos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="replace"
              checked={replaceExisting}
              onCheckedChange={(v) => setReplaceExisting(v === true)}
            />
            <Label htmlFor="replace" className="text-sm cursor-pointer">
              Substituir existentes
            </Label>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} disabled={isImporting} className="gap-2">
          Voltar
        </Button>
        <Button
          onClick={onImport}
          disabled={isImporting || selectedCount === 0}
          className="flex-1 gap-2"
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Import className="h-4 w-4" />
          )}
          Importar {selectedCount} Requisitos
        </Button>
      </div>
    </div>
  );
}
