import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, X } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface DateRangeFilterProps {
  startDate: string | null;
  endDate: string | null;
  onStartDateChange: (date: string | null) => void;
  onEndDateChange: (date: string | null) => void;
  label?: string;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  label = "Período"
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasFilter = startDate || endDate;

  const clearFilter = () => {
    onStartDateChange(null);
    onEndDateChange(null);
  };

  const formatDisplayDate = (date: string | null) => {
    if (!date) return null;
    try {
      return format(new Date(date), "d MMM yyyy", { locale: pt });
    } catch {
      return date;
    }
  };

  const getButtonLabel = () => {
    if (!startDate && !endDate) return label;
    if (startDate && endDate) {
      return `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
    }
    if (startDate) return `Desde ${formatDisplayDate(startDate)}`;
    if (endDate) return `Até ${formatDisplayDate(endDate)}`;
    return label;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={hasFilter ? "default" : "outline"}
          size="sm"
          className="gap-2"
        >
          <Calendar className="h-4 w-4" />
          <span className="max-w-[200px] truncate">{getButtonLabel()}</span>
          {hasFilter && (
            <X
              className="h-3 w-3 ml-1 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                clearFilter();
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-4">
          <div className="font-medium text-sm">Filtrar por período</div>
          
          <div className="space-y-2">
            <Label htmlFor="start-date" className="text-xs">Data inicial</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate || ""}
              onChange={(e) => onStartDateChange(e.target.value || null)}
              className="h-9"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="end-date" className="text-xs">Data final</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate || ""}
              onChange={(e) => onEndDateChange(e.target.value || null)}
              className="h-9"
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                clearFilter();
                setIsOpen(false);
              }}
            >
              Limpar
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => setIsOpen(false)}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
