import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, Lock, Scale } from "lucide-react";
import { motion } from "framer-motion";

const Index = () => {
  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden bg-background">
      {/* Subtle decorative shapes */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-accent/20 blur-[120px] -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-secondary/40 blur-[100px] translate-y-1/3 -translate-x-1/4" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12 text-center max-w-4xl mx-auto">
        
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-card border border-border shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary shadow-sm">
              <Scale className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-xl font-heading font-bold text-foreground tracking-tight">I&D</span>
              <span className="text-xs font-heading font-semibold tracking-[0.2em] text-primary">
                COMPLIANCE
              </span>
            </div>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <p className="text-sm font-heading font-medium tracking-[0.25em] uppercase text-muted-foreground mb-4">
            Plataforma de Gestão
          </p>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-heading font-bold text-foreground mb-3 tracking-tight leading-tight">
            <span className="text-primary">Conformidade Legal</span>
            <br />
            Simplificada
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p 
          className="text-muted-foreground text-lg md:text-xl max-w-2xl mb-10 leading-relaxed"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Gestão de conformidade legal conduzida por auditores especializados — 
          acompanhamento personalizado, auditorias rigorosas e suporte contínuo para o seu negócio.
        </motion.p>

        {/* CTA */}
        <motion.div 
          className="mb-14"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <Link to="/auth">
            <Button 
              size="lg" 
              className="group px-8 py-6 text-lg font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
            >
              Aceder à Área Cliente
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </motion.div>

        {/* Feature badges */}
        <motion.div 
          className="flex flex-wrap justify-center gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          {[
            { icon: Shield, label: "Dados Seguros" },
            { icon: Zap, label: "Atualizações em Tempo Real" },
            { icon: Lock, label: "Acesso Privado" }
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 text-muted-foreground"
            >
              <div className="p-2 rounded-lg bg-accent/30 border border-border">
                <item.icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">{item.label}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Divider */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border" />
      
      {/* Copyright */}
      <div className="absolute bottom-6 text-muted-foreground text-sm">
        © {new Date().getFullYear()} ID Compliance. Todos os direitos reservados.
      </div>
    </div>
  );
};

export default Index;
