import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Bell, Calendar, ChevronRight } from "lucide-react";
import heroImage from "@/assets/hero-compliance.jpg";
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
  
  // Show quick actions only if there's something to show
  const hasQuickActions = alertsCount > 0 || upcomingAudits > 0 || pendingActions > 0;
  
  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img 
          src={heroImage} 
          alt="Compliance Dashboard" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/85 to-background/50" />
      </div>
      
      {/* Content */}
      <div className="relative z-10 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Greeting */}
          <div className="max-w-xl">
            <Badge variant="outline" className="mb-3 bg-background/50 backdrop-blur-sm border-primary/30">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
            </Badge>
            
            <h1 className="text-2xl sm:text-3xl font-bold mb-1">
              {greeting}, {firstName}! 👋
            </h1>
            
            {organizationName && (
              <p className="text-muted-foreground">
                Gestão de conformidade legal para <span className="font-medium text-foreground">{organizationName}</span>
              </p>
            )}
          </div>

          {/* Right: Quick Actions / Notifications */}
          {hasQuickActions && (
            <div className="flex flex-wrap gap-3">
              {alertsCount > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <Bell className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium">{alertsCount} alertas</span>
                </div>
              )}
              {upcomingAudits > 0 && (
                <Link 
                  to="/dashboard?tab=audits"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                >
                  <Calendar className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium">{upcomingAudits} auditorias</span>
                  <ChevronRight className="h-3 w-3 text-purple-600" />
                </Link>
              )}
              {pendingActions > 0 && (
                <Link 
                  to="/dashboard?tab=actions"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors"
                >
                  <span className="text-sm font-medium">{pendingActions} ações pendentes</span>
                  <ChevronRight className="h-3 w-3 text-primary" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
