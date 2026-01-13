import { Badge } from "@/components/ui/badge";
import type { LegislationRelation } from "@/hooks/useLegislation";

interface LegislationRelationsBadgesProps {
  relations: LegislationRelation[];
}

const RELATION_STYLES: Record<string, { label: string; className: string }> = {
  // Direct relations
  revogado: { label: "Revoga", className: "bg-gray-800 text-white hover:bg-gray-700" },
  revogacao_parcial: { label: "Rev. Parcial", className: "bg-gray-500 text-white hover:bg-gray-400" },
  alteracao: { label: "Altera", className: "bg-amber-600 text-white hover:bg-amber-500" },
  transposicao: { label: "Transpõe", className: "bg-blue-600 text-white hover:bg-blue-500" },
  regulamentacao: { label: "Regulamenta", className: "bg-purple-600 text-white hover:bg-purple-500" },
  // Inverse relations
  revogado_por: { label: "Revogado por", className: "bg-red-700 text-white hover:bg-red-600" },
  revogado_parcialmente_por: { label: "Rev. Parc. por", className: "bg-red-500 text-white hover:bg-red-400" },
  alterado_por: { label: "Alterado por", className: "bg-orange-500 text-white hover:bg-orange-400" },
  transposto_por: { label: "Transposto por", className: "bg-cyan-600 text-white hover:bg-cyan-500" },
  regulamentado_por: { label: "Regulam. por", className: "bg-violet-600 text-white hover:bg-violet-500" },
};

export function LegislationRelationsBadges({ relations }: LegislationRelationsBadgesProps) {
  if (!relations || relations.length === 0) return null;

  // Group relations by type
  const groupedRelations = relations.reduce((acc, rel) => {
    if (!acc[rel.relation_type]) {
      acc[rel.relation_type] = [];
    }
    acc[rel.relation_type].push(rel);
    return acc;
  }, {} as Record<string, LegislationRelation[]>);

  return (
    <div className="mt-2 pt-2 border-t border-dashed">
      <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Relações</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(groupedRelations).map(([type, rels]) => {
          const style = RELATION_STYLES[type] || { label: type, className: "" };
          return rels.map((rel) => (
            <Badge
              key={rel.id}
              className={`text-[10px] cursor-default ${style.className}`}
              title={`${style.label}: ${rel.target_title}`}
            >
              <span className="opacity-70 mr-1">{style.label}:</span>
              <span className="font-mono">{rel.target_number}</span>
            </Badge>
          ));
        })}
      </div>
    </div>
  );
}
