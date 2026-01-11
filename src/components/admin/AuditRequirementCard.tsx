import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Save, Loader2 } from "lucide-react";

const complianceOptions = [
  { value: "pending", label: "Pendente", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: "compliant", label: "Conforme", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "partial", label: "Parcial", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "non_compliant", label: "Não Conforme", color: "bg-red-100 text-red-700 border-red-300" },
];

interface AuditRequirementCardProps {
  requirement: {
    id: string;
    compliance_status: string | null;
    evidence: string | null;
    findings: string | null;
    applicability_type: string;
    legislation?: { number: string; title: string } | null;
    legal_requirements?: { article: string | null; requirement_text: string } | null;
  };
  onUpdated: () => void;
}

export function AuditRequirementCard({ requirement, onUpdated }: AuditRequirementCardProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    compliance_status: requirement.compliance_status || "pending",
    evidence: requirement.evidence || "",
    findings: requirement.findings || "",
  });

  const currentStatus = complianceOptions.find(o => o.value === form.compliance_status) || complianceOptions[0];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("audit_requirements")
        .update({
          compliance_status: form.compliance_status,
          evidence: form.evidence || null,
          findings: form.findings || null,
        })
        .eq("id", requirement.id);

      if (error) throw error;

      toast({ title: "Avaliação guardada" });
      onUpdated();
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: "Erro ao guardar", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = 
    form.compliance_status !== (requirement.compliance_status || "pending") ||
    form.evidence !== (requirement.evidence || "") ||
    form.findings !== (requirement.findings || "");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  {requirement.legislation?.number}
                </p>
                {requirement.legal_requirements?.article && (
                  <p className="text-sm font-medium text-primary">
                    {requirement.legal_requirements.article}
                  </p>
                )}
                <p className="text-sm mt-1 line-clamp-2">
                  {requirement.legal_requirements?.requirement_text}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={currentStatus.color}>
                  {currentStatus.label}
                </Badge>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-4 pt-4 border-t space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Estado de Conformidade</label>
                <Select
                  value={form.compliance_status}
                  onValueChange={(v) => setForm({ ...form, compliance_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {complianceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${option.color.split(" ")[0]}`} />
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Aplicabilidade: {requirement.applicability_type}
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Evidência</label>
              <Textarea
                placeholder="Descreva as evidências de conformidade..."
                value={form.evidence}
                onChange={(e) => setForm({ ...form, evidence: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Constatações</label>
              <Textarea
                placeholder="Registe as constatações da auditoria..."
                value={form.findings}
                onChange={(e) => setForm({ ...form, findings: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex justify-end">
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
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
