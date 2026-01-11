import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Calendar, User, FileText, Target, Users, CheckCircle2 } from "lucide-react";

interface AuditPlanDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: {
    id: string;
    title: string;
    description?: string | null;
    auditor?: string | null;
    audit_date?: string | null;
    status?: string | null;
    methodology?: string | null;
    interlocutors?: string | null;
    executive_summary?: string | null;
    strengths?: string | null;
    weaknesses?: string | null;
    plan_approved_at?: string | null;
  } | null;
}

export function AuditPlanDetailsDialog({
  open,
  onOpenChange,
  audit,
}: AuditPlanDetailsDialogProps) {
  if (!audit) return null;

  const sections = [
    {
      title: "Resumo Executivo",
      content: audit.executive_summary,
      icon: FileText,
    },
    {
      title: "Metodologia",
      content: audit.methodology,
      icon: Target,
    },
    {
      title: "Interlocutores",
      content: audit.interlocutors,
      icon: Users,
    },
    {
      title: "Pontos Fortes",
      content: audit.strengths,
      icon: CheckCircle2,
      className: "text-green-600",
    },
    {
      title: "Pontos a Melhorar",
      content: audit.weaknesses,
      icon: CheckCircle2,
      className: "text-orange-600",
    },
  ].filter((s) => s.content);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">{audit.title}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(85vh-120px)] pr-4">
          <div className="space-y-6">
            {/* Status and metadata */}
            <div className="flex flex-wrap gap-4 text-sm">
              <Badge 
                variant="outline" 
                className={`gap-1 ${
                  audit.status === "in_progress" 
                    ? "bg-yellow-500 text-white border-0" 
                    : audit.status === "planned"
                    ? "bg-blue-500 text-white border-0"
                    : "bg-gray-500 text-white border-0"
                }`}
              >
                {audit.status === "in_progress" ? "Em Curso" : 
                 audit.status === "planned" ? "Planeada" : audit.status}
              </Badge>
              
              {audit.plan_approved_at && (
                <Badge variant="outline" className="gap-1 bg-green-500 text-white border-0">
                  <CheckCircle2 className="h-3 w-3" />
                  Plano Aprovado
                </Badge>
              )}
            </div>

            {/* Basic info */}
            <div className="grid gap-4 sm:grid-cols-2">
              {audit.audit_date && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Data prevista:</span>
                  <span className="font-medium">
                    {format(new Date(audit.audit_date), "d 'de' MMMM 'de' yyyy", { locale: pt })}
                  </span>
                </div>
              )}
              {audit.auditor && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Auditor:</span>
                  <span className="font-medium">{audit.auditor}</span>
                </div>
              )}
            </div>

            {/* Description */}
            {audit.description && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Descrição / Âmbito
                </h3>
                <p className="text-sm whitespace-pre-wrap">{audit.description}</p>
              </div>
            )}

            <Separator />

            {/* Detailed sections */}
            {sections.length > 0 ? (
              <div className="space-y-6">
                {sections.map((section, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <section.icon className={`h-4 w-4 ${section.className || "text-primary"}`} />
                      <h3 className="font-semibold text-sm uppercase tracking-wide">
                        {section.title}
                      </h3>
                    </div>
                    <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md">
                      {section.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Detalhes adicionais ainda não disponíveis</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
