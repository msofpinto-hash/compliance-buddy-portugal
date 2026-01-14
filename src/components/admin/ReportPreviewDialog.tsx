import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Download, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Building2,
  FileStack,
  ListChecks,
  TrendingUp,
  ChevronLeft,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ReportData, exportComplianceReportToPDF, exportExecutiveSummaryToPDF } from "@/lib/reportExport";

interface ReportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReportData | null;
  isLoading: boolean;
  onBack: () => void;
  isExecutive?: boolean;
}

export function ReportPreviewDialog({
  open,
  onOpenChange,
  data,
  isLoading,
  onBack,
  isExecutive = false,
}: ReportPreviewDialogProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!data) return;
    
    setIsExporting(true);
    try {
      if (isExecutive) {
        await exportExecutiveSummaryToPDF(data);
      } else {
        await exportComplianceReportToPDF(data);
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

  const getComplianceColor = (rate: number) => {
    if (rate >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (rate >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getComplianceBg = (rate: number) => {
    if (rate >= 80) return "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700";
    if (rate >= 50) return "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700";
    return "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                {isExecutive ? (
                  <Zap className="h-5 w-5 text-amber-500" />
                ) : (
                  <FileText className="h-5 w-5 text-emerald-600" />
                )}
                {isExecutive ? "Relatório Executivo" : "Pré-visualização do Relatório"}
                {isExecutive && (
                  <Badge className="ml-2 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                    1 Página
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {isExecutive 
                  ? "Resumo executivo ideal para apresentações rápidas"
                  : "Verifique como o relatório ficará antes de exportar"
                }
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(90vh-180px)]">
          <div className="p-6 pt-4">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <Skeleton className="h-32 w-full rounded-xl" />
                  <div className="grid grid-cols-5 gap-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-20 rounded-lg" />
                    ))}
                  </div>
                  <Skeleton className="h-48 w-full rounded-xl" />
                </motion.div>
              ) : data ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Cover Preview */}
                  <div className={`relative rounded-xl overflow-hidden border ${
                    isExecutive 
                      ? "bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-slate-800 dark:via-slate-900 dark:to-amber-950" 
                      : "bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-800 dark:via-slate-900 dark:to-emerald-950"
                  }`}>
                    {/* Header bar */}
                    <div className={`h-12 flex items-center justify-between px-4 ${
                      isExecutive 
                        ? "bg-gradient-to-r from-amber-500 to-orange-500" 
                        : "bg-gradient-to-r from-emerald-500 to-teal-500"
                    }`}>
                      {isExecutive && (
                        <Badge className="bg-white/20 text-white border-white/30">
                          <Zap className="h-3 w-3 mr-1" />
                          1 Página
                        </Badge>
                      )}
                    </div>
                    
                    <div className="p-6">
                      <div className="flex items-start gap-4">
                        {data.organization.logoUrl && (
                          <img 
                            src={data.organization.logoUrl} 
                            alt="Logo" 
                            className="w-16 h-16 object-contain rounded-lg bg-white p-1"
                          />
                        )}
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground">
                            {isExecutive ? "Resumo Executivo" : "Relatório de"}
                          </p>
                          <h2 className={`text-2xl font-bold ${
                            isExecutive 
                              ? "text-amber-700 dark:text-amber-400" 
                              : "text-emerald-700 dark:text-emerald-400"
                          }`}>
                            Conformidade Legal
                          </h2>
                          <div className="flex items-center gap-2 mt-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{data.organization.name}</span>
                          </div>
                        </div>
                        
                        {/* Compliance Rate Circle */}
                        <div className={`w-24 h-24 rounded-full flex flex-col items-center justify-center border-2 ${getComplianceBg(data.stats.complianceRate)}`}>
                          <span className={`text-2xl font-bold ${getComplianceColor(data.stats.complianceRate)}`}>
                            {data.stats.complianceRate}%
                          </span>
                          <span className="text-xs text-muted-foreground">Conformidade</span>
                        </div>
                      </div>
                      
                      {/* Date */}
                      <div className="mt-4 inline-block px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-muted-foreground">Data do Relatório</p>
                        <p className="text-sm font-medium">
                          {new Date().toLocaleDateString("pt-PT", { 
                            day: "2-digit", 
                            month: "long", 
                            year: "numeric"
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-5 gap-3">
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-center"
                    >
                      <FileStack className="h-5 w-5 mx-auto text-emerald-600 dark:text-emerald-400 mb-1" />
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{data.stats.totalLegislation}</p>
                      <p className="text-xs text-muted-foreground">Diplomas</p>
                    </motion.div>
                    
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="p-4 rounded-xl bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 text-center"
                    >
                      <ListChecks className="h-5 w-5 mx-auto text-teal-600 dark:text-teal-400 mb-1" />
                      <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{data.stats.totalRequirements}</p>
                      <p className="text-xs text-muted-foreground">Requisitos</p>
                    </motion.div>
                    
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="p-4 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-center"
                    >
                      <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 dark:text-green-400 mb-1" />
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300">{data.stats.conforme}</p>
                      <p className="text-xs text-muted-foreground">Conforme</p>
                    </motion.div>
                    
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                      className="p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-center"
                    >
                      <XCircle className="h-5 w-5 mx-auto text-red-600 dark:text-red-400 mb-1" />
                      <p className="text-2xl font-bold text-red-700 dark:text-red-300">{data.stats.naoConforme}</p>
                      <p className="text-xs text-muted-foreground">Não Conforme</p>
                    </motion.div>
                    
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-center"
                    >
                      <Clock className="h-5 w-5 mx-auto text-amber-600 dark:text-amber-400 mb-1" />
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{data.stats.emCurso}</p>
                      <p className="text-xs text-muted-foreground">Em Avaliação</p>
                    </motion.div>
                  </div>

                  {/* Action Plans Preview */}
                  {data.actionPlans.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 }}
                      className="rounded-xl border p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                          Planos de Ação
                        </h3>
                        <Badge variant="secondary">{data.actionPlans.length} ações</Badge>
                      </div>
                      <div className="space-y-2">
                        {data.actionPlans.slice(0, 3).map((plan, index) => (
                          <div key={plan.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <span className="text-sm truncate flex-1">{plan.title}</span>
                            <Badge 
                              variant="outline" 
                              className={
                                plan.status === "concluido" || plan.status === "completed" 
                                  ? "text-green-600 border-green-300" 
                                  : plan.status === "em_curso" || plan.status === "in_progress"
                                  ? "text-amber-600 border-amber-300"
                                  : "text-slate-600 border-slate-300"
                              }
                            >
                              {plan.status === "concluido" || plan.status === "completed" ? "Concluída" :
                               plan.status === "em_curso" || plan.status === "in_progress" ? "Em Curso" : "Pendente"}
                            </Badge>
                          </div>
                        ))}
                        {data.actionPlans.length > 3 && (
                          <p className="text-xs text-muted-foreground text-center pt-1">
                            + {data.actionPlans.length - 3} ações adicionais
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* Requirements Preview */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="rounded-xl border p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <ListChecks className="h-4 w-4 text-emerald-600" />
                        Requisitos por Diploma
                      </h3>
                      <Badge variant="secondary">{data.legislation.length} diplomas</Badge>
                    </div>
                    <div className="space-y-2">
                      {data.legislation.slice(0, 4).map((leg, index) => (
                        <div key={leg.id} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 truncate">
                              {leg.number}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{leg.title}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 ml-2">
                            {leg.requirementsCount} req.
                          </Badge>
                        </div>
                      ))}
                      {data.legislation.length > 4 && (
                        <p className="text-xs text-muted-foreground text-center pt-1">
                          + {data.legislation.length - 4} diplomas adicionais
                        </p>
                      )}
                    </div>
                  </motion.div>

                  {/* PDF Note */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      O PDF gerado incluirá todos os dados detalhados com formatação profissional, 
                      incluindo cabeçalhos, rodapés e paginação automática.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Não foi possível carregar os dados</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        <div className="p-6 pt-0 border-t mt-4">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleExport} 
              disabled={isExporting || !data}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A exportar...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Exportar PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
