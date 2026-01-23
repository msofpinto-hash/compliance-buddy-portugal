import { motion } from "framer-motion";

// Warm corporate background with I&D aesthetic
export const TechGridBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    {/* Warm cream/beige base */}
    <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-stone-50 to-orange-50/50 dark:from-stone-950 dark:via-stone-900 dark:to-amber-950/30" />
    
    {/* Subtle warm grid */}
    <div 
      className="absolute inset-0 opacity-[0.08] dark:opacity-[0.05]"
      style={{
        backgroundImage: `
          linear-gradient(hsl(25 60% 45% / 0.3) 1px, transparent 1px),
          linear-gradient(90deg, hsl(25 60% 45% / 0.3) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }}
    />
    
    {/* Geometric accent shapes */}
    <div className="absolute top-0 right-0 w-1/3 h-1/3 opacity-20 dark:opacity-10">
      <svg viewBox="0 0 400 400" className="w-full h-full">
        <circle cx="300" cy="100" r="200" fill="url(#warmGradient1)" />
        <defs>
          <radialGradient id="warmGradient1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(25 70% 55%)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(25 70% 55%)" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
    
    {/* Terracotta accent */}
    <motion.div 
      className="absolute top-1/4 left-1/6 w-80 h-80 rounded-full opacity-15 dark:opacity-10"
      style={{
        background: 'radial-gradient(circle, hsl(15 50% 55% / 0.4) 0%, transparent 70%)'
      }}
      animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    />
    
    {/* Emerald accent */}
    <motion.div 
      className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-10 dark:opacity-[0.08]"
      style={{
        background: 'radial-gradient(circle, hsl(152 70% 35% / 0.3) 0%, transparent 70%)'
      }}
      animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.15, 0.08] }}
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
    />
    
    {/* Top gradient fade for header blending */}
    <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-amber-50/80 dark:from-stone-950/80 to-transparent" />
  </div>
);

// Floating warm particles
export const TechParticles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 10,
    duration: 15 + Math.random() * 10,
    size: 2 + Math.random() * 3,
    // Warm color palette: amber, orange, terracotta, subtle emerald
    colorIndex: Math.floor(Math.random() * 4)
  }));

  const colors = [
    { bg: 'hsl(38 90% 55%)', shadow: 'hsl(38 90% 55% / 0.4)' },   // Amber
    { bg: 'hsl(25 80% 50%)', shadow: 'hsl(25 80% 50% / 0.4)' },   // Orange
    { bg: 'hsl(15 55% 50%)', shadow: 'hsl(15 55% 50% / 0.4)' },   // Terracotta
    { bg: 'hsl(152 60% 40%)', shadow: 'hsl(152 60% 40% / 0.4)' }, // Emerald
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((particle) => {
        const color = colors[particle.colorIndex];
        return (
          <motion.div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              left: particle.left,
              width: particle.size,
              height: particle.size,
              background: color.bg,
              boxShadow: `0 0 ${particle.size * 3}px ${color.shadow}`
            }}
            animate={{
              y: [window.innerHeight + 50, -50],
              opacity: [0, 0.6, 0.6, 0],
              scale: [0.5, 1, 1, 0.5]
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        );
      })}
    </div>
  );
};

// Subtle pattern overlay (replaces hex pattern)
export const HexPattern = () => (
  <div 
    className="fixed inset-0 pointer-events-none opacity-[0.015] dark:opacity-[0.02] z-0"
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23a16207' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
    }}
  />
);

// Warm border component (replaces neon)
export const NeonBorder = ({ 
  children, 
  color = "amber",
  className = "" 
}: { 
  children: React.ReactNode;
  color?: "amber" | "terracotta" | "emerald";
  className?: string;
}) => {
  const glowColors = {
    amber: "shadow-[0_4px_20px_hsl(38_80%_45%/0.15)] border-amber-300/40 dark:border-amber-700/40 hover:border-amber-400/60 dark:hover:border-amber-600/60 hover:shadow-[0_8px_30px_hsl(38_80%_45%/0.25)]",
    terracotta: "shadow-[0_4px_20px_hsl(15_50%_45%/0.15)] border-orange-300/40 dark:border-orange-800/40 hover:border-orange-400/60 dark:hover:border-orange-700/60 hover:shadow-[0_8px_30px_hsl(15_50%_45%/0.25)]",
    emerald: "shadow-[0_4px_20px_hsl(152_60%_35%/0.15)] border-emerald-300/40 dark:border-emerald-800/40 hover:border-emerald-400/60 dark:hover:border-emerald-700/60 hover:shadow-[0_8px_30px_hsl(152_60%_35%/0.25)]"
  };

  return (
    <div className={`
      relative rounded-2xl border bg-white/80 dark:bg-stone-900/80 backdrop-blur-xl
      transition-all duration-500
      ${glowColors[color]}
      ${className}
    `}>
      {children}
    </div>
  );
};