import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, History } from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  reference_period: "Período",
  period_date: "Data do período",
  document_type: "Tipo de documento",
  document_ref: "Refª documento",
  document_name: "Nome do documento",
  publication_date: "Data de publicação",
  modification_date: "Data de modificação",
  issuer: "Emissor",
  impact_iso_14001: "ISO 14001",
  impact_iso_45001: "ISO 45001",
  applicability_informative: "Informativo",
  applicability_direct: "Aplicabilidade direta",
  applicability_indirect: "Aplicabilidade indireta",
  descriptive: "Descritivo",
  actions: "Ações a implementar",
  responsible: "Responsável",
  implementation_deadline: "Prazo de implementação",
  implementation_status: "Estado de implementação",
  display_order: "Ordem",
};

type Change = { field: string; old: unknown; new: unknown };

type HistoryRow = {
  id: string;
  standard_id: string | null;
  action: string;
  document_ref: string | null;
  document_name: string | null;
  changed_by_name: string | null;
  changes: Change[] | null;
  created_at: string;
};

const showValue = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "(vazio)";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v);
};

const ACTION_LABEL: Record<string, string> = {
  insert: "Criado",
  update: "Editado",
  delete: "Eliminado",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId?: string;
  standardId?: string | null;
}

export function StandardsHistoryDialog({
  open,
  onOpenChange,
  organizationId,
  standardId,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["standards-history", organizationId, standardId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("standards_control_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (standardId) q = q.eq("standard_id", standardId);
      else if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as HistoryRow[];
    },
    enabled: open && (!!organizationId || !!standardId),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico de alterações
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.length ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Ainda não existem alterações registadas.
          </p>
        ) : (
          <div className="space-y-3">
            {data.map((h) => (
              <div key={h.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-[10px]">
                    {ACTION_LABEL[h.action] || h.action}
                  </Badge>
                  <span className="font-medium">
                    {h.document_ref || h.document_name || "Registo"}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {h.changed_by_name || "Sistema"} ·{" "}
                    {new Date(h.created_at).toLocaleString("pt-PT")}
                  </span>
                </div>
                {!!h.changes?.length && (
                  <ul className="space-y-1 text-xs">
                    {h.changes.map((c, i) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {FIELD_LABELS[c.field] || c.field}:
                        </span>{" "}
                        <span className="line-through">{showValue(c.old)}</span>{" "}
                        → <span className="text-foreground">{showValue(c.new)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
