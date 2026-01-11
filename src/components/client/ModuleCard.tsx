import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon, ArrowRight } from "lucide-react";

interface ModuleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  image?: string;
  count?: number;
  countLabel?: string;
  gradient?: string;
  isActive?: boolean;
}

export function ModuleCard({
  title,
  description,
  icon: Icon,
  href,
  image,
  count,
  countLabel,
  gradient = "from-primary/80 to-primary",
  isActive = false,
}: ModuleCardProps) {
  return (
    <Link to={href} className="group block">
      <Card className={cn(
        "relative overflow-hidden transition-all duration-300",
        "hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1",
        "border-0 bg-card",
        isActive && "ring-2 ring-primary"
      )}>
        {/* Background Image with Gradient Overlay */}
        <div className="relative h-32 sm:h-40 overflow-hidden">
          {image ? (
            <>
              <img 
                src={image} 
                alt={title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className={cn(
                "absolute inset-0 bg-gradient-to-t",
                gradient,
                "opacity-80 group-hover:opacity-70 transition-opacity"
              )} />
            </>
          ) : (
            <div className={cn(
              "absolute inset-0 bg-gradient-to-br",
              gradient
            )} />
          )}
          
          {/* Icon */}
          <div className="absolute top-4 left-4">
            <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
          
          {/* Count Badge */}
          {count !== undefined && count > 0 && (
            <div className="absolute top-4 right-4">
              <Badge variant="secondary" className="bg-white/90 text-foreground font-semibold shadow-sm">
                {count} {countLabel || ""}
              </Badge>
            </div>
          )}
          
          {/* Arrow indicator */}
          <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
            <div className="p-2 rounded-full bg-white/20 backdrop-blur-sm">
              <ArrowRight className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
        </div>
      </Card>
    </Link>
  );
}
