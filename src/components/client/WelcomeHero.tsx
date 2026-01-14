import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight, ClipboardList, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

interface WelcomeHeroProps {
  userName?: string;
  organizationName?: string;
  alertsCount?: number;
  upcomingAudits?: number;
  pendingActions?: number;
}

export function WelcomeHero({ 
  userName, 
  organizationName,
  alertsCount = 0,
  upcomingAudits = 0,
  pendingActions = 0,
}: WelcomeHeroProps) {
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 19 ? "Boa tarde" : "Boa noite";
  const firstName = userName?.split(" ")[0] || userName?.split("@")[0] || "Utilizador";
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/80 via-slate-900/90 to-emerald-950/50 border border-emerald-500/20 backdrop-blur-xl"
    >
      {/* Subtle glow effect */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(16, 185, 129, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 185, 129, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Greeting */}
          <div className="max-w-xl">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <Badge className="mb-4 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">
                <Sparkles className="h-3 w-3 mr-1" />
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
              </Badge>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-2xl sm:text-3xl font-bold text-white mb-2"
            >
              {greeting}, <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">{firstName}</span>! 👋
            </motion.h1>
            
            {organizationName && (
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="text-slate-400"
              >
                Gestão de conformidade legal para{" "}
                <span className="font-semibold text-emerald-400">{organizationName}</span>
              </motion.p>
            )}
          </div>

          {/* Right: Quick Stats */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="flex flex-wrap gap-3"
          >
            {upcomingAudits > 0 && (
              <Link 
                to="/dashboard?tab=audits"
                className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-purple-500/30 hover:bg-purple-500/10 hover:border-purple-500/50 transition-all duration-300"
              >
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Calendar className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{upcomingAudits}</p>
                  <p className="text-xs text-slate-400">auditorias ativas</p>
                </div>
                <ChevronRight className="h-4 w-4 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
            {pendingActions > 0 && (
              <Link 
                to="/dashboard?tab=actions"
                className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all duration-300"
              >
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <ClipboardList className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{pendingActions}</p>
                  <p className="text-xs text-slate-400">ações pendentes</p>
                </div>
                <ChevronRight className="h-4 w-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
