import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FolderTree, Check, Loader2 } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type Organization = Tables<"organizations">;
type Theme = Tables<"themes">;

interface AssignThemesDialogProps {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignThemesDialog({ organization, open, onOpenChange }: AssignThemesDialogProps) {
  const queryClient = useQueryClient();
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Fetch all themes
  const { data: themes, isLoading: isLoadingThemes } = useQuery({
    queryKey: ["themes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data as Theme[];
    },
  });

  // Fetch organization's assigned themes
  const { data: assignedThemes, isLoading: isLoadingAssigned } = useQuery({
    queryKey: ["organization-themes", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_themes")
        .select("theme_id")
        .eq("organization_id", organization.id);
      
      if (error) throw error;
      return data.map(t => t.theme_id);
    },
    enabled: open,
  });

  // Initialize selected themes when dialog opens and data is loaded
  useEffect(() => {
    if (open && assignedThemes !== undefined && !initialized) {
      setSelectedThemes(new Set(assignedThemes));
      setInitialized(true);
    }
  }, [open, assignedThemes, initialized]);

  // Reset initialization when dialog closes
  useEffect(() => {
    if (!open) {
      setInitialized(false);
    }
  }, [open]);

  // Save themes mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Delete all current assignments
      await supabase
        .from("organization_themes")
        .delete()
        .eq("organization_id", organization.id);

      // Insert new assignments
      if (selectedThemes.size > 0) {
        const { error } = await supabase
          .from("organization_themes")
          .insert(
            Array.from(selectedThemes).map(themeId => ({
              organization_id: organization.id,
              theme_id: themeId,
            }))
          );
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization-themes", organization.id] });
      queryClient.invalidateQueries({ queryKey: ["organization-themes-count", organization.id] });
      toast.success(`Temas atualizados para ${organization.name}`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar temas: " + error.message);
    },
  });

  const toggleTheme = (themeId: string) => {
    const newSelected = new Set(selectedThemes);
    if (newSelected.has(themeId)) {
      newSelected.delete(themeId);
    } else {
      newSelected.add(themeId);
    }
    setSelectedThemes(newSelected);
  };

  const selectAll = () => {
    if (themes) {
      setSelectedThemes(new Set(themes.map(t => t.id)));
    }
  };

  const deselectAll = () => {
    setSelectedThemes(new Set());
  };

  const isLoading = isLoadingThemes || isLoadingAssigned;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Atribuir Temas
          </DialogTitle>
          <DialogDescription>
            Selecione os temas a que <strong>{organization.name}</strong> terá acesso.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">
                {selectedThemes.size} de {themes?.length || 0} temas selecionados
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  Todos
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  Nenhum
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {themes?.map((theme) => (
                  <label
                    key={theme.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedThemes.has(theme.id)
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={selectedThemes.has(theme.id)}
                      onCheckedChange={() => toggleTheme(theme.id)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {theme.icon && <span>{theme.icon}</span>}
                        <span className="font-medium">{theme.name}</span>
                      </div>
                      {theme.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {theme.description}
                        </p>
                      )}
                    </div>
                    {selectedThemes.has(theme.id) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    A guardar...
                  </>
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Badge component to show how many themes an organization has
export function OrganizationThemesBadge({ organizationId }: { organizationId: string }) {
  const { data: count } = useQuery({
    queryKey: ["organization-themes-count", organizationId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("organization_themes")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      
      if (error) throw error;
      return count || 0;
    },
  });

  if (count === undefined) return null;

  return (
    <Badge variant="outline" className="gap-1">
      <FolderTree className="h-3 w-3" />
      {count} {count === 1 ? "tema" : "temas"}
    </Badge>
  );
}
