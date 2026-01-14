import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, Lock, Scale } from "lucide-react";
import { motion } from "framer-motion";
import heroBackgroundVideo from "@/assets/hero-background.mp4";

// Animated grid background - Green/Sage tones
const GridBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient - warm dark with green undertones */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-emerald-950/40 to-slate-950" />
      
      {/* Animated grid - sage green */}
      <div 
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage: `
            linear-gradient(rgba(132, 169, 140, 0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(132, 169, 140, 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'gridMove 20s linear infinite'
        }}
      />
      
      {/* Glow orbs - sage/olive/mint tones */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/15 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-700/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-lime-600/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      
      {/* Scan line effect */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
        }}
      />
    </div>
  );
};

// Floating particles - sage/mint colors
const TechParticles = () => {
  const colors = ['bg-emerald-400', 'bg-teal-400', 'bg-lime-400', 'bg-green-300'];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(30)].map((_, i) => (
        <div
          key={i}
          className={`absolute w-1 h-1 ${colors[i % colors.length]} rounded-full opacity-50`}
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `floatParticle ${8 + Math.random() * 12}s linear infinite`,
            animationDelay: `${Math.random() * 5}s`
          }}
        />
      ))}
    </div>
  );
};

// Animated Logo Component with continuous glow pulse
const AnimatedLogo = () => (
  <motion.div 
    className="relative group cursor-pointer"
    whileHover={{ scale: 1.05 }}
    transition={{ type: "spring", stiffness: 400, damping: 10 }}
  >
    {/* Continuous glow effect behind icon */}
    <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/20 via-teal-400/20 to-lime-500/20 rounded-3xl blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-500 animate-glow-pulse" />
    
    {/* Logo container */}
    <div className="relative flex items-center gap-4 px-6 py-4 rounded-2xl bg-slate-800/60 border border-emerald-500/30 backdrop-blur-sm group-hover:border-emerald-400/50 transition-all duration-300">
      {/* Icon with continuous pulse animation */}
      <div className="relative">
        {/* Inner glow ring */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 blur-md opacity-60 animate-icon-glow" />
        
        {/* Icon container */}
        <motion.div 
          className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-green-600 shadow-lg shadow-emerald-500/40"
          animate={{ 
            boxShadow: [
              '0 0 20px rgba(16, 185, 129, 0.4)',
              '0 0 35px rgba(16, 185, 129, 0.6)',
              '0 0 20px rgba(16, 185, 129, 0.4)'
            ]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Scale className="h-7 w-7 text-white drop-shadow-lg" />
        </motion.div>
      </div>
      
      {/* Text */}
      <div className="flex flex-col items-start">
        <span className="text-2xl font-bold text-white tracking-tight">I&D</span>
        <span 
          className="text-sm font-semibold tracking-[0.3em] text-emerald-400"
          style={{
            textShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
          }}
        >
          COMPLIANCE
        </span>
      </div>
    </div>
  </motion.div>
);

// Neon text effect component - green tones
const NeonText = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span 
    className={`relative ${className}`}
    style={{
      textShadow: '0 0 10px rgba(16, 185, 129, 0.5), 0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.2)'
    }}
  >
    {children}
  </span>
);

const Index = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Background video layer */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        >
          <source src={heroBackgroundVideo} type="video/mp4" />
        </video>
        {/* Overlay to blend video with grid */}
        <div className="absolute inset-0 bg-slate-950/60" />
      </div>
      
      <GridBackground />
      <TechParticles />
      
      {/* Mouse-following glow */}
      <div 
        className="absolute w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-300"
        style={{
          left: `${mousePosition.x * 100}%`,
          top: `${mousePosition.y * 100}%`,
          transform: 'translate(-50%, -50%)'
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12 text-center max-w-5xl mx-auto">
        
        {/* Logo with animation */}
        <motion.div
          initial={{ opacity: 0, y: -30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-10"
        >
          <AnimatedLogo />
        </motion.div>

        {/* Main headline */}
        <motion.h1 
          className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
        >
          <span className="block text-slate-300 text-lg md:text-xl font-normal tracking-widest uppercase mb-4">
            Plataforma de Gestão
          </span>
          <NeonText className="text-emerald-400">
            Conformidade Legal
          </NeonText>
          <span className="block text-white mt-2">
            Simplificada
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p 
          className="text-slate-400 text-lg md:text-xl max-w-2xl mb-12 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
        >
          Gestão de conformidade legal conduzida por auditores especializados — 
          acompanhamento personalizado, auditorias rigorosas e suporte contínuo para o seu negócio.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div 
          className="flex flex-col sm:flex-row gap-4 mb-16"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.9, ease: "easeOut" }}
        >
          <Link to="/auth">
            <Button 
              size="lg" 
              className="group relative overflow-hidden bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border-0 px-8 py-6 text-lg font-semibold rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] transition-all duration-300"
            >
              <span className="relative z-10 flex items-center gap-2">
                Aceder à Área Cliente
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </Link>
        </motion.div>

        {/* Feature badges */}
        <motion.div 
          className="flex flex-wrap justify-center gap-6 md:gap-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2, ease: "easeOut" }}
        >
          {[
            { icon: Shield, label: "Dados Seguros" },
            { icon: Zap, label: "Atualizações em Tempo Real" },
            { icon: Lock, label: "Acesso Privado" }
          ].map((item, index) => (
            <motion.div
              key={item.label}
              className="flex items-center gap-3 text-slate-400 group"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1.3 + index * 0.1 }}
            >
              <div className="p-2 rounded-lg bg-slate-800/50 border border-emerald-500/20 group-hover:border-emerald-500/50 group-hover:bg-slate-800 transition-all">
                <item.icon className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-sm md:text-base">{item.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Bottom decoration */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      
      {/* Version/Copyright */}
      <div className="absolute bottom-6 text-slate-600 text-sm">
        © {new Date().getFullYear()} ID Compliance. Todos os direitos reservados.
      </div>
    </div>
  );
};

export default Index;
