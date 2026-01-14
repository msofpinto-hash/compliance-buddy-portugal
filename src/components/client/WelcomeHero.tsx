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
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-800/95 dark:via-slate-800/80 dark:to-emerald-900/20 border border-slate-200/80 dark:border-slate-600/30 shadow-lg shadow-slate-200/50 dark:shadow-none"
    >
      {/* Decorative gradient accents */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-emerald-400/15 via-teal-400/10 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-400/10 to-transparent rounded-full blur-2xl" />
      
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
              <Badge className="mb-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 transition-shadow">
                <Sparkles className="h-3 w-3 mr-1.5" />
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
              </Badge>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white mb-2"
            >
              {greeting}, <span className="bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">{firstName}</span>! 👋
            </motion.h1>
            
            {organizationName && (
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="text-slate-600 dark:text-slate-400"
              >
                Gestão de conformidade legal para{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{organizationName}</span>
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
                className="group flex items-center gap-3 px-5 py-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-500/15 dark:to-purple-600/10 border border-purple-200/80 dark:border-purple-500/25 hover:border-purple-400 dark:hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300"
              >
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 shadow-md shadow-purple-500/20">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-800 dark:text-white">{upcomingAudits}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">auditorias ativas</p>
                </div>
                <ChevronRight className="h-4 w-4 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
            {pendingActions > 0 && (
              <Link 
                to="/dashboard?tab=actions"
                className="group flex items-center gap-3 px-5 py-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-100/50 dark:from-emerald-500/15 dark:to-teal-600/10 border border-emerald-200/80 dark:border-emerald-500/25 hover:border-emerald-400 dark:hover:border-emerald-400/50 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300"
              >
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/20">
                  <ClipboardList className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-800 dark:text-white">{pendingActions}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">ações pendentes</p>
                </div>
                <ChevronRight className="h-4 w-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
