import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FolderTree, ChevronDown, Loader2, ArrowRight, Check } from "lucide-react";

interface Theme {
  id: string;
  name: string;
}

interface ThemeCategory {
  id: string;
  name: string;
  theme_id: string;
  parent_id: string | null;
}

interface MoveLegislationToCategoryDialogProps {
  legislationId: string;
  legislationNumber: string;
  currentCategoryId: string;
  currentCategoryName: string;
  onMoved?: () => void;
  trigger?: React.ReactNode;
}

export function MoveLegislationToCategoryDialog({
  legislationId,
  legislationNumber,
  currentCategoryId,
  currentCategoryName,
  onMoved,
  trigger,
}: MoveLegislationToCategoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch all themes
  const { data: themes = [] } = useQuery({
    queryKey: ["themes-for-move-dialog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data as Theme[];
    },
    enabled: open,
  });

  // Fetch all categories
  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories-for-move-dialog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_categories")
        .select("id, name, theme_id, parent_id")
        .order("name");
      if (error) throw error;
      return data as ThemeCategory[];
    },
    enabled: open,
  });

  const getCategoriesForTheme = (themeId: string) =>
    allCategories.filter((c) => c.theme_id === themeId && !c.parent_id);

  const getSubcategories = (parentId: string) =>
    allCategories.filter((c) => c.parent_id === parentId);

  const toggleTheme = (themeId: string) => {
    const newSet = new Set(expandedThemes);
    if (newSet.has(themeId)) newSet.delete(themeId);
    else newSet.add(themeId);
    setExpandedThemes(newSet);
  };

  const toggleCat = (catId: string) => {
    const newSet = new Set(expandedCats);
    if (newSet.has(catId)) newSet.delete(catId);
    else newSet.add(catId);
    setExpandedCats(newSet);
  };

  const handleMove = async () => {
    if (!selectedTargetId || selectedTargetId === currentCategoryId) return;

    setIsMoving(true);
    try {
      // Update the mapping from current category to the new one
      const { error } = await supabase
        .from("legislation_category_mapping")
        .update({ category_id: selectedTargetId })
        .eq("legislation_id", legislationId)
        .eq("category_id", currentCategoryId);

      if (error) throw error;

      toast.success("Diploma movido com sucesso!");

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["category-legislation"] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation-counts-manual"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-category-mappings"] });

      setOpen(false);
      onMoved?.();
    } catch (error: any) {
      toast.error("Erro ao mover: " + error.message);
    } finally {
      setIsMoving(false);
    }
  };

  const renderCategoryOption = (cat: ThemeCategory, level: number = 0) => {
    const subs = getSubcategories(cat.id);
    const hasSubs = subs.length > 0;
    const isExpanded = expandedCats.has(cat.id);
    const isCurrent = cat.id === currentCategoryId;
    const isSelected = cat.id === selectedTargetId;

    return (
      <div key={cat.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
            isCurrent
              ? "opacity-50 cursor-not-allowed"
              : isSelected
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          }`}
          style={{ paddingLeft: `${8 + level * 12}px` }}
          onClick={() => !isCurrent && setSelectedTargetId(cat.id)}
        >
          {hasSubs && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleCat(cat.id);
              }}
            >
              <ChevronDown className={`h-3 w-3 ${isExpanded ? "" : "-rotate-90"}`} />
            </Button>
          )}
          {!hasSubs && <div className="w-5" />}
          <FolderTree className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="flex-1 text-sm truncate">{cat.name}</span>
          {isCurrent && (
            <Badge variant="secondary" className="text-[10px]">
              Atual
            </Badge>
          )}
          {isSelected && <Check className="h-4 w-4" />}
        </div>
        {hasSubs && isExpanded && subs.map((sub) => renderCategoryOption(sub, level + 1))}
      </div>
    );
  };

  const selectedTarget = allCategories.find((c) => c.id === selectedTargetId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <ArrowRight className="h-3 w-3 mr-1" />
            Mover
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Mover Diploma
          </DialogTitle>
          <DialogDescription>
            Mover <strong>{legislationNumber}</strong> de "{currentCategoryName}" para outra categoria.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[350px] border rounded-lg p-2">
          <div className="space-y-1">
            {themes.map((theme) => {
              const cats = getCategoriesForTheme(theme.id);
              const isExpanded = expandedThemes.has(theme.id);
              return (
                <div key={theme.id}>
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer font-medium text-sm"
                    onClick={() => toggleTheme(theme.id)}
                  >
                    <ChevronDown className={`h-4 w-4 ${isExpanded ? "" : "-rotate-90"}`} />
                    {theme.name}
                  </div>
                  {isExpanded && cats.map((cat) => renderCategoryOption(cat, 0))}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {selectedTarget && selectedTarget.id !== currentCategoryId && (
          <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
            <ArrowRight className="h-4 w-4 text-primary" />
            <span>Mover para: <strong>{selectedTarget.name}</strong></span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleMove}
            disabled={!selectedTargetId || selectedTargetId === currentCategoryId || isMoving}
          >
            {isMoving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Mover Diploma
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
