import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight, ClipboardList, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 dark:from-emerald-700 dark:via-teal-700 dark:to-cyan-800 shadow-xl">
      {/* Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-cyan-400/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/4 w-32 h-32 bg-emerald-300/10 rounded-full blur-2xl" />
        
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>
      </div>
      
      {/* Content */}
      <div className="relative p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Greeting */}
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-4">
              <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm shadow-sm">
                <Sparkles className="h-3 w-3 mr-1" />
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
              </Badge>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 drop-shadow-lg">
              {greeting}, <span className="text-emerald-200">{firstName}</span>
            </h1>
            
            {organizationName && (
              <p className="text-emerald-100/90 text-lg">
                Gestão de conformidade legal para{" "}
                <span className="font-semibold text-white">{organizationName}</span>
              </p>
            )}
          </div>

          {/* Right: Quick Stats */}
          <div className="flex flex-wrap gap-3">
            {upcomingAudits > 0 && (
              <Link 
                to="/dashboard?tab=audits"
                className="group flex items-center gap-3 px-5 py-4 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/25 hover:border-white/30 transition-all duration-200"
              >
                <div className="p-2.5 rounded-lg bg-amber-400 shadow-lg group-hover:scale-110 transition-transform">
                  <Calendar className="h-5 w-5 text-amber-900" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{upcomingAudits}</p>
                  <p className="text-sm text-emerald-100/80">auditorias ativas</p>
                </div>
                <ChevronRight className="h-5 w-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </Link>
            )}
            {pendingActions > 0 && (
              <Link 
                to="/dashboard?tab=actions"
                className="group flex items-center gap-3 px-5 py-4 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/25 hover:border-white/30 transition-all duration-200"
              >
                <div className="p-2.5 rounded-lg bg-blue-400 shadow-lg group-hover:scale-110 transition-transform">
                  <ClipboardList className="h-5 w-5 text-blue-900" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{pendingActions}</p>
                  <p className="text-sm text-emerald-100/80">ações pendentes</p>
                </div>
                <ChevronRight className="h-5 w-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}