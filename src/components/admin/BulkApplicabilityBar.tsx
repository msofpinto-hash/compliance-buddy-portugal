import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const OPTIONS = [
  { value: "aplicavel_direto", label: "Aplicável Direto" },
  { value: "aplicavel_indireto", label: "Aplicável Indireto" },
  { value: "aplicavel_condicionado", label: "Aplicável Condicionado" },
  { value: "nao_aplicavel", label: "Não Aplicável" },
  { value: "informativo", label: "Informativo" },
  { value: "nao_avaliado", label: "Não Avaliado" },
];

interface Props {
  organizationId: string;
  legislationIds: string[];
  scopeLabel: string;
}

export function BulkApplicabilityBar({
  organizationId,
  legislationIds,
  scopeLabel,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string>("aplicavel_direto");
  const [saving, setSaving] = useState(false);

  const apply = async () => {
    if (!user || legislationIds.length === 0) return;
    setSaving(true);
    try {
      const chunk = 200;
      for (let i = 0; i < legislationIds.length; i += chunk) {
        const slice = legislationIds.slice(i, i + chunk);

        const { data: existing, error: fetchError } = await supabase
          .from("organization_legislation")
          .select("id, legislation_id")
          .eq("organization_id", organizationId)
          .in("legislation_id", slice);
        if (fetchError) throw fetchError;

        const existingIds = new Set((existing || []).map((r) => r.legislation_id));

        if (existing && existing.length > 0) {
          const { error: updateError } = await supabase
            .from("organization_legislation")
            .update({ applicability_type: value })
            .in(
              "id",
              existing.map((r) => r.id),
            );
          if (updateError) throw updateError;
        }

        const toInsert = slice
          .filter((id) => !existingIds.has(id))
          .map((id) => ({
            legislation_id: id,
            organization_id: organizationId,
            applicability_type: value,
            assigned_by: user.id,
          }));
        if (toInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("organization_legislation")
            .insert(toInsert);
          if (insertError) throw insertError;
        }
      }

      toast({
        title: "Aplicabilidade aplicada",
        description: `${legislationIds.length} diploma(s) de "${scopeLabel}" classificados.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["legislation-applicability"] }),
        queryClient.invalidateQueries({ queryKey: ["biblioteca-legislation"] }),
        queryClient.invalidateQueries({ queryKey: ["requirement-applicabilities"] }),
        queryClient.invalidateQueries({ queryKey: ["applicabilities"] }),
        queryClient.invalidateQueries({ queryKey: ["req-list"] }),
        queryClient.invalidateQueries({ queryKey: ["requisitos-tema"] }),
        queryClient.invalidateQueries({ queryKey: ["conformidade"] }),
      ]);
    } catch (e: any) {
      toast({
        title: "Erro ao aplicar",
        description: e?.message || "Não foi possível aplicar a classificação.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
      <span className="flex items-center gap-1.5 text-xs font-medium">
        <Layers className="h-4 w-4 text-primary" />
        Classificar todos ({legislationIds.length}) em «{scopeLabel}»
      </span>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="h-8 w-[200px] bg-background text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" className="h-8" onClick={apply} disabled={saving || legislationIds.length === 0}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
      </Button>
    </div>
  );
}
