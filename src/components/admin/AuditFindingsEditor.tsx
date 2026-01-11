import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, AlertTriangle, Lightbulb, Users, FileText, ThumbsUp, ThumbsDown, ClipboardList } from "lucide-react";

interface AuditFindingsEditorProps {
  auditId: string;
  findings: string | null;
  recommendations: string | null;
  interlocutors?: string | null;
  methodology?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  executiveSummary?: string | null;
  onUpdated: () => void;
}

export function AuditFindingsEditor({ 
  auditId, 
  findings: initialFindings, 
  recommendations: initialRecommendations,
  interlocutors: initialInterlocutors,
  methodology: initialMethodology,
  strengths: initialStrengths,
  weaknesses: initialWeaknesses,
  executiveSummary: initialExecutiveSummary,
  onUpdated 
}: AuditFindingsEditorProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    findings: initialFindings || "",
    recommendations: initialRecommendations || "",
    interlocutors: initialInterlocutors || "",
    methodology: initialMethodology || "",
    strengths: initialStrengths || "",
    weaknesses: initialWeaknesses || "",
    executive_summary: initialExecutiveSummary || "",
  });

  // Reset form when audit changes
  useEffect(() => {
    setForm({
      findings: initialFindings || "",
      recommendations: initialRecommendations || "",
      interlocutors: initialInterlocutors || "",
      methodology: initialMethodology || "",
      strengths: initialStrengths || "",
      weaknesses: initialWeaknesses || "",
      executive_summary: initialExecutiveSummary || "",
    });
  }, [auditId, initialFindings, initialRecommendations, initialInterlocutors, initialMethodology, initialStrengths, initialWeaknesses, initialExecutiveSummary]);

  const hasChanges = 
    form.findings !== (initialFindings || "") ||
    form.recommendations !== (initialRecommendations || "") ||
    form.interlocutors !== (initialInterlocutors || "") ||
    form.methodology !== (initialMethodology || "") ||
    form.strengths !== (initialStrengths || "") ||
    form.weaknesses !== (initialWeaknesses || "") ||
    form.executive_summary !== (initialExecutiveSummary || "");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("audits")
        .update({
          findings: form.findings || null,
          recommendations: form.recommendations || null,
          interlocutors: form.interlocutors || null,
          methodology: form.methodology || null,
          strengths: form.strengths || null,
          weaknesses: form.weaknesses || null,
          executive_summary: form.executive_summary || null,
        })
        .eq("id", auditId);

      if (error) throw error;

      toast({ title: "Dados da auditoria guardados" });
      onUpdated();
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: "Erro ao guardar", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Detalhes e Conclusões da Auditoria</CardTitle>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary" className="text-xs">Sumário</TabsTrigger>
            <TabsTrigger value="methodology" className="text-xs">Metodologia</TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs">Análise</TabsTrigger>
            <TabsTrigger value="conclusions" className="text-xs">Conclusões</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Sumário Executivo
              </label>
              <Textarea
                placeholder="Resumo geral da auditoria, objetivos, âmbito e principais conclusões..."
                value={form.executive_summary}
                onChange={(e) => setForm({ ...form, executive_summary: e.target.value })}
                rows={5}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Interlocutores
              </label>
              <Textarea
                placeholder="Liste os interlocutores contactados durante a auditoria (nome, função, departamento)..."
                value={form.interlocutors}
                onChange={(e) => setForm({ ...form, interlocutors: e.target.value })}
                rows={3}
                className="resize-none"
              />
            </div>
          </TabsContent>

          <TabsContent value="methodology" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-purple-500" />
                Metodologia de Trabalho
              </label>
              <Textarea
                placeholder="Descreva a metodologia utilizada: entrevistas, análise documental, verificação no local, amostragem..."
                value={form.methodology}
                onChange={(e) => setForm({ ...form, methodology: e.target.value })}
                rows={6}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Inclua critérios de amostragem, documentos analisados e técnicas de verificação utilizadas.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-green-500" />
                  Pontos Fortes
                </label>
                <Textarea
                  placeholder="Identifique os pontos fortes observados, boas práticas e áreas de excelência..."
                  value={form.strengths}
                  onChange={(e) => setForm({ ...form, strengths: e.target.value })}
                  rows={6}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-red-500" />
                  Pontos Fracos
                </label>
                <Textarea
                  placeholder="Identifique os pontos fracos, lacunas e áreas que necessitam de melhoria..."
                  value={form.weaknesses}
                  onChange={(e) => setForm({ ...form, weaknesses: e.target.value })}
                  rows={6}
                  className="resize-none"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="conclusions" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Constatações Gerais
              </label>
              <Textarea
                placeholder="Descreva as principais constatações da auditoria, não conformidades identificadas..."
                value={form.findings}
                onChange={(e) => setForm({ ...form, findings: e.target.value })}
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-blue-500" />
                Recomendações
              </label>
              <Textarea
                placeholder="Liste as recomendações para corrigir não conformidades e melhorar o desempenho..."
                value={form.recommendations}
                onChange={(e) => setForm({ ...form, recommendations: e.target.value })}
                rows={4}
                className="resize-none"
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
