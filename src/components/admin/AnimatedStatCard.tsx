import { Card, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCountAnimation } from "@/hooks/useCountAnimation";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import { ReactNode } from "react";

interface AnimatedStatCardProps {
  label: string;
  value: number;
  previousValue?: number;
  icon?: LucideIcon;
  iconClassName?: string;
  titleClassName?: string;
  className?: string;
  isActive?: boolean;
  activeRingColor?: string;
  onClick?: () => void;
  tooltip?: ReactNode;
}

export function AnimatedStatCard({
  label,
  value,
  previousValue,
  icon: Icon,
  iconClassName,
  titleClassName,
  className,
  isActive,
  activeRingColor = "ring-primary",
  onClick,
  tooltip,
}: AnimatedStatCardProps) {
  const animatedValue = useCountAnimation(value);

  // Calculate percentage change
  const percentChange = previousValue !== undefined && previousValue > 0
    ? ((value - previousValue) / previousValue) * 100
    : previousValue === 0 && value > 0
      ? 100
      : 0;
  
  const showVariation = previousValue !== undefined;
  const isPositive = percentChange > 0;
  const isNegative = percentChange < 0;
  const isNeutral = percentChange === 0;

  const cardContent = (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]",
        className,
        isActive && `ring-2 ${activeRingColor}`
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1">
          {Icon && <Icon className={cn("h-3 w-3", iconClassName)} />}
          {label}
          {tooltip && <HelpCircle className="h-3 w-3 text-muted-foreground/50" />}
        </CardDescription>
        <div className="flex items-end gap-2">
          <CardTitle className={cn("text-3xl tabular-nums", titleClassName)}>
            {animatedValue}
          </CardTitle>
          {showVariation && (
            <div className={cn(
              "flex items-center gap-0.5 text-xs font-medium pb-1",
              isPositive && "text-green-600",
              isNegative && "text-red-600",
              isNeutral && "text-muted-foreground"
            )}>
              {isPositive && <TrendingUp className="h-3 w-3" />}
              {isNegative && <TrendingDown className="h-3 w-3" />}
              {isNeutral && <Minus className="h-3 w-3" />}
              <span>
                {isPositive && "+"}
                {percentChange.toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      </CardHeader>
    </Card>
  );

  if (!tooltip) {
    return cardContent;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
