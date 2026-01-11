import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, AlertTriangle, Lightbulb, Users, FileText, ThumbsUp, ThumbsDown, ClipboardList, Crosshair, Building2 } from "lucide-react";

interface AuditFindingsEditorProps {
  auditId: string;
  findings: string | null;
  recommendations: string | null;
  interlocutors?: string | null;
  methodology?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  executiveSummary?: string | null;
  objectives?: string | null;
  scope?: string | null;
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
  objectives: initialObjectives,
  scope: initialScope,
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
    objectives: initialObjectives || "",
    scope: initialScope || "",
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
      objectives: initialObjectives || "",
      scope: initialScope || "",
    });
  }, [auditId, initialFindings, initialRecommendations, initialInterlocutors, initialMethodology, initialStrengths, initialWeaknesses, initialExecutiveSummary, initialObjectives, initialScope]);

  const hasChanges = 
    form.findings !== (initialFindings || "") ||
    form.recommendations !== (initialRecommendations || "") ||
    form.interlocutors !== (initialInterlocutors || "") ||
    form.methodology !== (initialMethodology || "") ||
    form.strengths !== (initialStrengths || "") ||
    form.weaknesses !== (initialWeaknesses || "") ||
    form.executive_summary !== (initialExecutiveSummary || "") ||
    form.objectives !== (initialObjectives || "") ||
    form.scope !== (initialScope || "");

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
          objectives: form.objectives || null,
          scope: form.scope || null,
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
        <Tabs defaultValue="plan" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="plan" className="text-xs gap-1">
              Plano
              {(!form.objectives || !form.methodology || !form.scope || !form.interlocutors) && (
                <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="summary" className="text-xs">Sumário</TabsTrigger>
            <TabsTrigger value="methodology" className="text-xs">Metodologia</TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs">Análise</TabsTrigger>
            <TabsTrigger value="conclusions" className="text-xs">Conclusões</TabsTrigger>
          </TabsList>

          <TabsContent value="plan" className="space-y-4 mt-4">
            <div className={`p-3 rounded-lg mb-4 ${
              (!form.objectives || !form.methodology || !form.scope || !form.interlocutors)
                ? "bg-destructive/10 border border-destructive/30"
                : "bg-green-500/10 border border-green-500/30"
            }`}>
              <p className={`text-sm font-medium ${
                (!form.objectives || !form.methodology || !form.scope || !form.interlocutors)
                  ? "text-destructive"
                  : "text-green-600"
              }`}>
                {(!form.objectives || !form.methodology || !form.scope || !form.interlocutors)
                  ? "⚠️ Campos Obrigatórios em Falta"
                  : "✓ Plano de Auditoria Completo"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(!form.objectives || !form.methodology || !form.scope || !form.interlocutors)
                  ? "Preencha todos os campos para enviar o plano para aprovação"
                  : "Todos os campos obrigatórios estão preenchidos"}
              </p>
            </div>
            
            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${!form.objectives ? "text-destructive" : ""}`}>
                <Crosshair className={`h-4 w-4 ${!form.objectives ? "text-destructive" : "text-primary"}`} />
                Objetivos da Auditoria <span className="text-destructive">*</span>
                {!form.objectives && <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">Em falta</span>}
              </label>
              <Textarea
                placeholder="Defina os objetivos e metas específicas desta auditoria..."
                value={form.objectives}
                onChange={(e) => setForm({ ...form, objectives: e.target.value })}
                rows={4}
                className={`resize-none ${!form.objectives ? "border-destructive/50 focus-visible:ring-destructive/50" : ""}`}
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${!form.scope ? "text-destructive" : ""}`}>
                <Building2 className={`h-4 w-4 ${!form.scope ? "text-destructive" : "text-orange-500"}`} />
                Estabelecimentos Abrangidos <span className="text-destructive">*</span>
                {!form.scope && <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">Em falta</span>}
              </label>
              <Textarea
                placeholder="Liste os estabelecimentos, instalações e locais incluídos no âmbito desta auditoria..."
                value={form.scope}
                onChange={(e) => setForm({ ...form, scope: e.target.value })}
                rows={3}
                className={`resize-none ${!form.scope ? "border-destructive/50 focus-visible:ring-destructive/50" : ""}`}
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${!form.methodology ? "text-destructive" : ""}`}>
                <ClipboardList className={`h-4 w-4 ${!form.methodology ? "text-destructive" : "text-purple-500"}`} />
                Metodologia <span className="text-destructive">*</span>
                {!form.methodology && <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">Em falta</span>}
              </label>
              <Textarea
                placeholder="Descreva a metodologia a utilizar: entrevistas, análise documental, verificação no local..."
                value={form.methodology}
                onChange={(e) => setForm({ ...form, methodology: e.target.value })}
                rows={4}
                className={`resize-none ${!form.methodology ? "border-destructive/50 focus-visible:ring-destructive/50" : ""}`}
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium flex items-center gap-2 ${!form.interlocutors ? "text-destructive" : ""}`}>
                <Users className={`h-4 w-4 ${!form.interlocutors ? "text-destructive" : "text-blue-500"}`} />
                Interlocutores <span className="text-destructive">*</span>
                {!form.interlocutors && <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">Em falta</span>}
              </label>
              <Textarea
                placeholder="Liste os interlocutores a contactar (nome, função, departamento)..."
                value={form.interlocutors}
                onChange={(e) => setForm({ ...form, interlocutors: e.target.value })}
                rows={3}
                className={`resize-none ${!form.interlocutors ? "border-destructive/50 focus-visible:ring-destructive/50" : ""}`}
              />
            </div>
          </TabsContent>

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
