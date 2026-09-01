import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AIBadgeProps {
  className?: string;
  label?: string;
}

/**
 * Transparência de IA (Regulamento (UE) 2024/1689, art.º 50).
 * Identifica conteúdo gerado ou sugerido por sistemas de IA.
 */
export function AIBadge({ className, label = "Sugerido por IA" }: AIBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "gap-1 border-terracotta/40 bg-terracotta/10 text-terracotta font-medium",
            className
          )}
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        Conteúdo gerado por inteligência artificial. Requer validação humana antes de ser
        considerado definitivo (Regulamento (UE) 2024/1689, art.º 50).
      </TooltipContent>
    </Tooltip>
  );
}

export function AIDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <Sparkles className="mr-1 inline h-3 w-3 text-terracotta" aria-hidden="true" />
      Sugestões geradas por IA — <strong>requerem validação humana</strong>. A decisão final é
      sempre do técnico responsável.
    </p>
  );
}
