import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertCircle, Clock, HelpCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface OrganizationComplianceProgressProps {
  organizationId: string;
  compact?: boolean;
}

interface ComplianceStats {
  total: number;
  conforme: number;
  naoConforme: number;
  emCurso: number;
  naoAvaliado: number;
  percentage: number;
}

export function OrganizationComplianceProgress({ organizationId, compact = false }: OrganizationComplianceProgressProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["org-compliance-stats", organizationId],
    queryFn: async (): Promise<ComplianceStats> => {
      const { data, error } = await supabase
        .from("applicabilities")
        .select("compliance_status")
        .eq("organization_id", organizationId);
      
      if (error) throw error;
      
      const total = data?.length || 0;
      const conforme = data?.filter(a => a.compliance_status === "conforme").length || 0;
      const naoConforme = data?.filter(a => a.compliance_status === "nao_conforme").length || 0;
      const emCurso = data?.filter(a => a.compliance_status === "em_curso").length || 0;
      const naoAvaliado = data?.filter(a => !a.compliance_status || a.compliance_status === "nao_avaliado").length || 0;
      
      const percentage = total > 0 ? Math.round((conforme / total) * 100) : 0;
      
      return { total, conforme, naoConforme, emCurso, naoAvaliado, percentage };
    },
    staleTime: 30000,
  });

  if (isLoading) {
    return <Skeleton className={compact ? "h-4 w-24" : "h-6 w-32"} />;
  }

  if (!stats || stats.total === 0) {
    return (
      <span className="text-xs text-muted-foreground italic">
        Sem requisitos
      </span>
    );
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "bg-emerald-500";
    if (percentage >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 min-w-[100px]">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${getProgressColor(stats.percentage)}`}
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
              <span className="text-xs font-medium tabular-nums w-8">
                {stats.percentage}%
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="p-3">
            <div className="space-y-2 text-sm">
              <p className="font-semibold">Progresso de Conformidade</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Conforme:</span>
                </div>
                <span className="font-medium">{stats.conforme}</span>
                
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  <span>Não Conforme:</span>
                </div>
                <span className="font-medium">{stats.naoConforme}</span>
                
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <span>Em Curso:</span>
                </div>
                <span className="font-medium">{stats.emCurso}</span>
                
                <div className="flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Por Avaliar:</span>
                </div>
                <span className="font-medium">{stats.naoAvaliado}</span>
              </div>
              <div className="pt-1 border-t">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-medium">{stats.total} requisitos</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Conformidade</span>
        <span className="font-medium">{stats.percentage}%</span>
      </div>
      <Progress value={stats.percentage} className="h-2" />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            {stats.conforme}
          </span>
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-red-500" />
            {stats.naoConforme}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-500" />
            {stats.emCurso}
          </span>
        </div>
        <span>{stats.total} requisitos</span>
      </div>
    </div>
  );
}
