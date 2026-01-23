import { motion } from "framer-motion";

// Professional background inspired by incredibleanddynamic.com
// Forest green + white + clean institutional aesthetic
export const IDBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    {/* Clean white/light green base */}
    <div className="absolute inset-0 bg-gradient-to-br from-white via-emerald-50/40 to-stone-50 dark:from-[#0c1f17] dark:via-[#0f2419] dark:to-[#0a1610]" />
    
    {/* Subtle geometric pattern overlay */}
    <div 
      className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
      style={{
        backgroundImage: `
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 40px,
            hsl(152 60% 25%) 40px,
            hsl(152 60% 25%) 41px
          )
        `,
      }}
    />
    
    {/* Soft gradient accents - forest green inspired */}
    <div 
      className="absolute top-0 right-0 w-[600px] h-[600px] opacity-20 dark:opacity-15"
      style={{
        background: 'radial-gradient(circle at center, hsl(152 45% 35% / 0.3) 0%, transparent 70%)'
      }}
    />
    <div 
      className="absolute bottom-0 left-0 w-[500px] h-[500px] opacity-15 dark:opacity-10"
      style={{
        background: 'radial-gradient(circle at center, hsl(152 50% 30% / 0.25) 0%, transparent 70%)'
      }}
    />
    
    {/* Animated floating elements - subtle and professional */}
    <motion.div
      className="absolute top-1/4 right-1/3 w-2 h-2 rounded-full bg-emerald-600/20 dark:bg-emerald-400/15"
      animate={{
        y: [-20, 20, -20],
        opacity: [0.3, 0.6, 0.3],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
    <motion.div
      className="absolute bottom-1/3 left-1/4 w-3 h-3 rounded-full bg-emerald-700/15 dark:bg-emerald-500/10"
      animate={{
        y: [15, -15, 15],
        opacity: [0.2, 0.5, 0.2],
      }}
      transition={{
        duration: 10,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 2,
      }}
    />
    
    {/* Bottom decorative line - I&D branding inspired */}
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-emerald-700/30 dark:via-emerald-500/20 to-transparent" />
  </div>
);

// Floating particles - more subtle for corporate feel
export const IDParticles = ({ count = 8 }: { count?: number }) => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-emerald-600/20 dark:bg-emerald-400/15"
          style={{
            left: `${10 + (i * 80 / count)}%`,
            top: `${20 + Math.sin(i) * 30}%`,
          }}
          animate={{
            y: [-10, 10, -10],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 6 + i,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.5,
          }}
        />
      ))}
    </div>
  );
};

// Hero section with I&D aesthetic
export const IDHeroSection = ({ 
  title, 
  subtitle, 
  badge,
  icon: Icon 
}: { 
  title: string; 
  subtitle?: string; 
  badge?: string;
  icon?: React.ElementType;
}) => (
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    className="relative overflow-hidden rounded-xl bg-white/80 dark:bg-[#0f2419]/80 border border-emerald-200/50 dark:border-emerald-800/30 p-6 lg:p-8 shadow-sm"
  >
    {/* Decorative accent */}
    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-600 via-emerald-700 to-emerald-800 dark:from-emerald-500 dark:via-emerald-600 dark:to-emerald-700" />
    
    {/* Subtle corner accent */}
    <div className="absolute -right-20 -top-20 w-40 h-40 bg-emerald-100/30 dark:bg-emerald-700/10 rounded-full blur-3xl" />
    
    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pl-4">
      <div className="space-y-3">
        {badge && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/60 dark:border-emerald-700/40">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {badge}
          </span>
        )}
        <h1 className="text-2xl lg:text-3xl font-semibold text-slate-800 dark:text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-slate-600 dark:text-emerald-100/70 max-w-xl text-sm lg:text-base">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  </motion.div>
);

// Card component with I&D styling
export const IDCard = ({ 
  children, 
  className = "" 
}: { 
  children: React.ReactNode; 
  className?: string; 
}) => (
  <div className={`bg-white/90 dark:bg-[#0f2419]/80 border border-emerald-200/50 dark:border-emerald-800/30 rounded-xl shadow-sm backdrop-blur-sm ${className}`}>
    {children}
  </div>
);
