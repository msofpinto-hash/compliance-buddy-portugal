import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { LegislationWithCategories } from "@/hooks/useLegislation";

interface AssignCategoriesDialogProps {
  legislation: LegislationWithCategories | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignCategoriesDialog({ legislation, open, onOpenChange }: AssignCategoriesDialogProps) {
  const { data: themes, isLoading: themesLoading } = useThemesWithCategories();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Initialize selected categories when dialog opens
  useState(() => {
    if (legislation) {
      setSelectedCategories(legislation.categories.map(c => c.id));
    }
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!legislation) return;

      // Delete existing mappings
      await supabase
        .from("legislation_category_mapping")
        .delete()
        .eq("legislation_id", legislation.id);

      // Insert new mappings
      if (selectedCategories.length > 0) {
        const mappings = selectedCategories.map(catId => ({
          legislation_id: legislation.id,
          category_id: catId,
        }));

        const { error } = await supabase
          .from("legislation_category_mapping")
          .insert(mappings);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      toast({
        title: "Categorias atualizadas",
        description: `${selectedCategories.length} categoria(s) atribuída(s)`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar",
        variant: "destructive",
      });
    },
  });

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Reset selection when legislation changes
  const handleOpenChange = (open: boolean) => {
    if (open && legislation) {
      setSelectedCategories(legislation.categories.map(c => c.id));
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atribuir Categorias</DialogTitle>
          <DialogDescription>
            {legislation?.number} - {legislation?.title}
          </DialogDescription>
        </DialogHeader>

        {themesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {themes?.map(theme => (
              <div key={theme.id} className="space-y-3">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  {theme.name}
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {theme.categories.map(category => (
                    <div
                      key={category.id}
                      className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-accent/50"
                    >
                      <Checkbox
                        id={category.id}
                        checked={selectedCategories.includes(category.id)}
                        onCheckedChange={() => toggleCategory(category.id)}
                      />
                      <Label htmlFor={category.id} className="flex-1 cursor-pointer text-sm">
                        {category.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                {selectedCategories.length} categoria(s) selecionada(s)
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
