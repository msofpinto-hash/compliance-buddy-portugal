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
  accentColor?: string;
  isActive?: boolean;
}

const defaultGradients = [
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-amber-500 to-orange-600",
  "from-purple-500 to-pink-600",
];

export function ModuleCard({
  title,
  description,
  icon: Icon,
  href,
  image,
  count,
  countLabel,
  gradient,
  accentColor = "emerald",
  isActive = false,
}: ModuleCardProps) {
  return (
    <Link to={href} className="group block">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl h-44",
          "bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900",
          "border border-slate-200/80 dark:border-slate-700/50",
          "shadow-md hover:shadow-xl",
          "transition-all duration-300 transform hover:-translate-y-1",
          isActive && "ring-2 ring-primary ring-offset-2"
        )}
      >
        {/* Background Image with Overlay */}
        {image && (
          <div className="absolute inset-0">
            <img 
              src={image} 
              alt="" 
              className="w-full h-full object-cover opacity-20 dark:opacity-15 group-hover:opacity-30 dark:group-hover:opacity-25 transition-opacity duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/90 to-white/70 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-800/70" />
          </div>
        )}

        {/* Colored Top Bar */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-1.5",
          "bg-gradient-to-r",
          gradient || defaultGradients[0]
        )} />

        {/* Content */}
        <div className="relative h-full p-5 flex flex-col">
          {/* Header with icon and count */}
          <div className="flex items-start justify-between mb-auto">
            <div className={cn(
              "p-3 rounded-xl shadow-lg",
              "bg-gradient-to-br",
              gradient || defaultGradients[0],
              "group-hover:scale-110 transition-transform duration-300"
            )}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            
            {count !== undefined && count > 0 && (
              <Badge 
                className={cn(
                  "text-xs font-bold px-2.5 py-1 border-0 shadow-sm",
                  "bg-gradient-to-r",
                  gradient || defaultGradients[0],
                  "text-white"
                )}
              >
                {count} {countLabel || ""}
              </Badge>
            )}
          </div>
          
          {/* Title and Description */}
          <div className="mt-auto space-y-1">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white group-hover:text-primary transition-colors">
              {title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
              {description}
            </p>
          </div>
          
          {/* Hover Arrow */}
          <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
            <div className={cn(
              "p-1.5 rounded-full",
              "bg-gradient-to-r",
              gradient || defaultGradients[0]
            )}>
              <ChevronRight className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}