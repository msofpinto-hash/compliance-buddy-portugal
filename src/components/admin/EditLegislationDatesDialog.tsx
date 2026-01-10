import { useState, useEffect } from "react";
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
import { Loader2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { LegislationWithCategories } from "@/hooks/useLegislation";

interface EditLegislationDatesDialogProps {
  legislation: LegislationWithCategories | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditLegislationDatesDialog({
  legislation,
  open,
  onOpenChange,
}: EditLegislationDatesDialogProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [publicationDate, setPublicationDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [revocationDate, setRevocationDate] = useState("");

  useEffect(() => {
    if (legislation) {
      setPublicationDate(legislation.publication_date || "");
      setEffectiveDate(legislation.effective_date || "");
      // revocation_date is not in the type yet, we'll handle it
      setRevocationDate((legislation as any).revocation_date || "");
    }
  }, [legislation]);

  const handleSave = async () => {
    if (!legislation) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("legislation")
        .update({
          publication_date: publicationDate || null,
          effective_date: effectiveDate || null,
          revocation_date: revocationDate || null,
        } as any)
        .eq("id", legislation.id);

      if (error) throw error;

      toast.success("Datas atualizadas com sucesso");
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao atualizar datas: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Editar Datas
          </DialogTitle>
          <DialogDescription>
            {legislation?.number} - {legislation?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="publicationDate">Data de Publicação</Label>
            <Input
              id="publicationDate"
              type="date"
              value={publicationDate}
              onChange={(e) => setPublicationDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Data em que o diploma foi publicado oficialmente
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="effectiveDate">Data de Entrada em Vigor</Label>
            <Input
              id="effectiveDate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Data em que o diploma entrou/entra em vigor
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="revocationDate">Data de Revogação</Label>
            <Input
              id="revocationDate"
              type="date"
              value={revocationDate}
              onChange={(e) => setRevocationDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Data em que o diploma foi revogado (se aplicável)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
