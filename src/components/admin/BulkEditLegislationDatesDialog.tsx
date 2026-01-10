import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CalendarDays, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { LegislationWithCategories } from "@/hooks/useLegislation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface BulkEditLegislationDatesDialogProps {
  legislationList: LegislationWithCategories[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkEditLegislationDatesDialog({
  legislationList,
  open,
  onOpenChange,
}: BulkEditLegislationDatesDialogProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [publicationDate, setPublicationDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [applyPublication, setApplyPublication] = useState(false);
  const [applyEffective, setApplyEffective] = useState(false);

  // Count items missing dates
  const stats = useMemo(() => {
    const missingPublication = legislationList.filter(l => !l.publication_date).length;
    const missingEffective = legislationList.filter(l => !l.effective_date).length;
    return { missingPublication, missingEffective };
  }, [legislationList]);

  const handleSave = async () => {
    if (!applyPublication && !applyEffective) {
      toast.error("Selecione pelo menos um campo de data para atualizar");
      return;
    }

    if (legislationList.length === 0) {
      toast.error("Nenhuma legislação selecionada");
      return;
    }

    setIsLoading(true);
    try {
      const updateData: Record<string, string | null> = {};
      
      if (applyPublication) {
        updateData.publication_date = publicationDate || null;
      }
      if (applyEffective) {
        updateData.effective_date = effectiveDate || null;
      }

      const ids = legislationList.map(l => l.id);
      
      const { error } = await supabase
        .from("legislation")
        .update(updateData)
        .in("id", ids);

      if (error) throw error;

      toast.success(`Datas atualizadas para ${legislationList.length} diploma(s)`);
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      
      // Reset form
      setPublicationDate("");
      setEffectiveDate("");
      setApplyPublication(false);
      setApplyEffective(false);
      
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao atualizar datas: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setPublicationDate("");
      setEffectiveDate("");
      setApplyPublication(false);
      setApplyEffective(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Editar Datas em Massa
          </DialogTitle>
          <DialogDescription>
            Atualizar datas para {legislationList.length} diploma(s) selecionado(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Stats about missing dates */}
          <div className="flex gap-3">
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
              <AlertCircle className="h-3 w-3 mr-1" />
              {stats.missingPublication} sem data de publicação
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
              <AlertCircle className="h-3 w-3 mr-1" />
              {stats.missingEffective} sem data de vigor
            </Badge>
          </div>

          {/* Publication Date */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="applyPublication"
                checked={applyPublication}
                onCheckedChange={(checked) => setApplyPublication(checked === true)}
              />
              <Label htmlFor="applyPublication" className="font-medium cursor-pointer">
                Atualizar Data de Publicação
              </Label>
            </div>
            {applyPublication && (
              <div className="space-y-2 pl-6">
                <Input
                  type="date"
                  value={publicationDate}
                  onChange={(e) => setPublicationDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para limpar a data de publicação
                </p>
              </div>
            )}
          </div>

          {/* Effective Date */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="applyEffective"
                checked={applyEffective}
                onCheckedChange={(checked) => setApplyEffective(checked === true)}
              />
              <Label htmlFor="applyEffective" className="font-medium cursor-pointer">
                Atualizar Data de Entrada em Vigor
              </Label>
            </div>
            {applyEffective && (
              <div className="space-y-2 pl-6">
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para limpar a data de entrada em vigor
                </p>
              </div>
            )}
          </div>

          {/* Preview of selected legislation */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Diplomas selecionados:</Label>
            <ScrollArea className="h-32 rounded-md border p-2">
              <div className="space-y-1">
                {legislationList.map((leg) => (
                  <div key={leg.id} className="text-sm flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {leg.number}
                    </span>
                    <span className="truncate flex-1">{leg.title}</span>
                    {!leg.publication_date && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">
                        s/ pub
                      </Badge>
                    )}
                    {!leg.effective_date && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">
                        s/ vigor
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isLoading || (!applyPublication && !applyEffective)}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aplicar a {legislationList.length} diploma(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
