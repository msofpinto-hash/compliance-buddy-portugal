import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SlidersHorizontal, Calendar as CalendarIcon, X, Search } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AdvancedSearchDialogProps {
  // Search
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  // Source
  selectedSource: string;
  onSourceChange: (value: string) => void;
  // Applicability
  selectedApplicability: string;
  onApplicabilityChange: (value: string) => void;
  applicabilityOptions: { value: string; label: string }[];
  showApplicability: boolean;
  // Date range
  startDate: string | null;
  endDate: string | null;
  onStartDateChange: (value: string | null) => void;
  onEndDateChange: (value: string | null) => void;
  // Actions
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

export function AdvancedSearchDialog({
  searchTerm,
  onSearchTermChange,
  selectedSource,
  onSourceChange,
  selectedApplicability,
  onApplicabilityChange,
  applicabilityOptions,
  showApplicability,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClearAll,
  hasActiveFilters,
}: AdvancedSearchDialogProps) {
  const [open, setOpen] = useState(false);

  const parseDate = (dateStr: string | null): Date | undefined => {
    if (!dateStr) return undefined;
    return new Date(dateStr);
  };

  const handleStartDateSelect = (date: Date | undefined) => {
    onStartDateChange(date ? format(date, "yyyy-MM-dd") : null);
  };

  const handleEndDateSelect = (date: Date | undefined) => {
    onEndDateChange(date ? format(date, "yyyy-MM-dd") : null);
  };

  const activeFiltersCount = [
    selectedSource !== "all",
    selectedApplicability !== "all",
    startDate,
    endDate,
  ].filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Pesquisa Avançada
          {activeFiltersCount > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Pesquisa Avançada</DialogTitle>
          <DialogDescription>
            Configure filtros detalhados para refinar a sua pesquisa de legislação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Search Term */}
          <div className="space-y-2">
            <Label htmlFor="search-term">Pesquisar por nome ou sumário</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search-term"
                placeholder="Título, número ou entidade..."
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Source Filter */}
          <div className="space-y-2">
            <Label>Fonte de Publicação</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={selectedSource === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => onSourceChange("all")}
              >
                Todos
              </Button>
              <Button
                type="button"
                variant={selectedSource === "dre" ? "default" : "outline"}
                size="sm"
                onClick={() => onSourceChange("dre")}
              >
                DRE
              </Button>
              <Button
                type="button"
                variant={selectedSource === "eurlex" ? "default" : "outline"}
                size="sm"
                onClick={() => onSourceChange("eurlex")}
              >
                EUR-Lex
              </Button>
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>Período de Publicação</Label>
            <div className="flex gap-2 items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(new Date(startDate), "dd/MM/yyyy") : "De"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDate(startDate)}
                    onSelect={handleStartDateSelect}
                    locale={pt}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(new Date(endDate), "dd/MM/yyyy") : "Até"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseDate(endDate)}
                    onSelect={handleEndDateSelect}
                    locale={pt}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {(startDate || endDate) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onStartDateChange(null);
                    onEndDateChange(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Applicability Filter */}
          {showApplicability && (
            <div className="space-y-2">
              <Label>Aplicabilidade</Label>
              <Select value={selectedApplicability} onValueChange={onApplicabilityChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {applicabilityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={onClearAll}
            disabled={!hasActiveFilters && !searchTerm}
          >
            Limpar Tudo
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            Aplicar Filtros
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
