import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const complianceStatuses = [
  { value: "pendente", label: "Por avaliar", color: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "conforme", label: "Conforme", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "nao_conforme", label: "Não conforme", color: "bg-red-100 text-red-700 border-red-300" },
  { value: "parcial", label: "Parcialmente conforme", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "nao_aplicavel", label: "Não aplicável", color: "bg-gray-100 text-gray-700 border-gray-300" },
];

export function getComplianceInfo(value?: string) {
  return complianceStatuses.find((s) => s.value === (value || "pendente")) || complianceStatuses[0];
}

export function ComplianceBadge({ value }: { value?: string }) {
  const info = getComplianceInfo(value);
  return (
    <Badge variant="outline" className={`${info.color} text-xs`}>
      {info.label}
    </Badge>
  );
}

interface Props {
  requirementId: string;
  organizationId: string;
  currentValue?: string;
  readOnly?: boolean;
  onUpdate?: (value: string) => void;
}

export function RequirementComplianceSelect({
  requirementId,
  organizationId,
  currentValue = "pendente",
  readOnly = false,
  onUpdate,
}: Props) {
  const { toast } = useToast();
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(currentValue);
  }, [currentValue, requirementId, organizationId]);

  const handleChange = async (newValue: string) => {
    if (readOnly) return;
    setSaving(true);
    setValue(newValue);
    try {
      const { data: existing, error: fetchError } = await supabase
        .from("applicabilities")
        .select("id")
        .eq("requirement_id", requirementId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (fetchError) throw fetchError;

      const status = newValue === "pendente" ? null : newValue;

      if (existing) {
        const { error } = await supabase
          .from("applicabilities")
          .update({ compliance_status: status, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("applicabilities").insert({
          requirement_id: requirementId,
          organization_id: organizationId,
          compliance_status: status,
          is_applicable: true,
        });
        if (error) throw error;
      }

      toast({ title: "Conformidade atualizada", description: getComplianceInfo(newValue).label });
      onUpdate?.(newValue);
    } catch (e) {
      console.error("Error updating compliance:", e);
      setValue(currentValue);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível guardar o estado de conformidade",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (readOnly) return <ComplianceBadge value={value} />;

  const info = getComplianceInfo(value);

  return (
    <Select value={value} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className={`w-[190px] h-8 text-xs ${info.color}`} aria-label="Estado de conformidade">
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {complianceStatuses.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${s.color.split(" ")[0]}`} />
              {s.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
