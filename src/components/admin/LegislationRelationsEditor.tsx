import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link2, Plus, X, Loader2, ArrowRight, Search, ExternalLink, Globe, FileText, RefreshCw, AlertCircle, MoreHorizontal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Props {
  legislationId: string;
  legislationNumber: string;
}

const RELATION_TYPES = [
  { value: "altera", label: "Altera", inverse: "alterado_por" },
  { value: "alterado_por", label: "Alterado por", inverse: "altera" },
  { value: "revoga", label: "Revoga", inverse: "revogado_por" },
  { value: "revogado_por", label: "Revogado por", inverse: "revoga" },
  { value: "regulamenta", label: "Regulamenta", inverse: "regulamentado_por" },
  { value: "regulamentado_por", label: "Regulamentado por", inverse: "regulamenta" },
  { value: "complementa", label: "Complementa", inverse: "complementado_por" },
  { value: "transpoe", label: "Transpõe", inverse: "transposto_por" },
];

const RELATION_COLORS: Record<string, string> = {
  altera: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  alterado_por: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  revoga: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  revogado_por: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  regulamenta: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  regulamentado_por: "bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400",
  complementa: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  transpoe: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
};

interface UrlCategory {
  key: string;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
}

const URL_CATEGORIES: UrlCategory[] = [
  { key: "eu", label: "Direito da União Europeia", icon: <Globe className="h-4 w-4 text-blue-500" />, placeholder: "URL EUR-Lex..." },
  { key: "regulamentacao", label: "Regulamentação", icon: <FileText className="h-4 w-4 text-green-500" />, placeholder: "URL DRE/EUR-Lex..." },
  { key: "modificacoes", label: "Modificações", icon: <RefreshCw className="h-4 w-4 text-amber-500" />, placeholder: "URL de alterações..." },
  { key: "retificacoes", label: "Retificações", icon: <AlertCircle className="h-4 w-4 text-orange-500" />, placeholder: "URL de retificações..." },
  { key: "outros", label: "Outros Tipos", icon: <MoreHorizontal className="h-4 w-4 text-gray-500" />, placeholder: "Outros URLs relevantes..." },
];

export function LegislationRelationsEditor({ legislationId, legislationNumber }: Props) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRelationType, setSelectedRelationType] = useState<string>("altera");
  const [isAdding, setIsAdding] = useState(false);

  // Fetch relations where this legislation is source
  const { data: outgoingRelations = [], isLoading: loadingOut } = useQuery({
    queryKey: ["legislation-relations-out", legislationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_relations")
        .select(`
          id,
          relation_type,
          target_legislation_id,
          legislation:legislation!legislation_relations_target_legislation_id_fkey (
            id, number, title
          )
        `)
        .eq("source_legislation_id", legislationId);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch relations where this legislation is target
  const { data: incomingRelations = [], isLoading: loadingIn } = useQuery({
    queryKey: ["legislation-relations-in", legislationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation_relations")
        .select(`
          id,
          relation_type,
          source_legislation_id,
          legislation:legislation!legislation_relations_source_legislation_id_fkey (
            id, number, title
          )
        `)
        .eq("target_legislation_id", legislationId);
      if (error) throw error;
      return data || [];
    },
  });

  // Search legislation
  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ["search-legislation-for-relation", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title")
        .neq("id", legislationId)
        .or(`number.ilike.%${searchTerm}%,title.ilike.%${searchTerm}%`)
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: searchTerm.length >= 2,
  });

  const handleAddRelation = async (targetId: string, relationType?: string) => {
    const typeToUse = relationType || selectedRelationType;
    setIsAdding(true);
    try {
      // Check if relation already exists
      const { data: existing } = await supabase
        .from("legislation_relations")
        .select("id")
        .eq("source_legislation_id", legislationId)
        .eq("target_legislation_id", targetId)
        .eq("relation_type", typeToUse)
        .maybeSingle();

      if (existing) {
        toast.info("Esta relação já existe");
        return;
      }

      // Add the relation
      const { error } = await supabase
        .from("legislation_relations")
        .insert({
          source_legislation_id: legislationId,
          target_legislation_id: targetId,
          relation_type: typeToUse,
        });

      if (error) throw error;

      // Add inverse relation
      const relationDef = RELATION_TYPES.find(r => r.value === typeToUse);
      if (relationDef?.inverse) {
        await supabase
          .from("legislation_relations")
          .insert({
            source_legislation_id: targetId,
            target_legislation_id: legislationId,
            relation_type: relationDef.inverse,
          });
      }

      toast.success("Relação adicionada");
      queryClient.invalidateQueries({ queryKey: ["legislation-relations-out", legislationId] });
      queryClient.invalidateQueries({ queryKey: ["legislation-relations-in", legislationId] });
      setSearchTerm("");
      setIsDialogOpen(false);
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveRelation = async (relationId: string, targetId: string, relationType: string) => {
    try {
      // Remove main relation
      const { error } = await supabase
        .from("legislation_relations")
        .delete()
        .eq("id", relationId);

      if (error) throw error;

      // Remove inverse relation
      const relationDef = RELATION_TYPES.find(r => r.value === relationType);
      if (relationDef?.inverse) {
        await supabase
          .from("legislation_relations")
          .delete()
          .eq("source_legislation_id", targetId)
          .eq("target_legislation_id", legislationId)
          .eq("relation_type", relationDef.inverse);
      }

      toast.success("Relação removida");
      queryClient.invalidateQueries({ queryKey: ["legislation-relations-out", legislationId] });
      queryClient.invalidateQueries({ queryKey: ["legislation-relations-in", legislationId] });
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  const isLoading = loadingOut || loadingIn;
  const allRelations = [
    ...outgoingRelations.map((r: any) => ({
      ...r,
      direction: "out" as const,
      relatedLeg: r.legislation,
    })),
    ...incomingRelations.map((r: any) => ({
      ...r,
      direction: "in" as const,
      relatedLeg: r.legislation,
      // Show the inverse type for incoming relations
      displayType: RELATION_TYPES.find(t => t.inverse === r.relation_type)?.value || r.relation_type,
    })),
  ];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        A carregar relações...
      </div>
    );
  }

  // URL inputs state
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({
    eu: "",
    regulamentacao: "",
    modificacoes: "",
    retificacoes: "",
    outros: "",
  });
  const [isProcessingUrl, setIsProcessingUrl] = useState<string | null>(null);

  const handleUrlChange = (key: string, value: string) => {
    setUrlInputs(prev => ({ ...prev, [key]: value }));
  };

  const handleAddFromUrl = async (categoryKey: string) => {
    const url = urlInputs[categoryKey]?.trim();
    if (!url) {
      toast.error("Introduza um URL válido");
      return;
    }

    setIsProcessingUrl(categoryKey);
    try {
      // First, try to find legislation by URL
      const { data: existingLeg } = await supabase
        .from("legislation")
        .select("id, number, title")
        .eq("document_url", url)
        .maybeSingle();

      if (existingLeg) {
        // Legislation exists, create relation
        const relationType = getRelationTypeForCategory(categoryKey);
        await handleAddRelation(existingLeg.id, relationType);
        setUrlInputs(prev => ({ ...prev, [categoryKey]: "" }));
        toast.success(`Relação criada com ${existingLeg.number}`);
      } else {
        // Legislation doesn't exist - suggest import
        toast.info("Diploma não encontrado. Use a importação por URL para adicionar primeiro.");
      }
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setIsProcessingUrl(null);
    }
  };

  const getRelationTypeForCategory = (categoryKey: string): string => {
    switch (categoryKey) {
      case "eu": return "transpoe";
      case "regulamentacao": return "regulamenta";
      case "modificacoes": return "altera";
      case "retificacoes": return "complementa";
      default: return "complementa";
    }
  };

  return (
    <div className="space-y-4">
      {/* URL Categories Section */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="url-categories" className="border rounded-lg">
          <AccordionTrigger className="px-3 py-2 hover:no-underline">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Adicionar por URL</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <div className="space-y-3">
              {URL_CATEGORIES.map((cat) => (
                <div key={cat.key} className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    {cat.icon}
                    {cat.label}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={cat.placeholder}
                      value={urlInputs[cat.key] || ""}
                      onChange={(e) => handleUrlChange(cat.key, e.target.value)}
                      className="text-xs h-8"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 shrink-0"
                      onClick={() => handleAddFromUrl(cat.key)}
                      disabled={isProcessingUrl === cat.key || !urlInputs[cat.key]?.trim()}
                    >
                      {isProcessingUrl === cat.key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Relations Header */}
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-blue-500" />
          Relações
        </Label>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-3 w-3 mr-1" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Adicionar Relação</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm bg-muted p-2 rounded">
                <span className="font-mono">{legislationNumber}</span>
                <ArrowRight className="h-4 w-4" />
                <Select value={selectedRelationType} onValueChange={setSelectedRelationType}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATION_TYPES.filter(r => !r.value.includes("_por")).map(rt => (
                      <SelectItem key={rt.value} value={rt.value}>
                        {rt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ArrowRight className="h-4 w-4" />
                <span className="text-muted-foreground">?</span>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar diploma (número ou título)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              {searching && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto space-y-1 border rounded-md p-2">
                  {searchResults.map((leg: any) => (
                    <div
                      key={leg.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                      onClick={() => handleAddRelation(leg.id)}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm">{leg.number}</p>
                        <p className="text-xs text-muted-foreground truncate">{leg.title}</p>
                      </div>
                      {isAdding ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum diploma encontrado
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current relations */}
      <div className="space-y-1">
        {allRelations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sem relações registadas</p>
        ) : (
          allRelations.map((rel: any) => (
            <div
              key={rel.id}
              className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2"
            >
              <Badge
                variant="secondary"
                className={`text-[10px] shrink-0 ${RELATION_COLORS[rel.relation_type] || ""}`}
              >
                {RELATION_TYPES.find(t => t.value === rel.relation_type)?.label || rel.relation_type}
              </Badge>
              <span className="font-mono text-xs shrink-0">{rel.relatedLeg?.number}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">
                {rel.relatedLeg?.title}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => handleRemoveRelation(
                  rel.id,
                  rel.direction === "out" ? rel.target_legislation_id : rel.source_legislation_id,
                  rel.relation_type
                )}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
