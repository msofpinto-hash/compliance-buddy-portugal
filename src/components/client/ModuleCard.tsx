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
        whileHover={{ y: -4, scale: 1.01 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-6",
          "bg-gradient-to-br from-slate-50 via-white to-slate-50",
          "dark:from-slate-800/90 dark:via-slate-800/70 dark:to-slate-900/90",
          "border border-slate-200/80 dark:border-slate-600/30",
          "shadow-sm hover:shadow-xl hover:shadow-emerald-500/10",
          "hover:border-emerald-400/60 dark:hover:border-emerald-500/40",
          "transition-all duration-300",
          isActive && "ring-2 ring-emerald-500/50"
        )}
      >
        {/* Subtle gradient accent in corner */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-bl from-emerald-400/20 via-teal-400/10 to-transparent rounded-full blur-2xl group-hover:from-emerald-400/30 transition-all duration-500" />
        
        {/* Header with icon and count */}
        <div className="relative flex items-start justify-between mb-4">
          <div className={cn(
            "p-3 rounded-xl",
            "bg-gradient-to-br from-emerald-500 to-teal-600",
            "shadow-lg shadow-emerald-500/25"
          )}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          
          {count !== undefined && count > 0 && (
            <Badge 
              variant="secondary" 
              className="bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-500/20 text-xs font-semibold px-2.5"
            >
              {count} {countLabel || ""}
            </Badge>
          )}
        </div>
        
        {/* Content */}
        <div className="relative space-y-2">
          <h3 className="font-bold text-lg text-slate-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {description}
          </p>
        </div>
        
        {/* Arrow indicator */}
        <div className="absolute bottom-6 right-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Aceder</span>
          <ArrowRight className="h-4 w-4 text-emerald-500" />
        </div>
      </motion.div>
    </Link>
  );
}
