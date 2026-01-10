import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Palette, Plus } from "lucide-react";
import { useThemesWithCategories, type ThemeWithCategories, type ThemeCategory, type Theme } from "@/hooks/useThemes";
import { ThemeCard } from "./ThemeCard";
import { CreateThemeDialog } from "./CreateThemeDialog";
import { EditThemeDialog } from "./EditThemeDialog";
import { CreateCategoryDialog } from "./CreateCategoryDialog";
import { EditCategoryDialog } from "./EditCategoryDialog";

export function ThemesPanel() {
  const { data: themes, isLoading, error } = useThemesWithCategories();
  
  // Dialogs state
  const [showCreateTheme, setShowCreateTheme] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [showEditTheme, setShowEditTheme] = useState(false);
  
  const [creatingCategoryForTheme, setCreatingCategoryForTheme] = useState<ThemeWithCategories | null>(null);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  
  const [editingCategory, setEditingCategory] = useState<ThemeCategory | null>(null);
  const [showEditCategory, setShowEditCategory] = useState(false);

  // All categories for parent selection
  const allCategories = themes?.flatMap(t => t.categories) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-destructive">Erro ao carregar temas: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const totalCategories = themes?.reduce((acc, t) => acc + t.categories.length, 0) || 0;
  const totalSubcategories = themes?.reduce(
    (acc, t) => acc + t.categories.filter(c => c.parent_id).length, 0
  ) || 0;

  const handleEditTheme = (theme: ThemeWithCategories) => {
    setEditingTheme(theme);
    setShowEditTheme(true);
  };

  const handleAddCategory = (theme: ThemeWithCategories) => {
    setCreatingCategoryForTheme(theme);
    setShowCreateCategory(true);
  };

  const handleEditCategory = (category: ThemeCategory) => {
    setEditingCategory(category);
    setShowEditCategory(true);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Temas</CardDescription>
            <CardTitle className="text-3xl">{themes?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Categorias</CardDescription>
            <CardTitle className="text-3xl">{totalCategories - totalSubcategories}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Subcategorias</CardDescription>
            <CardTitle className="text-3xl">{totalSubcategories}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Keywords</CardDescription>
            <CardTitle className="text-3xl">
              {themes?.reduce((acc, t) => 
                acc + t.categories.reduce((catAcc, c) => catAcc + (c.keywords?.length || 0), 0), 0
              ) || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Theme List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Temas e Categorias
              </CardTitle>
              <CardDescription>
                Gerencie os temas, categorias e subcategorias para organizar a legislação
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateTheme(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Tema
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {themes && themes.length > 0 ? (
            <div className="space-y-4">
              {themes.map((theme) => (
                <ThemeCard 
                  key={theme.id} 
                  theme={theme}
                  onEditTheme={handleEditTheme}
                  onEditCategory={handleEditCategory}
                  onAddCategory={handleAddCategory}
                />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Palette className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Nenhum tema configurado</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setShowCreateTheme(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Tema
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateThemeDialog 
        open={showCreateTheme} 
        onOpenChange={setShowCreateTheme} 
      />
      
      <EditThemeDialog 
        theme={editingTheme} 
        open={showEditTheme} 
        onOpenChange={setShowEditTheme} 
      />
      
      <CreateCategoryDialog 
        theme={creatingCategoryForTheme}
        categories={creatingCategoryForTheme?.categories || []}
        open={showCreateCategory} 
        onOpenChange={setShowCreateCategory} 
      />
      
      <EditCategoryDialog 
        category={editingCategory}
        allCategories={allCategories}
        open={showEditCategory} 
        onOpenChange={setShowEditCategory} 
      />
    </div>
  );
}
