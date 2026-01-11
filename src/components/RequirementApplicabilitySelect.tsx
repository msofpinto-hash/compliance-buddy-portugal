import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface RequirementApplicabilitySelectProps {
  requirementId: string;
  organizationId: string;
  currentValue?: string;
  onUpdate?: (newValue: string) => void;
  readOnly?: boolean;
}

const applicabilityTypes = [
  { value: "nao_avaliado", label: "Não Avaliado", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: "aplicavel_direto", label: "Aplicável Direto", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "aplicavel_indireto", label: "Aplicável Indireto", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "aplicavel_condicionado", label: "Aplicável Condicionado", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "nao_aplicavel", label: "Não Aplicável", color: "bg-red-100 text-red-700 border-red-300" },
  { value: "informativo", label: "Informativo", color: "bg-purple-100 text-purple-700 border-purple-300" },
];

export function getApplicabilityInfo(value: string) {
  return applicabilityTypes.find(t => t.value === value) || applicabilityTypes[0];
}

export function ApplicabilityBadge({ value }: { value?: string }) {
  const info = getApplicabilityInfo(value || "nao_avaliado");
  return (
    <Badge variant="outline" className={`${info.color} text-xs`}>
      {info.label}
    </Badge>
  );
}

export function RequirementApplicabilitySelect({
  requirementId,
  organizationId,
  currentValue = "nao_avaliado",
  onUpdate,
  readOnly = false,
}: RequirementApplicabilitySelectProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [value, setValue] = useState(currentValue);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleValueChange = async (newValue: string) => {
    if (!user || readOnly) return;

    setIsUpdating(true);
    setValue(newValue);

    try {
      // Check if applicability record exists
      const { data: existing, error: fetchError } = await supabase
        .from("applicabilities")
        .select("id")
        .eq("requirement_id", requirementId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from("applicabilities")
          .update({ 
            applicability_type: newValue,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from("applicabilities")
          .insert({
            requirement_id: requirementId,
            organization_id: organizationId,
            applicability_type: newValue,
            is_applicable: newValue !== "nao_aplicavel",
          });

        if (insertError) throw insertError;
      }

      toast({
        title: "Aplicabilidade atualizada",
        description: `Requisito classificado como "${getApplicabilityInfo(newValue).label}"`,
      });

      onUpdate?.(newValue);
    } catch (error) {
      console.error("Error updating applicability:", error);
      setValue(currentValue); // Revert on error
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar a aplicabilidade",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (readOnly) {
    return <ApplicabilityBadge value={value} />;
  }

  const selectedInfo = getApplicabilityInfo(value);

  return (
    <div className="relative">
      <Select value={value} onValueChange={handleValueChange} disabled={isUpdating}>
        <SelectTrigger className={`w-[180px] h-8 text-xs ${selectedInfo.color}`}>
          {isUpdating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          {applicabilityTypes.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${type.color.split(' ')[0]}`} />
                {type.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
