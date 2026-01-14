import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LucideIcon, ChevronRight } from "lucide-react";

interface ModuleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  image?: string;
  count?: number;
  countLabel?: string;
  gradient?: string;
  isActive?: boolean;
}

export function ModuleCard({
  title,
  description,
  icon: Icon,
  href,
  count,
  countLabel,
  isActive = false,
}: ModuleCardProps) {
  return (
    <Link to={href} className="group block">
      <div
        className={cn(
          "relative overflow-hidden rounded-lg p-5",
          "bg-white dark:bg-slate-800/80",
          "border border-slate-200 dark:border-slate-600/50",
          "shadow-sm hover:shadow-lg",
          "hover:border-primary/50 dark:hover:border-primary/50",
          "hover:bg-slate-50 dark:hover:bg-slate-700/80",
          "transition-all duration-200",
          isActive && "border-primary ring-1 ring-primary/20"
        )}
      >
        {/* Header with icon and count */}
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "p-2.5 rounded-lg",
            "bg-primary/10 dark:bg-primary/20",
            "border border-primary/20 dark:border-primary/30"
          )}>
            <Icon className="h-5 w-5 text-primary" />
          </div>
          
          {count !== undefined && count > 0 && (
            <Badge 
              variant="outline" 
              className="bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-500 text-xs font-medium"
            >
              {count} {countLabel || ""}
            </Badge>
          )}
        </div>
        
        {/* Content */}
        <div className="space-y-1.5">
          <h3 className="font-semibold text-base text-slate-900 dark:text-white group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-300 line-clamp-2 leading-relaxed">
            {description}
          </p>
        </div>
        
        {/* Arrow indicator */}
        <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <ChevronRight className="h-5 w-5 text-primary" />
        </div>
      </div>
    </Link>
  );
}
