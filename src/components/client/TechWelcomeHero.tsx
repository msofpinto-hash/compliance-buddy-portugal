import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight, ClipboardList, Cpu, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

interface TechWelcomeHeroProps {
  userName?: string;
  organizationName?: string;
  alertsCount?: number;
  upcomingAudits?: number;
  pendingActions?: number;
}

export function TechWelcomeHero({ 
  userName, 
  organizationName,
  alertsCount = 0,
  upcomingAudits = 0,
  pendingActions = 0,
}: TechWelcomeHeroProps) {
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 19 ? "Boa tarde" : "Boa noite";
  const firstName = userName?.split(" ")[0] || userName?.split("@")[0] || "Utilizador";
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-900/60 backdrop-blur-xl shadow-[0_0_40px_hsl(190_100%_50%/0.15)]"
    >
      {/* Animated scan line */}
      <motion.div 
        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
        animate={{ top: ['0%', '100%', '0%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      
      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-20 h-20 border-l-2 border-t-2 border-cyan-500/40 rounded-tl-2xl" />
      <div className="absolute top-0 right-0 w-20 h-20 border-r-2 border-t-2 border-violet-500/40 rounded-tr-2xl" />
      <div className="absolute bottom-0 left-0 w-20 h-20 border-l-2 border-b-2 border-violet-500/40 rounded-bl-2xl" />
      <div className="absolute bottom-0 right-0 w-20 h-20 border-r-2 border-b-2 border-cyan-500/40 rounded-br-2xl" />
      
      {/* Glowing orbs */}
      <motion.div 
        className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, hsl(190 100% 50% / 0.4) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      <motion.div 
        className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, hsl(280 100% 60% / 0.4) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 5, repeat: Infinity, delay: 1 }}
      />
      
      {/* Content */}
      <div className="relative p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Greeting */}
          <motion.div 
            className="max-w-xl"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div 
              className="flex items-center gap-2 mb-4"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Badge className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 backdrop-blur-sm px-3 py-1.5 font-mono text-xs">
                <Cpu className="h-3 w-3 mr-1.5" />
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
              </Badge>
            </motion.div>
            
            <motion.h1 
              className="text-3xl sm:text-4xl font-bold mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <span className="text-slate-100">{greeting}, </span>
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                {firstName}
              </span>
            </motion.h1>
            
            {organizationName && (
              <motion.p 
                className="text-slate-400 text-lg font-light"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Gestão de conformidade para{" "}
                <span className="font-medium text-cyan-300">{organizationName}</span>
              </motion.p>
            )}
          </motion.div>

          {/* Right: Quick Stats */}
          <motion.div 
            className="flex flex-wrap gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            {upcomingAudits > 0 && (
              <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.98 }}>
                <Link 
                  to="/dashboard?tab=audits"
                  className="group flex items-center gap-3 px-5 py-4 rounded-xl bg-slate-800/60 backdrop-blur-sm border border-amber-500/30 hover:border-amber-400/50 hover:bg-slate-800/80 transition-all duration-300 shadow-[0_0_20px_hsl(38_100%_50%/0.15)]"
                >
                  <motion.div 
                    className="p-2.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30"
                    whileHover={{ rotate: 10 }}
                  >
                    <Calendar className="h-5 w-5 text-white" />
                  </motion.div>
                  <div>
                    <p className="text-2xl font-bold text-white font-mono">{upcomingAudits}</p>
                    <p className="text-sm text-slate-400">auditorias ativas</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-400/60 group-hover:text-amber-300 group-hover:translate-x-1 transition-all" />
                </Link>
              </motion.div>
            )}
            {pendingActions > 0 && (
              <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.98 }}>
                <Link 
                  to="/dashboard?tab=actions"
                  className="group flex items-center gap-3 px-5 py-4 rounded-xl bg-slate-800/60 backdrop-blur-sm border border-cyan-500/30 hover:border-cyan-400/50 hover:bg-slate-800/80 transition-all duration-300 shadow-[0_0_20px_hsl(190_100%_50%/0.15)]"
                >
                  <motion.div 
                    className="p-2.5 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30"
                    whileHover={{ rotate: -10 }}
                  >
                    <ClipboardList className="h-5 w-5 text-white" />
                  </motion.div>
                  <div>
                    <p className="text-2xl font-bold text-white font-mono">{pendingActions}</p>
                    <p className="text-sm text-slate-400">ações pendentes</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-cyan-400/60 group-hover:text-cyan-300 group-hover:translate-x-1 transition-all" />
                </Link>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
