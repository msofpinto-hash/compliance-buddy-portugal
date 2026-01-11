import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface LegislationApplicabilitySelectProps {
  legislationId: string;
  organizationId: string;
  currentValue?: string;
  onUpdate?: (newValue: string) => void;
  readOnly?: boolean;
}

const applicabilityTypes = [
  { value: "nao_avaliado", label: "Não Avaliado", color: "bg-gray-100 text-gray-700 border-gray-300", description: "Este diploma ainda não foi avaliado pela organização." },
  { value: "aplicavel_direto", label: "Aplicável Direto", color: "bg-green-100 text-green-700 border-green-300", description: "Aplicação obrigatória e direta às atividades da organização." },
  { value: "aplicavel_indireto", label: "Aplicável Indireto", color: "bg-blue-100 text-blue-700 border-blue-300", description: "Aplicação através de terceiros (fornecedores, clientes, etc.)." },
  { value: "aplicavel_condicionado", label: "Aplicável Condicionado", color: "bg-amber-100 text-amber-700 border-amber-300", description: "Aplicação dependente de condições específicas ou futuras." },
  { value: "nao_aplicavel", label: "Não Aplicável", color: "bg-red-100 text-red-700 border-red-300", description: "Este diploma não se aplica às atividades da organização." },
  { value: "informativo", label: "Informativo", color: "bg-purple-100 text-purple-700 border-purple-300", description: "Diploma para conhecimento, sem obrigações de conformidade." },
];

export function getLegislationApplicabilityInfo(value: string) {
  return applicabilityTypes.find(t => t.value === value) || applicabilityTypes[0];
}

export function LegislationApplicabilityBadge({ value }: { value?: string }) {
  const info = getLegislationApplicabilityInfo(value || "nao_avaliado");
  return (
    <Badge variant="outline" className={`${info.color}`}>
      {info.label}
    </Badge>
  );
}

export function LegislationApplicabilitySelect({
  legislationId,
  organizationId,
  currentValue = "nao_avaliado",
  onUpdate,
  readOnly = false,
}: LegislationApplicabilitySelectProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(currentValue);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleValueChange = async (newValue: string) => {
    if (!user || readOnly) return;

    setIsUpdating(true);
    setValue(newValue);

    try {
      // Check if organization_legislation record exists
      const { data: existing, error: fetchError } = await supabase
        .from("organization_legislation")
        .select("id")
        .eq("legislation_id", legislationId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from("organization_legislation")
          .update({ 
            applicability_type: newValue
          })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        // Create new record - assign legislation to organization with applicability
        const { error: insertError } = await supabase
          .from("organization_legislation")
          .insert({
            legislation_id: legislationId,
            organization_id: organizationId,
            applicability_type: newValue,
            assigned_by: user.id,
          });

        if (insertError) throw insertError;
      }

      toast({
        title: "Aplicabilidade atualizada",
        description: `Diploma classificado como "${getLegislationApplicabilityInfo(newValue).label}"`,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["legislation-applicability"] });
      queryClient.invalidateQueries({ queryKey: ["biblioteca-legislation"] });

      onUpdate?.(newValue);
    } catch (error) {
      console.error("Error updating legislation applicability:", error);
      setValue(currentValue); // Revert on error
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar a aplicabilidade do diploma",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (readOnly) {
    return <LegislationApplicabilityBadge value={value} />;
  }

  const selectedInfo = getLegislationApplicabilityInfo(value);

  return (
    <div className="relative">
      <Select value={value} onValueChange={handleValueChange} disabled={isUpdating}>
        <SelectTrigger className={`w-[200px] h-9 ${selectedInfo.color}`}>
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
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
