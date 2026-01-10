import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Search, 
  ExternalLink,
  Filter,
  ArrowLeft,
  Calendar,
  Building2
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useThemesWithCategories } from "@/hooks/useThemes";

export default function Biblioteca() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");

  // Fetch themes
  const { data: themes } = useThemesWithCategories();

  // Fetch legislation with categories
  const { data: legislation, isLoading } = useQuery({
    queryKey: ["biblioteca-legislation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select(`
          *,
          legislation_category_mapping(
            category_id,
            theme_categories(id, name, theme_id, themes(id, name))
          )
        `)
        .order("publication_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Filter legislation
  const filteredLegislation = useMemo(() => {
    if (!legislation) return [];
    
    return legislation.filter((leg) => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        leg.title?.toLowerCase().includes(searchLower) ||
        leg.number?.toLowerCase().includes(searchLower) ||
        leg.summary?.toLowerCase().includes(searchLower) ||
        leg.entity?.toLowerCase().includes(searchLower);

      // Source filter
      const matchesSource = selectedSource === "all" || leg.source === selectedSource;

      // Theme filter
      let matchesTheme = selectedTheme === "all";
      if (!matchesTheme && leg.legislation_category_mapping) {
        matchesTheme = leg.legislation_category_mapping.some(
          (mapping: any) => mapping.theme_categories?.theme_id === selectedTheme
        );
      }

      return matchesSearch && matchesSource && matchesTheme;
    });
  }, [legislation, searchTerm, selectedSource, selectedTheme]);

  // Get unique themes from legislation mappings
  const getLegislationThemes = (leg: any) => {
    if (!leg.legislation_category_mapping) return [];
    const themeSet = new Map<string, string>();
    leg.legislation_category_mapping.forEach((mapping: any) => {
      if (mapping.theme_categories?.themes) {
        themeSet.set(mapping.theme_categories.themes.id, mapping.theme_categories.themes.name);
      }
    });
    return Array.from(themeSet.values());
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to={user ? "/dashboard" : "/"}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Biblioteca de Legislação</h1>
              <p className="text-sm text-muted-foreground">
                Pesquise e explore toda a legislação
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por título, número ou entidade..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={selectedTheme} onValueChange={setSelectedTheme}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Tema" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os temas</SelectItem>
                    {themes?.map((theme) => (
                      <SelectItem key={theme.id} value={theme.id}>
                        {theme.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Fonte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as fontes</SelectItem>
                    <SelectItem value="dre">DRE</SelectItem>
                    <SelectItem value="eurlex">EUR-Lex</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results count */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredLegislation.length} diploma{filteredLegislation.length !== 1 ? "s" : ""} encontrado{filteredLegislation.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Legislation List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : filteredLegislation.length > 0 ? (
          <div className="space-y-4">
            {filteredLegislation.map((leg) => {
              const legThemes = getLegislationThemes(leg);
              return (
                <Card key={leg.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header with badges */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant={leg.source === "dre" ? "default" : leg.source === "eurlex" ? "secondary" : "outline"}>
                            {leg.source === "dre" ? "DRE" : leg.source === "eurlex" ? "EUR-Lex" : "Manual"}
                          </Badge>
                          <span className="font-semibold">{leg.number}</span>
                          {leg.revocation_date && (
                            <Badge variant="destructive">Revogado</Badge>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="font-medium text-lg mb-2">{leg.title}</h3>

                        {/* Summary */}
                        {leg.summary && (
                          <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                            {leg.summary}
                          </p>
                        )}

                        {/* Metadata */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                          {leg.entity && (
                            <div className="flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              {leg.entity}
                            </div>
                          )}
                          {leg.publication_date && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(leg.publication_date), "d MMMM yyyy", { locale: pt })}
                            </div>
                          )}
                        </div>

                        {/* Themes */}
                        {legThemes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {legThemes.map((themeName, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {themeName}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {leg.document_url && (
                        <a
                          href={leg.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0"
                        >
                          <Button variant="outline" size="sm" className="gap-2">
                            <ExternalLink className="h-4 w-4" />
                            Ver Diploma
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium text-lg mb-2">Nenhum diploma encontrado</h3>
              <p className="text-muted-foreground">
                Tente ajustar os filtros de pesquisa
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
