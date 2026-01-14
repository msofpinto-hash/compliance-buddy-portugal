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
  // Map gradient to shadow color
  const getShadowColor = () => {
    if (gradient.includes("emerald")) return "hover:shadow-emerald-500/30 dark:hover:shadow-emerald-400/20";
    if (gradient.includes("blue")) return "hover:shadow-blue-500/30 dark:hover:shadow-blue-400/20";
    if (gradient.includes("amber")) return "hover:shadow-amber-500/30 dark:hover:shadow-amber-400/20";
    if (gradient.includes("purple")) return "hover:shadow-purple-500/30 dark:hover:shadow-purple-400/20";
    if (gradient.includes("rose")) return "hover:shadow-rose-500/30 dark:hover:shadow-rose-400/20";
    return "hover:shadow-emerald-500/30 dark:hover:shadow-emerald-400/20";
  };

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
        y: -12, 
        scale: 1.03,
        transition: { duration: 0.25, ease: "easeOut" }
      }}
      whileTap={{ scale: 0.98 }}
    >
      <Link to={href} className="group block">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl min-h-[200px]",
            "bg-gradient-to-br from-white via-slate-50 to-emerald-50/50",
            "dark:from-slate-700 dark:via-slate-600 dark:to-emerald-900/30",
            "border border-emerald-100/50 dark:border-slate-500/30",
            "shadow-lg hover:shadow-2xl",
            getShadowColor(),
            "backdrop-blur-sm",
            "transition-all duration-500",
            isActive && "ring-2 ring-primary ring-offset-2"
          )}
        >
          {/* Shine Effect on Hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
          </div>

          {/* Glow Effect */}
          <div className={cn(
            "absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-60 blur-xl transition-opacity duration-500 -z-10",
            "bg-gradient-to-r",
            gradient
          )} />

          {/* Background Image with Overlay */}
          {image && (
            <div className="absolute inset-0">
              <img 
                src={image} 
                alt="" 
                className="w-full h-full object-cover opacity-25 dark:opacity-15 group-hover:opacity-35 dark:group-hover:opacity-25 group-hover:scale-110 transition-all duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/90 to-white/70 dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-700/70" />
            </div>
          )}

          {/* Colored Top Bar with enhanced glow */}
          <div className={cn(
            "absolute top-0 left-0 right-0 h-1.5 group-hover:h-2 transition-all duration-300",
            "bg-gradient-to-r",
            gradient
          )} />
          <div className={cn(
            "absolute top-0 left-0 right-0 h-12 opacity-20 group-hover:opacity-40 transition-opacity duration-300",
            "bg-gradient-to-b",
            gradient.replace("to-", "to-transparent from-")
          )} />

          {/* Content */}
          <div className="relative h-full p-5 flex flex-col">
            {/* Header with icon and count */}
            <div className="flex items-start justify-between mb-auto">
              <motion.div 
                className={cn(
                  "p-3 rounded-xl shadow-lg group-hover:shadow-xl transition-shadow duration-300",
                  "bg-gradient-to-br",
                  gradient
                )}
                whileHover={{ rotate: [0, -10, 10, 0], scale: 1.15 }}
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
                      "text-xs font-bold px-3 py-1.5 border-0 shadow-md group-hover:shadow-lg transition-shadow duration-300",
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
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors duration-300">
                {description}
              </p>
            </div>
            
            {/* Hover Arrow with animation */}
            <motion.div 
              className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              initial={{ x: -10, opacity: 0 }}
              whileHover={{ x: 0, opacity: 1 }}
            >
              <motion.div 
                className={cn(
                  "p-2 rounded-full shadow-lg",
                  "bg-gradient-to-r",
                  gradient
                )}
                animate={{ x: [0, 4, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              >
                <ChevronRight className="h-4 w-4 text-white" />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}