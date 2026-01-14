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
  const [creatingCategoryParent, setCreatingCategoryParent] = useState<ThemeCategory | null>(null);
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

  const handleAddCategory = (theme: ThemeWithCategories, parentCategory?: ThemeCategory) => {
    setCreatingCategoryForTheme(theme);
    setCreatingCategoryParent(parentCategory || null);
    setShowCreateCategory(true);
  };

  const handleEditCategory = (category: ThemeCategory) => {
    setEditingCategory(category);
    setShowEditCategory(true);
  };

  const handleAddSubcategoryFromEdit = (parentCategory: ThemeCategory) => {
    // Find the theme for this category
    const theme = themes?.find(t => t.categories.some(c => c.id === parentCategory.id));
    if (theme) {
      handleAddCategory(theme, parentCategory);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-amber-50/95 via-orange-50/80 to-yellow-50/70 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/25 border border-amber-200/60 dark:border-amber-800/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-amber-700/70 dark:text-amber-400/70">Total de Temas</CardDescription>
            <CardTitle className="text-3xl text-stone-800 dark:text-stone-100">{themes?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-orange-50/95 via-amber-50/80 to-yellow-50/70 dark:from-orange-950/40 dark:via-amber-950/35 dark:to-yellow-950/25 border border-orange-200/60 dark:border-orange-800/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-amber-700/70 dark:text-amber-400/70">Categorias</CardDescription>
            <CardTitle className="text-3xl text-stone-800 dark:text-stone-100">{totalCategories - totalSubcategories}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-50/95 via-amber-50/80 to-stone-50/70 dark:from-yellow-950/40 dark:via-amber-950/35 dark:to-stone-900/30 border border-yellow-200/60 dark:border-yellow-800/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-amber-700/70 dark:text-amber-400/70">Subcategorias</CardDescription>
            <CardTitle className="text-3xl text-stone-800 dark:text-stone-100">{totalSubcategories}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-gradient-to-br from-stone-50/95 via-amber-50/80 to-orange-50/70 dark:from-stone-900/50 dark:via-amber-950/40 dark:to-orange-950/30 border border-stone-200/60 dark:border-stone-700/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-amber-700/70 dark:text-amber-400/70">Keywords</CardDescription>
            <CardTitle className="text-3xl text-stone-800 dark:text-stone-100">
              {themes?.reduce((acc, t) => 
                acc + t.categories.reduce((catAcc, c) => catAcc + (c.keywords?.length || 0), 0), 0
              ) || 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Theme List */}
      <Card className="bg-gradient-to-br from-amber-50/95 via-orange-50/80 to-yellow-50/70 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/25 border border-amber-200/60 dark:border-amber-800/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-stone-800 dark:text-stone-100">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
                  <Palette className="h-4 w-4 text-white" />
                </div>
                Temas e Categorias
              </CardTitle>
              <CardDescription className="text-amber-700/70 dark:text-amber-400/70">
                Gerencie os temas, categorias e subcategorias para organizar a legislação
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateTheme(true)} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
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
        initialParentId={creatingCategoryParent?.id || null}
        open={showCreateCategory} 
        onOpenChange={(open) => {
          setShowCreateCategory(open);
          if (!open) {
            setCreatingCategoryParent(null);
          }
        }} 
      />
      
      <EditCategoryDialog 
        category={editingCategory}
        allCategories={allCategories}
        open={showEditCategory} 
        onOpenChange={setShowEditCategory}
        onAddSubcategory={handleAddSubcategoryFromEdit}
      />
    </div>
  );
}
