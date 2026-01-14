import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LucideIcon, ChevronRight } from "lucide-react";
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
  accentColor?: string;
  isActive?: boolean;
  index?: number;
}

export function ModuleCard({
  title,
  description,
  icon: Icon,
  href,
  image,
  count,
  countLabel,
  gradient = "from-emerald-500 to-teal-600",
  isActive = false,
  index = 0,
}: ModuleCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.1,
        ease: "easeOut"
      }}
      whileHover={{ 
        y: -8, 
        scale: 1.02,
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: 0.98 }}
    >
      <Link to={href} className="group block">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl h-48",
            "bg-white/90 dark:bg-slate-800/70",
            "border border-white/50 dark:border-slate-600/30",
            "shadow-lg hover:shadow-2xl",
            "backdrop-blur-sm",
            "transition-all duration-300",
            isActive && "ring-2 ring-primary ring-offset-2"
          )}
        >
          {/* Background Image with Overlay */}
          {image && (
            <div className="absolute inset-0">
              <img 
                src={image} 
                alt="" 
                className="w-full h-full object-cover opacity-30 dark:opacity-20 group-hover:opacity-40 dark:group-hover:opacity-30 group-hover:scale-110 transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-white/80 dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-800/80" />
            </div>
          )}

          {/* Colored Top Bar with glow */}
          <div className={cn(
            "absolute top-0 left-0 right-0 h-1.5",
            "bg-gradient-to-r",
            gradient
          )} />
          <div className={cn(
            "absolute top-0 left-0 right-0 h-8 opacity-30",
            "bg-gradient-to-b",
            gradient.replace("to-", "to-transparent from-")
          )} />

          {/* Content */}
          <div className="relative h-full p-5 flex flex-col">
            {/* Header with icon and count */}
            <div className="flex items-start justify-between mb-auto">
              <motion.div 
                className={cn(
                  "p-3 rounded-xl shadow-lg",
                  "bg-gradient-to-br",
                  gradient
                )}
                whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
                transition={{ duration: 0.4 }}
              >
                <Icon className="h-5 w-5 text-white drop-shadow-md" />
              </motion.div>
              
              {count !== undefined && count > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 + 0.3, type: "spring", stiffness: 500 }}
                >
                  <Badge 
                    className={cn(
                      "text-xs font-bold px-3 py-1.5 border-0 shadow-md",
                      "bg-gradient-to-r",
                      gradient,
                      "text-white"
                    )}
                  >
                    {count} {countLabel || ""}
                  </Badge>
                </motion.div>
              )}
            </div>
            
            {/* Title and Description */}
            <div className="mt-auto space-y-1.5">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-emerald-600 group-hover:to-teal-600 dark:group-hover:from-emerald-400 dark:group-hover:to-teal-400 transition-all duration-300">
                {title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                {description}
              </p>
            </div>
            
            {/* Hover Arrow */}
            <motion.div 
              className="absolute bottom-5 right-5"
              initial={{ opacity: 0, x: -10 }}
              whileHover={{ opacity: 1, x: 0 }}
            >
              <div className={cn(
                "p-2 rounded-full shadow-lg",
                "bg-gradient-to-r",
                gradient
              )}>
                <ChevronRight className="h-4 w-4 text-white" />
              </div>
            </motion.div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}