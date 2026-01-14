import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, FileSpreadsheet, FileText, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  fetchReportData,
  exportLegislationToExcel,
  exportRequirementsToExcel,
  exportActionPlansToExcel,
  exportFullReportToExcel,
  exportLegislationToPDF,
  exportRequirementsToPDF,
  exportComplianceReportToPDF,
  ReportData,
} from "@/lib/reportExport";
import { ReportPreviewDialog } from "./ReportPreviewDialog";

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
}

type ReportType = "compliance" | "legislation" | "requirements" | "action-plans";
type ExportFormat = "excel" | "pdf";

const reportTypes = [
  { value: "compliance", label: "Relatório de Conformidade", description: "Resumo completo com diplomas, requisitos e planos de ação" },
  { value: "legislation", label: "Lista de Legislação", description: "Diplomas aplicáveis à organização" },
  { value: "requirements", label: "Lista de Requisitos", description: "Requisitos legais com estados de conformidade" },
  { value: "action-plans", label: "Planos de Ação", description: "Ações corretivas e seu estado" },
];

export function ExportReportDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
}: ExportReportDialogProps) {
  const [reportType, setReportType] = useState<ReportType>("compliance");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<ReportData | null>(null);

  const handlePreview = async () => {
    if (reportType !== "compliance" || exportFormat !== "pdf") {
      // Only compliance PDF supports preview, proceed with direct export for others
      handleExport();
      return;
    }

    setIsLoadingPreview(true);
    setShowPreview(true);
    try {
      const data = await fetchReportData(organizationId);
      setPreviewData(data);
    } catch (error) {
      console.error("Error loading preview data:", error);
      toast.error("Erro ao carregar pré-visualização");
      setShowPreview(false);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await fetchReportData(organizationId);

      if (exportFormat === "excel") {
        switch (reportType) {
          case "compliance":
            exportFullReportToExcel(data);
            break;
          case "legislation":
            exportLegislationToExcel(data);
            break;
          case "requirements":
            exportRequirementsToExcel(data);
            break;
          case "action-plans":
            exportActionPlansToExcel(data);
            break;
        }
      } else {
        switch (reportType) {
          case "compliance":
            await exportComplianceReportToPDF(data);
            break;
          case "legislation":
            await exportLegislationToPDF(data);
            break;
          case "requirements":
            await exportRequirementsToPDF(data);
            break;
          case "action-plans":
            // Action plans use Excel format as default
            exportActionPlansToExcel(data);
            toast.info("Planos de ação exportados em Excel (formato mais adequado para dados tabulares)");
            break;
        }
      }

      toast.success("Relatório exportado com sucesso!");
      onOpenChange(false);
    } catch (error) {
      console.error("Error exporting report:", error);
      toast.error("Erro ao exportar relatório");
    } finally {
      setIsExporting(false);
    }
  };

  const handleBackFromPreview = () => {
    setShowPreview(false);
    setPreviewData(null);
  };

  const canPreview = reportType === "compliance" && exportFormat === "pdf";

  return (
    <>
      <Dialog open={open && !showPreview} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Exportar Relatório</DialogTitle>
            <DialogDescription>
              Exportar dados de <strong>{organizationName}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Report Type Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tipo de Relatório</Label>
              <RadioGroup
                value={reportType}
                onValueChange={(value) => setReportType(value as ReportType)}
                className="grid gap-2"
              >
                {reportTypes.map((type) => (
                  <div key={type.value} className="flex items-start space-x-3">
                    <RadioGroupItem value={type.value} id={type.value} className="mt-1" />
                    <div className="grid gap-0.5">
                      <Label htmlFor={type.value} className="font-medium cursor-pointer">
                        {type.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{type.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Format Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Formato</Label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={exportFormat === "pdf" ? "default" : "outline"}
                  className="flex-1 gap-2"
                  onClick={() => setExportFormat("pdf")}
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </Button>
                <Button
                  type="button"
                  variant={exportFormat === "excel" ? "default" : "outline"}
                  className="flex-1 gap-2"
                  onClick={() => setExportFormat("excel")}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {exportFormat === "pdf" 
                  ? "PDF é ideal para relatórios visuais e impressão"
                  : "Excel é ideal para análise de dados e filtros"
                }
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {canPreview ? (
              <Button 
                onClick={handlePreview} 
                disabled={isExporting || isLoadingPreview}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {isLoadingPreview ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A carregar...
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    Pré-visualizar
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleExport} disabled={isExporting} className="gap-2">
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A exportar...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Exportar
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <ReportPreviewDialog
        open={showPreview}
        onOpenChange={(open) => {
          if (!open) {
            handleBackFromPreview();
          }
        }}
        data={previewData}
        isLoading={isLoadingPreview}
        onBack={handleBackFromPreview}
      />
    </>
  );
}
