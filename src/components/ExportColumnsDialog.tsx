import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Check, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ExportColumn {
  key: string;
  label: string;
  defaultSelected?: boolean;
}

interface ExportColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ExportColumn[];
  onExport: (selectedColumns: string[]) => void;
  title?: string;
  description?: string;
}

export function ExportColumnsDialog({
  open,
  onOpenChange,
  columns,
  onExport,
  title = "Exportar para Excel",
  description = "Selecione as colunas que pretende incluir na exportação."
}: ExportColumnsDialogProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // Initialize with default selected columns
  useEffect(() => {
    if (open) {
      const defaultSelected = columns
        .filter(col => col.defaultSelected !== false)
        .map(col => col.key);
      setSelectedColumns(defaultSelected);
    }
  }, [open, columns]);

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const selectAll = () => {
    setSelectedColumns(columns.map(col => col.key));
  };

  const deselectAll = () => {
    setSelectedColumns([]);
  };

  const handleExport = () => {
    onExport(selectedColumns);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedColumns.length} de {columns.length} colunas selecionadas
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">
                <Check className="h-3 w-3 mr-1" />
                Todas
              </Button>
              <Button variant="ghost" size="sm" onClick={deselectAll} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                Nenhuma
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[250px] rounded-md border p-3">
            <div className="space-y-3">
              {columns.map(column => (
                <div key={column.key} className="flex items-center space-x-3">
                  <Checkbox
                    id={column.key}
                    checked={selectedColumns.includes(column.key)}
                    onCheckedChange={() => toggleColumn(column.key)}
                  />
                  <Label
                    htmlFor={column.key}
                    className="text-sm font-normal cursor-pointer flex-1"
                  >
                    {column.label}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={selectedColumns.length === 0}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar ({selectedColumns.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
