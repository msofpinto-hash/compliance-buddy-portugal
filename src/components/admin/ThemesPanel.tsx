import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Palette } from "lucide-react";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { ThemeCard } from "./ThemeCard";

export function ThemesPanel() {
  const { data: themes, isLoading, error } = useThemesWithCategories();

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

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Temas</CardDescription>
            <CardTitle className="text-3xl">{themes?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Subcategorias</CardDescription>
            <CardTitle className="text-3xl">{totalCategories}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Keywords Configuradas</CardDescription>
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
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Temas e Subcategorias
          </CardTitle>
          <CardDescription>
            Gerencie os temas e subcategorias para categorização automática de legislação
          </CardDescription>
        </CardHeader>
        <CardContent>
          {themes && themes.length > 0 ? (
            <div className="space-y-4">
              {themes.map((theme) => (
                <ThemeCard key={theme.id} theme={theme} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Palette className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Nenhum tema configurado</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
