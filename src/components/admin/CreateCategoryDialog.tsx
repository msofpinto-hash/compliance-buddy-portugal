import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Theme, ThemeCategory } from "@/hooks/useThemes";

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Reset form when dialog opens with new initial parent
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setParentId(initialParentId || null);
      setName("");
      setKeywords("");
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

    const getLevel = (catId: string): number => {
      const cat = categories.find(c => c.id === catId);
      if (!cat || !cat.parent_id) return 0;
      return 1 + getLevel(cat.parent_id);
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

      const { error } = await supabase
        .from("theme_categories")
        .insert({
          theme_id: theme.id,
          name,
          parent_id: parentId,
          keywords: keywordsArray.length > 0 ? keywordsArray : null,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme-categories"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
      toast({
        title: "Categoria criada",
        description: `A categoria "${name}" foi criada com sucesso`,
      });
      setName("");
      setParentId(null);
      setKeywords("");
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
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Equipamentos de Proteção"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent">Categoria Pai (opcional)</Label>
            <Select value={parentId || "none"} onValueChange={(v) => setParentId(v === "none" ? null : v)}>
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

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || createMutation.isPending}
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
