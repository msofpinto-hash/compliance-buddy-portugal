import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId?: string;
  defaultPeriod?: string;
}

type ParsedRow = Record<string, unknown>;

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toLocaleDateString("pt-PT");
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (typeof o.text === "string") return o.text;
    if (o.result !== undefined) return String(o.result);
    return "";
  }
  return String(v).trim();
};

const isMark = (v: unknown) => {
  const t = cellText(v).toLowerCase();
  return t === "x" || t === "sim" || t === "true" || t === "✓";
};

export function StandardsImportDialog({
  open,
  onOpenChange,
  organizationId,
  defaultPeriod,
}: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [period, setPeriod] = useState(defaultPeriod || "");
  const [periodDate, setPeriodDate] = useState("");
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    if (!organizationId || !file || !period.trim()) {
      toast.error("Escolha o ficheiro e indique o período.");
      return;
    }
    setBusy(true);
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("O ficheiro não tem folhas de cálculo.");

      const rows: ParsedRow[] = [];
      let lastType = "";
      let order = 0;

      ws.eachRow((row, rowNumber) => {
        const v = (i: number) => row.getCell(i).value;
        const type = cellText(v(1));
        const ref = cellText(v(2));
        const name = cellText(v(3));
        if (!ref && !name) return;
        // skip header rows
        if (
          rowNumber <= 6 &&
          /ref|documento|tipo/i.test(type + ref) &&
          /nome|documento/i.test(name)
        )
          return;
        if (type) lastType = type;
        order += 1;
        rows.push({
          organization_id: organizationId,
          reference_period: period.trim(),
          period_date: periodDate || null,
          document_type: type || lastType || null,
          document_ref: ref || null,
          document_name: name || null,
          publication_date: cellText(v(4)) || null,
          modification_date: cellText(v(5)) || null,
          issuer: cellText(v(6)) || null,
          impact_iso_14001: isMark(v(7)),
          impact_iso_45001: isMark(v(8)),
          applicability_informative: isMark(v(9)),
          applicability_direct: isMark(v(10)),
          applicability_indirect: isMark(v(11)),
          descriptive: cellText(v(12)) || null,
          actions: cellText(v(13)) || null,
          responsible: cellText(v(14)) || null,
          implementation_deadline: cellText(v(15)) || null,
          implementation_status: cellText(v(16)) || null,
          display_order: order,
        });
      });

      if (!rows.length) throw new Error("Não foram encontrados registos no ficheiro.");

      const { error: delError } = await supabase
        .from("standards_control")
        .delete()
        .eq("organization_id", organizationId)
        .eq("reference_period", period.trim());
      if (delError) throw delError;

      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase
          .from("standards_control")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(rows.slice(i, i + 200) as any);
        if (error) throw error;
      }

      toast.success(`${rows.length} registos importados para ${period.trim()}`);
      queryClient.invalidateQueries({ queryKey: ["standards-control"] });
      queryClient.invalidateQueries({ queryKey: ["standards-history"] });
      setFile(null);
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível importar o ficheiro",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Atualizar a partir de Excel
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Ficheiro Excel (.xlsx)</Label>
            <Input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Período (ex.: Junho 2026)</Label>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="Junho 2026"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data de referência (opcional)</Label>
            <Input
              type="date"
              value={periodDate}
              onChange={(e) => setPeriodDate(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Os registos existentes desse período são substituídos pelos do
            ficheiro. Todas as alterações ficam registadas no histórico.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
