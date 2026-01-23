import { motion } from "framer-motion";

// Professional background inspired by incredibleanddynamic.com
// Forest green + warm beige/salmon/brown accents
export const IDBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    {/* Warm beige/cream base with subtle green */}
    <div className="absolute inset-0 bg-gradient-to-br from-amber-50/80 via-stone-50 to-emerald-50/40 dark:from-[#1a1512] dark:via-[#141210] dark:to-[#0f1a14]" />
    
    {/* Subtle warm geometric pattern overlay */}
    <div 
      className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
      style={{
        backgroundImage: `
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 50px,
            hsl(30 40% 45%) 50px,
            hsl(30 40% 45%) 51px
          )
        `,
      }}
    />
    
    {/* Warm salmon/terracotta accent - top right */}
    <div 
      className="absolute -top-20 -right-20 w-[700px] h-[700px] opacity-15 dark:opacity-10"
      style={{
        background: 'radial-gradient(circle at center, hsl(15 50% 55% / 0.35) 0%, transparent 60%)'
      }}
    />
    
    {/* Forest green accent - bottom left */}
    <div 
      className="absolute -bottom-20 -left-20 w-[500px] h-[500px] opacity-20 dark:opacity-12"
      style={{
        background: 'radial-gradient(circle at center, hsl(152 45% 30% / 0.3) 0%, transparent 65%)'
      }}
    />
    
    {/* Warm brown accent - center */}
    <div 
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] opacity-8 dark:opacity-5"
      style={{
        background: 'radial-gradient(ellipse at center, hsl(25 35% 40% / 0.15) 0%, transparent 70%)'
      }}
    />
    
    {/* Animated floating elements - warm tones */}
    <motion.div
      className="absolute top-1/4 right-1/3 w-2 h-2 rounded-full bg-amber-500/25 dark:bg-amber-400/15"
      animate={{
        y: [-20, 20, -20],
        opacity: [0.2, 0.5, 0.2],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
    <motion.div
      className="absolute bottom-1/3 left-1/4 w-3 h-3 rounded-full bg-emerald-600/20 dark:bg-emerald-500/12"
      animate={{
        y: [15, -15, 15],
        opacity: [0.2, 0.4, 0.2],
      }}
      transition={{
        duration: 10,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 2,
      }}
    />
    <motion.div
      className="absolute top-2/3 right-1/4 w-2 h-2 rounded-full bg-orange-400/20 dark:bg-orange-300/10"
      animate={{
        y: [-15, 15, -15],
        opacity: [0.15, 0.35, 0.15],
      }}
      transition={{
        duration: 12,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 4,
      }}
    />
    
    {/* Bottom decorative line - warm gradient */}
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-600/25 dark:via-amber-500/15 to-transparent" />
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

// Hero section with I&D aesthetic - warm tones
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
    className="relative overflow-hidden rounded-xl bg-gradient-to-r from-white via-amber-50/50 to-stone-50 dark:from-[#1a1512] dark:via-[#181410] dark:to-[#141210] border border-amber-200/50 dark:border-amber-900/30 p-6 lg:p-8 shadow-sm"
  >
    {/* Decorative accent - warm gradient */}
    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-600 via-amber-500 to-orange-500 dark:from-emerald-500 dark:via-amber-500 dark:to-orange-400" />
    
    {/* Warm corner accents */}
    <div className="absolute -right-20 -top-20 w-48 h-48 bg-gradient-to-br from-amber-200/30 to-orange-200/20 dark:from-amber-700/15 dark:to-orange-700/10 rounded-full blur-3xl" />
    <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-emerald-200/20 dark:bg-emerald-700/10 rounded-full blur-2xl" />
    
    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pl-4">
      <div className="space-y-3">
        {badge && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-emerald-100 to-amber-100/80 dark:from-emerald-800/50 dark:to-amber-800/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/60 dark:border-emerald-700/40">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {badge}
          </span>
        )}
        <h1 className="text-2xl lg:text-3xl font-semibold text-stone-800 dark:text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-stone-600 dark:text-amber-100/70 max-w-xl text-sm lg:text-base">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  </motion.div>
);

// Card component with I&D styling - warm accents
export const IDCard = ({ 
  children, 
  className = "" 
}: { 
  children: React.ReactNode; 
  className?: string; 
}) => (
  <div className={`bg-white/95 dark:bg-[#181410]/90 border border-stone-200/60 dark:border-amber-900/30 rounded-xl shadow-sm backdrop-blur-sm ${className}`}>
    {children}
  </div>
);
