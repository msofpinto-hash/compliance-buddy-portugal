import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Devolve, por diploma, o número de requisitos legais ainda por avaliar
 * (sem estado de conformidade definido) para a organização indicada.
 */
export function usePendingRequirements(organizationId?: string) {
  return useQuery({
    queryKey: ["pending-requirements-by-legislation", organizationId],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!organizationId) return {} as Record<string, number>;

      // 1) Todos os requisitos legais (paginados para ultrapassar o limite de 1000)
      const requirements: { id: string; legislation_id: string }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("legal_requirements")
          .select("id, legislation_id")
          .range(from, from + 999);
        if (error) throw error;
        if (!data?.length) break;
        requirements.push(...(data as any));
        if (data.length < 1000) break;
      }

      // 2) Avaliações existentes da organização
      const evaluated = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("applicabilities")
          .select("requirement_id, compliance_status")
          .eq("organization_id", organizationId)
          .range(from, from + 999);
        if (error) throw error;
        if (!data?.length) break;
        for (const row of data as any[]) {
          if (row.compliance_status) evaluated.add(row.requirement_id);
        }
        if (data.length < 1000) break;
      }

      const map: Record<string, number> = {};
      for (const req of requirements) {
        if (!evaluated.has(req.id)) {
          map[req.legislation_id] = (map[req.legislation_id] || 0) + 1;
        }
      }
      return map;
    },
  });
}
