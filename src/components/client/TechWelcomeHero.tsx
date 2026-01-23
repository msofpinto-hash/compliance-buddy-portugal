import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight, ClipboardList, Sparkles } from "lucide-react";
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
      className="relative overflow-hidden rounded-2xl border border-stone-200/60 dark:border-stone-700/40 bg-white/70 dark:bg-stone-900/60 backdrop-blur-xl shadow-[0_8px_30px_hsl(25_50%_40%/0.1)]"
    >
      {/* Subtle animated accent line */}
      <motion.div 
        className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
        style={{ top: 0 }}
      />
      
      {/* Corner decorations - warm tones */}
      <div className="absolute top-0 left-0 w-16 h-16 border-l-2 border-t-2 border-emerald-500/30 rounded-tl-2xl" />
      <div className="absolute top-0 right-0 w-16 h-16 border-r-2 border-t-2 border-amber-500/30 rounded-tr-2xl" />
      <div className="absolute bottom-0 left-0 w-16 h-16 border-l-2 border-b-2 border-amber-500/30 rounded-bl-2xl" />
      <div className="absolute bottom-0 right-0 w-16 h-16 border-r-2 border-b-2 border-emerald-500/30 rounded-br-2xl" />
      
      {/* Warm gradient orbs */}
      <motion.div 
        className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, hsl(25 70% 55% / 0.4) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.25, 0.15] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <motion.div 
        className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, hsl(152 60% 40% / 0.4) 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.35, 0.2] }}
        transition={{ duration: 8, repeat: Infinity, delay: 1 }}
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
              <Badge className="bg-amber-100 hover:bg-amber-200/80 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/50 dark:border-amber-700/50 backdrop-blur-sm px-3 py-1.5 text-xs font-medium">
                <Sparkles className="h-3 w-3 mr-1.5" />
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
              </Badge>
            </motion.div>
            
            <motion.h1 
              className="text-3xl sm:text-4xl font-bold mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <span className="text-stone-700 dark:text-stone-200">{greeting}, </span>
              <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                {firstName}
              </span>
            </motion.h1>
            
            {organizationName && (
              <motion.p 
                className="text-stone-500 dark:text-stone-400 text-lg font-light"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Gestão de conformidade para{" "}
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{organizationName}</span>
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
              <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.98 }}>
                <Link 
                  to="/dashboard?tab=audits"
                  className="group flex items-center gap-3 px-5 py-4 rounded-xl bg-white/80 dark:bg-stone-800/60 backdrop-blur-sm border border-amber-200/60 dark:border-amber-700/40 hover:border-amber-400/80 dark:hover:border-amber-600/60 hover:bg-amber-50/50 dark:hover:bg-amber-900/20 transition-all duration-300 shadow-[0_4px_20px_hsl(38_80%_50%/0.12)]"
                >
                  <motion.div 
                    className="p-2.5 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-400/30"
                    whileHover={{ rotate: 5 }}
                  >
                    <Calendar className="h-5 w-5 text-white" />
                  </motion.div>
                  <div>
                    <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{upcomingAudits}</p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">auditorias ativas</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-500/60 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
                </Link>
              </motion.div>
            )}
            {pendingActions > 0 && (
              <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.98 }}>
                <Link 
                  to="/dashboard?tab=actions"
                  className="group flex items-center gap-3 px-5 py-4 rounded-xl bg-white/80 dark:bg-stone-800/60 backdrop-blur-sm border border-emerald-200/60 dark:border-emerald-700/40 hover:border-emerald-400/80 dark:hover:border-emerald-600/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-all duration-300 shadow-[0_4px_20px_hsl(152_60%_40%/0.12)]"
                >
                  <motion.div 
                    className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30"
                    whileHover={{ rotate: -5 }}
                  >
                    <ClipboardList className="h-5 w-5 text-white" />
                  </motion.div>
                  <div>
                    <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{pendingActions}</p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">ações pendentes</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-emerald-500/60 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                </Link>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}