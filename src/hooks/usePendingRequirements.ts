import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const EXCLUDED_TYPES = new Set(["informativo", "nao_aplicavel"]);

/**
 * Devolve, por diploma, o número de requisitos legais ainda por avaliar
 * (sem estado de conformidade) para a organização indicada.
 *
 * Só contam requisitos de diplomas classificados como aplicáveis para a
 * organização. Diplomas informativos / não aplicáveis (e requisitos marcados
 * como tal) não precisam de avaliação e não são contabilizados.
 */
export function usePendingRequirements(organizationId?: string) {
  return useQuery({
    queryKey: ["pending-requirements-by-legislation", organizationId],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!organizationId) return {} as Record<string, number>;

      // 1) Diplomas atribuídos à organização e classificados como aplicáveis
      const applicableLegIds: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("organization_legislation")
          .select("legislation_id, applicability_type")
          .eq("organization_id", organizationId)
          .range(from, from + 999);
        if (error) throw error;
        if (!data?.length) break;
        for (const row of data as any[]) {
          const type = row.applicability_type;
          if (type && !EXCLUDED_TYPES.has(type)) applicableLegIds.push(row.legislation_id);
        }
        if (data.length < 1000) break;
      }
      if (applicableLegIds.length === 0) return {} as Record<string, number>;

      // 2) Requisitos legais desses diplomas (em blocos, paginados)
      const requirements: { id: string; legislation_id: string }[] = [];
      for (let i = 0; i < applicableLegIds.length; i += 100) {
        const chunk = applicableLegIds.slice(i, i + 100);
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from("legal_requirements")
            .select("id, legislation_id")
            .in("legislation_id", chunk)
            .range(from, from + 999);
          if (error) throw error;
          if (!data?.length) break;
          requirements.push(...(data as any));
          if (data.length < 1000) break;
        }
      }

      // 3) Estado por requisito na organização
      const resolved = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("applicabilities")
          .select("requirement_id, compliance_status, applicability_type")
          .eq("organization_id", organizationId)
          .range(from, from + 999);
        if (error) throw error;
        if (!data?.length) break;
        for (const row of data as any[]) {
          // Já avaliado, ou dispensado de avaliação (informativo / não aplicável)
          if (row.compliance_status || EXCLUDED_TYPES.has(row.applicability_type)) {
            resolved.add(row.requirement_id);
          }
        }
        if (data.length < 1000) break;
      }

      const map: Record<string, number> = {};
      for (const req of requirements) {
        if (!resolved.has(req.id)) {
          map[req.legislation_id] = (map[req.legislation_id] || 0) + 1;
        }
      }
      return map;
    },
  });
}
