import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Copy } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useThemes, type Theme, type ThemeCategory } from "@/hooks/useThemes";

interface CreateCategoryDialogProps {
  theme: Theme | null;
  categories: ThemeCategory[];
  initialParentId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CategoryOption {
  id: string;
  name: string;
  level: number;
  fullPath: string;
}

export function CreateCategoryDialog({ theme, categories, initialParentId, open, onOpenChange }: CreateCategoryDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(initialParentId || null);
  const [keywords, setKeywords] = useState("");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [cloneToThemes, setCloneToThemes] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get all themes for clone selection
  const { data: allThemes } = useThemes();
  const otherThemes = allThemes?.filter(t => t.id !== theme?.id) || [];

  // Check for duplicate category at the same level
  const checkDuplicate = (categoryName: string, parent: string | null): boolean => {
    const normalizedName = categoryName.trim().toLowerCase();
    const siblingsAtLevel = categories.filter(c => c.parent_id === parent);
    return siblingsAtLevel.some(c => c.name.trim().toLowerCase() === normalizedName);
  };

  // Validate on name change
  const handleNameChange = (newName: string) => {
    setName(newName);
    if (newName.trim() && checkDuplicate(newName, parentId)) {
      const levelLabel = parentId 
        ? `dentro de "${categories.find(c => c.id === parentId)?.name}"`
        : "como categoria principal";
      setDuplicateError(`Já existe uma categoria "${newName.trim()}" ${levelLabel}`);
    } else {
      setDuplicateError(null);
    }
  };

  // Re-validate when parent changes
  const handleParentChange = (newParentId: string | null) => {
    setParentId(newParentId);
    if (name.trim() && checkDuplicate(name, newParentId)) {
      const levelLabel = newParentId 
        ? `dentro de "${categories.find(c => c.id === newParentId)?.name}"`
        : "como categoria principal";
      setDuplicateError(`Já existe uma categoria "${name.trim()}" ${levelLabel}`);
    } else {
      setDuplicateError(null);
    }
  };

  const toggleCloneTheme = (themeId: string) => {
    setCloneToThemes(prev => 
      prev.includes(themeId) 
        ? prev.filter(id => id !== themeId)
        : [...prev, themeId]
    );
  };

  // Reset form when dialog opens with new initial parent
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setParentId(initialParentId || null);
      setName("");
      setKeywords("");
      setDuplicateError(null);
      setCloneToThemes([]);
    }
    onOpenChange(newOpen);
  };

  // Build hierarchical list of all categories with indentation
  const categoryOptions = useMemo(() => {
    const options: CategoryOption[] = [];
    
    const buildPath = (catId: string): string => {
      const cat = categories.find(c => c.id === catId);
      if (!cat) return "";
      if (!cat.parent_id) return cat.name;
      return `${buildPath(cat.parent_id)} > ${cat.name}`;
    };

    const addCategoryAndChildren = (parentId: string | null, level: number) => {
      const children = categories.filter(c => c.parent_id === parentId);
      children.sort((a, b) => a.name.localeCompare(b.name));
      
      for (const child of children) {
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
  }, [categories]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!theme) return;
      
      const keywordsArray = keywords
        .split(",")
        .map(k => k.trim())
        .filter(k => k.length > 0);

      // Create in main theme
      const { data: mainCategory, error } = await supabase
        .from("theme_categories")
        .insert({
          theme_id: theme.id,
          name,
          parent_id: parentId,
          keywords: keywordsArray.length > 0 ? keywordsArray : null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add link to main theme
      await supabase
        .from("category_theme_links")
        .insert({ category_id: mainCategory.id, theme_id: theme.id });

      // Create clones in other themes if selected
      for (const cloneThemeId of cloneToThemes) {
        const { data: cloneCat, error: cloneError } = await supabase
          .from("theme_categories")
          .insert({
            theme_id: cloneThemeId,
            name,
            parent_id: null, // Clones are top-level in their themes
            keywords: keywordsArray.length > 0 ? keywordsArray : null,
          })
          .select()
          .single();

        if (cloneError) throw cloneError;

        // Add link to clone theme
        await supabase
          .from("category_theme_links")
          .insert({ category_id: cloneCat.id, theme_id: cloneThemeId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme-categories"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories-with-theme-links"] });
      
      const cloneCount = cloneToThemes.length;
      toast({
        title: "Categoria criada",
        description: cloneCount > 0 
          ? `A categoria "${name}" foi criada com ${cloneCount} clone(s)`
          : `A categoria "${name}" foi criada com sucesso`,
      });
      setName("");
      setParentId(null);
      setKeywords("");
      setCloneToThemes([]);
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar categoria",
        variant: "destructive",
      });
    },
  });

  // Get selected category display name
  const selectedCategory = categoryOptions.find(c => c.id === parentId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar Nova Categoria</DialogTitle>
          <DialogDescription>
            Adicione uma categoria ao tema "{theme?.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Nome *</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex: Equipamentos de Proteção"
              className={duplicateError ? "border-destructive" : ""}
            />
            {duplicateError && (
              <p className="text-xs text-destructive">{duplicateError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent">Categoria Pai (opcional)</Label>
            <Select value={parentId || "none"} onValueChange={(v) => handleParentChange(v === "none" ? null : v)}>
              <SelectTrigger>
                <SelectValue>
                  {parentId ? selectedCategory?.fullPath : "Nenhuma (categoria principal)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="none">Nenhuma (categoria principal)</SelectItem>
                {categoryOptions.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span style={{ paddingLeft: `${cat.level * 16}px` }} className="flex items-center">
                      {cat.level > 0 && <span className="text-muted-foreground mr-1">└</span>}
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Selecione qualquer categoria para criar uma subcategoria dentro dela
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords">Palavras-chave</Label>
            <Input
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="palavra1, palavra2, palavra3"
            />
            <p className="text-xs text-muted-foreground">
              Separadas por vírgula. Usadas para categorização automática.
            </p>
          </div>

          {/* Clone to other themes */}
          {otherThemes.length > 0 && !parentId && (
            <div className="space-y-2 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/30">
              <Label className="flex items-center gap-2">
                <Copy className="h-4 w-4 text-blue-600" />
                Criar clone noutros temas
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Cria uma cópia independente desta categoria nos temas selecionados
              </p>
              <div className="flex flex-wrap gap-2">
                {otherThemes.map(t => (
                  <div 
                    key={t.id}
                    onClick={() => toggleCloneTheme(t.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                      cloneToThemes.includes(t.id)
                        ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600"
                        : "bg-muted/30 border-transparent hover:border-muted"
                    }`}
                  >
                    <Checkbox
                      checked={cloneToThemes.includes(t.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-sm">{t.name}</span>
                  </div>
                ))}
              </div>
              {cloneToThemes.length > 0 && (
                <Badge variant="secondary" className="mt-2">
                  {cloneToThemes.length} clone(s) serão criados
                </Badge>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || !!duplicateError || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Plus className="mr-2 h-4 w-4" />
              Criar Categoria
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}