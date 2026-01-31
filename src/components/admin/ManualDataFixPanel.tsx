import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Type, Calendar, FileText, Link, Loader2, Save, ChevronLeft, ChevronRight,
  ExternalLink, AlertCircle, CheckCircle, SkipForward, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

type ProblemType = "titles" | "dates" | "summaries" | "urls";

interface LegislationItem {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  document_url: string | null;
  publication_date: string | null;
  effective_date: string | null;
  origin: string | null;
  entity: string | null;
}

const PROBLEM_LABELS: Record<ProblemType, { label: string; icon: React.ReactNode; color: string }> = {
  titles: { label: "Títulos Genéricos", icon: <Type className="h-4 w-4" />, color: "text-amber-600" },
  dates: { label: "Datas em Falta", icon: <Calendar className="h-4 w-4" />, color: "text-blue-600" },
  summaries: { label: "Sumários Curtos", icon: <FileText className="h-4 w-4" />, color: "text-purple-600" },
  urls: { label: "URLs em Falta", icon: <Link className="h-4 w-4" />, color: "text-red-600" },
};

export function ManualDataFixPanel() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProblemType>("titles");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [editedTitle, setEditedTitle] = useState("");
  const [editedSummary, setEditedSummary] = useState("");
  const [editedUrl, setEditedUrl] = useState("");
  const [editedPublicationDate, setEditedPublicationDate] = useState("");
  const [editedEffectiveDate, setEditedEffectiveDate] = useState("");

  // Fetch items with problems
  const { data: problemItems, isLoading, refetch } = useQuery({
    queryKey: ["manual-fix-items", activeTab],
    queryFn: async (): Promise<LegislationItem[]> => {
      let query = supabase
        .from("legislation")
        .select("id, number, title, summary, document_url, publication_date, effective_date, origin, entity")
        .is("revocation_date", null)
        .limit(100);

      switch (activeTab) {
        case "titles":
          // Use the RPC for generic titles
          const { data: titleIds } = await supabase.rpc("get_generic_title_ids", { p_limit: 100, p_offset: 0 });
          if (!titleIds || titleIds.length === 0) return [];
          const ids = titleIds.map((r: any) => r.id);
          const { data: titleData } = await supabase
            .from("legislation")
            .select("id, number, title, summary, document_url, publication_date, effective_date, origin, entity")
            .in("id", ids);
          return titleData || [];
          
        case "dates":
          query = query
            .not("document_url", "is", null)
            .or("publication_date.is.null,effective_date.is.null");
          break;
          
        case "summaries":
          // Use the RPC for short summaries
          const { data: summaryIds } = await supabase.rpc("get_short_summary_ids", { p_limit: 100, p_offset: 0 });
          if (!summaryIds || summaryIds.length === 0) return [];
          const sIds = summaryIds.map((r: any) => r.id);
          const { data: summaryData } = await supabase
            .from("legislation")
            .select("id, number, title, summary, document_url, publication_date, effective_date, origin, entity")
            .in("id", sIds);
          return summaryData || [];
          
        case "urls":
          query = query
            .is("document_url", null)
            .or("no_digital_version.is.null,no_digital_version.eq.false");
          break;
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });

  const currentItem = problemItems?.[currentIndex];

  // Sync form state with current item
  useEffect(() => {
    if (currentItem) {
      setEditedTitle(currentItem.title || "");
      setEditedSummary(currentItem.summary || "");
      setEditedUrl(currentItem.document_url || "");
      setEditedPublicationDate(currentItem.publication_date || "");
      setEditedEffectiveDate(currentItem.effective_date || "");
    }
  }, [currentItem]);

  // Reset index when tab changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [activeTab]);

  const handleSave = async () => {
    if (!currentItem) return;

    setIsSaving(true);
    try {
      const updateData: Record<string, any> = {};

      switch (activeTab) {
        case "titles":
          if (!editedTitle.trim()) {
            toast.error("O título não pode estar vazio");
            return;
          }
          updateData.title = editedTitle.trim();
          break;
          
        case "dates":
          updateData.publication_date = editedPublicationDate || null;
          updateData.effective_date = editedEffectiveDate || null;
          break;
          
        case "summaries":
          updateData.summary = editedSummary.trim() || null;
          break;
          
        case "urls":
          updateData.document_url = editedUrl.trim() || null;
          break;
      }

      const { error } = await supabase
        .from("legislation")
        .update(updateData)
        .eq("id", currentItem.id);

      if (error) throw error;

      toast.success("Guardado com sucesso!");
      
      // Move to next item
      if (currentIndex < (problemItems?.length || 1) - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // Refetch to get fresh list
        await refetch();
        setCurrentIndex(0);
      }
      
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      queryClient.invalidateQueries({ queryKey: ["data-fix-stats-compact"] });
    } catch (error: any) {
      toast.error("Erro ao guardar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    if (currentIndex < (problemItems?.length || 1) - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      toast.info("Fim da lista. Recarregando...");
      refetch();
      setCurrentIndex(0);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const openDocument = () => {
    if (currentItem?.document_url) {
      window.open(currentItem.document_url, "_blank");
    }
  };

  const generateDreUrl = () => {
    if (!currentItem) return;
    // Try to generate DRE URL from number
    const number = currentItem.number;
    // Simple pattern: "Decreto-Lei n.º 123/2020" -> search URL
    const searchUrl = `https://diariodarepublica.pt/dr/pesquisa/-/search/basic?q=${encodeURIComponent(number)}`;
    window.open(searchUrl, "_blank");
  };

  return (
    <Card className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950 border-slate-200/60 dark:border-slate-800/40">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Type className="h-5 w-5 text-slate-600" />
            Correção Manual
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">
        {/* Problem Type Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProblemType)}>
          <TabsList className="grid w-full grid-cols-4 h-auto">
            {(Object.keys(PROBLEM_LABELS) as ProblemType[]).map((type) => (
              <TabsTrigger 
                key={type} 
                value={type}
                className="flex items-center gap-1.5 text-xs px-2 py-2"
              >
                {PROBLEM_LABELS[type].icon}
                <span className="hidden sm:inline">{PROBLEM_LABELS[type].label.split(" ")[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Content for all tabs */}
          {(Object.keys(PROBLEM_LABELS) as ProblemType[]).map((type) => (
            <TabsContent key={type} value={type} className="mt-4 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !problemItems || problemItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
                  <p className="text-lg font-medium text-green-600">Tudo corrigido!</p>
                  <p className="text-sm text-muted-foreground">Não há mais {PROBLEM_LABELS[type].label.toLowerCase()} para corrigir.</p>
                </div>
              ) : currentItem ? (
                <>
                  {/* Navigation Header */}
                  <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePrevious}
                        disabled={currentIndex === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium">
                        {currentIndex + 1} / {problemItems.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSkip}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={PROBLEM_LABELS[type].color}>
                        {currentItem.origin || "PT"}
                      </Badge>
                      {currentItem.document_url && (
                        <Button variant="ghost" size="sm" onClick={openDocument}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Diploma Info (Read-only) */}
                  <div className="bg-white dark:bg-slate-900 rounded-lg border p-4 space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Número</Label>
                      <p className="font-mono text-sm font-medium">{currentItem.number}</p>
                    </div>
                    
                    {activeTab !== "titles" && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Título Atual</Label>
                        <p className="text-sm">{currentItem.title}</p>
                      </div>
                    )}

                    {currentItem.entity && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Entidade</Label>
                        <p className="text-sm">{currentItem.entity}</p>
                      </div>
                    )}
                  </div>

                  {/* Editable Fields based on problem type */}
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 p-4 space-y-4">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Campo a corrigir</span>
                    </div>

                    {activeTab === "titles" && (
                      <div className="space-y-2">
                        <Label htmlFor="title">Novo Título</Label>
                        <Textarea
                          id="title"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          placeholder="Ex: Decreto-Lei n.º 123/2020, de 15 de março - Aprova o regime..."
                          className="min-h-[80px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          Formato recomendado: "Número, de Data - Descrição"
                        </p>
                      </div>
                    )}

                    {activeTab === "dates" && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="publication">Data de Publicação</Label>
                          <Input
                            id="publication"
                            type="date"
                            value={editedPublicationDate}
                            onChange={(e) => setEditedPublicationDate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="effective">Data de Entrada em Vigor</Label>
                          <Input
                            id="effective"
                            type="date"
                            value={editedEffectiveDate}
                            onChange={(e) => setEditedEffectiveDate(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {activeTab === "summaries" && (
                      <div className="space-y-2">
                        <Label htmlFor="summary">Sumário</Label>
                        <Textarea
                          id="summary"
                          value={editedSummary}
                          onChange={(e) => setEditedSummary(e.target.value)}
                          placeholder="Descreva o conteúdo e âmbito do diploma..."
                          className="min-h-[120px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          Mínimo recomendado: 20 caracteres
                        </p>
                      </div>
                    )}

                    {activeTab === "urls" && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="url">URL do Documento</Label>
                          <Input
                            id="url"
                            type="url"
                            value={editedUrl}
                            onChange={(e) => setEditedUrl(e.target.value)}
                            placeholder="https://diariodarepublica.pt/dr/..."
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={generateDreUrl}
                          className="w-full"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Pesquisar no DRE
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="ghost"
                      onClick={handleSkip}
                      disabled={isSaving}
                    >
                      <SkipForward className="h-4 w-4 mr-2" />
                      Saltar
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Guardar e Próximo
                    </Button>
                  </div>
                </>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
