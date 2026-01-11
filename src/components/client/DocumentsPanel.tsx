import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Search, 
  FileText, 
  Upload,
  Filter,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Clock
} from "lucide-react";
import { RequirementDocuments } from "./RequirementDocuments";

interface DocumentsPanelProps {
  organizationIds: string[];
}

export function DocumentsPanel({ organizationIds }: DocumentsPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [legislationFilter, setLegislationFilter] = useState<string>("all");

  // Fetch all requirements with their legislation
  const { data: requirements, isLoading } = useQuery({
    queryKey: ["org-requirements-with-docs", organizationIds],
    queryFn: async () => {
      if (organizationIds.length === 0) return [];

      // First get organization's legislation
      const { data: orgLeg, error: orgError } = await supabase
        .from("organization_legislation")
        .select("legislation_id, organization_id")
        .in("organization_id", organizationIds);

      if (orgError) throw orgError;
      
      const legislationIds = [...new Set(orgLeg?.map(l => l.legislation_id) || [])];
      if (legislationIds.length === 0) return [];

      // Get requirements for these legislations
      const { data: reqs, error: reqError } = await supabase
        .from("legal_requirements")
        .select(`
          id,
          article,
          requirement_text,
          legislation_id,
          legislation(id, number, title)
        `)
        .in("legislation_id", legislationIds)
        .order("article");

      if (reqError) throw reqError;

      // Get applicabilities for status
      const { data: applicabilities, error: appError } = await supabase
        .from("applicabilities")
        .select("requirement_id, compliance_status, evidence_files, organization_id")
        .in("organization_id", organizationIds);

      if (appError) throw appError;

      // Merge data
      const appMap = new Map(applicabilities?.map(a => [`${a.organization_id}-${a.requirement_id}`, a]));
      
      return reqs?.map(req => {
        // Find org for this legislation
        const orgForLeg = orgLeg?.find(ol => ol.legislation_id === req.legislation_id);
        const orgId = orgForLeg?.organization_id || organizationIds[0];
        const app = appMap.get(`${orgId}-${req.id}`);
        
        return {
          ...req,
          organizationId: orgId,
          complianceStatus: app?.compliance_status,
          hasDocuments: (app?.evidence_files as string[] | null)?.length ? true : false,
          documentCount: (app?.evidence_files as string[] | null)?.length || 0,
        };
      }) || [];
    },
    enabled: organizationIds.length > 0,
  });

  // Get unique legislations for filter
  const legislations = requirements
    ? [...new Map(requirements.map(r => [(r.legislation as any)?.id, r.legislation])).values()]
        .filter(Boolean)
        .sort((a: any, b: any) => a.number.localeCompare(b.number))
    : [];

  // Filter requirements
  const filteredRequirements = requirements?.filter((req) => {
    const matchesSearch = !searchTerm || 
      req.requirement_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.article?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.legislation as any)?.number.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === "with-docs") {
      matchesStatus = req.hasDocuments;
    } else if (statusFilter === "without-docs") {
      matchesStatus = !req.hasDocuments;
    } else if (statusFilter === "conforme") {
      matchesStatus = req.complianceStatus === "conforme";
    } else if (statusFilter === "nao_conforme") {
      matchesStatus = req.complianceStatus === "nao_conforme";
    } else if (statusFilter === "em_curso") {
      matchesStatus = !req.complianceStatus || req.complianceStatus === "em_curso";
    }

    const matchesLegislation = legislationFilter === "all" || 
      (req.legislation as any)?.id === legislationFilter;

    return matchesSearch && matchesStatus && matchesLegislation;
  });

  // Stats
  const stats = {
    total: requirements?.length || 0,
    withDocs: requirements?.filter(r => r.hasDocuments).length || 0,
    conforme: requirements?.filter(r => r.complianceStatus === "conforme").length || 0,
    naoConforme: requirements?.filter(r => r.complianceStatus === "nao_conforme").length || 0,
    emCurso: requirements?.filter(r => !r.complianceStatus || r.complianceStatus === "em_curso").length || 0,
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (!requirements || requirements.length === 0) {
    return (
      <div className="text-center py-16">
        <FolderOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-xl font-semibold mb-2">Sem Requisitos Disponíveis</h3>
        <p className="text-muted-foreground">
          Não existem requisitos legais associados à sua organização.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Evidências Documentais</h2>
        <p className="text-muted-foreground">
          Carregue documentos para comprovar a conformidade com os requisitos legais
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total de Requisitos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Com Documentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.withDocs}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.withDocs / stats.total) * 100) : 0}% documentados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Conformes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.conforme}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Não Conformes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.naoConforme}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar requisitos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os requisitos</SelectItem>
            <SelectItem value="with-docs">Com documentos</SelectItem>
            <SelectItem value="without-docs">Sem documentos</SelectItem>
            <SelectItem value="conforme">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Conformes
              </div>
            </SelectItem>
            <SelectItem value="nao_conforme">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Não Conformes
              </div>
            </SelectItem>
            <SelectItem value="em_curso">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                Em Avaliação
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={legislationFilter} onValueChange={setLegislationFilter}>
          <SelectTrigger className="w-full sm:w-[250px]">
            <SelectValue placeholder="Filtrar por diploma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os diplomas</SelectItem>
            {legislations.map((leg: any) => (
              <SelectItem key={leg.id} value={leg.id}>
                {leg.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredRequirements?.length || 0} de {requirements.length} requisitos
        </p>
      </div>

      {/* Requirements list */}
      <ScrollArea className="h-[calc(100vh-480px)] min-h-[400px]">
        <div className="space-y-4 pr-4">
          {filteredRequirements?.map((req) => (
            <RequirementDocuments
              key={req.id}
              organizationId={req.organizationId}
              requirementId={req.id}
              requirementText={req.requirement_text}
              article={req.article || undefined}
              legislationNumber={(req.legislation as any)?.number || ""}
              complianceStatus={req.complianceStatus}
            />
          ))}
          
          {filteredRequirements?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum requisito encontrado com os filtros selecionados</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
