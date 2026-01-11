import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { RequirementApplicabilitySelect, ApplicabilityBadge } from "@/components/RequirementApplicabilitySelect";
import { LegislationApplicabilitySelect, LegislationApplicabilityBadge } from "@/components/LegislationApplicabilitySelect";
import { 
  ArrowLeft, 
  ExternalLink, 
  Calendar, 
  Building2, 
  FileText,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Link2,
  BookOpen,
  Flag,
  Globe,
  Building
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

export default function LegislacaoDetalhes() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();

  // Fetch user's organization
  const { data: userOrganization } = useQuery({
    queryKey: ["user-organization", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("organization_id, organizations(id, name)")
        .eq("user_id", user.id)
        .not("organization_id", "is", null)
        .maybeSingle();
      if (error) throw error;
      return data?.organizations || null;
    },
    enabled: !!user,
  });

  // Fetch legislation details
  const { data: legislation, isLoading, error } = useQuery({
    queryKey: ["legislation-details", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("legislation")
        .select(`
          *,
          legislation_category_mapping(
            theme_categories(
              id, 
              name, 
              themes(id, name, icon)
            )
          )
        `)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch legal requirements
  const { data: requirements, isLoading: loadingRequirements } = useQuery({
    queryKey: ["legislation-requirements", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("legal_requirements")
        .select("*")
        .eq("legislation_id", id)
        .order("article", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch applicabilities for the user's organization (requirements)
  const { data: applicabilities } = useQuery({
    queryKey: ["requirement-applicabilities", id, userOrganization?.id],
    queryFn: async () => {
      if (!id || !userOrganization?.id) return {};
      const { data, error } = await supabase
        .from("applicabilities")
        .select("requirement_id, applicability_type")
        .eq("organization_id", userOrganization.id);
      if (error) throw error;
      
      // Convert to map for easy lookup
      const map: Record<string, string> = {};
      data?.forEach((a) => {
        map[a.requirement_id] = a.applicability_type || "nao_avaliado";
      });
      return map;
    },
    enabled: !!id && !!userOrganization?.id,
  });

  // Fetch legislation applicability for the user's organization
  const { data: legislationApplicability } = useQuery({
    queryKey: ["legislation-applicability", id, userOrganization?.id],
    queryFn: async () => {
      if (!id || !userOrganization?.id) return null;
      const { data, error } = await supabase
        .from("organization_legislation")
        .select("id, applicability_type")
        .eq("legislation_id", id)
        .eq("organization_id", userOrganization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!userOrganization?.id,
  });

  // Fetch relations (this legislation affects or is affected by)
  const { data: relations } = useQuery({
    queryKey: ["legislation-relations", id],
    queryFn: async () => {
      if (!id) return { outgoing: [], incoming: [] };
      
      // Outgoing relations (this legislation affects others)
      const { data: outgoing, error: outError } = await supabase
        .from("legislation_relations")
        .select(`
          *,
          target:legislation!legislation_relations_target_legislation_id_fkey(id, number, title)
        `)
        .eq("source_legislation_id", id);
      
      // Incoming relations (others affect this legislation)
      const { data: incoming, error: inError } = await supabase
        .from("legislation_relations")
        .select(`
          *,
          source:legislation!legislation_relations_source_legislation_id_fkey(id, number, title)
        `)
        .eq("target_legislation_id", id);
      
      if (outError) throw outError;
      if (inError) throw inError;
      
      return { outgoing: outgoing || [], incoming: incoming || [] };
    },
    enabled: !!id,
  });

  // Get unique themes and categories
  const getThemesAndCategories = () => {
    if (!legislation?.legislation_category_mapping) return { themes: [], categories: [] };
    
    const themesMap = new Map<string, { id: string; name: string; icon?: string }>();
    const categories: { id: string; name: string; themeName: string }[] = [];
    
    legislation.legislation_category_mapping.forEach((mapping: any) => {
      if (mapping.theme_categories) {
        const cat = mapping.theme_categories;
        if (cat.themes) {
          themesMap.set(cat.themes.id, cat.themes);
        }
        categories.push({
          id: cat.id,
          name: cat.name,
          themeName: cat.themes?.name || "",
        });
      }
    });
    
    return {
      themes: Array.from(themesMap.values()),
      categories,
    };
  };

  const { themes, categories } = getThemesAndCategories();

  // Relation type labels - matching DB constraint values
  const relationTypeLabels: Record<string, { label: string; color: string; inverseLabel: string }> = {
    revogado: { label: "Revoga", color: "destructive", inverseLabel: "Revogado por" },
    revogacao_parcial: { label: "Revoga parcialmente", color: "destructive", inverseLabel: "Rev. parcial por" },
    alteracao: { label: "Altera", color: "default", inverseLabel: "Alterado por" },
    transposicao: { label: "Transpõe", color: "outline", inverseLabel: "Transposto por" },
    regulamentacao: { label: "Regulamenta", color: "secondary", inverseLabel: "Regulamentado por" },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="container mx-auto flex items-center gap-3 px-4 py-4">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-8 w-64" />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !legislation) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="container mx-auto flex items-center gap-3 px-4 py-4">
            <Link to="/biblioteca">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Legislação não encontrada</h1>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium text-lg mb-2">Diploma não encontrado</h3>
              <p className="text-muted-foreground mb-4">
                O diploma solicitado não existe ou foi removido.
              </p>
              <Link to="/biblioteca">
                <Button>Voltar à Biblioteca</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const isRevoked = !!legislation.revocation_date;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/biblioteca">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{legislation.number}</h1>
              <p className="text-sm text-muted-foreground">Detalhes do Diploma</p>
            </div>
          </div>
          {legislation.document_url && (
            <a href={legislation.document_url} target="_blank" rel="noopener noreferrer">
              <Button className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Ver Documento Original
              </Button>
            </a>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title and Summary */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge 
                    variant="outline"
                    className={
                      legislation.origin === 'PT' 
                        ? 'bg-green-500/10 text-green-700 border-green-300' 
                        : legislation.origin === 'EU'
                          ? 'bg-blue-500/10 text-blue-700 border-blue-300'
                          : ''
                    }
                  >
                    {legislation.origin === 'PT' ? (
                      <><Flag className="h-3 w-3 mr-1" />DRE (Portugal)</>
                    ) : legislation.origin === 'EU' ? (
                      <><Globe className="h-3 w-3 mr-1" />EUR-Lex (UE)</>
                    ) : (
                      'Manual'
                    )}
                  </Badge>
                  {isRevoked && (
                    <Badge variant="destructive">Revogado</Badge>
                  )}
                </div>
                <CardTitle className="text-2xl">{legislation.title}</CardTitle>
                {legislation.summary && (
                  <CardDescription className="text-base mt-2">
                    {legislation.summary}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {/* Metadata Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {legislation.entity && (
                    <div className="flex items-start gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Entidade</p>
                        <p className="text-sm text-muted-foreground">{legislation.entity}</p>
                      </div>
                    </div>
                  )}
                  {legislation.publication_date && (
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Data de Publicação</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(legislation.publication_date), "d MMMM yyyy", { locale: pt })}
                        </p>
                      </div>
                    </div>
                  )}
                  {legislation.effective_date && (
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Entrada em Vigor</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(legislation.effective_date), "d MMMM yyyy", { locale: pt })}
                        </p>
                      </div>
                    </div>
                  )}
                  {legislation.revocation_date && (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Data de Revogação</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(legislation.revocation_date), "d MMMM yyyy", { locale: pt })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Legislation Applicability */}
                {userOrganization && (
                  <Separator className="my-4" />
                )}
                {userOrganization && (
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-3">
                      <Building className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Aplicabilidade do Diploma</p>
                        <p className="text-xs text-muted-foreground">
                          Classificação para {userOrganization.name}
                        </p>
                      </div>
                    </div>
                    <LegislationApplicabilitySelect
                      legislationId={id!}
                      organizationId={userOrganization.id}
                      currentValue={legislationApplicability?.applicability_type || "nao_avaliado"}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Legal Requirements */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Requisitos Legais
                    </CardTitle>
                    <CardDescription>
                      Obrigações e requisitos extraídos deste diploma
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{requirements?.length || 0} requisitos</Badge>
                </div>
                {userOrganization && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-2">
                    <Building className="h-4 w-4" />
                    <span>Classificando para: <strong className="text-foreground">{userOrganization.name}</strong></span>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {loadingRequirements ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : requirements && requirements.length > 0 ? (
                  <div className="space-y-4">
                    {requirements.map((req, index) => (
                      <div key={req.id}>
                        <div className="rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3 mb-1">
                                <div className="flex-1">
                                  {req.article && (
                                    <p className="text-sm font-medium text-primary">
                                      {req.article}
                                    </p>
                                  )}
                                </div>
                                {userOrganization ? (
                                  <RequirementApplicabilitySelect
                                    requirementId={req.id}
                                    organizationId={userOrganization.id}
                                    currentValue={applicabilities?.[req.id] || "nao_avaliado"}
                                  />
                                ) : (
                                  <ApplicabilityBadge value="nao_avaliado" />
                                )}
                              </div>
                              <p className="text-sm">{req.requirement_text}</p>
                              {req.notes && (
                                <p className="text-sm text-muted-foreground mt-2 italic">
                                  Nota: {req.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">
                      Nenhum requisito legal definido para este diploma
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Themes and Categories */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Temas e Categorias</CardTitle>
              </CardHeader>
              <CardContent>
                {themes.length > 0 ? (
                  <div className="space-y-4">
                    {themes.map((theme) => (
                      <div key={theme.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary">
                            <FileText className="h-3 w-3" />
                          </div>
                          <span className="font-medium text-sm">{theme.name}</span>
                        </div>
                        <div className="ml-8 flex flex-wrap gap-1">
                          {categories
                            .filter((c) => c.themeName === theme.name)
                            .map((cat) => (
                              <Badge key={cat.id} variant="secondary" className="text-xs">
                                {cat.name}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem categorias atribuídas
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Relations */}
            {(relations?.outgoing.length > 0 || relations?.incoming.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Relações com outros diplomas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Outgoing relations - this legislation affects others */}
                    {relations?.outgoing.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Este diploma:</p>
                        <div className="space-y-2">
                          {relations.outgoing.map((rel: any) => {
                            const typeInfo = relationTypeLabels[rel.relation_type] || { label: rel.relation_type, color: "outline" };
                            return (
                              <div key={rel.id} className="flex items-center gap-2 pl-2 border-l-2 border-primary/30">
                                <Badge variant={typeInfo.color as any} className="shrink-0 text-xs">
                                  {typeInfo.label}
                                </Badge>
                                <Link 
                                  to={`/legislacao/${rel.target?.id}`}
                                  className="text-sm hover:underline text-primary truncate"
                                  title={rel.target?.title}
                                >
                                  {rel.target?.number}
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Incoming relations - others affect this legislation */}
                    {relations?.incoming.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Este diploma é afetado por:</p>
                        <div className="space-y-2">
                          {relations.incoming.map((rel: any) => {
                            const typeInfo = relationTypeLabels[rel.relation_type] || { label: rel.relation_type, color: "outline", inverseLabel: rel.relation_type };
                            return (
                              <div key={rel.id} className="flex items-center gap-2 pl-2 border-l-2 border-muted-foreground/30">
                                <Badge variant={typeInfo.color as any} className="shrink-0 text-xs">
                                  {typeInfo.inverseLabel}
                                </Badge>
                                <Link 
                                  to={`/legislacao/${rel.source?.id}`}
                                  className="text-sm hover:underline text-primary truncate"
                                  title={rel.source?.title}
                                >
                                  {rel.source?.number}
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Cronologia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative pl-6 space-y-4">
                  <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border" />
                  
                  {legislation.publication_date && (
                    <div className="relative">
                      <div className="absolute -left-4 top-1 h-3 w-3 rounded-full bg-primary" />
                      <p className="text-sm font-medium">Publicação</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(legislation.publication_date), "d MMM yyyy", { locale: pt })}
                      </p>
                    </div>
                  )}
                  
                  {legislation.effective_date && (
                    <div className="relative">
                      <div className="absolute -left-4 top-1 h-3 w-3 rounded-full bg-green-500" />
                      <p className="text-sm font-medium">Entrada em Vigor</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(legislation.effective_date), "d MMM yyyy", { locale: pt })}
                      </p>
                    </div>
                  )}
                  
                  {legislation.revocation_date && (
                    <div className="relative">
                      <div className="absolute -left-4 top-1 h-3 w-3 rounded-full bg-destructive" />
                      <p className="text-sm font-medium">Revogação</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(legislation.revocation_date), "d MMM yyyy", { locale: pt })}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
