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
    <div className="mt-3 pt-3 border-t">
      <p className="text-xs font-medium text-muted-foreground mb-2">Datas</p>
      <div className="relative flex items-center">
        {/* Timeline line */}
        <div className="absolute left-0 right-0 h-[2px] bg-border top-[10px]" />
        
        {/* Timeline points */}
        <div className="relative flex justify-between w-full">
          {/* Publicação */}
          <div className="flex flex-col items-center z-10">
            <span className="text-[10px] text-muted-foreground mb-1">Publicação</span>
            <div 
              className={`w-4 h-4 rounded-full border-2 ${
                publicationDate 
                  ? 'bg-foreground border-foreground' 
                  : 'bg-background border-muted-foreground'
              }`}
            />
            <span className="text-[10px] font-medium mt-1">
              {formatDate(publicationDate) || "—"}
            </span>
          </div>

          {/* Em vigor */}
          <div className="flex flex-col items-center z-10">
            <span className="text-[10px] text-muted-foreground mb-1">Em vigor</span>
            <div 
              className={`w-4 h-4 rounded-full border-2 ${
                effectiveDate 
                  ? 'bg-foreground border-foreground' 
                  : 'bg-background border-muted-foreground'
              }`}
            />
            <span className="text-[10px] font-medium mt-1">
              {formatDate(effectiveDate) || "—"}
            </span>
          </div>

          {/* Revogado em */}
          <div className="flex flex-col items-center z-10">
            <span className="text-[10px] text-muted-foreground mb-1">Revogado em</span>
            <div 
              className={`w-4 h-4 rounded-full border-2 ${
                revocationDate 
                  ? 'bg-destructive border-destructive' 
                  : 'bg-background border-muted-foreground'
              }`}
            />
            <span className={`text-[10px] font-medium mt-1 ${revocationDate ? 'text-destructive' : ''}`}>
              {formatDate(revocationDate) || "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
