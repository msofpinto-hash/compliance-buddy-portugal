import { motion } from "framer-motion";

// Cyberpunk-style animated grid background
export const TechGridBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    {/* Deep dark base */}
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
    
    {/* Animated perspective grid */}
    <div 
      className="absolute inset-0 opacity-20"
      style={{
        backgroundImage: `
          linear-gradient(hsl(190 100% 50% / 0.15) 1px, transparent 1px),
          linear-gradient(90deg, hsl(190 100% 50% / 0.15) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px',
        transform: 'perspective(500px) rotateX(60deg)',
        transformOrigin: 'center top',
      }}
    />
    
    {/* Horizontal scan line */}
    <motion.div
      className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
      animate={{
        top: ['0%', '100%'],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
    
    {/* Radial glow spots */}
    <div 
      className="absolute top-1/4 left-1/4 w-96 h-96 opacity-30"
      style={{
        background: 'radial-gradient(circle, hsl(280 100% 50% / 0.15) 0%, transparent 70%)'
      }}
    />
    <div 
      className="absolute bottom-1/4 right-1/4 w-96 h-96 opacity-30"
      style={{
        background: 'radial-gradient(circle, hsl(190 100% 50% / 0.2) 0%, transparent 70%)'
      }}
    />
    
    {/* Top gradient fade */}
    <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-slate-950 to-transparent" />
  </div>
);

// Floating tech particles with glow
export const TechParticles = () => {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 8,
    duration: 12 + Math.random() * 8,
    size: 1 + Math.random() * 2,
    color: Math.random() > 0.5 ? 'cyan' : 'violet'
  }));

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: particle.left,
            width: particle.size,
            height: particle.size,
            background: particle.color === 'cyan' 
              ? 'hsl(190 100% 60%)' 
              : 'hsl(280 100% 70%)',
            boxShadow: particle.color === 'cyan'
              ? `0 0 ${particle.size * 4}px hsl(190 100% 50% / 0.6)`
              : `0 0 ${particle.size * 4}px hsl(280 100% 60% / 0.6)`
          }}
          animate={{
            y: [window.innerHeight + 50, -50],
            opacity: [0, 0.8, 0.8, 0],
            scale: [0.5, 1, 1, 0.5]
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "linear"
          }}
        />
      ))}
    </div>
  );
};

// Hexagon pattern overlay
export const HexPattern = () => (
  <div 
    className="fixed inset-0 pointer-events-none opacity-[0.02] z-0"
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%2300d4ff' fill-opacity='1'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
    }}
  />
);

// Neon border glow component
export const NeonBorder = ({ 
  children, 
  color = "cyan",
  className = "" 
}: { 
  children: React.ReactNode;
  color?: "cyan" | "violet" | "emerald";
  className?: string;
}) => {
  const glowColors = {
    cyan: "shadow-[0_0_20px_hsl(190_100%_50%/0.3),inset_0_0_20px_hsl(190_100%_50%/0.05)] border-cyan-500/30 hover:border-cyan-400/50 hover:shadow-[0_0_30px_hsl(190_100%_50%/0.4)]",
    violet: "shadow-[0_0_20px_hsl(280_100%_60%/0.3),inset_0_0_20px_hsl(280_100%_60%/0.05)] border-violet-500/30 hover:border-violet-400/50 hover:shadow-[0_0_30px_hsl(280_100%_60%/0.4)]",
    emerald: "shadow-[0_0_20px_hsl(160_100%_40%/0.3),inset_0_0_20px_hsl(160_100%_40%/0.05)] border-emerald-500/30 hover:border-emerald-400/50 hover:shadow-[0_0_30px_hsl(160_100%_40%/0.4)]"
  };

  return (
    <div className={`
      relative rounded-2xl border bg-slate-900/80 backdrop-blur-xl
      transition-all duration-500
      ${glowColors[color]}
      ${className}
    `}>
      {children}
    </div>
  );
};
