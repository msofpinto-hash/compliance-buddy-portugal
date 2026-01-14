import { motion } from "framer-motion";

// Animated grid background for client dashboard
export const ClientGridBackground = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    {/* Base gradient */}
    <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/30 via-background to-teal-950/20" />
    
    {/* Animated grid */}
    <div 
      className="absolute inset-0 opacity-[0.03]"
      style={{
        backgroundImage: `
          linear-gradient(hsl(161 93% 30% / 0.3) 1px, transparent 1px),
          linear-gradient(90deg, hsl(161 93% 30% / 0.3) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        animation: 'gridMove 20s linear infinite'
      }}
    />
    
    {/* Radial glow */}
    <div 
      className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-20"
      style={{
        background: 'radial-gradient(ellipse at center, hsl(161 93% 30% / 0.3) 0%, transparent 70%)'
      }}
    />
  </div>
);

// Floating tech particles
export const ClientParticles = () => {
  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 5,
    duration: 10 + Math.random() * 10,
    size: 2 + Math.random() * 3
  }));

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-emerald-400/40"
          style={{
            left: particle.left,
            width: particle.size,
            height: particle.size,
            boxShadow: `0 0 ${particle.size * 2}px hsl(161 93% 50% / 0.4)`
          }}
          animate={{
            y: [window.innerHeight, -50],
            opacity: [0, 0.6, 0.6, 0]
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

// Animated logo for header
export const ClientAnimatedLogo = ({ className = "" }: { className?: string }) => (
  <div className={`relative ${className}`}>
    {/* Outer glow ring */}
    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/30 to-teal-500/30 blur-md animate-glow-pulse" />
    
    {/* Main container */}
    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25">
      {/* Inner glow */}
      <div className="absolute inset-1 rounded-lg bg-gradient-to-br from-emerald-400/20 to-transparent animate-icon-glow" />
      
      {/* Icon */}
      <svg 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className="h-5 w-5 text-white relative z-10"
      >
        <path d="m3 17 2 2 4-4" />
        <path d="m3 7 2 2 4-4" />
        <path d="M13 6h8" />
        <path d="M13 12h8" />
        <path d="M13 18h8" />
      </svg>
    </div>
  </div>
);
