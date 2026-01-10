import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, FileText, Loader2, Calendar, Building2, Tags, FileEdit, Search, CalendarDays } from "lucide-react";
import { useLegislationWithCategories, type LegislationWithCategories } from "@/hooks/useLegislation";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { AssignCategoriesDialog } from "./AssignCategoriesDialog";
import { ManageRequirementsDialog } from "./ManageRequirementsDialog";
import { EditLegislationDatesDialog } from "./EditLegislationDatesDialog";
import { LegislationTimeline } from "./LegislationTimeline";

export function LegislationPanel() {
  const { data: legislation, isLoading, error } = useLegislationWithCategories();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLegislation, setSelectedLegislation] = useState<LegislationWithCategories | null>(null);
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [datesDialogOpen, setDatesDialogOpen] = useState(false);

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

  const filteredLegislation = legislation?.filter(leg =>
    leg.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    leg.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    leg.summary?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const dreCount = legislation?.filter(l => l.source === 'dre').length || 0;
  const eurlexCount = legislation?.filter(l => l.source === 'eurlex').length || 0;
  const manualCount = legislation?.filter(l => l.source === 'manual' || !l.source).length || 0;

  const openCategoriesDialog = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setCategoriesDialogOpen(true);
  };

  const openRequirementsDialog = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setRequirementsDialogOpen(true);
  };

  const openDatesDialog = (leg: LegislationWithCategories) => {
    setSelectedLegislation(leg);
    setDatesDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Legislação</CardDescription>
            <CardTitle className="text-3xl">{legislation?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>DRE (Portugal)</CardDescription>
            <CardTitle className="text-3xl text-green-600">{dreCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>EUR-Lex (UE)</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{eurlexCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Manual</CardDescription>
            <CardTitle className="text-3xl">{manualCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Legislation List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Legislação Importada
              </CardTitle>
              <CardDescription>
                Gerencie categorias e requisitos legais
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar legislação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLegislation && filteredLegislation.length > 0 ? (
            <div className="space-y-4">
              {filteredLegislation.map((leg) => (
                <div
                  key={leg.id}
                  className="rounded-lg border p-4 transition-all hover:bg-accent/50"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge 
                          variant="outline"
                          className={
                            leg.source === 'dre' 
                              ? 'bg-green-500/10 text-green-700 border-green-300' 
                              : leg.source === 'eurlex'
                                ? 'bg-blue-500/10 text-blue-700 border-blue-300'
                                : ''
                          }
                        >
                          {leg.source === 'dre' ? 'DRE' : leg.source === 'eurlex' ? 'EUR-Lex' : 'Manual'}
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

                      {/* Timeline */}
                      <LegislationTimeline
                        publicationDate={leg.publication_date}
                        effectiveDate={leg.effective_date}
                        revocationDate={(leg as any).revocation_date}
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 lg:flex-col">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDatesDialog(leg)}
                        className="gap-2"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Datas
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCategoriesDialog(leg)}
                        className="gap-2"
                      >
                        <Tags className="h-4 w-4" />
                        Categorias
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRequirementsDialog(leg)}
                        className="gap-2"
                      >
                        <FileEdit className="h-4 w-4" />
                        Requisitos
                      </Button>
                      {leg.document_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <a href={leg.document_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
              {searchTerm ? (
                <p>Nenhuma legislação encontrada para "{searchTerm}"</p>
              ) : (
                <>
                  <p>Nenhuma legislação importada ainda</p>
                  <p className="text-sm">Execute uma sincronização para importar documentos</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AssignCategoriesDialog
        legislation={selectedLegislation}
        open={categoriesDialogOpen}
        onOpenChange={setCategoriesDialogOpen}
      />
      <ManageRequirementsDialog
        legislation={selectedLegislation}
        open={requirementsDialogOpen}
        onOpenChange={setRequirementsDialogOpen}
      />
      <EditLegislationDatesDialog
        legislation={selectedLegislation}
        open={datesDialogOpen}
        onOpenChange={setDatesDialogOpen}
      />
    </div>
  );
}
