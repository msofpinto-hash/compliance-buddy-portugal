import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LucideIcon, ChevronRight, Zap } from "lucide-react";
import { motion } from "framer-motion";

interface TechModuleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  image?: string;
  count?: number;
  countLabel?: string;
  glowColor?: "cyan" | "violet" | "amber" | "emerald" | "rose";
  isActive?: boolean;
  index?: number;
}

const GLOW_CONFIGS = {
  cyan: {
    border: "border-cyan-500/30 hover:border-cyan-400/60",
    shadow: "shadow-[0_0_30px_hsl(190_100%_50%/0.2)] hover:shadow-[0_0_50px_hsl(190_100%_50%/0.35)]",
    gradient: "from-cyan-500 to-blue-600",
    text: "text-cyan-400",
    glow: "bg-cyan-500/20",
  },
  violet: {
    border: "border-violet-500/30 hover:border-violet-400/60",
    shadow: "shadow-[0_0_30px_hsl(280_100%_60%/0.2)] hover:shadow-[0_0_50px_hsl(280_100%_60%/0.35)]",
    gradient: "from-violet-500 to-purple-600",
    text: "text-violet-400",
    glow: "bg-violet-500/20",
  },
  amber: {
    border: "border-amber-500/30 hover:border-amber-400/60",
    shadow: "shadow-[0_0_30px_hsl(38_100%_50%/0.2)] hover:shadow-[0_0_50px_hsl(38_100%_50%/0.35)]",
    gradient: "from-amber-500 to-orange-600",
    text: "text-amber-400",
    glow: "bg-amber-500/20",
  },
  emerald: {
    border: "border-emerald-500/30 hover:border-emerald-400/60",
    shadow: "shadow-[0_0_30px_hsl(160_100%_40%/0.2)] hover:shadow-[0_0_50px_hsl(160_100%_40%/0.35)]",
    gradient: "from-emerald-500 to-teal-600",
    text: "text-emerald-400",
    glow: "bg-emerald-500/20",
  },
  rose: {
    border: "border-rose-500/30 hover:border-rose-400/60",
    shadow: "shadow-[0_0_30px_hsl(350_100%_60%/0.2)] hover:shadow-[0_0_50px_hsl(350_100%_60%/0.35)]",
    gradient: "from-rose-500 to-pink-600",
    text: "text-rose-400",
    glow: "bg-rose-500/20",
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
  glowColor = "cyan",
  isActive = false,
  index = 0,
}: TechModuleCardProps) {
  const config = GLOW_CONFIGS[glowColor];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.5, 
        delay: index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      whileHover={{ 
        y: -8, 
        scale: 1.02,
        transition: { duration: 0.25 }
      }}
      whileTap={{ scale: 0.98 }}
    >
      <Link to={href} className="group block">
        <div
          className={cn(
            "relative overflow-hidden rounded-xl min-h-[220px] border",
            "bg-slate-900/70 backdrop-blur-xl",
            "transition-all duration-500",
            config.border,
            config.shadow,
            isActive && "ring-2 ring-cyan-400"
          )}
        >
          {/* Animated border gradient */}
          <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <div className={cn(
              "absolute inset-[-2px] rounded-xl bg-gradient-to-r opacity-50 blur-sm",
              config.gradient
            )} />
          </div>

          {/* Scan line effect on hover */}
          <motion.div 
            className={cn(
              "absolute left-0 right-0 h-px opacity-0 group-hover:opacity-100",
              "bg-gradient-to-r from-transparent via-current to-transparent",
              config.text
            )}
            animate={{ top: ['0%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />

          {/* Background Image with dark overlay */}
          {image && (
            <div className="absolute inset-0">
              <img 
                src={image} 
                alt="" 
                className="w-full h-full object-cover opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-700 ease-out grayscale"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/95 to-slate-900/80" />
            </div>
          )}

          {/* Corner accents */}
          <div className={cn("absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 rounded-tl-xl transition-colors duration-300", config.border.replace('hover:', 'group-hover:'))} />
          <div className={cn("absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 rounded-br-xl transition-colors duration-300", config.border.replace('hover:', 'group-hover:'))} />

          {/* Content */}
          <div className="relative h-full p-5 flex flex-col">
            {/* Header with icon and count */}
            <div className="flex items-start justify-between mb-4">
              <motion.div 
                className={cn(
                  "relative p-3 rounded-lg",
                  "bg-gradient-to-br",
                  config.gradient,
                  "shadow-lg"
                )}
                style={{
                  boxShadow: `0 0 30px hsl(var(--${glowColor === 'cyan' ? '190 100% 50%' : glowColor === 'violet' ? '280 100% 60%' : glowColor === 'amber' ? '38 100% 50%' : glowColor === 'emerald' ? '160 100% 40%' : '350 100% 60%'} / 0.4))`
                }}
                whileHover={{ rotate: [0, -5, 5, 0], scale: 1.1 }}
                transition={{ duration: 0.4 }}
              >
                <Icon className="h-6 w-6 text-white" />
                {/* Icon glow ring */}
                <div className={cn(
                  "absolute inset-0 rounded-lg animate-pulse-ring",
                  config.glow
                )} />
              </motion.div>
              
              {count !== undefined && count > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 + 0.3, type: "spring", stiffness: 400 }}
                >
                  <Badge 
                    className={cn(
                      "font-mono text-xs font-bold px-3 py-1.5 border backdrop-blur-sm",
                      "bg-slate-800/80",
                      config.border,
                      config.text
                    )}
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    {count} {countLabel || ""}
                  </Badge>
                </motion.div>
              )}
            </div>
            
            {/* Title and Description */}
            <div className="mt-auto space-y-2">
              <h3 className={cn(
                "font-bold text-xl text-slate-100 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r transition-all duration-300",
                `group-hover:${config.gradient}`
              )}>
                {title}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors duration-300">
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
                  "p-2 rounded-lg border backdrop-blur-sm",
                  "bg-slate-800/80",
                  config.border,
                )}
                animate={{ x: [0, 5, 0] }}
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
