import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ExternalLink, 
  FileEdit, 
  CalendarDays, 
  Tags, 
  Link2, 
  Eye, 
  Flag, 
  Globe, 
  Building2,
  Pencil,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { Link } from "react-router-dom";
import { LegislationTimeline } from "./LegislationTimeline";
import { LegislationRelationsBadges } from "./LegislationRelationsBadges";
import { type LegislationWithCategories } from "@/hooks/useLegislation";
import { cn } from "@/lib/utils";

interface LegislationCardProps {
  leg: LegislationWithCategories;
  isSelected: boolean;
  hasProblems: boolean;
  onToggleSelect: (id: string) => void;
  onOpenCategories: (leg: LegislationWithCategories) => void;
  onOpenRequirements: (leg: LegislationWithCategories) => void;
  onOpenDates: (leg: LegislationWithCategories) => void;
  onOpenRelations: (leg: LegislationWithCategories) => void;
  onOpenEdit: (leg: LegislationWithCategories) => void;
  onOpenAISuggestions: (leg: LegislationWithCategories) => void;
}

export function LegislationCard({
  leg,
  isSelected,
  hasProblems,
  onToggleSelect,
  onOpenCategories,
  onOpenRequirements,
  onOpenDates,
  onOpenRelations,
  onOpenEdit,
  onOpenAISuggestions,
}: LegislationCardProps) {
  const hasCategories = leg.categories.length > 0;
  const isRevoked = !!leg.revocation_date;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary bg-primary/5",
        !hasCategories && "border-amber-300 bg-amber-50/50",
        hasProblems && hasCategories && "border-red-300/50",
        isRevoked && "bg-gray-100/80 border-gray-300"
      )}
    >
      <div className="flex gap-4">
        {/* Left: Checkbox */}
        <div className="pt-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(leg.id)}
          />
        </div>

        {/* Middle: Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Header Row: Origin + Number + Entity */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant="outline"
              className={cn(
                "text-xs",
                leg.origin === 'PT' 
                  ? 'bg-green-500/10 text-green-700 border-green-300' 
                  : leg.origin === 'EU'
                    ? 'bg-blue-500/10 text-blue-700 border-blue-300'
                    : 'bg-amber-500/10 text-amber-700 border-amber-300'
              )}
            >
              {leg.origin === 'PT' ? (
                <><Flag className="h-3 w-3 mr-1" />DRE</>
              ) : leg.origin === 'EU' ? (
                <><Globe className="h-3 w-3 mr-1" />EUR-Lex</>
              ) : (
                'Sem Origem'
              )}
            </Badge>
            <Link 
              to={`/legislacao/${leg.id}`} 
              className={cn(
                "font-mono text-sm font-medium hover:text-primary hover:underline",
                isRevoked ? "text-muted-foreground line-through" : "text-foreground"
              )}
            >
              {leg.number}
            </Link>
            {isRevoked && (
              <Badge variant="outline" className="text-xs bg-gray-800 text-white border-gray-700">
                Revogado {leg.revocation_date && `em ${new Date(leg.revocation_date).toLocaleDateString('pt-PT')}`}
              </Badge>
            )}
            {leg.entity && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {leg.entity}
              </span>
            )}
          </div>

          {/* Title (if different from number) */}
          {leg.title !== leg.number && !leg.title.startsWith(leg.number) && (
            <p className={cn(
              "font-medium text-sm",
              isRevoked && "line-through text-muted-foreground"
            )}>
              {leg.title}
            </p>
          )}
          
          {/* Summary - full text */}
          {leg.summary && (
            <p className="text-sm text-muted-foreground">
              {leg.summary}
            </p>
          )}

          {/* Categories */}
          <div className="flex flex-wrap gap-1">
            {hasCategories ? (
              leg.categories.map((cat) => (
                <Badge 
                  key={cat.id} 
                  variant="secondary" 
                  className="text-xs"
                >
                  {cat.full_path}
                </Badge>
              ))
            ) : (
              <Badge 
                variant="outline" 
                className="text-xs bg-amber-100 text-amber-800 border-amber-300"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                Sem categoria atribuída
              </Badge>
            )}
          </div>

          {/* Timeline */}
          <LegislationTimeline
            publicationDate={leg.publication_date}
            effectiveDate={leg.effective_date}
            revocationDate={(leg as any).revocation_date}
          />

          {/* Relations */}
          {leg.relations && leg.relations.length > 0 && (
            <LegislationRelationsBadges relations={leg.relations} />
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <Button
            variant={!hasCategories ? "default" : "outline"}
            size="sm"
            onClick={() => onOpenCategories(leg)}
            className={cn(
              "h-8 gap-1.5 justify-start",
              !hasCategories && "bg-amber-600 hover:bg-amber-700"
            )}
          >
            <Tags className="h-4 w-4" />
            Categorias
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenAISuggestions(leg)}
            className="h-8 gap-1.5 justify-start text-amber-600 border-amber-300 hover:bg-amber-50"
          >
            <Sparkles className="h-4 w-4" />
            Sugerir (IA)
          </Button>
          <Button
            variant={hasProblems ? "default" : "outline"}
            size="sm"
            onClick={() => onOpenEdit(leg)}
            className={cn(
              "h-8 gap-1.5 justify-start",
              hasProblems && "bg-red-600 hover:bg-red-700"
            )}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenDates(leg)}
            className="h-8 gap-1.5 justify-start"
          >
            <CalendarDays className="h-4 w-4" />
            Datas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenRequirements(leg)}
            className="h-8 gap-1.5 justify-start"
          >
            <FileEdit className="h-4 w-4" />
            Requisitos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenRelations(leg)}
            className="h-8 gap-1.5 justify-start"
          >
            <Link2 className="h-4 w-4" />
            Relações
          </Button>
          <div className="flex gap-1 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              asChild
              title="Ver detalhes"
            >
              <Link to={`/legislacao/${leg.id}`}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
            {leg.document_url && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                asChild
                title="Abrir documento"
              >
                <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
