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
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 dark:from-emerald-600 dark:via-teal-600 dark:to-cyan-700 shadow-2xl"
    >
      {/* Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Animated gradient orbs */}
        <motion.div 
          className="absolute -top-20 -right-20 w-72 h-72 bg-white/20 rounded-full blur-3xl"
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2]
          }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <motion.div 
          className="absolute -bottom-20 -left-20 w-56 h-56 bg-cyan-300/30 rounded-full blur-3xl"
          animate={{ 
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.4, 0.3]
          }}
          transition={{ duration: 5, repeat: Infinity, delay: 1 }}
        />
        <motion.div 
          className="absolute top-1/2 right-1/4 w-40 h-40 bg-emerald-200/20 rounded-full blur-2xl"
          animate={{ 
            x: [0, 20, 0],
            y: [0, -20, 0]
          }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
      </div>
      
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
              <Badge className="bg-white/25 hover:bg-white/35 text-white border-0 backdrop-blur-sm shadow-lg px-3 py-1.5">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
              </Badge>
            </motion.div>
            
            <motion.h1 
              className="text-3xl sm:text-4xl font-bold text-white mb-2 drop-shadow-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              {greeting}, <span className="text-emerald-100">{firstName}</span>
            </motion.h1>
            
            {organizationName && (
              <motion.p 
                className="text-emerald-50/90 text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Gestão de conformidade legal para{" "}
                <span className="font-semibold text-white">{organizationName}</span>
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
              <motion.div
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <Link 
                  to="/dashboard?tab=audits"
                  className="group flex items-center gap-3 px-5 py-4 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 hover:bg-white/30 transition-all duration-200 shadow-lg"
                >
                  <motion.div 
                    className="p-2.5 rounded-xl bg-amber-400 shadow-lg"
                    whileHover={{ rotate: 10 }}
                  >
                    <Calendar className="h-5 w-5 text-amber-900" />
                  </motion.div>
                  <div>
                    <p className="text-2xl font-bold text-white">{upcomingAudits}</p>
                    <p className="text-sm text-emerald-50/80">auditorias ativas</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </Link>
              </motion.div>
            )}
            {pendingActions > 0 && (
              <motion.div
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <Link 
                  to="/dashboard?tab=actions"
                  className="group flex items-center gap-3 px-5 py-4 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 hover:bg-white/30 transition-all duration-200 shadow-lg"
                >
                  <motion.div 
                    className="p-2.5 rounded-xl bg-blue-400 shadow-lg"
                    whileHover={{ rotate: -10 }}
                  >
                    <ClipboardList className="h-5 w-5 text-blue-900" />
                  </motion.div>
                  <div>
                    <p className="text-2xl font-bold text-white">{pendingActions}</p>
                    <p className="text-sm text-emerald-50/80">ações pendentes</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </Link>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}