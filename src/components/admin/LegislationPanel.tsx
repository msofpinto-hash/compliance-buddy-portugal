import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, Loader2, Calendar, Building2 } from "lucide-react";
import { useLegislationWithCategories } from "@/hooks/useLegislation";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

export function LegislationPanel() {
  const { data: legislation, isLoading, error } = useLegislationWithCategories();

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
          <p className="text-destructive">Erro ao carregar legislação: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const dreCount = legislation?.filter(l => l.source === 'dre').length || 0;
  const manualCount = legislation?.filter(l => l.source === 'manual' || !l.source).length || 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Legislação</CardDescription>
            <CardTitle className="text-3xl">{legislation?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sincronizado (DRE)</CardDescription>
            <CardTitle className="text-3xl text-primary">{dreCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Adicionado Manual</CardDescription>
            <CardTitle className="text-3xl">{manualCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Legislation List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Legislação Importada
          </CardTitle>
          <CardDescription>
            Documentos legislativos sincronizados do DRE
          </CardDescription>
        </CardHeader>
        <CardContent>
          {legislation && legislation.length > 0 ? (
            <div className="space-y-4">
              {legislation.map((leg) => (
                <div
                  key={leg.id}
                  className="rounded-lg border p-4 transition-all hover:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={leg.source === 'dre' ? 'default' : 'secondary'}>
                          {leg.source === 'dre' ? 'DRE' : 'Manual'}
                        </Badge>
                        <span className="font-mono text-sm text-muted-foreground">
                          {leg.number}
                        </span>
                      </div>
                      
                      <h4 className="font-semibold">{leg.title}</h4>
                      
                      {leg.summary && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {leg.summary}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {leg.entity && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {leg.entity}
                          </span>
                        )}
                        {leg.publication_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(leg.publication_date), "d 'de' MMMM 'de' yyyy", { locale: pt })}
                          </span>
                        )}
                      </div>

                      {/* Categories */}
                      {leg.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {leg.categories.map((cat) => (
                            <Badge key={cat.id} variant="outline" className="text-xs">
                              {cat.theme_name} → {cat.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {leg.document_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                      >
                        <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p>Nenhuma legislação importada ainda</p>
              <p className="text-sm">Execute uma sincronização para importar documentos</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
