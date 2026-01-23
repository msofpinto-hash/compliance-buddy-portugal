import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LucideIcon, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface TechModuleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  image?: string;
  count?: number;
  countLabel?: string;
  glowColor?: "emerald" | "amber" | "terracotta" | "stone" | "rose";
  isActive?: boolean;
  index?: number;
}

const GLOW_CONFIGS = {
  emerald: {
    border: "border-emerald-200/60 dark:border-emerald-700/40 hover:border-emerald-400/80 dark:hover:border-emerald-600/60",
    shadow: "shadow-[0_4px_20px_hsl(152_60%_40%/0.1)] hover:shadow-[0_8px_30px_hsl(152_60%_40%/0.2)]",
    gradient: "from-emerald-500 to-teal-600",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300/50 dark:border-emerald-700/50",
  },
  amber: {
    border: "border-amber-200/60 dark:border-amber-700/40 hover:border-amber-400/80 dark:hover:border-amber-600/60",
    shadow: "shadow-[0_4px_20px_hsl(38_80%_50%/0.1)] hover:shadow-[0_8px_30px_hsl(38_80%_50%/0.2)]",
    gradient: "from-amber-400 to-orange-500",
    text: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300/50 dark:border-amber-700/50",
  },
  terracotta: {
    border: "border-orange-200/60 dark:border-orange-800/40 hover:border-orange-400/80 dark:hover:border-orange-700/60",
    shadow: "shadow-[0_4px_20px_hsl(15_50%_50%/0.1)] hover:shadow-[0_8px_30px_hsl(15_50%_50%/0.2)]",
    gradient: "from-orange-400 to-red-500",
    text: "text-orange-600 dark:text-orange-400",
    badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-300/50 dark:border-orange-700/50",
  },
  stone: {
    border: "border-stone-200/60 dark:border-stone-700/40 hover:border-stone-400/80 dark:hover:border-stone-600/60",
    shadow: "shadow-[0_4px_20px_hsl(30_10%_40%/0.1)] hover:shadow-[0_8px_30px_hsl(30_10%_40%/0.15)]",
    gradient: "from-stone-400 to-stone-600",
    text: "text-stone-600 dark:text-stone-400",
    badge: "bg-stone-100 dark:bg-stone-800/60 text-stone-600 dark:text-stone-300 border-stone-300/50 dark:border-stone-700/50",
  },
  rose: {
    border: "border-rose-200/60 dark:border-rose-800/40 hover:border-rose-400/80 dark:hover:border-rose-700/60",
    shadow: "shadow-[0_4px_20px_hsl(350_80%_55%/0.1)] hover:shadow-[0_8px_30px_hsl(350_80%_55%/0.15)]",
    gradient: "from-rose-400 to-pink-500",
    text: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 border-rose-300/50 dark:border-rose-700/50",
  },
};

export function TechModuleCard({
  title,
  description,
  icon: Icon,
  href,
  image,
  count,
  countLabel,
  glowColor = "emerald",
  isActive = false,
  index = 0,
}: TechModuleCardProps) {
  const config = GLOW_CONFIGS[glowColor];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.5, 
        delay: index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{ 
        y: -6, 
        scale: 1.02,
        transition: { duration: 0.25 }
      }}
      whileTap={{ scale: 0.98 }}
    >
      <Link to={href} className="group block">
        <div
          className={cn(
            "relative overflow-hidden rounded-xl min-h-[220px] border",
            "bg-white/80 dark:bg-stone-900/70 backdrop-blur-xl",
            "transition-all duration-500",
            config.border,
            config.shadow,
            isActive && "ring-2 ring-emerald-400"
          )}
        >
          {/* Subtle gradient overlay on hover */}
          <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <div className={cn(
              "absolute inset-[-1px] rounded-xl bg-gradient-to-br opacity-10",
              config.gradient
            )} />
          </div>

          {/* Background Image with warm overlay */}
          {image && (
            <div className="absolute inset-0">
              <img 
                src={image} 
                alt="" 
                className="w-full h-full object-cover opacity-8 group-hover:opacity-15 group-hover:scale-105 transition-all duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-stone-900 via-white/98 dark:via-stone-900/98 to-white/90 dark:to-stone-900/90" />
            </div>
          )}

          {/* Content */}
          <div className="relative h-full p-5 flex flex-col">
            {/* Header with icon and count */}
            <div className="flex items-start justify-between mb-4">
              <motion.div 
                className={cn(
                  "relative p-3 rounded-xl",
                  "bg-gradient-to-br",
                  config.gradient,
                  "shadow-lg"
                )}
                whileHover={{ rotate: [0, -3, 3, 0], scale: 1.05 }}
                transition={{ duration: 0.4 }}
              >
                <Icon className="h-6 w-6 text-white" />
              </motion.div>
              
              {count !== undefined && count > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 + 0.3, type: "spring", stiffness: 400 }}
                >
                  <Badge 
                    className={cn(
                      "text-xs font-medium px-3 py-1.5 border backdrop-blur-sm",
                      config.badge
                    )}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {count} {countLabel || ""}
                  </Badge>
                </motion.div>
              )}
            </div>
            
            {/* Title and Description */}
            <div className="mt-auto space-y-2">
              <h3 className={cn(
                "font-bold text-xl text-stone-800 dark:text-stone-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors duration-300"
              )}>
                {title}
              </h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed group-hover:text-stone-600 dark:group-hover:text-stone-300 transition-colors duration-300">
                {description}
              </p>
            </div>
            
            {/* Hover Arrow */}
            <motion.div 
              className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              initial={{ x: -10 }}
              whileHover={{ x: 0 }}
            >
              <motion.div 
                className={cn(
                  "p-2 rounded-lg border backdrop-blur-sm bg-white/80 dark:bg-stone-800/80",
                  config.border,
                )}
                animate={{ x: [0, 4, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              >
                <ChevronRight className={cn("h-4 w-4", config.text)} />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}