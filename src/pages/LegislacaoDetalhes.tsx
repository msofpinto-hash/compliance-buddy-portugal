import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RequirementApplicabilitySelect, ApplicabilityBadge } from "@/components/RequirementApplicabilitySelect";
import { LegislationApplicabilitySelect, LegislationApplicabilityBadge } from "@/components/LegislationApplicabilitySelect";
import { EditLegislationDialog } from "@/components/admin/EditLegislationDialog";
import { EditLegislationDatesDialog } from "@/components/admin/EditLegislationDatesDialog";
import { ManageRelationsDialog } from "@/components/admin/ManageRelationsDialog";
import { ManageRequirementsDialog } from "@/components/admin/ManageRequirementsDialog";
import { AssignCategoriesDialog } from "@/components/admin/AssignCategoriesDialog";
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
  Building,
  Pencil,
  Tags,
  FileEdit,
  Settings
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Format requirement text with line breaks between numbered items/paragraphs
function formatRequirementText(text: string): string {
  if (!text) return "";
  
  // Add line break before numbered patterns like "1.", "2.", "a)", "b)", "i)", "ii)", etc.
  let formatted = text
    // Before numbers followed by dot/parenthesis: "1.", "2)", etc.
    .replace(/\s+(\d+[\.\)]\s)/g, "\n$1")
    // Before letters followed by parenthesis: "a)", "b)", etc.
    .replace(/\s+([a-z][\)]\s)/gi, "\n$1")
    // Before roman numerals followed by parenthesis: "i)", "ii)", "iii)", "iv)", etc.
    .replace(/\s+((?:i{1,3}|iv|vi{0,3}|ix|x{1,3})[\)]\s)/gi, "\n$1")
    // Before dash or bullet points
    .replace(/\s+([-–—•]\s)/g, "\n$1")
    // Before "Artigo", "Anexo", "Considerando" keywords
    .replace(/\s+(Art(?:igo)?\.?\s*\d+)/gi, "\n$1")
    .replace(/\s+(Anexo\s+[IVX\d]+)/gi, "\n$1");
  
  // Clean up: remove leading newlines and multiple consecutive newlines
  formatted = formatted.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
  
  return formatted;
}

export default function LegislacaoDetalhes() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [datesDialogOpen, setDatesDialogOpen] = useState(false);
  const [relationsDialogOpen, setRelationsDialogOpen] = useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);

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
  // Fetch ALL requirements without any limit (override Supabase's default 1000 row limit)
  const { data: requirements, isLoading: loadingRequirements } = useQuery({
    queryKey: ["legislation-requirements", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("legal_requirements")
        .select("*")
        .eq("legislation_id", id)
        .order("display_order", { ascending: true, nullsFirst: false })
        .range(0, 9999); // Explicitly fetch up to 10,000 requirements to avoid default limit
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Robust ordering for requirements (guards against bad display_order coming from extraction)
  const sortedRequirements = useMemo(() => {
    const list = (requirements || []) as Array<{
      id: string;
      article: string | null;
      requirement_text: string;
      notes: string | null;
      display_order: number | null;
      created_at?: string;
    }>;

    const romanToInt = (roman: string) => {
      const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
      let total = 0;
      let prev = 0;
      const s = roman.toUpperCase().replace(/[^IVXLCDM]/g, "");
      for (let i = s.length - 1; i >= 0; i--) {
        const val = map[s[i]] || 0;
        if (val < prev) total -= val;
        else {
          total += val;
          prev = val;
        }
      }
      return total;
    };

    const getSortKey = (article: string | null, displayOrder: number | null) => {
      const a = (article || "").trim();
      const lower = a.toLowerCase();

      // 0: considerandos, 1: artigos, 2: anexos, 3: outros
      let typeRank = 3;
      let n1 = Number.POSITIVE_INFINITY;
      let n2 = 0;

      if (lower.startsWith("considerando")) {
        typeRank = 0;
        const m = a.match(/(\d+)/);
        if (m) n1 = parseInt(m[1], 10);
      } else if (lower.includes("art")) {
        typeRank = 1;
        const mArt = a.match(/art\.?\s*(\d+)/i);
        if (mArt) n1 = parseInt(mArt[1], 10);
        const mN = a.match(/n\.?\s*º\s*(\d+)/i) || a.match(/n\.\s*(\d+)/i);
        if (mN) n2 = parseInt(mN[1], 10);
      } else if (lower.includes("anexo")) {
        typeRank = 2;
        // Anexo I / II / 1
        const mRoman = a.match(/anexo\s+([IVXLCDM]+)/i);
        const mNum = a.match(/anexo\s+(\d+)/i);
        if (mRoman) n1 = romanToInt(mRoman[1]);
        else if (mNum) n1 = parseInt(mNum[1], 10);
        else n1 = 0;
      }

      const safeDisplay = displayOrder ?? Number.POSITIVE_INFINITY;
      return { typeRank, n1, n2, safeDisplay, raw: a };
    };

    return [...list].sort((x, y) => {
      const ax = getSortKey(x.article, x.display_order);
      const ay = getSortKey(y.article, y.display_order);

      if (ax.typeRank !== ay.typeRank) return ax.typeRank - ay.typeRank;
      if (ax.n1 !== ay.n1) return ax.n1 - ay.n1;
      if (ax.n2 !== ay.n2) return ax.n2 - ay.n2;

      // If extraction produced a bad display_order, keep it only as tie-breaker
      if (ax.safeDisplay !== ay.safeDisplay) return ax.safeDisplay - ay.safeDisplay;

      return ax.raw.localeCompare(ay.raw, "pt");
    });
  }, [requirements]);

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
  const { data: relations, isLoading: loadingRelations } = useQuery({
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

  // Theme color configuration for badges
  const themeColors: Record<string, { badge: string; badgeDark: string; icon: string; gradient: string }> = {
    "Ambiente": {
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
      badgeDark: "dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700",
      icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
      gradient: "from-emerald-500 to-teal-600"
    },
    "SST": {
      badge: "bg-orange-100 text-orange-800 border-orange-200",
      badgeDark: "dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
      icon: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
      gradient: "from-orange-500 to-red-500"
    },
    "Segurança e Saúde no Trabalho": {
      badge: "bg-orange-100 text-orange-800 border-orange-200",
      badgeDark: "dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
      icon: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
      gradient: "from-orange-500 to-red-500"
    },
    "Energia": {
      badge: "bg-amber-100 text-amber-800 border-amber-200",
      badgeDark: "dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
      icon: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
      gradient: "from-amber-500 to-yellow-500"
    },
    "Qualidade": {
      badge: "bg-sky-100 text-sky-800 border-sky-200",
      badgeDark: "dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700",
      icon: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",
      gradient: "from-sky-500 to-blue-600"
    },
    "Segurança": {
      badge: "bg-rose-100 text-rose-800 border-rose-200",
      badgeDark: "dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700",
      icon: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
      gradient: "from-rose-500 to-red-600"
    },
    "Conciliação": {
      badge: "bg-pink-100 text-pink-800 border-pink-200",
      badgeDark: "dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-700",
      icon: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
      gradient: "from-pink-500 to-rose-500"
    },
  };

  const defaultThemeColor = {
    badge: "bg-stone-100 text-stone-800 border-stone-200",
    badgeDark: "dark:bg-stone-800/50 dark:text-stone-300 dark:border-stone-600",
    icon: "bg-stone-100 text-stone-600 dark:bg-stone-800/50 dark:text-stone-400",
    gradient: "from-stone-500 to-amber-600"
  };

  const getThemeConfig = (themeName: string) => themeColors[themeName] || defaultThemeColor;

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

  // Helper to split EUR-Lex title at the date
  const splitEurlexTitle = (title: string): { title: string; rest: string | null } => {
    if (!title) return { title: '', rest: null };
    
    const monthPattern = '(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';
    const datePattern = new RegExp(`(,\\s*de\\s+\\d{1,2}\\s+de\\s+${monthPattern}\\s+de\\s+\\d{4})(.*)`, 'i');
    
    const match = title.match(datePattern);
    
    if (match) {
      const titlePart = title.substring(0, match.index! + match[1].length);
      const restPart = match[3]?.trim();
      
      let cleanRest = restPart?.replace(/^[,\s]+/, '').trim() || null;
      if (cleanRest && cleanRest.toLowerCase().startsWith('que ')) {
        cleanRest = cleanRest.substring(4).trim();
      }
      
      if (cleanRest && cleanRest.length > 0) {
        cleanRest = cleanRest.charAt(0).toUpperCase() + cleanRest.slice(1);
      }
      
      return { 
        title: titlePart, 
        rest: cleanRest && cleanRest.length > 10 ? cleanRest : null 
      };
    }
    
    return { title, rest: null };
  };

  // Get display title and summary based on origin
  const getDisplayTitleAndSummary = () => {
    if (!legislation) return { displayTitle: '', displaySummary: '' };
    
    if (legislation.origin === 'EU') {
      const { title: euTitle, rest } = splitEurlexTitle(legislation.title);
      return {
        displayTitle: euTitle,
        displaySummary: rest || legislation.summary || ''
      };
    }
    
    return {
      displayTitle: legislation.title,
      displaySummary: legislation.summary || ''
    };
  };

  const { displayTitle, displaySummary } = getDisplayTitleAndSummary();

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
          <div className="flex items-center gap-2">
            {/* Admin Edit Actions */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Editar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Dados Gerais
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDatesDialogOpen(true)}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Datas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCategoriesDialogOpen(true)}>
                    <Tags className="h-4 w-4 mr-2" />
                    Categorias
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setRequirementsDialogOpen(true)}>
                    <FileEdit className="h-4 w-4 mr-2" />
                    Requisitos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRelationsDialogOpen(true)}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Relações
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {legislation.document_url && (
              <Button 
                className="gap-2"
                onClick={() => {
                  // Use about:blank technique to completely break referrer chain
                  const newWindow = window.open('about:blank', '_blank');
                  if (newWindow) {
                    newWindow.opener = null;
                    newWindow.location.href = legislation.document_url!;
                  }
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Ver Documento Original
              </Button>
            )}
          </div>
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
                <CardTitle className={`text-2xl ${isRevoked ? 'line-through decoration-destructive/50 text-muted-foreground' : ''} ${legislation.origin === 'PT' ? 'font-bold' : ''}`}>
                  {displayTitle}
                </CardTitle>
                {displaySummary && (
                  <CardDescription className={`text-base mt-2 ${isRevoked ? 'line-through decoration-destructive/50' : ''}`}>
                    {displaySummary}
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
                  <Badge variant="secondary">{sortedRequirements.length} requisitos</Badge>
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
                ) : sortedRequirements.length > 0 ? (
                  <div className="space-y-4">
                    {sortedRequirements.map((req, index) => (
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
                                    <p className="text-sm font-medium text-primary">{req.article}</p>
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
                              <div className="text-sm whitespace-pre-line">{formatRequirementText(req.requirement_text)}</div>
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
                  <TooltipProvider delayDuration={200}>
                    <div className="space-y-4">
                      {themes.map((theme) => {
                        const themeConfig = getThemeConfig(theme.name);
                        return (
                          <div key={theme.id}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`flex h-6 w-6 items-center justify-center rounded ${themeConfig.icon}`}>
                                <FileText className="h-3 w-3" />
                              </div>
                              <span className="font-medium text-sm">{theme.name}</span>
                            </div>
                            <div className="ml-8 flex flex-wrap gap-1.5">
                              {categories
                                .filter((c) => c.themeName === theme.name)
                                .map((cat) => (
                                  <Tooltip key={cat.id}>
                                    <TooltipTrigger asChild>
                                      <Badge 
                                        variant="outline" 
                                        className={`text-xs border cursor-default transition-all hover:scale-105 hover:shadow-sm ${themeConfig.badge} ${themeConfig.badgeDark}`}
                                      >
                                        {cat.name}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent 
                                      side="top" 
                                      className="bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 text-xs"
                                    >
                                      <span className="text-muted-foreground">{theme.name}</span>
                                      <span className="mx-1.5 text-muted-foreground/60">›</span>
                                      <span className="font-medium">{cat.name}</span>
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TooltipProvider>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem categorias atribuídas
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Relations */}
            {loadingRelations ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Relações com outros diplomas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-3/4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : ((relations?.outgoing?.length ?? 0) > 0 || (relations?.incoming?.length ?? 0) > 0) ? (
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
                    {(relations?.outgoing?.length ?? 0) > 0 && (
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
                    {(relations?.incoming?.length ?? 0) > 0 && (
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
            ) : null}

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

      {/* Admin Edit Dialogs */}
      {isAdmin && legislation && (
        <>
          <EditLegislationDialog
            legislation={{
              ...legislation,
              categories: categories.map(c => ({ 
                id: c.id, 
                name: c.name, 
                full_path: `${c.themeName} > ${c.name}`,
                theme_name: c.themeName,
                parent_id: null 
              })),
              relations: (relations?.outgoing || []).map((r: any) => ({
                id: r.id,
                relation_type: r.relation_type,
                target_id: r.target?.id || r.target_legislation_id,
                target_number: r.target?.number || '',
                target_title: r.target?.title || ''
              }))
            }}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
          <ManageRelationsDialog
            legislation={{
              ...legislation,
              categories: categories.map(c => ({ 
                id: c.id, 
                name: c.name, 
                full_path: `${c.themeName} > ${c.name}`,
                theme_name: c.themeName,
                parent_id: null 
              })),
              relations: (relations?.outgoing || []).map((r: any) => ({
                id: r.id,
                relation_type: r.relation_type,
                target_id: r.target?.id || r.target_legislation_id,
                target_number: r.target?.number || '',
                target_title: r.target?.title || ''
              }))
            }}
            open={relationsDialogOpen}
            onOpenChange={setRelationsDialogOpen}
          />
          <ManageRequirementsDialog
            legislation={{
              ...legislation,
              categories: categories.map(c => ({ 
                id: c.id, 
                name: c.name, 
                full_path: `${c.themeName} > ${c.name}`,
                theme_name: c.themeName,
                parent_id: null 
              })),
              relations: (relations?.outgoing || []).map((r: any) => ({
                id: r.id,
                relation_type: r.relation_type,
                target_id: r.target?.id || r.target_legislation_id,
                target_number: r.target?.number || '',
                target_title: r.target?.title || ''
              }))
            }}
            open={requirementsDialogOpen}
            onOpenChange={setRequirementsDialogOpen}
          />
          <AssignCategoriesDialog
            legislation={{
              ...legislation,
              categories: categories.map(c => ({ 
                id: c.id, 
                name: c.name, 
                full_path: `${c.themeName} > ${c.name}`,
                theme_name: c.themeName,
                parent_id: null 
              })),
              relations: (relations?.outgoing || []).map((r: any) => ({
                id: r.id,
                relation_type: r.relation_type,
                target_id: r.target?.id || r.target_legislation_id,
                target_number: r.target?.number || '',
                target_title: r.target?.title || ''
              }))
            }}
            open={categoriesDialogOpen}
            onOpenChange={setCategoriesDialogOpen}
          />
          <EditLegislationDatesDialog
            legislation={legislation as any}
            open={datesDialogOpen}
            onOpenChange={setDatesDialogOpen}
          />
        </>
      )}
    </div>
  );
}
