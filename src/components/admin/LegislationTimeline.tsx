import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface LegislationTimelineProps {
  publicationDate?: string | null;
  effectiveDate?: string | null;
  revocationDate?: string | null;
}

export function LegislationTimeline({
  publicationDate,
  effectiveDate,
  revocationDate,
}: LegislationTimelineProps) {
  const formatDate = (date: string | null | undefined) => {
    if (!date) return null;
    return format(new Date(date), "dd-MM-yyyy", { locale: pt });
  };

  const hasAnyDate = publicationDate || effectiveDate || revocationDate;

  if (!hasAnyDate) return null;

  return (
    <div className="flex items-center gap-6 text-xs pt-2">
      {/* Publicação */}
      <div className="flex items-center gap-1.5">
        <div 
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            publicationDate 
              ? 'bg-foreground' 
              : 'bg-muted-foreground/30'
          }`}
        />
        <span className="text-muted-foreground">Publicação:</span>
        <span className="font-medium">
          {formatDate(publicationDate) || "—"}
        </span>
      </div>

      {/* Separator */}
      <div className="w-8 h-[1px] bg-border" />

      {/* Em vigor */}
      <div className="flex items-center gap-1.5">
        <div 
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            effectiveDate 
              ? 'bg-foreground' 
              : 'bg-muted-foreground/30'
          }`}
        />
        <span className="text-muted-foreground">Em vigor:</span>
        <span className="font-medium">
          {formatDate(effectiveDate) || "—"}
        </span>
      </div>

      {/* Separator */}
      <div className="w-8 h-[1px] bg-border" />

      {/* Revogado em */}
      <div className="flex items-center gap-1.5">
        <div 
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            revocationDate 
              ? 'bg-destructive' 
              : 'bg-muted-foreground/30'
          }`}
        />
        <span className="text-muted-foreground">Revogado:</span>
        <span className={`font-medium ${revocationDate ? 'text-destructive' : ''}`}>
          {formatDate(revocationDate) || "—"}
        </span>
      </div>
    </div>
  );
}
