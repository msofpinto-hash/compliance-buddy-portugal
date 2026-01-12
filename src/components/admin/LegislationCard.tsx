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
  ChevronDown,
  ChevronUp,
  AlertCircle
} from "lucide-react";
import { Link } from "react-router-dom";
import { LegislationTimeline } from "./LegislationTimeline";
import { LegislationRelationsBadges } from "./LegislationRelationsBadges";
import { type LegislationWithCategories } from "@/hooks/useLegislation";
import { useState } from "react";
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
  compact?: boolean;
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
  compact = false
}: LegislationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasCategories = leg.categories.length > 0;

  // Format category paths - show only the leaf name in compact mode
  const formatCategoryForCompact = (fullPath: string) => {
    const parts = fullPath.split(" → ");
    return parts[parts.length - 1]; // Return only the last part (leaf)
  };

  // Get theme from first category
  const primaryTheme = leg.categories[0]?.theme_name;

  return (
    <div
      className={cn(
        "group rounded-lg border transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary bg-primary/5",
        !hasCategories && "border-amber-300/50 bg-amber-50/30",
        hasProblems && "border-red-300/50"
      )}
    >
      {/* Main Row - Always Visible */}
      <div className="flex items-center gap-3 p-3">
        {/* Checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(leg.id)}
          className="shrink-0"
        />

        {/* Origin Badge */}
        <Badge 
          variant="outline"
          className={cn(
            "shrink-0 text-xs px-1.5 py-0.5",
            leg.origin === 'PT' 
              ? 'bg-green-500/10 text-green-700 border-green-300' 
              : leg.origin === 'EU'
                ? 'bg-blue-500/10 text-blue-700 border-blue-300'
                : 'bg-amber-500/10 text-amber-700 border-amber-300'
          )}
        >
          {leg.origin === 'PT' ? (
            <><Flag className="h-3 w-3 mr-0.5" />PT</>
          ) : leg.origin === 'EU' ? (
            <><Globe className="h-3 w-3 mr-0.5" />EU</>
          ) : (
            '?'
          )}
        </Badge>

        {/* Number */}
        <Link 
          to={`/legislacao/${leg.id}`} 
          className="font-mono text-sm text-muted-foreground hover:text-primary shrink-0 min-w-[140px]"
        >
          {leg.number}
        </Link>

        {/* Title/Summary - truncated */}
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">
            {leg.summary || leg.title}
          </p>
        </div>

        {/* Theme Badge (if any) */}
        {primaryTheme && (
          <Badge variant="secondary" className="shrink-0 text-xs hidden lg:flex">
            {primaryTheme}
          </Badge>
        )}

        {/* Quick Category Count */}
        <div className="flex items-center gap-1 shrink-0">
          {hasCategories ? (
            <Badge 
              variant="outline" 
              className="text-xs bg-green-50 text-green-700 border-green-200"
            >
              {leg.categories.length} cat.
            </Badge>
          ) : (
            <Badge 
              variant="outline" 
              className="text-xs bg-amber-50 text-amber-700 border-amber-200"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              Sem cat.
            </Badge>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant={!hasCategories ? "default" : "ghost"}
            size="sm"
            onClick={() => onOpenCategories(leg)}
            className={cn(
              "h-8 gap-1",
              !hasCategories && "bg-amber-600 hover:bg-amber-700"
            )}
            title="Gerir categorias"
          >
            <Tags className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Categorias</span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Recolher" : "Expandir"}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3 bg-muted/20">
          {/* Categories Full Path */}
          {hasCategories && (
            <div className="flex flex-wrap gap-1">
              {leg.categories.map((cat) => (
                <Badge 
                  key={cat.id} 
                  variant="outline" 
                  className="text-xs bg-background"
                  title={cat.full_path}
                >
                  {cat.full_path}
                </Badge>
              ))}
            </div>
          )}

          {/* Entity */}
          {leg.entity && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />
              {leg.entity}
            </div>
          )}

          {/* Timeline */}
          <LegislationTimeline
            publicationDate={leg.publication_date}
            effectiveDate={leg.effective_date}
            revocationDate={(leg as any).revocation_date}
          />

          {/* Relations */}
          <LegislationRelationsBadges relations={leg.relations} />

          {/* All Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              variant={hasProblems ? "default" : "outline"}
              size="sm"
              onClick={() => onOpenEdit(leg)}
              className={cn(
                "h-7 text-xs gap-1",
                hasProblems && "bg-red-600 hover:bg-red-700"
              )}
            >
              <Pencil className="h-3 w-3" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenDates(leg)}
              className="h-7 text-xs gap-1"
            >
              <CalendarDays className="h-3 w-3" />
              Datas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenCategories(leg)}
              className="h-7 text-xs gap-1"
            >
              <Tags className="h-3 w-3" />
              Categorias
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenRequirements(leg)}
              className="h-7 text-xs gap-1"
            >
              <FileEdit className="h-3 w-3" />
              Requisitos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenRelations(leg)}
              className="h-7 text-xs gap-1"
            >
              <Link2 className="h-3 w-3" />
              Relações
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              asChild
            >
              <Link to={`/legislacao/${leg.id}`}>
                <Eye className="h-3 w-3" />
                Ver
              </Link>
            </Button>
            {leg.document_url && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                asChild
              >
                <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  Abrir
                </a>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
