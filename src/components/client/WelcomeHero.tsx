import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";

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
    <div className="relative overflow-hidden rounded-lg bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 shadow-sm">
      {/* Subtle accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
      
      {/* Content */}
      <div className="relative p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Greeting */}
          <div className="max-w-xl">
            <Badge variant="outline" className="mb-4 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
            </Badge>
            
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
              {greeting}, <span className="text-primary">{firstName}</span>
            </h1>
            
            {organizationName && (
              <p className="text-slate-600 dark:text-slate-400">
                Gestão de conformidade legal para{" "}
                <span className="font-semibold text-slate-900 dark:text-white">{organizationName}</span>
              </p>
            )}
          </div>

          {/* Right: Quick Stats */}
          <div className="flex flex-wrap gap-3">
            {upcomingAudits > 0 && (
              <Link 
                to="/dashboard?tab=audits"
                className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-primary/50 dark:hover:border-primary/40 transition-colors"
              >
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{upcomingAudits}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">auditorias ativas</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
              </Link>
            )}
            {pendingActions > 0 && (
              <Link 
                to="/dashboard?tab=actions"
                className="group flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-primary/50 dark:hover:border-primary/40 transition-colors"
              >
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <ClipboardList className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{pendingActions}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">ações pendentes</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
