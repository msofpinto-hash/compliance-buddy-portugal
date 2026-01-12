import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2, Plus, FileText } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ThemeCategory } from "@/hooks/useThemes";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CategoryLegislationDialog } from "./CategoryLegislationDialog";

interface EditCategoryDialogProps {
  category: ThemeCategory | null;
  allCategories: ThemeCategory[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSubcategory?: (parentCategory: ThemeCategory) => void;
}

interface CategoryOption {
  id: string;
  name: string;
  level: number;
  fullPath: string;
}

export function EditCategoryDialog({ 
  category, 
  allCategories, 
  open, 
  onOpenChange,
  onAddSubcategory 
}: EditCategoryDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [keywords, setKeywords] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLegislationDialog, setShowLegislationDialog] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get legislation count for this category
  const { data: legislationCount } = useQuery({
    queryKey: ["category-legislation-count", category?.id],
    queryFn: async () => {
      if (!category) return 0;
      const { count, error } = await supabase
        .from("legislation_category_mapping")
        .select("*", { count: "exact", head: true })
        .eq("category_id", category.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!category,
  });

  // Build hierarchical list of all categories with indentation (same theme only)
  const categoryOptions = useMemo(() => {
    if (!category) return [];
    
    const samethemeCategories = allCategories.filter(c => c.theme_id === category.theme_id);
    const options: CategoryOption[] = [];
    
    // Get all descendant IDs to prevent circular references
    const getDescendantIds = (catId: string): Set<string> => {
      const descendants = new Set<string>();
      const children = samethemeCategories.filter(c => c.parent_id === catId);
      children.forEach(child => {
        descendants.add(child.id);
        getDescendantIds(child.id).forEach(id => descendants.add(id));
      });
      return descendants;
    };
    
    const descendantIds = getDescendantIds(category.id);
    
    const buildPath = (catId: string): string => {
      const cat = samethemeCategories.find(c => c.id === catId);
      if (!cat) return "";
      if (!cat.parent_id) return cat.name;
      return `${buildPath(cat.parent_id)} > ${cat.name}`;
    };

    const addCategoryAndChildren = (parentId: string | null, level: number) => {
      const children = samethemeCategories.filter(c => c.parent_id === parentId);
      children.sort((a, b) => a.name.localeCompare(b.name));
      
      for (const child of children) {
        // Skip self and descendants
        if (child.id === category.id || descendantIds.has(child.id)) {
          continue;
        }
        options.push({
          id: child.id,
          name: child.name,
          level,
          fullPath: buildPath(child.id),
        });
        addCategoryAndChildren(child.id, level + 1);
      }
    };

    // Start with top-level categories
    addCategoryAndChildren(null, 0);
    
    return options;
  }, [allCategories, category]);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setParentId(category.parent_id);
      setKeywords(category.keywords?.join(", ") || "");
    }
  }, [category]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!category) return;
      
      const keywordsArray = keywords
        .split(",")
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const { error } = await supabase
        .from("theme_categories")
        .update({
          name,
          parent_id: parentId,
          keywords: keywordsArray.length > 0 ? keywordsArray : null,
        })
        .eq("id", category.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme-categories"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
      toast({
        title: "Categoria atualizada",
        description: `A categoria "${name}" foi atualizada com sucesso`,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar categoria",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!category) return;
      const { error } = await supabase
        .from("theme_categories")
        .delete()
        .eq("id", category.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme-categories"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
      toast({
        title: "Categoria eliminada",
        description: "A categoria foi eliminada com sucesso",
      });
      setShowDeleteConfirm(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao eliminar categoria",
        variant: "destructive",
      });
    },
  });

  // Get selected category display name
  const selectedParent = categoryOptions.find(c => c.id === parentId);

  // Calculate current level
  const getCurrentLevel = (): number => {
    if (!category) return 0;
    let level = 0;
    let currentParentId = category.parent_id;
    while (currentParentId) {
      level++;
      const parent = allCategories.find(c => c.id === currentParentId);
      currentParentId = parent?.parent_id || null;
    }
    return level;
  };
  const currentLevel = getCurrentLevel();

  const getLevelLabel = (level: number): string => {
    if (level === 0) return "Categoria principal";
    if (level === 1) return "Subcategoria";
    if (level === 2) return "Sub-subcategoria";
    return `Nível ${level + 1}`;
  };

  const handleAddSubcategory = () => {
    if (category && onAddSubcategory) {
      onOpenChange(false);
      onAddSubcategory(category);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Editar Categoria
              <Badge variant="outline" className="font-normal">
                {getLevelLabel(currentLevel)}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Modifique as propriedades ou mova para outro nível na hierarquia
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddSubcategory}
                disabled={!onAddSubcategory}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Criar Subcategoria
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLegislationDialog(true)}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Diplomas
                {legislationCount !== undefined && legislationCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5">{legislationCount}</Badge>
                )}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">Nome *</Label>
              <Input
                id="edit-cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-parent">Mover para dentro de</Label>
              <Select value={parentId || "none"} onValueChange={(v) => setParentId(v === "none" ? null : v)}>
                <SelectTrigger>
                  <SelectValue>
                    {parentId ? selectedParent?.fullPath : "Nenhuma (categoria principal)"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="none">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">Nível 1</Badge>
                      Categoria principal (raiz do tema)
                    </span>
                  </SelectItem>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span style={{ paddingLeft: `${cat.level * 16}px` }} className="flex items-center gap-2">
                        {cat.level > 0 && <span className="text-muted-foreground mr-1">└</span>}
                        <Badge variant="outline" className="text-[10px]">Nível {cat.level + 2}</Badge>
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecione "Nenhuma" para tornar categoria principal, ou escolha outra categoria para criar uma subcategoria/sub-subcategoria
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-keywords">Palavras-chave</Label>
              <Input
                id="edit-keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="palavra1, palavra2, palavra3"
              />
              <p className="text-xs text-muted-foreground">
                Separadas por vírgula. Usadas para categorização automática.
              </p>
            </div>

            <div className="flex justify-between pt-4">
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => updateMutation.mutate()}
                  disabled={!name.trim() || updateMutation.isPending}
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá eliminar a categoria "{category?.name}".
              A legislação associada será desvinculada desta categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CategoryLegislationDialog
        category={category}
        open={showLegislationDialog}
        onOpenChange={setShowLegislationDialog}
      />
    </>
  );
}
