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
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "relative overflow-hidden rounded-xl p-5",
          "bg-slate-800/40 backdrop-blur-sm",
          "border border-slate-700/50",
          "hover:border-emerald-500/30 hover:bg-slate-800/60",
          "transition-colors duration-300",
          isActive && "ring-2 ring-emerald-500/50"
        )}
      >
        {/* Header with icon and count */}
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "p-2.5 rounded-lg",
            "bg-gradient-to-br from-emerald-500/20 to-teal-500/10",
            "border border-emerald-500/20"
          )}>
            <Icon className="h-5 w-5 text-emerald-400" />
          </div>
          
          {count !== undefined && count > 0 && (
            <Badge 
              variant="secondary" 
              className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs"
            >
              {count} {countLabel || ""}
            </Badge>
          )}
        </div>
        
        {/* Content */}
        <div className="space-y-1.5">
          <h3 className="font-medium text-white group-hover:text-emerald-400 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-slate-400 line-clamp-2">
            {description}
          </p>
        </div>
        
        {/* Arrow indicator */}
        <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <ArrowRight className="h-4 w-4 text-emerald-400" />
        </div>
      </motion.div>
    </Link>
  );
}
