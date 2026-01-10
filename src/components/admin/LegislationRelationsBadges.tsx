import { Badge } from "@/components/ui/badge";
import type { LegislationRelation } from "@/hooks/useLegislation";

interface LegislationRelationsBadgesProps {
  relations: LegislationRelation[];
}

const RELATION_STYLES: Record<string, { label: string; className: string }> = {
  revogado: { label: "Revogado", className: "bg-gray-800 text-white hover:bg-gray-700" },
  revogacao_parcial: { label: "Rev. Parcial", className: "bg-gray-500 text-white hover:bg-gray-400" },
  alteracao: { label: "Alteração", className: "bg-white border-2 border-gray-400 text-gray-700 hover:bg-gray-50" },
  transposicao: { label: "Transposição", className: "bg-blue-600 text-white hover:bg-blue-500" },
  regulamentacao: { label: "Regulamentação", className: "bg-purple-600 text-white hover:bg-purple-500" },
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
