import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, Lock } from "lucide-react";
import logoIdCompliance from "@/assets/logo-id-compliance.png";

// Animated grid background
const GridBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      
      {/* Animated grid */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'gridMove 20s linear infinite'
        }}
      />
      
      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-600/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-purple-600/15 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
      
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

// Floating particles
const TechParticles = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(30)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-cyan-400 rounded-full opacity-60"
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

// Neon text effect component
const NeonText = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span 
    className={`relative ${className}`}
    style={{
      textShadow: '0 0 10px rgba(34, 211, 238, 0.5), 0 0 20px rgba(34, 211, 238, 0.3), 0 0 40px rgba(34, 211, 238, 0.2)'
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
      <GridBackground />
      <TechParticles />
      
      {/* Mouse-following glow */}
      <div 
        className="absolute w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none transition-all duration-300"
        style={{
          left: `${mousePosition.x * 100}%`,
          top: `${mousePosition.y * 100}%`,
          transform: 'translate(-50%, -50%)'
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12 text-center max-w-5xl mx-auto">
        
        {/* Logo with glow effect */}
        <div className="relative mb-8 group">
          <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-2xl scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <img 
            src={logoIdCompliance} 
            alt="ID Compliance" 
            className="h-20 md:h-28 relative z-10 drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]"
          />
        </div>

        {/* Main headline */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight">
          <span className="block text-slate-300 text-lg md:text-xl font-normal tracking-widest uppercase mb-4">
            Plataforma de Gestão
          </span>
          <NeonText className="text-cyan-400">
            Conformidade Legal
          </NeonText>
          <span className="block text-white mt-2">
            Simplificada
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mb-12 leading-relaxed">
          Monitorização inteligente de legislação, auditorias automatizadas e gestão de evidências 
          — tudo numa única plataforma.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link to="/auth">
            <Button 
              size="lg" 
              className="group relative overflow-hidden bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white border-0 px-8 py-6 text-lg font-semibold rounded-xl shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] transition-all duration-300"
            >
              <span className="relative z-10 flex items-center gap-2">
                Aceder à Área Cliente
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </Link>
        </div>

        {/* Feature badges */}
        <div className="flex flex-wrap justify-center gap-6 md:gap-10">
          <div className="flex items-center gap-3 text-slate-400 group">
            <div className="p-2 rounded-lg bg-slate-800/50 border border-cyan-500/20 group-hover:border-cyan-500/50 group-hover:bg-slate-800 transition-all">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-sm md:text-base">Dados Seguros</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 group">
            <div className="p-2 rounded-lg bg-slate-800/50 border border-cyan-500/20 group-hover:border-cyan-500/50 group-hover:bg-slate-800 transition-all">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-sm md:text-base">Atualizações em Tempo Real</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 group">
            <div className="p-2 rounded-lg bg-slate-800/50 border border-cyan-500/20 group-hover:border-cyan-500/50 group-hover:bg-slate-800 transition-all">
              <Lock className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-sm md:text-base">Acesso Privado</span>
          </div>
        </div>
      </div>

      {/* Bottom decoration */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      
      {/* Version/Copyright */}
      <div className="absolute bottom-6 text-slate-600 text-sm">
        © {new Date().getFullYear()} ID Compliance. Todos os direitos reservados.
      </div>
    </div>
  );
};

export default Index;
