import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";

interface ExportMetadataIssuesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportMetadataIssuesDialog({ open, onOpenChange }: ExportMetadataIssuesDialogProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Fetch all PT legislation with metadata issues
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, summary, publication_date, effective_date, document_url")
        .eq("origin", "PT")
        .or(
          "publication_date.is.null,effective_date.is.null," +
          "summary.is.null"
        )
        .order("number");

      if (error) throw error;

      // Filter and categorize issues
      const issues = (data || []).filter(leg => {
        const hasMissingDates = !leg.publication_date || !leg.effective_date;
        const hasGenericTitle = leg.title === leg.number || 
          (leg.title.length <= 30 && !leg.title.includes(", de "));
        const hasShortSummary = !leg.summary || leg.summary.trim().length < 20;
        return hasMissingDates || hasGenericTitle || hasShortSummary;
      }).map(leg => {
        const problems: string[] = [];
        if (!leg.publication_date || !leg.effective_date) problems.push("Datas");
        if (leg.title === leg.number || (leg.title.length <= 30 && !leg.title.includes(", de "))) problems.push("Título");
        if (!leg.summary || leg.summary.trim().length < 20) problems.push("Sumário");
        return { ...leg, problems };
      });

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "ID Compliance";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Diplomas para Correção");

      // Define columns
      worksheet.columns = [
        { header: "Problema", key: "problema", width: 15 },
        { header: "Número", key: "numero", width: 40 },
        { header: "Título", key: "titulo", width: 60 },
        { header: "Sumário", key: "sumario", width: 80 },
        { header: "Data Publicação", key: "data_pub", width: 15 },
        { header: "Data Eficácia", key: "data_eff", width: 15 },
        { header: "Link DRE", key: "url", width: 60 },
        { header: "ID", key: "id", width: 40 },
      ];

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A5F" },
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

      // Add data rows
      issues.forEach(leg => {
        const row = worksheet.addRow({
          problema: leg.problems.join(", "),
          numero: leg.number,
          titulo: leg.title,
          sumario: leg.summary || "(sem sumário)",
          data_pub: leg.publication_date || "(em falta)",
          data_eff: leg.effective_date || "(em falta)",
          url: leg.document_url || "",
          id: leg.id,
        });

        // Make URL clickable
        if (leg.document_url) {
          row.getCell("url").value = {
            text: leg.document_url,
            hyperlink: leg.document_url,
          };
          row.getCell("url").font = { color: { argb: "FF0066CC" }, underline: true };
        }

        // Color code by problem type
        if (leg.problems.includes("Datas")) {
          row.getCell("problema").fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFD700" },
          };
        } else if (leg.problems.includes("Título")) {
          row.getCell("problema").fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFA500" },
          };
        } else {
          row.getCell("problema").fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF87CEEB" },
          };
        }
      });

      // Auto-filter
      worksheet.autoFilter = {
        from: "A1",
        to: `H${issues.length + 1}`,
      };

      // Generate and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `diplomas-correcao-manual-${new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exportados ${issues.length} diplomas para Excel`);
      onOpenChange(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Erro ao exportar lista");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Exportar Lista de Correções
          </DialogTitle>
          <DialogDescription>
            Exporta todos os diplomas PT com problemas de metadados para um ficheiro Excel com links diretos ao DRE.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-yellow-400" />
              <span>Datas em falta</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-orange-400" />
              <span>Títulos genéricos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-sky-300" />
              <span>Sumários curtos</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            O ficheiro inclui links clicáveis para aceder diretamente à página de cada diploma no DRE.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                A exportar...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
