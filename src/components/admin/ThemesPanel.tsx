import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Palette, 
  Plus, 
  Search, 
  FolderTree, 
  FileText, 
  ChevronRight,
  Sparkles,
  Tags,
  Layers
} from "lucide-react";
import { useThemesWithCategories, type ThemeWithCategories, type ThemeCategory, type Theme } from "@/hooks/useThemes";
import { CreateThemeDialog } from "./CreateThemeDialog";
import { EditThemeDialog } from "./EditThemeDialog";
import { CreateCategoryDialog } from "./CreateCategoryDialog";
import { EditCategoryDialog } from "./EditCategoryDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as Icons from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Theme images and colors
import themeAmbiente from "@/assets/theme-ambiente.png";
import themeSst from "@/assets/theme-sst.png";
import themeEnergia from "@/assets/theme-energia.png";
import themeQualidade from "@/assets/theme-qualidade.png";
import themeSeguranca from "@/assets/theme-seguranca.png";
import themeGeral from "@/assets/theme-geral.png";

const themeImages: Record<string, string> = {
  ambiente: themeAmbiente,
  sst: themeSst,
  energia: themeEnergia,
  qualidade: themeQualidade,
  seguranca: themeSeguranca,
  segurança: themeSeguranca,
  geral: themeGeral,
};

const themeColors: Record<string, { gradient: string; accent: string; badge: string }> = {
  ambiente: { 
    gradient: "from-emerald-500/20 via-green-500/10 to-teal-500/5",
    accent: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
  },
  sst: { 
    gradient: "from-amber-500/20 via-orange-500/10 to-yellow-500/5",
    accent: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
  },
  energia: { 
    gradient: "from-yellow-500/20 via-amber-500/10 to-orange-500/5",
    accent: "text-yellow-600 dark:text-yellow-400",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
  },
  qualidade: { 
    gradient: "from-blue-500/20 via-indigo-500/10 to-violet-500/5",
    accent: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
  },
  seguranca: { 
    gradient: "from-red-500/20 via-rose-500/10 to-pink-500/5",
    accent: "text-red-600 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
  },
};

const getThemeImage = (themeName: string): string => {
  const normalizedName = themeName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [key, image] of Object.entries(themeImages)) {
    const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalizedName.includes(normalizedKey)) return image;
  }
  return themeGeral;
};

const getThemeColors = (themeName: string) => {
  const normalizedName = themeName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [key, colors] of Object.entries(themeColors)) {
    if (normalizedName.includes(key)) return colors;
  }
  return { 
    gradient: "from-stone-500/20 via-gray-500/10 to-slate-500/5",
    accent: "text-stone-600 dark:text-stone-400",
    badge: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
  };
};

export function ThemesPanel() {
  const { data: themes, isLoading, error } = useThemesWithCategories();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<ThemeWithCategories | null>(null);
  
  // Dialogs state
  const [showCreateTheme, setShowCreateTheme] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [showEditTheme, setShowEditTheme] = useState(false);
  
  const [creatingCategoryForTheme, setCreatingCategoryForTheme] = useState<ThemeWithCategories | null>(null);
  const [creatingCategoryParent, setCreatingCategoryParent] = useState<ThemeCategory | null>(null);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  
  const [editingCategory, setEditingCategory] = useState<ThemeCategory | null>(null);
  const [showEditCategory, setShowEditCategory] = useState(false);

  // Fetch legislation counts per theme
  const { data: themeLegislationCounts = {} } = useQuery({
    queryKey: ["theme-legislation-counts"],
    queryFn: async () => {
      if (!themes) return {};
      
      const allCategoryIds = themes.flatMap(t => t.categories.map(c => c.id));
      if (allCategoryIds.length === 0) return {};

      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select("category_id");

      if (error) throw error;

      // Group by theme
      const counts: Record<string, number> = {};
      themes.forEach(theme => {
        const themeCatIds = new Set(theme.categories.map(c => c.id));
        counts[theme.id] = data?.filter(row => themeCatIds.has(row.category_id)).length || 0;
      });
      
      return counts;
    },
    enabled: !!themes,
  });

  // All categories for parent selection
  const allCategories = themes?.flatMap(t => t.categories) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
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
  const totalKeywords = themes?.reduce((acc, t) => 
    acc + t.categories.reduce((catAcc, c) => catAcc + (c.keywords?.length || 0), 0), 0
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
    const theme = themes?.find(t => t.categories.some(c => c.id === parentCategory.id));
    if (theme) {
      handleAddCategory(theme, parentCategory);
    }
  };

  // Filter categories by search
  const filteredCategories = selectedTheme?.categories.filter(cat => 
    !searchTerm || 
    cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cat.keywords?.some(k => k.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const topLevelCategories = filteredCategories.filter(c => !c.parent_id);

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <Card className="relative overflow-hidden border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/40 dark:to-orange-950/20">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/20">
                  <Palette className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{themes?.length || 0}</p>
                  <p className="text-xs text-amber-700/70 dark:text-amber-400/70">Temas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="relative overflow-hidden border-orange-200/60 dark:border-orange-800/40 bg-gradient-to-br from-orange-50 to-amber-50/50 dark:from-orange-950/40 dark:to-amber-950/20">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-500/10 to-transparent rounded-bl-full" />
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-500/20">
                  <Layers className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{totalCategories - totalSubcategories}</p>
                  <p className="text-xs text-orange-700/70 dark:text-orange-400/70">Categorias</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="relative overflow-hidden border-yellow-200/60 dark:border-yellow-800/40 bg-gradient-to-br from-yellow-50 to-amber-50/50 dark:from-yellow-950/40 dark:to-amber-950/20">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-yellow-500/10 to-transparent rounded-bl-full" />
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-500 shadow-lg shadow-yellow-500/20">
                  <FolderTree className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{totalSubcategories}</p>
                  <p className="text-xs text-yellow-700/70 dark:text-yellow-400/70">Subcategorias</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="relative overflow-hidden border-stone-200/60 dark:border-stone-700/40 bg-gradient-to-br from-stone-50 to-amber-50/50 dark:from-stone-900/60 dark:to-amber-950/20">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-stone-500/10 to-transparent rounded-bl-full" />
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-stone-500 to-stone-600 shadow-lg shadow-stone-500/20">
                  <Tags className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{totalKeywords}</p>
                  <p className="text-xs text-stone-600/70 dark:text-stone-400/70">Keywords</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr,1.5fr]">
        {/* Left: Theme Grid */}
        <Card className="border-amber-200/60 dark:border-amber-800/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Temas
              </CardTitle>
              <Button 
                size="sm" 
                onClick={() => setShowCreateTheme(true)}
                className="h-8 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/20"
              >
                <Plus className="mr-1 h-3 w-3" />
                Novo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {themes && themes.length > 0 ? (
              <div className="grid gap-3 grid-cols-1">
                {themes.map((theme, idx) => {
                  const themeImage = getThemeImage(theme.name);
                  const colors = getThemeColors(theme.name);
                  const IconComponent = theme.icon && Icons[theme.icon as keyof typeof Icons] 
                    ? (Icons[theme.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>)
                    : Icons.Folder;
                  const isSelected = selectedTheme?.id === theme.id;
                  const legislationCount = themeLegislationCounts[theme.id] || 0;

                  return (
                    <motion.div
                      key={theme.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <button
                        onClick={() => setSelectedTheme(isSelected ? null : theme)}
                        className={`w-full text-left group relative overflow-hidden rounded-xl border transition-all duration-300 ${
                          isSelected 
                            ? "ring-2 ring-amber-500 border-amber-400 shadow-lg shadow-amber-500/20" 
                            : "border-border/50 hover:border-amber-300 hover:shadow-md"
                        }`}
                      >
                        {/* Image Background */}
                        <div className="absolute inset-0 overflow-hidden">
                          <img 
                            src={themeImage} 
                            alt={theme.name}
                            className="w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-opacity"
                          />
                          <div className={`absolute inset-0 bg-gradient-to-r ${colors.gradient}`} />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/70 to-transparent" />
                        </div>

                        {/* Content */}
                        <div className="relative p-4 flex items-center gap-3">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-background/90 shadow-lg border ${colors.accent}`}>
                            <IconComponent className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm truncate">{theme.name}</h3>
                            <p className="text-xs text-muted-foreground truncate">{theme.description || "Sem descrição"}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="secondary" className="text-xs">
                              {theme.categories.length} cat.
                            </Badge>
                            {legislationCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <FileText className="mr-1 h-2.5 w-2.5" />
                                {legislationCount}
                              </Badge>
                            )}
                          </div>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`} />
                        </div>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 mb-4">
                  <Palette className="h-8 w-8 text-amber-500" />
                </div>
                <p className="text-muted-foreground mb-4">Nenhum tema configurado</p>
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateTheme(true)}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Primeiro Tema
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Category Detail */}
        <Card className="border-amber-200/60 dark:border-amber-800/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                {selectedTheme ? (
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{selectedTheme.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleEditTheme(selectedTheme)}
                    >
                      Editar
                    </Button>
                  </div>
                ) : (
                  <CardTitle className="text-base text-muted-foreground">Selecione um tema</CardTitle>
                )}
              </div>
              {selectedTheme && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar categorias..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-8 w-48 pl-8 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    onClick={() => handleAddCategory(selectedTheme)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Categoria
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <AnimatePresence mode="wait">
              {selectedTheme ? (
                <motion.div
                  key={selectedTheme.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <ScrollArea className="h-[400px] pr-4">
                    {topLevelCategories.length > 0 ? (
                      <div className="space-y-2">
                        {topLevelCategories.map((category) => (
                          <CategoryTreeItem
                            key={category.id}
                            category={category}
                            allCategories={filteredCategories}
                            level={0}
                            onEditCategory={handleEditCategory}
                            onAddSubcategory={(parent) => handleAddCategory(selectedTheme, parent)}
                            themeColors={getThemeColors(selectedTheme.name)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center">
                        <FolderTree className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          {searchTerm ? "Nenhuma categoria encontrada" : "Sem categorias neste tema"}
                        </p>
                        {!searchTerm && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => handleAddCategory(selectedTheme)}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Adicionar primeira categoria
                          </Button>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-16 text-center"
                >
                  <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 mb-4">
                    <FolderTree className="h-10 w-10 text-amber-400" />
                  </div>
                  <p className="text-muted-foreground">Clique num tema para ver as categorias</p>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

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

// Category Tree Item Component
interface CategoryTreeItemProps {
  category: ThemeCategory;
  allCategories: ThemeCategory[];
  level: number;
  onEditCategory?: (category: ThemeCategory) => void;
  onAddSubcategory?: (parentCategory: ThemeCategory) => void;
  themeColors: { gradient: string; accent: string; badge: string };
}

function CategoryTreeItem({ 
  category, 
  allCategories, 
  level, 
  onEditCategory,
  onAddSubcategory,
  themeColors
}: CategoryTreeItemProps) {
  const [expanded, setExpanded] = useState(level < 1);
  const subcategories = allCategories.filter(cat => cat.parent_id === category.id);
  const hasSubcategories = subcategories.length > 0;

  return (
    <div className="space-y-1.5">
      <div 
        className={`group flex items-center justify-between rounded-lg border transition-all hover:shadow-sm ${
          level === 0 
            ? 'p-3 bg-card/80 border-border/60' 
            : 'p-2.5 bg-muted/30 border-border/40'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasSubcategories ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </Button>
          ) : (
            <div className="w-6" />
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-medium truncate ${level === 0 ? 'text-sm' : 'text-xs'}`}>
                {category.name}
              </p>
              {hasSubcategories && (
                <Badge className={`text-xs ${themeColors.badge}`}>
                  {subcategories.length} sub
                </Badge>
              )}
            </div>
            {category.keywords && category.keywords.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {category.keywords.slice(0, 3).map((keyword, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs py-0 px-1.5 font-normal">
                    {keyword}
                  </Badge>
                ))}
                {category.keywords.length > 3 && (
                  <Badge variant="outline" className="text-xs py-0 px-1.5">
                    +{category.keywords.length - 3}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onAddSubcategory && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onAddSubcategory(category)}
              title="Adicionar subcategoria"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          {onEditCategory && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEditCategory(category)}
              title="Editar"
            >
              <Icons.Edit2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Subcategories */}
      <AnimatePresence>
        {hasSubcategories && expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-5 space-y-1.5 border-l-2 border-muted pl-3"
          >
            {subcategories.map((sub) => (
              <CategoryTreeItem
                key={sub.id}
                category={sub}
                allCategories={allCategories}
                level={level + 1}
                onEditCategory={onEditCategory}
                onAddSubcategory={onAddSubcategory}
                themeColors={themeColors}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
