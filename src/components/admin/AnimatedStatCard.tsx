import { Card, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { useCountAnimation } from "@/hooks/useCountAnimation";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface AnimatedStatCardProps {
  label: string;
  value: number;
  icon?: LucideIcon;
  iconClassName?: string;
  titleClassName?: string;
  className?: string;
  isActive?: boolean;
  activeRingColor?: string;
  onClick?: () => void;
}

export function AnimatedStatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  titleClassName,
  className,
  isActive,
  activeRingColor = "ring-primary",
  onClick,
}: AnimatedStatCardProps) {
  const animatedValue = useCountAnimation(value);

  return (
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
        </CardDescription>
        <CardTitle className={cn("text-3xl tabular-nums", titleClassName)}>
          {animatedValue}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
