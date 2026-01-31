import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FolderTree, Loader2, Save, ChevronLeft, ChevronRight,
  ExternalLink, CheckCircle, RefreshCw, ChevronDown, FileText, Layers, XCircle, Trash2, ArrowRight
} from "lucide-react";
import { LegislationCategoryEditor } from "./LegislationCategoryEditor";
import { LegislationRelationsEditor } from "./LegislationRelationsEditor";
import { AddLegislationToCategoryDialog } from "./AddLegislationToCategoryDialog";
import { MoveLegislationToCategoryDialog } from "./MoveLegislationToCategoryDialog";

interface LegislationItem {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  document_url: string | null;
  publication_date: string | null;
  effective_date: string | null;
  revocation_date: string | null;
  origin: string | null;
  entity: string | null;
  source: string | null;
}

interface ThemeCategory {
  id: string;
  name: string;
  theme_id: string;
  parent_id: string | null;
  keywords: string[] | null;
}

interface Theme {
  id: string;
  name: string;
  icon: string | null;
}

export function ManualDataFixPanel() {
  const queryClient = useQueryClient();
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [editedTitle, setEditedTitle] = useState("");
  const [editedSummary, setEditedSummary] = useState("");
  const [editedUrl, setEditedUrl] = useState("");
  const [editedPublicationDate, setEditedPublicationDate] = useState("");
  const [editedEffectiveDate, setEditedEffectiveDate] = useState("");
  const [editedRevocationDate, setEditedRevocationDate] = useState("");

  // Fetch themes
  const { data: themes = [] } = useQuery({
    queryKey: ["themes-for-manual-fix"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("id, name, icon")
        .order("name");
      if (error) throw error;
      return data as Theme[];
    },
  });

  // Fetch all categories
  const { data: allCategories = [] } = useQuery({
    queryKey: ["categories-for-manual-fix"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_categories")
        .select("id, name, theme_id, parent_id, keywords")
        .order("name");
      if (error) throw error;
      return data as ThemeCategory[];
    },
  });

  // Get count of legislation per category
  const { data: categoryCounts = {} } = useQuery({
    queryKey: ["category-legislation-counts-manual"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_category_mapping")
        .select("category_id");
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(row => {
        counts[row.category_id] = (counts[row.category_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Fetch legislation for selected category
  const { data: categoryLegislation = [], isLoading: loadingLegislation, refetch } = useQuery({
    queryKey: ["category-legislation", selectedCategoryId],
    queryFn: async (): Promise<LegislationItem[]> => {
      if (!selectedCategoryId) return [];
      
      // Get legislation IDs for this category
      const { data: mappings, error: mappingError } = await supabase
        .from("legislation_category_mapping")
        .select("legislation_id")
        .eq("category_id", selectedCategoryId);
      
      if (mappingError) throw mappingError;
      if (!mappings || mappings.length === 0) return [];

      const legIds = mappings.map(m => m.legislation_id);
      
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, summary, document_url, publication_date, effective_date, revocation_date, origin, entity, source")
        .in("id", legIds)
        .order("publication_date", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedCategoryId,
  });

  const currentItem = categoryLegislation?.[currentIndex];

  // Sync form state with current item
  useEffect(() => {
    if (currentItem) {
      setEditedTitle(currentItem.title || "");
      setEditedSummary(currentItem.summary || "");
      setEditedUrl(currentItem.document_url || "");
      setEditedPublicationDate(currentItem.publication_date || "");
      setEditedEffectiveDate(currentItem.effective_date || "");
      setEditedRevocationDate(currentItem.revocation_date || "");
    }
  }, [currentItem]);

  // Reset index when category changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [selectedCategoryId]);

  // Helper functions for hierarchy
  const getCategoriesForTheme = (themeId: string) => 
    allCategories.filter(c => c.theme_id === themeId && !c.parent_id);
  
  const getSubcategories = (parentId: string) => 
    allCategories.filter(c => c.parent_id === parentId);

  const getCategoryCount = (categoryId: string): number => {
    const directCount = categoryCounts[categoryId] || 0;
    const subs = getSubcategories(categoryId);
    const subCount = subs.reduce((sum, sub) => sum + getCategoryCount(sub.id), 0);
    return directCount + subCount;
  };

  const toggleTheme = (themeId: string) => {
    const newExpanded = new Set(expandedThemes);
    if (newExpanded.has(themeId)) {
      newExpanded.delete(themeId);
    } else {
      newExpanded.add(themeId);
    }
    setExpandedThemes(newExpanded);
    setSelectedThemeId(themeId);
  };

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const selectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
  };

  const handleSave = async () => {
    if (!currentItem) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("legislation")
        .update({
          title: editedTitle.trim() || currentItem.title,
          summary: editedSummary.trim() || null,
          document_url: editedUrl.trim() || null,
          publication_date: editedPublicationDate || null,
          effective_date: editedEffectiveDate || null,
          revocation_date: editedRevocationDate || null,
        })
        .eq("id", currentItem.id);

      if (error) throw error;

      toast.success("Guardado com sucesso!");
      
      // Move to next item
      if (currentIndex < categoryLegislation.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        toast.info("Fim da categoria!");
      }
      
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      queryClient.invalidateQueries({ queryKey: ["category-legislation", selectedCategoryId] });
    } catch (error: any) {
      toast.error("Erro ao guardar: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < categoryLegislation.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const openDocument = () => {
    if (currentItem?.document_url) {
      // Use about:blank technique to completely break referrer chain
      const newWindow = window.open('about:blank', '_blank');
      if (newWindow) {
        newWindow.opener = null;
        newWindow.location.href = currentItem.document_url;
      }
    }
  };

  const generateDreUrl = () => {
    if (!currentItem) return;
    const searchUrl = `https://diariodarepublica.pt/dr/pesquisa/-/search/basic?q=${encodeURIComponent(currentItem.number)}`;
    // Use about:blank technique to completely break referrer chain
    const newWindow = window.open('about:blank', '_blank');
    if (newWindow) {
      newWindow.opener = null;
      newWindow.location.href = searchUrl;
    }
  };

  // Recursive category renderer
  const renderCategory = (category: ThemeCategory, level: number = 0) => {
    const subcats = getSubcategories(category.id);
    const hasSubcats = subcats.length > 0;
    const count = getCategoryCount(category.id);
    const isExpanded = expandedCategories.has(category.id);
    const isSelected = selectedCategoryId === category.id;

    return (
      <div key={category.id} className="space-y-1">
        <div 
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
            isSelected 
              ? "bg-primary text-primary-foreground" 
              : "hover:bg-muted"
          }`}
          style={{ paddingLeft: `${8 + level * 16}px` }}
        >
          {hasSubcats && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0"
              onClick={(e) => { e.stopPropagation(); toggleCategory(category.id); }}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
            </Button>
          )}
          {!hasSubcats && <div className="w-5" />}
          
          <div 
            className="flex-1 flex items-center gap-2 min-w-0"
            onClick={() => selectCategory(category.id)}
          >
            <FolderTree className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="text-sm truncate">{category.name}</span>
            {count > 0 && (
              <Badge variant={isSelected ? "secondary" : "outline"} className="text-xs shrink-0">
                {count}
              </Badge>
            )}
          </div>
        </div>
        
        {hasSubcats && isExpanded && (
          <div className="space-y-1">
            {subcats.map(sub => renderCategory(sub, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Get selected category path for breadcrumbs
  const getSelectedCategoryPath = (): ThemeCategory[] => {
    if (!selectedCategoryId) return [];
    
    const path: ThemeCategory[] = [];
    let current = allCategories.find(c => c.id === selectedCategoryId);
    
    while (current) {
      path.unshift(current);
      current = current.parent_id 
        ? allCategories.find(c => c.id === current!.parent_id) 
        : undefined;
    }
    
    return path;
  };

  const selectedTheme = themes.find(t => t.id === selectedThemeId);
  const categoryPath = getSelectedCategoryPath();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Theme/Category Tree */}
      <Card className="lg:col-span-1 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950">
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-5 w-5 text-amber-600" />
            Navegação por Tema
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <ScrollArea className="h-[500px] pr-2">
            <div className="space-y-2">
              {themes.map(theme => {
                const isExpanded = expandedThemes.has(theme.id);
                const themeCategories = getCategoriesForTheme(theme.id);
                const themeCount = themeCategories.reduce((sum, cat) => sum + getCategoryCount(cat.id), 0);
                
                return (
                  <div key={theme.id} className="space-y-1">
                    <div 
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedThemeId === theme.id 
                          ? "bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800" 
                          : "hover:bg-muted border border-transparent"
                      }`}
                      onClick={() => toggleTheme(theme.id)}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                      <span className="font-medium text-sm">{theme.name}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {themeCount}
                      </Badge>
                    </div>
                    
                    {isExpanded && themeCategories.length > 0 && (
                      <div className="ml-2 space-y-1 border-l-2 border-amber-200 dark:border-amber-800">
                        {themeCategories.map(cat => renderCategory(cat, 0))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right: Legislation Editor */}
      <Card className="lg:col-span-2 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950">
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-600" />
              Editor de Diploma
            </CardTitle>
            {selectedCategoryId && (
              <div className="flex items-center gap-2">
                <AddLegislationToCategoryDialog
                  categoryId={selectedCategoryId}
                  categoryName={categoryPath[categoryPath.length - 1]?.name || "Categoria"}
                  onAdded={() => refetch()}
                />
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loadingLegislation}>
                  {loadingLegislation ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
          
          {/* Breadcrumbs */}
          {categoryPath.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 flex-wrap">
              {selectedTheme && (
                <>
                  <span className="font-medium text-foreground">{selectedTheme.name}</span>
                  <span>/</span>
                </>
              )}
              {categoryPath.map((cat, idx) => (
                <span key={cat.id} className="flex items-center gap-1.5">
                  <span className={idx === categoryPath.length - 1 ? "font-medium text-foreground" : ""}>
                    {cat.name}
                  </span>
                  {idx < categoryPath.length - 1 && <span>/</span>}
                </span>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="px-4 pb-4 space-y-4">
          {!selectedCategoryId ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FolderTree className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-lg font-medium text-muted-foreground">Seleciona uma categoria</p>
              <p className="text-sm text-muted-foreground/80">
                Escolhe um tema e categoria à esquerda para ver a legislação associada.
              </p>
            </div>
          ) : loadingLegislation ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categoryLegislation.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-lg font-medium text-muted-foreground">Sem legislação</p>
              <p className="text-sm text-muted-foreground/80">
                Esta categoria não tem diplomas associados.
              </p>
            </div>
          ) : currentItem ? (
            <>
              {/* Navigation Header */}
              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePrevious}
                    disabled={currentIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    {currentIndex + 1} / {categoryLegislation.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNext}
                    disabled={currentIndex >= categoryLegislation.length - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {currentItem.origin || "PT"}
                  </Badge>
                  {currentItem.source && (
                    <Badge variant="secondary" className="text-xs">
                      {currentItem.source}
                    </Badge>
                  )}
                  {currentItem.document_url && (
                    <Button variant="ghost" size="sm" onClick={openDocument}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {/* Move button */}
                  <MoveLegislationToCategoryDialog
                    legislationId={currentItem.id}
                    legislationNumber={currentItem.number}
                    currentCategoryId={selectedCategoryId!}
                    currentCategoryName={categoryPath[categoryPath.length - 1]?.name || "Categoria"}
                    onMoved={() => refetch()}
                    trigger={
                      <Button variant="outline" size="sm" title="Mover para outra categoria">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    }
                  />
                  
                  {/* Remove from category button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                    title="Remover desta categoria"
                    onClick={async () => {
                      if (!confirm(`Remover "${currentItem.number}" desta categoria?`)) return;
                      try {
                        const { error } = await supabase
                          .from("legislation_category_mapping")
                          .delete()
                          .eq("legislation_id", currentItem.id)
                          .eq("category_id", selectedCategoryId!);
                        if (error) throw error;
                        toast.success("Diploma removido da categoria");
                        queryClient.invalidateQueries({ queryKey: ["category-legislation", selectedCategoryId] });
                        queryClient.invalidateQueries({ queryKey: ["category-legislation-counts-manual"] });
                        refetch();
                      } catch (error: any) {
                        toast.error("Erro: " + error.message);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Diploma Info - Editable */}
              <div className="space-y-4">
                {/* Number (read-only) */}
                <div>
                  <Label className="text-xs text-muted-foreground">Número</Label>
                  <p className="font-mono text-sm font-medium bg-muted/50 px-3 py-2 rounded-md">{currentItem.number}</p>
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Textarea
                    id="title"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    placeholder="Título do diploma..."
                    className="min-h-[60px]"
                  />
                </div>

                {/* Dates */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="publication">Data de Publicação</Label>
                    <Input
                      id="publication"
                      type="date"
                      value={editedPublicationDate}
                      onChange={(e) => setEditedPublicationDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="effective">Data de Entrada em Vigor</Label>
                    <Input
                      id="effective"
                      type="date"
                      value={editedEffectiveDate}
                      onChange={(e) => setEditedEffectiveDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Revocation Date */}
                <div className="space-y-2">
                  <Label htmlFor="revocation" className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Data de Revogação
                  </Label>
                  <Input
                    id="revocation"
                    type="date"
                    value={editedRevocationDate}
                    onChange={(e) => setEditedRevocationDate(e.target.value)}
                    className={editedRevocationDate ? "border-red-300 bg-red-50 dark:bg-red-950/30" : ""}
                  />
                  {editedRevocationDate && (
                    <p className="text-xs text-red-600">Este diploma está marcado como revogado.</p>
                  )}
                </div>

                {/* Summary */}
                <div className="space-y-2">
                  <Label htmlFor="summary">Sumário</Label>
                  <Textarea
                    id="summary"
                    value={editedSummary}
                    onChange={(e) => setEditedSummary(e.target.value)}
                    placeholder="Descrição do diploma..."
                    className="min-h-[100px]"
                  />
                </div>

                {/* URL */}
                <div className="space-y-2">
                  <Label htmlFor="url">URL do Documento</Label>
                  <div className="flex gap-2">
                    <Input
                      id="url"
                      type="url"
                      value={editedUrl}
                      onChange={(e) => setEditedUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <Button variant="outline" size="icon" onClick={generateDreUrl} title="Pesquisar no DRE">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Entity (read-only info) */}
                {currentItem.entity && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Entidade</Label>
                    <p className="text-sm text-muted-foreground">{currentItem.entity}</p>
                  </div>
                )}

                <Separator className="my-4" />

                {/* Category Editor */}
                <LegislationCategoryEditor legislationId={currentItem.id} />

                <Separator className="my-4" />

                {/* Relations Editor */}
                <LegislationRelationsEditor 
                  legislationId={currentItem.id} 
                  legislationNumber={currentItem.number}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleNext}
                  disabled={currentIndex >= categoryLegislation.length - 1}
                >
                  <ChevronRight className="h-4 w-4 mr-2" />
                  Próximo sem guardar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar e Próximo
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
