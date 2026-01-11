import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, AlertTriangle, Lightbulb } from "lucide-react";

interface AuditFindingsEditorProps {
  auditId: string;
  findings: string | null;
  recommendations: string | null;
  onUpdated: () => void;
}

export function AuditFindingsEditor({ 
  auditId, 
  findings: initialFindings, 
  recommendations: initialRecommendations,
  onUpdated 
}: AuditFindingsEditorProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    findings: initialFindings || "",
    recommendations: initialRecommendations || "",
  });

  // Reset form when audit changes
  useEffect(() => {
    setForm({
      findings: initialFindings || "",
      recommendations: initialRecommendations || "",
    });
  }, [auditId, initialFindings, initialRecommendations]);

  const hasChanges = 
    form.findings !== (initialFindings || "") ||
    form.recommendations !== (initialRecommendations || "");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("audits")
        .update({
          findings: form.findings || null,
          recommendations: form.recommendations || null,
        })
        .eq("id", auditId);

      if (error) throw error;

      toast({ title: "Constatações e recomendações guardadas" });
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
          <CardTitle className="text-base">Conclusões da Auditoria</CardTitle>
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
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Constatações Gerais
          </label>
          <Textarea
            placeholder="Descreva as principais constatações da auditoria, não conformidades identificadas, pontos de melhoria..."
            value={form.findings}
            onChange={(e) => setForm({ ...form, findings: e.target.value })}
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Registe aqui um resumo das principais constatações identificadas durante a auditoria.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-blue-500" />
            Recomendações
          </label>
          <Textarea
            placeholder="Liste as recomendações para corrigir as não conformidades e melhorar o desempenho..."
            value={form.recommendations}
            onChange={(e) => setForm({ ...form, recommendations: e.target.value })}
            rows={4}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Inclua recomendações específicas, prazos sugeridos e responsáveis quando aplicável.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
