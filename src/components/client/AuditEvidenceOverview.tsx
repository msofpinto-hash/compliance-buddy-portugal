import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  FileText,
  Paperclip,
} from "lucide-react";
import { useState } from "react";

interface Props {
  organizationId: string;
}

interface AuditRow {
  id: string;
  title: string;
  audit_date: string | null;
  audit_type: string | null;
  status: string;
  docs: { id: string; name: string }[];
}

/** Lists each audit with the evidence already attached, highlighting what is still missing. */
export function AuditEvidenceOverview({ organizationId }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-evidence-overview", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data: audits, error } = await supabase
        .from("audits")
        .select("id, title, audit_date, audit_type, status")
        .eq("organization_id", organizationId)
        .order("audit_date", { ascending: false });
      if (error) throw error;

      const ids = (audits || []).map((a) => a.id);
      if (ids.length === 0) return [] as AuditRow[];

      const { data: links } = await supabase
        .from("audit_documents")
        .select("audit_id, documents ( id, name )")
        .in("audit_id", ids);

      return (audits || []).map((a) => ({
        ...a,
        docs: (links || [])
          .filter((l: any) => l.audit_id === a.id && l.documents)
          .map((l: any) => l.documents),
      })) as AuditRow[];
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.length === 0) return null;

  const withDocs = data.filter((a) => a.docs.length > 0).length;
  const pct = Math.round((withDocs / data.length) * 100);

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">Evidências por auditoria</CardTitle>
            <p className="text-xs text-muted-foreground">
              Documentos já associados a cada auditoria e o que ainda falta
            </p>
          </div>
          <div className="min-w-[160px]">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Cobertura</span>
              <span className="font-semibold text-primary">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {data.map((a) => {
          const missing = a.docs.length === 0;
          return (
            <Collapsible
              key={a.id}
              open={open === a.id}
              onOpenChange={() => setOpen(open === a.id ? null : a.id)}
            >
              <div
                className={`rounded-lg border p-3 transition-colors ${
                  missing ? "border-amber-300/70 bg-amber-50/50" : "bg-muted/20"
                }`}
              >
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center gap-3 text-left">
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        open === a.id ? "" : "-rotate-90"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.audit_date
                          ? format(new Date(a.audit_date), "d MMM yyyy", {
                              locale: pt,
                            })
                          : "Sem data"}
                        {a.audit_type ? ` • ${a.audit_type}` : ""}
                      </p>
                    </div>
                    {missing ? (
                      <Badge className="gap-1 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">
                        <AlertTriangle className="h-3 w-3" /> Sem evidências
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Paperclip className="h-3 w-3" /> {a.docs.length}
                      </Badge>
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 space-y-1 border-t pt-3">
                    {missing ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhum documento associado a esta auditoria.
                      </p>
                    ) : (
                      a.docs.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <FileText className="h-3.5 w-3.5 text-primary" />
                          <span className="truncate">{d.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default AuditEvidenceOverview;
