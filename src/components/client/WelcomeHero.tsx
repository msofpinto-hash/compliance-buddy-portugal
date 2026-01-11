import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import heroImage from "@/assets/hero-compliance.jpg";

interface WelcomeHeroProps {
  userName?: string;
  organizationName?: string;
  complianceRate: number;
  stats: {
    compliant: number;
    nonCompliant: number;
    inProgress: number;
    total: number;
  };
}

export function WelcomeHero({ 
  userName, 
  organizationName, 
  complianceRate,
  stats 
}: WelcomeHeroProps) {
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 19 ? "Boa tarde" : "Boa noite";
  const firstName = userName?.split(" ")[0] || userName?.split("@")[0] || "Utilizador";
  
  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img 
          src={heroImage} 
          alt="Compliance Dashboard" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/40" />
      </div>
      
      {/* Content */}
      <div className="relative z-10 p-6 sm:p-8 lg:p-10">
        <div className="max-w-2xl">
          {/* Greeting */}
          <Badge variant="outline" className="mb-4 bg-background/50 backdrop-blur-sm border-primary/30">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: pt })}
          </Badge>
          
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
            {greeting}, {firstName}! 👋
          </h1>
          
          {organizationName && (
            <p className="text-muted-foreground mb-6">
              Gestão de conformidade legal para <span className="font-medium text-foreground">{organizationName}</span>
            </p>
          )}
          
          {/* Compliance Overview */}
          <div className="bg-card/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
              {/* Main Rate */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-muted/20"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="36"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${complianceRate * 2.26} 226`}
                      className="text-primary transition-all duration-1000"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xl font-bold">
                    {complianceRate}%
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taxa de Conformidade</p>
                  <div className="flex items-center gap-1 text-primary">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm font-medium">Global</span>
                  </div>
                </div>
              </div>
              
              {/* Stats */}
              <div className="flex-1 grid grid-cols-3 gap-4">
                <div className="text-center p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-green-600">{stats.compliant}</p>
                  <p className="text-xs text-muted-foreground">Conforme</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-amber-500/10">
                  <Clock className="h-5 w-5 text-amber-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-amber-600">{stats.inProgress}</p>
                  <p className="text-xs text-muted-foreground">Em curso</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-red-500/10">
                  <AlertTriangle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-red-600">{stats.nonCompliant}</p>
                  <p className="text-xs text-muted-foreground">Não conforme</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
