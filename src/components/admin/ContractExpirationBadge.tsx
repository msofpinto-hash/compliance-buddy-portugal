import { differenceInDays, parseISO, format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Clock, XCircle, CheckCircle2 } from "lucide-react";

interface ContractExpirationBadgeProps {
  contractEndDate: string | null;
  compact?: boolean;
}

export function ContractExpirationBadge({ contractEndDate, compact = false }: ContractExpirationBadgeProps) {
  if (!contractEndDate) {
    return null;
  }

  const endDate = parseISO(contractEndDate);
  const today = new Date();
  const daysUntilExpiration = differenceInDays(endDate, today);

  let status: "expired" | "critical" | "warning" | "ok";
  let label: string;
  let bgClass: string;
  let Icon: typeof AlertTriangle;

  if (daysUntilExpiration < 0) {
    status = "expired";
    label = `Expirado há ${Math.abs(daysUntilExpiration)} dias`;
    bgClass = "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700";
    Icon = XCircle;
  } else if (daysUntilExpiration <= 7) {
    status = "critical";
    label = daysUntilExpiration === 0 ? "Expira hoje!" : `Expira em ${daysUntilExpiration} dias`;
    bgClass = "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700 animate-pulse";
    Icon = AlertTriangle;
  } else if (daysUntilExpiration <= 30) {
    status = "warning";
    label = `Expira em ${daysUntilExpiration} dias`;
    bgClass = "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700";
    Icon = Clock;
  } else {
    // More than 30 days - don't show anything unless we want to show a positive indicator
    if (compact) {
      return null; // Don't show badge if contract is OK in compact mode
    }
    status = "ok";
    label = `Válido até ${format(endDate, "dd/MM/yyyy", { locale: pt })}`;
    bgClass = "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700";
    Icon = CheckCircle2;
  }

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`${bgClass} text-xs gap-1 cursor-help`}>
              <Icon className="h-3 w-3" />
              {daysUntilExpiration < 0 ? "Expirado" : `${daysUntilExpiration}d`}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">
              Data fim: {format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: pt })}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Badge variant="outline" className={`${bgClass} text-xs gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
