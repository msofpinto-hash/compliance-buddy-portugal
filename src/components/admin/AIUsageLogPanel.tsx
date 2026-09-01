import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Sparkles, ShieldCheck, UserCheck, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

const OPERATION_LABELS: Record<string, string> = {
  suggest_categories: "Sugestão de categorias",
  bulk_suggest_categories: "Sugestão de categorias (lote)",
  extract_requirements: "Extração de requisitos",
  fix_metadata: "Correção de metadados",
  detect_relations: "Deteção de relações",
};

export function AIUsageLogPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-usage-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_usage_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const total = data?.length ?? 0;
  const validated = data?.filter((r) => r.human_validated).length ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Conformidade com o Regulamento de IA (UE) 2024/1689
          </CardTitle>
          <CardDescription>
            Registo auditável das operações de inteligência artificial executadas na plataforma.
            Todas as sugestões carecem de validação humana.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Operações registadas</p>
            <p className="font-heading text-2xl font-bold">{total}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">Validadas por humano</p>
            <p className="font-heading text-2xl font-bold text-primary">{validated}</p>
          </div>
          <Button variant="outline" asChild className="ml-auto">
            <Link to="/politica-ia" target="_blank" rel="noopener noreferrer">
              Política de IA
              <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico recente</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ainda não existem operações de IA registadas.
            </p>
          ) : (
            <ScrollArea className="h-[520px] pr-4">
              <ul className="space-y-2">
                {data!.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-terracotta" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {OPERATION_LABELS[row.operation] ?? row.operation}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.output_summary || row.input_summary || "—"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {row.model ?? "—"}
                    </Badge>
                    {row.human_validated ? (
                      <Badge className="gap-1 bg-primary text-primary-foreground text-xs">
                        <UserCheck className="h-3 w-3" aria-hidden="true" />
                        Validado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Sugestão
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(row.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
