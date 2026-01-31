import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Link2, Plus, Trash2, ExternalLink, Search, Globe, Flag, Sparkles, AlertCircle, FileText, RefreshCw, AlertTriangle, MoreHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import type { LegislationWithCategories } from "@/hooks/useLegislation";

interface ManageRelationsDialogProps {
  legislation: LegislationWithCategories | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RELATION_TYPES = [
  { value: "revogado", label: "Revogado", color: "bg-gray-800 text-white" },
  { value: "revogacao_parcial", label: "Revogação Parcial", color: "bg-gray-500 text-white" },
  { value: "alteracao", label: "Alteração", color: "bg-white border-2 border-gray-400 text-gray-700" },
  { value: "transposicao", label: "Transposição", color: "bg-blue-600 text-white" },
  { value: "regulamentacao", label: "Regulamentação", color: "bg-purple-600 text-white" },
];

interface Relation {
  id: string;
  source_legislation_id: string;
  target_legislation_id: string;
  relation_type: string;
  target_legislation?: {
    id: string;
    number: string;
    title: string;
    document_url?: string;
  };
}

interface FoundLegislation {
  id: string;
  number: string;
  title: string;
  origin: string | null;
}

interface UrlCategoryInputProps {
  placeholder: string;
  relationType: string;
  legislationId: string;
  onRelationAdded: () => void;
}

function UrlCategoryInput({ placeholder, relationType, legislationId, onRelationAdded }: UrlCategoryInputProps) {
  const [urlValue, setUrlValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const queryClient = useQueryClient();

  const handleProcess = async () => {
    if (!urlValue.trim() || !legislationId) return;

    setIsProcessing(true);
    setProcessingStatus("A analisar URL...");
    const url = urlValue.trim();
    const isDRE = url.toLowerCase().includes('dre.pt') || url.toLowerCase().includes('diariodarepublica.pt');
    const isEurLex = url.toLowerCase().includes('eur-lex.europa.eu');
    const isAnaliseJuridica = url.toLowerCase().includes('/analise-juridica/');

    if (!isDRE && !isEurLex) {
      toast.error("URL inválida. Apenas URLs do DRE ou EUR-Lex são suportadas.");
      setIsProcessing(false);
      setProcessingStatus("");
      return;
    }

    try {
      // If it's an analysis page (modificacoes, etc.), scrape and extract diplomas
      if (isAnaliseJuridica) {
        setProcessingStatus("A extrair diplomas da página...");
        
        const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('firecrawl-scrape', {
          body: { 
            url, 
            options: { formats: ['markdown', 'links'], onlyMainContent: true } 
          },
        });

        if (scrapeError) throw scrapeError;

        const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || '';
        const links = scrapeData?.data?.links || scrapeData?.links || [];
        
        // Extract DRE diploma links from the page
        const dreLinks: string[] = [];
        
        // Look for links that are actual diploma pages
        for (const link of links) {
          if (typeof link === 'string' && 
              (link.includes('dre.pt/') || link.includes('diariodarepublica.pt/')) &&
              !link.includes('/analise-juridica/') &&
              (link.includes('/detalhe/') || link.includes('/web/guest/') || link.match(/\/\d+$/))) {
            dreLinks.push(link);
          }
        }

        // Also try to extract diploma numbers from markdown and search them
        const diplomaPatterns = [
          /(?:Decreto-Lei|Lei|Portaria|Despacho|Resolução)\s+n\.?[ºo°]?\s*[\d\-\/]+(?:\/\d{4})?/gi,
        ];

        const foundNumbers: string[] = [];
        for (const pattern of diplomaPatterns) {
          const matches = markdown.match(pattern) || [];
          foundNumbers.push(...matches.map((m: string) => m.trim()));
        }

        let relationsCreated = 0;

        // Process DRE links
        if (dreLinks.length > 0) {
          setProcessingStatus(`A processar ${dreLinks.length} diploma(s)...`);
          
          for (const dreLink of dreLinks.slice(0, 10)) { // Limit to 10
            try {
              // Check if legislation exists by URL
              let { data: existingLeg } = await supabase
                .from("legislation")
                .select("id, number")
                .eq("document_url", dreLink)
                .maybeSingle();

              let targetId = existingLeg?.id;

              // If not found, try to import
              if (!targetId) {
                const { data: importData } = await supabase.functions.invoke('import-dre-links', {
                  body: { links: [dreLink], updateExisting: false, extractRequirementsAI: false },
                });
                
                if (importData?.results?.[0]?.success && importData.results[0].legislationId) {
                  targetId = importData.results[0].legislationId;
                } else if (importData?.results?.[0]?.skipped) {
                  const { data: skippedLeg } = await supabase
                    .from("legislation")
                    .select("id")
                    .eq("document_url", dreLink)
                    .maybeSingle();
                  targetId = skippedLeg?.id;
                }
              }

              if (targetId && targetId !== legislationId) {
                // Check if relation exists
                const { data: existingRel } = await supabase
                  .from("legislation_relations")
                  .select("id")
                  .eq("source_legislation_id", legislationId)
                  .eq("target_legislation_id", targetId)
                  .eq("relation_type", relationType)
                  .maybeSingle();

                if (!existingRel) {
                  await supabase.from("legislation_relations").insert({
                    source_legislation_id: legislationId,
                    target_legislation_id: targetId,
                    relation_type: relationType,
                  });
                  relationsCreated++;
                }
              }
            } catch (e) {
              console.error("Error processing link:", dreLink, e);
            }
          }
        }

        // If no links found, try to search by diploma numbers
        if (dreLinks.length === 0 && foundNumbers.length > 0) {
          setProcessingStatus(`A procurar ${foundNumbers.length} diploma(s) por número...`);
          
          const uniqueNumbers = [...new Set(foundNumbers)].slice(0, 10);
          
          for (const number of uniqueNumbers) {
            const { data: matchingLeg } = await supabase
              .from("legislation")
              .select("id")
              .ilike("number", `%${number}%`)
              .limit(1)
              .maybeSingle();

            if (matchingLeg && matchingLeg.id !== legislationId) {
              const { data: existingRel } = await supabase
                .from("legislation_relations")
                .select("id")
                .eq("source_legislation_id", legislationId)
                .eq("target_legislation_id", matchingLeg.id)
                .eq("relation_type", relationType)
                .maybeSingle();

              if (!existingRel) {
                await supabase.from("legislation_relations").insert({
                  source_legislation_id: legislationId,
                  target_legislation_id: matchingLeg.id,
                  relation_type: relationType,
                });
                relationsCreated++;
              }
            }
          }
        }

        if (relationsCreated > 0) {
          toast.success(`${relationsCreated} relação(ões) criada(s)`);
          setUrlValue("");
          onRelationAdded();
          queryClient.invalidateQueries({ queryKey: ["legislation-list"] });
        } else {
          toast.info("Nenhum diploma novo encontrado na página");
        }
      } else {
        // Regular single diploma URL
        setProcessingStatus("A procurar diploma...");
        
        const { data: existingLeg } = await supabase
          .from("legislation")
          .select("id, number")
          .eq("document_url", url)
          .maybeSingle();

        let targetId = existingLeg?.id;

        if (!targetId) {
          setProcessingStatus("A criar diploma...");
          
          if (isDRE) {
            const { data, error } = await supabase.functions.invoke('import-dre-links', {
              body: { links: [url], updateExisting: false, extractRequirementsAI: false },
            });
            if (error) throw error;
            if (data?.results?.[0]?.success && data.results[0].legislationId) {
              targetId = data.results[0].legislationId;
              toast.success("Diploma DRE criado");
            } else if (data?.results?.[0]?.skipped) {
              const { data: skippedLeg } = await supabase
                .from("legislation")
                .select("id")
                .eq("document_url", url)
                .maybeSingle();
              targetId = skippedLeg?.id;
            }
          } else if (isEurLex) {
            const celexMatch = url.match(/CELEX[:%](\d{5}[A-Z]\d+)/i);
            const celex = celexMatch ? celexMatch[1] : null;
            const number = celex 
              ? `Documento EUR-Lex ${celex}` 
              : `Documento EUR-Lex ${Date.now()}`;

            const { data: insertedLeg, error: insertError } = await supabase
              .from('legislation')
              .insert({
                external_id: celex ? `eurlex-${celex}` : `eurlex-${Date.now()}`,
                source: 'eurlex-manual',
                number,
                title: number,
                origin: 'EU',
                document_url: url,
              })
              .select('id')
              .single();

            if (insertError && insertError.code === '23505') {
              const { data: dupLeg } = await supabase
                .from("legislation")
                .select("id")
                .eq("document_url", url)
                .maybeSingle();
              targetId = dupLeg?.id;
            } else if (insertError) {
              throw insertError;
            } else {
              targetId = insertedLeg?.id;
              toast.success("Diploma EUR-Lex criado");
            }
          }
        }

        if (!targetId) {
          toast.error("Não foi possível identificar ou criar o diploma");
          return;
        }

        const { data: existingRel } = await supabase
          .from("legislation_relations")
          .select("id")
          .eq("source_legislation_id", legislationId)
          .eq("target_legislation_id", targetId)
          .eq("relation_type", relationType)
          .maybeSingle();

        if (existingRel) {
          toast.info("Esta relação já existe");
          setUrlValue("");
          return;
        }

        const { error: relError } = await supabase
          .from("legislation_relations")
          .insert({
            source_legislation_id: legislationId,
            target_legislation_id: targetId,
            relation_type: relationType,
          });

        if (relError) throw relError;

        toast.success("Relação adicionada");
        setUrlValue("");
        onRelationAdded();
        queryClient.invalidateQueries({ queryKey: ["legislation-list"] });
      }
    } catch (error: any) {
      console.error("Error processing URL:", error);
      toast.error("Erro: " + error.message);
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  return (
    <div className="flex gap-2">
      <div className="flex-1 relative">
        <Input
          placeholder={placeholder}
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          className="text-sm h-9"
        />
        {processingStatus && (
          <span className="absolute -bottom-5 left-0 text-[10px] text-muted-foreground">
            {processingStatus}
          </span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-9 px-3 shrink-0"
        onClick={handleProcess}
        disabled={isProcessing || !urlValue.trim()}
      >
        {isProcessing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
export function ManageRelationsDialog({
  legislation,
  open,
  onOpenChange,
}: ManageRelationsDialogProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [addMode, setAddMode] = useState<"select" | "url">("select");
  const [urlInput, setUrlInput] = useState("");
  const [isSearchingUrl, setIsSearchingUrl] = useState(false);
  const [isCreatingFromUrl, setIsCreatingFromUrl] = useState(false);
  const [foundLegislation, setFoundLegislation] = useState<FoundLegislation | null>(null);
  const [urlNotFound, setUrlNotFound] = useState(false);

  // Fetch all legislation for the dropdown
  const { data: allLegislation } = useQuery({
    queryKey: ["legislation-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title")
        .order("number");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch existing relations for this legislation
  const { data: relations, refetch: refetchRelations } = useQuery({
    queryKey: ["legislation-relations", legislation?.id],
    queryFn: async () => {
      if (!legislation?.id) return [];
      
      const { data, error } = await supabase
        .from("legislation_relations")
        .select(`
          id,
          source_legislation_id,
          target_legislation_id,
          relation_type,
          target_legislation:legislation!legislation_relations_target_legislation_id_fkey(id, number, title, document_url)
        `)
        .eq("source_legislation_id", legislation.id);
      
      if (error) throw error;
      return data as unknown as Relation[];
    },
    enabled: open && !!legislation?.id,
  });

  const handleSearchByUrl = async () => {
    if (!urlInput.trim()) {
      toast.error("Insira uma URL válida");
      return;
    }

    setIsSearchingUrl(true);
    setFoundLegislation(null);
    setUrlNotFound(false);

    try {
      // Normalize URL for comparison
      const normalizedUrl = urlInput.trim().toLowerCase();
      
      // Search by exact URL match first
      let { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, origin")
        .eq("document_url", urlInput.trim())
        .maybeSingle();

      // If not found, try with lowercase comparison
      if (!data) {
        const { data: allData, error: allError } = await supabase
          .from("legislation")
          .select("id, number, title, origin, document_url");
        
        if (allError) throw allError;
        
        // Find by URL match (case insensitive)
        data = allData?.find(leg => 
          leg.document_url?.toLowerCase() === normalizedUrl
        ) || null;
      }

      if (data) {
        setFoundLegislation(data);
        setUrlNotFound(false);
        toast.success(`Diploma encontrado: ${data.number}`);
      } else {
        setUrlNotFound(true);
        toast.info("Diploma não encontrado. Pode criar automaticamente via scraping.");
      }
    } catch (error: any) {
      toast.error("Erro ao procurar diploma: " + error.message);
    } finally {
      setIsSearchingUrl(false);
    }
  };

  // Helper to extract CELEX from EUR-Lex URL
  const extractCelexFromUrl = (url: string): string | null => {
    // Pattern: https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32019R0942
    const celexMatch = url.match(/CELEX[:%](\d{5}[A-Z]\d+)/i);
    if (celexMatch) return celexMatch[1];
    
    // Pattern: https://eur-lex.europa.eu/eli/reg/2019/942/oj
    const eliMatch = url.match(/\/eli\/(\w+)\/(\d{4})\/(\d+)/);
    if (eliMatch) {
      const typeMap: { [key: string]: string } = {
        'reg': 'R', 'dir': 'L', 'dec': 'D', 'rec': 'H'
      };
      const typeCode = typeMap[eliMatch[1]] || 'R';
      return `3${eliMatch[2]}${typeCode}${eliMatch[3].padStart(4, '0')}`;
    }
    
    return null;
  };

  // Helper to build readable title from CELEX
  const buildTitleFromCelex = (celex: string): string => {
    const match = celex.match(/^(\d)(\d{4})([A-Z])(\d+)/);
    if (!match) return `Documento ${celex}`;
    
    const [, , year, type, number] = match;
    
    const typeNames: { [key: string]: string } = {
      'R': 'Regulamento', 'L': 'Diretiva', 'D': 'Decisão', 'H': 'Recomendação'
    };
    
    const typeName = typeNames[type] || 'Documento';
    return `${typeName} (UE) ${year}/${parseInt(number, 10)}`;
  };

  const handleCreateFromUrl = async () => {
    if (!urlInput.trim()) {
      toast.error("Insira uma URL válida");
      return;
    }

    const url = urlInput.trim();
    const isDRE = url.toLowerCase().includes('dre.pt') || url.toLowerCase().includes('diariodarepublica.pt');
    const isEurLex = url.toLowerCase().includes('eur-lex.europa.eu');
    
    if (!isDRE && !isEurLex) {
      toast.error("URL inválida. Apenas URLs do DRE ou EUR-Lex são suportadas.");
      return;
    }

    setIsCreatingFromUrl(true);

    try {
      if (isDRE) {
        // Use existing import-dre-links function for DRE
        const { data, error } = await supabase.functions.invoke('import-dre-links', {
          body: {
            links: [url],
            updateExisting: false,
            extractRequirementsAI: false,
          },
        });

        if (error) throw error;

        if (data?.results?.length > 0) {
          const result = data.results[0];
          
          if (result.success && result.legislationId) {
            const { data: createdLeg, error: fetchError } = await supabase
              .from("legislation")
              .select("id, number, title, origin")
              .eq("id", result.legislationId)
              .single();

            if (fetchError) throw fetchError;

            setFoundLegislation(createdLeg);
            setUrlNotFound(false);
            toast.success(`Diploma criado com sucesso: ${createdLeg.number}`);
            queryClient.invalidateQueries({ queryKey: ["legislation-list"] });
            queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
          } else if (result.skipped) {
            const { data: existingLeg } = await supabase
              .from("legislation")
              .select("id, number, title, origin")
              .eq("document_url", url)
              .maybeSingle();

            if (existingLeg) {
              setFoundLegislation(existingLeg);
              setUrlNotFound(false);
              toast.info(`Diploma já existia: ${existingLeg.number}`);
            }
          } else {
            toast.error(result.error || "Não foi possível extrair informações da URL.");
          }
        } else {
          toast.error("Nenhum resultado retornado. Verifique se a URL é válida.");
        }
      } else if (isEurLex) {
        // Handle EUR-Lex URLs
        const celex = extractCelexFromUrl(url);
        
        // Try to scrape with Firecrawl first
        const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('firecrawl-scrape', {
          body: { 
            url, 
            options: { formats: ['markdown'], onlyMainContent: true } 
          },
        });

        let title = '';
        let summary = '';

        if (!scrapeError && scrapeData?.success) {
          const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
          
          // Extract title from markdown - look for first heading
          const titleMatch = markdown.match(/^#\s+(.+)$/m);
          if (titleMatch) {
            title = titleMatch[1].replace(/\*+/g, '').trim().substring(0, 500);
          }
          
          // Extract summary - first paragraph after title
          const paragraphs = markdown.split(/\n\n+/).filter((p: string) => 
            p.length > 50 && !p.startsWith('#') && !p.includes('|')
          );
          if (paragraphs.length > 0) {
            summary = paragraphs[0].replace(/\*+/g, '').replace(/\[.*?\]\(.*?\)/g, '').trim().substring(0, 1000);
          }
        }

        // Build number from CELEX or URL
        let number = '';
        if (celex) {
          number = buildTitleFromCelex(celex);
          if (!title) title = number;
        } else {
          // Fallback: extract from URL path
          const pathMatch = url.match(/\/(\d{4})\/(\d+)/);
          if (pathMatch) {
            number = `Regulamento (UE) ${pathMatch[1]}/${pathMatch[2]}`;
            if (!title) title = number;
          } else {
            number = `Documento EUR-Lex ${Date.now()}`;
            title = title || number;
          }
        }

        // Insert into database
        const { data: insertedLeg, error: insertError } = await supabase
          .from('legislation')
          .insert({
            external_id: celex ? `eurlex-${celex}` : `eurlex-${Date.now()}`,
            source: 'eurlex-manual',
            number,
            title,
            summary: summary || null,
            origin: 'EU',
            document_url: url,
          })
          .select('id, number, title, origin')
          .single();

        if (insertError) {
          if (insertError.code === '23505') {
            // Duplicate - try to fetch existing
            const { data: existingLeg } = await supabase
              .from("legislation")
              .select("id, number, title, origin")
              .eq("document_url", url)
              .maybeSingle();

            if (existingLeg) {
              setFoundLegislation(existingLeg);
              setUrlNotFound(false);
              toast.info(`Diploma já existia: ${existingLeg.number}`);
              return;
            }
          }
          throw insertError;
        }

        setFoundLegislation(insertedLeg);
        setUrlNotFound(false);
        toast.success(`Diploma EUR-Lex criado: ${insertedLeg.number}`);
        queryClient.invalidateQueries({ queryKey: ["legislation-list"] });
        queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      }
    } catch (error: any) {
      console.error("Error creating from URL:", error);
      toast.error("Erro ao criar diploma: " + error.message);
    } finally {
      setIsCreatingFromUrl(false);
    }
  };

  const handleAddRelation = async (targetId?: string) => {
    const finalTargetId = targetId || selectedTargetId;
    if (!legislation || !selectedType || !finalTargetId) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("legislation_relations")
        .insert({
          source_legislation_id: legislation.id,
          target_legislation_id: finalTargetId,
          relation_type: selectedType,
        } as any);

      if (error) throw error;

      toast.success("Relação adicionada com sucesso");
      setSelectedType("");
      setSelectedTargetId("");
      setUrlInput("");
      setFoundLegislation(null);
      refetchRelations();
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-relations"] });
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("Esta relação já existe");
      } else {
        toast.error("Erro ao adicionar relação: " + error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRelation = async (relationId: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("legislation_relations")
        .delete()
        .eq("id", relationId);

      if (error) throw error;

      toast.success("Relação removida");
      refetchRelations();
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-relations"] });
    } catch (error: any) {
      toast.error("Erro ao remover relação: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getRelationStyle = (type: string) => {
    return RELATION_TYPES.find(t => t.value === type)?.color || "";
  };

  const getRelationLabel = (type: string) => {
    return RELATION_TYPES.find(t => t.value === type)?.label || type;
  };

  // Filter out current legislation from the dropdown
  const availableLegislation = allLegislation?.filter(l => l.id !== legislation?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Relações entre Diplomas
          </DialogTitle>
          <DialogDescription>
            {legislation?.number} - {legislation?.title}
          </DialogDescription>
        </DialogHeader>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 py-2 border-b">
          {RELATION_TYPES.map((type) => (
            <Badge key={type.value} className={`${type.color} text-xs`}>
              {type.label}
            </Badge>
          ))}
        </div>

        {/* Existing Relations */}
        <div className="space-y-2">
          <Label>Relações existentes</Label>
          {relations && relations.length > 0 ? (
            <div className="space-y-2">
              {relations.map((rel) => (
                <div
                  key={rel.id}
                  className="flex items-center justify-between gap-2 p-3 border rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge className={`${getRelationStyle(rel.relation_type)} text-xs shrink-0`}>
                      {getRelationLabel(rel.relation_type)}
                    </Badge>
                    <span className="font-mono text-sm truncate">
                      {rel.target_legislation?.number}
                    </span>
                    <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                      {rel.target_legislation?.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {rel.target_legislation?.document_url && (
                      <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <a href={rel.target_legislation.document_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRelation(rel.id)}
                      disabled={isLoading}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma relação definida
            </p>
          )}
        </div>

        {/* Add New Relation */}
        <div className="space-y-3 pt-4 border-t">
          <Label>Adicionar nova relação</Label>
          
          {/* Relation Type Selector - Always visible */}
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo de relação" />
            </SelectTrigger>
            <SelectContent>
              {RELATION_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded ${type.color}`} />
                    {type.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tabs for different add modes */}
          <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "select" | "url")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="select" className="gap-2">
                <Search className="h-4 w-4" />
                Selecionar
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-2">
                <Globe className="h-4 w-4" />
                Por URL
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="select" className="space-y-3">
              <div className="flex gap-2">
                <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecionar diploma..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLegislation?.map((leg) => (
                      <SelectItem key={leg.id} value={leg.id}>
                        <span className="font-mono">{leg.number}</span>
                        <span className="text-muted-foreground ml-2 truncate">
                          {leg.title.substring(0, 50)}...
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleAddRelation()}
                  disabled={isLoading || !selectedType || !selectedTargetId}
                  className="gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Adicionar
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="url" className="space-y-4">
              {/* Quick URL Input */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Cole a URL do diploma (DRE ou EUR-Lex)..."
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                      setFoundLegislation(null);
                      setUrlNotFound(false);
                    }}
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleSearchByUrl}
                    disabled={isSearchingUrl || isCreatingFromUrl || !urlInput.trim()}
                    className="gap-2"
                  >
                    {isSearchingUrl ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Procurar
                  </Button>
                </div>
              </div>
              
              {/* Found legislation display */}
              {foundLegislation && (
                <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge 
                        variant="outline"
                        className={
                          foundLegislation.origin === 'PT' 
                            ? 'bg-green-500/10 text-green-700 border-green-300' 
                            : foundLegislation.origin === 'EU'
                              ? 'bg-blue-500/10 text-blue-700 border-blue-300'
                              : 'bg-gray-500/10'
                        }
                      >
                        {foundLegislation.origin === 'PT' ? (
                          <><Flag className="h-3 w-3 mr-1" />DRE</>
                        ) : foundLegislation.origin === 'EU' ? (
                          <><Globe className="h-3 w-3 mr-1" />EUR-Lex</>
                        ) : (
                          'Outro'
                        )}
                      </Badge>
                      <span className="font-mono text-sm font-medium">
                        {foundLegislation.number}
                      </span>
                      <span className="text-sm text-muted-foreground truncate">
                        {foundLegislation.title.substring(0, 60)}...
                      </span>
                    </div>
                    <Button
                      onClick={() => handleAddRelation(foundLegislation.id)}
                      disabled={isLoading || !selectedType}
                      size="sm"
                      className="gap-2 shrink-0"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Adicionar
                    </Button>
                  </div>
                </div>
              )}

              {/* URL not found - offer to create */}
              {urlNotFound && !foundLegislation && (
                <div className="p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        Diploma não encontrado na base de dados.
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Pode criar o diploma automaticamente extraindo os metadados da URL.
                      </p>
                      <Button
                        onClick={handleCreateFromUrl}
                        disabled={isCreatingFromUrl}
                        size="sm"
                        variant="outline"
                        className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/50"
                      >
                        {isCreatingFromUrl ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            A extrair metadados...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Criar diploma via scraping
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Categorized URL Inputs */}
              <div className="border-t pt-4 space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  URLs por Categoria
                </Label>
                
                {/* EU Law */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Direito da União Europeia</span>
                  </div>
                  <UrlCategoryInput
                    placeholder="URL EUR-Lex (Diretivas, Regulamentos UE)..."
                    relationType="transposicao"
                    legislationId={legislation?.id || ""}
                    onRelationAdded={() => {
                      refetchRelations();
                      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
                    }}
                  />
                </div>

                {/* Regulation */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium">Regulamentação</span>
                  </div>
                  <UrlCategoryInput
                    placeholder="URL de regulamentação associada..."
                    relationType="regulamentacao"
                    legislationId={legislation?.id || ""}
                    onRelationAdded={() => {
                      refetchRelations();
                      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
                    }}
                  />
                </div>

                {/* Modifications */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Modificações</span>
                  </div>
                  <UrlCategoryInput
                    placeholder="URL de alterações ao diploma..."
                    relationType="alteracao"
                    legislationId={legislation?.id || ""}
                    onRelationAdded={() => {
                      refetchRelations();
                      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
                    }}
                  />
                </div>

                {/* Rectifications */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium">Retificações</span>
                  </div>
                  <UrlCategoryInput
                    placeholder="URL de retificações..."
                    relationType="revogacao_parcial"
                    legislationId={legislation?.id || ""}
                    onRelationAdded={() => {
                      refetchRelations();
                      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
                    }}
                  />
                </div>

                {/* Other */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <MoreHorizontal className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium">Outros Tipos</span>
                  </div>
                  <UrlCategoryInput
                    placeholder="Outros URLs relevantes..."
                    relationType="revogado"
                    legislationId={legislation?.id || ""}
                    onRelationAdded={() => {
                      refetchRelations();
                      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
                    }}
                  />
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Cole URLs do DRE ou EUR-Lex. Se o diploma não existir, será criado automaticamente.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}