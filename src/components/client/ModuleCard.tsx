import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LucideIcon, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

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
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative overflow-hidden rounded-xl p-5",
          "bg-white/80 dark:bg-white/5 backdrop-blur-sm",
          "border border-slate-200 dark:border-slate-700/30",
          "hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/5",
          "transition-all duration-300",
          isActive && "ring-2 ring-emerald-500/50"
        )}
      >
        {/* Header with icon and count */}
        <div className="flex items-start justify-between mb-3">
          <div className={cn(
            "p-2 rounded-lg",
            "bg-emerald-50 dark:bg-emerald-500/10",
            "border border-emerald-100 dark:border-emerald-500/20"
          )}>
            <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          
          {count !== undefined && count > 0 && (
            <Badge 
              variant="secondary" 
              className="bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-0 text-xs font-medium"
            >
              {count} {countLabel || ""}
            </Badge>
          )}
        </div>
        
        {/* Content */}
        <div className="space-y-1">
          <h3 className="font-semibold text-slate-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
            {description}
          </p>
        </div>
        
        {/* Arrow indicator */}
        <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <ArrowRight className="h-4 w-4 text-emerald-500" />
        </div>
      </motion.div>
    </Link>
  );
}
