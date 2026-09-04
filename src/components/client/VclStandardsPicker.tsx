import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ExternalLink } from "lucide-react";

type StandardRow = {
  id: string;
  reference_period: string;
  period_date: string | null;
  document_type: string | null;
  document_ref: string | null;
  document_name: string | null;
  implementation_status: string | null;
  applicability_informative: boolean;
  document_url: string | null;
};

type LinkRow = { id: string; standard_id: string };

interface Props {
  auditId: string;
  organizationId: string;
  /** data de referência da VCL (executed_at || audit_date) */
  referenceDate: string;
  canEdit: boolean;
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function statusBadge(s: StandardRow) {
  if (s.applicability_informative) return null;
  const st = (s.implementation_status || "").toLowerCase();
  if (st.includes("implementad"))
    return (
      <Badge className="bg-green-600 text-white border-0 text-[10px] shrink-0">
        Implementado
      </Badge>
    );
  if (st.includes("curso"))
    return (
      <Badge className="bg-amber-500 text-white border-0 text-[10px] shrink-0">
        Em curso
      </Badge>
    );
  return (
    <Badge className="bg-red-600 text-white border-0 text-[10px] shrink-0">
      Por analisar
    </Badge>
  );
}

/** Seleção de normas/despachos/notas técnicas do mês associadas à VCL. */
export function VclStandardsPicker({
  auditId,
  organizationId,
  referenceDate,
  canEdit,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyPeriod, setOnlyPeriod] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const ref = new Date(referenceDate);
  const year = ref.getFullYear();
  const month = ref.getMonth(); // 0-based
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const periodName = `${MESES[month]} de ${year}`;

  const { data: rows, isLoading } = useQuery({
    queryKey: ["vcl-standards", organizationId],
    queryFn: async () => {
      const out: StandardRow[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("standards_control")
          .select(
            "id, reference_period, period_date, document_type, document_ref, document_name, implementation_status, applicability_informative, document_url",
          )
          .eq("organization_id", organizationId)
          .order("period_date", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        out.push(...((data || []) as StandardRow[]));
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      // manter apenas a versão mais recente de cada documento
      const seen = new Set<string>();
      return out.filter((r) => {
        const key = `${(r.document_ref || "").toLowerCase()}|${(r.document_name || "").toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    enabled: !!organizationId,
  });

  const { data: links } = useQuery({
    queryKey: ["vcl-standards-links", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standards_control_audits")
        .select("id, standard_id")
        .eq("audit_id", auditId);
      if (error) throw error;
      return (data || []) as LinkRow[];
    },
    enabled: !!auditId,
  });

  const linkedIds = useMemo(
    () => new Set((links || []).map((l) => l.standard_id)),
    [links],
  );

  const filtered = useMemo(() => {
    return (rows || []).filter((r) => {
      if (onlyPeriod) {
        const inPeriod =
          (r.period_date && r.period_date.startsWith(monthPrefix)) ||
          (r.reference_period || "").toLowerCase().includes(MESES[month]);
        if (!inPeriod) return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (r.document_ref || "").toLowerCase().includes(q) ||
        (r.document_name || "").toLowerCase().includes(q) ||
        (r.document_type || "").toLowerCase().includes(q)
      );
    });
  }, [rows, onlyPeriod, search, monthPrefix, month]);

  const toggle = async (standardId: string, checked: boolean) => {
    setPending(standardId);
    try {
      if (checked) {
        const { error } = await supabase
          .from("standards_control_audits")
          .insert({
            standard_id: standardId,
            audit_id: auditId,
            link_source: "vcl_report",
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("standards_control_audits")
          .delete()
          .eq("standard_id", standardId)
          .eq("audit_id", auditId);
        if (error) throw error;
      }
      queryClient.invalidateQueries({
        queryKey: ["vcl-standards-links", auditId],
      });
      queryClient.invalidateQueries({ queryKey: ["standards-audit-links"] });
    } catch (e: any) {
      toast({
        title: "Não foi possível atualizar a associação",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label>
          Normas, despachos e notas técnicas do mês{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({linkedIds.size} associados)
          </span>
        </Label>
        <Button
          size="sm"
          variant={onlyPeriod ? "default" : "outline"}
          className="h-7 text-[11px]"
          onClick={() => setOnlyPeriod((v) => !v)}
        >
          {onlyPeriod ? `Só ${periodName}` : "Todos os períodos"}
        </Button>
      </div>
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Procurar por referência, nome ou tipo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
        {isLoading && (
          <p className="text-xs text-muted-foreground p-3 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
          </p>
        )}
        {!isLoading && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground p-3">
            Sem normas registadas em {periodName}. Desligue o filtro do mês para
            ver todos os períodos.
          </p>
        )}
        {filtered.slice(0, 300).map((r) => {
          const checked = linkedIds.has(r.id);
          return (
            <label
              key={r.id}
              className="flex items-start gap-2 p-2.5 text-xs cursor-pointer hover:bg-muted/50"
            >
              <Checkbox
                checked={checked}
                disabled={!canEdit || pending === r.id}
                onCheckedChange={(v) => toggle(r.id, !!v)}
              />
              <span className="flex-1">
                <span className="font-medium">
                  {r.document_ref || "—"}
                </span>{" "}
                <span className="text-muted-foreground">
                  {r.document_name || ""}
                </span>
                {r.document_type && (
                  <span className="block text-[10px] text-muted-foreground">
                    {r.document_type} · {r.reference_period}
                  </span>
                )}
              </span>
              {statusBadge(r)}
              {r.document_url && (
                <a
                  href={r.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline shrink-0"
                  aria-label="Abrir documento"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
