import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  AlertTriangle, 
  Loader2, 
  Search, 
  Merge, 
  Trash2, 
  CheckCircle2,
  ExternalLink,
  Calendar,
  FileText,
  Building2,
  Filter
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface LegislationItem {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  entity: string | null;
  publication_date: string | null;
  effective_date: string | null;
  document_url: string | null;
  source: string | null;
  created_at: string;
}

interface DuplicateGroup {
  normalizedNumber: string;
  items: LegislationItem[];
  selectedKeepId: string | null;
}

// Normalize number for comparison
function normalizeNumber(num: string): string {
  return num
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/n\.?º?\s*/gi, '')
    .replace(/[–—−]/g, '-')
    .replace(/\//g, '/')
    .trim();
}

// Score for quality comparison
function qualityScore(item: LegislationItem): number {
  let score = 0;
  
  // Prefer items with more complete data
  if (item.summary && item.summary.length > 10) score += 30;
  if (item.entity && item.entity.length > 0) score += 20;
  if (item.publication_date) score += 15;
  if (item.effective_date) score += 10;
  if (item.document_url) score += 15;
  
  // Prefer descriptive titles over generic ones
  const genericPatterns = [
    /^decreto-lei\s*n/i,
    /^lei\s*n/i,
    /^portaria\s*n/i,
    /^regulamento\s*\(/i,
    /^diretiva\s*\d/i,
  ];
  const isGenericTitle = genericPatterns.some(p => p.test(item.title));
  if (!isGenericTitle && item.title.length > 30) score += 25;
  
  // Prefer newer items (likely more updated)
  if (item.created_at) {
    const age = Date.now() - new Date(item.created_at).getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);
    if (daysOld < 30) score += 10;
  }
  
  return score;
}

export function DuplicateCleanupPanel() {
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [scanStats, setScanStats] = useState<{
    totalLegislation: number;
    duplicateGroups: number;
    totalDuplicates: number;
  } | null>(null);
  const [incompleteFilter, setIncompleteFilter] = useState<string>("all");

  // Check if a group has incomplete data
  const groupHasIncompleteData = (group: DuplicateGroup): { incomplete: boolean; issues: string[] } => {
    const issues: string[] = [];
    const bestItem = group.items.find(i => i.id === group.selectedKeepId) || group.items[0];
    
    // Check all items in group - if ANY is missing critical data, flag it
    const allItemsMissingSummary = group.items.every(i => !i.summary || i.summary.length < 10);
    const allItemsMissingEntity = group.items.every(i => !i.entity);
    const allItemsMissingEffectiveDate = group.items.every(i => !i.effective_date);
    const allItemsMissingPublicationDate = group.items.every(i => !i.publication_date);
    
    if (allItemsMissingSummary) issues.push("sumário");
    if (allItemsMissingEntity) issues.push("entidade");
    if (allItemsMissingEffectiveDate) issues.push("data vigor");
    if (allItemsMissingPublicationDate) issues.push("data publicação");
    
    return { incomplete: issues.length > 0, issues };
  };

  // Filter groups based on selected filter
  const filteredGroups = useMemo(() => {
    if (incompleteFilter === "all") return duplicateGroups;
    if (incompleteFilter === "incomplete") {
      return duplicateGroups.filter(g => groupHasIncompleteData(g).incomplete);
    }
    if (incompleteFilter === "complete") {
      return duplicateGroups.filter(g => !groupHasIncompleteData(g).incomplete);
    }
    // Specific field filters
    return duplicateGroups.filter(g => {
      const { issues } = groupHasIncompleteData(g);
      if (incompleteFilter === "missing-summary") return issues.includes("sumário");
      if (incompleteFilter === "missing-entity") return issues.includes("entidade");
      if (incompleteFilter === "missing-effective-date") return issues.includes("data vigor");
      if (incompleteFilter === "missing-publication-date") return issues.includes("data publicação");
      return true;
    });
  }, [duplicateGroups, incompleteFilter]);

  // Count incomplete groups
  const incompleteCount = useMemo(() => {
    return duplicateGroups.filter(g => groupHasIncompleteData(g).incomplete).length;
  }, [duplicateGroups]);

  const scanForDuplicates = async () => {
    setIsScanning(true);
    setDuplicateGroups([]);
    setScanStats(null);
    setSelectedGroups(new Set());

    try {
      // Fetch all legislation
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, summary, entity, publication_date, effective_date, document_url, source, created_at")
        .order("publication_date", { ascending: false });

      if (error) throw error;

      // Group by normalized number
      const groups = new Map<string, LegislationItem[]>();
      
      for (const item of data || []) {
        const normalized = normalizeNumber(item.number);
        if (!groups.has(normalized)) {
          groups.set(normalized, []);
        }
        groups.get(normalized)!.push(item);
      }

      // Filter to only groups with duplicates
      const duplicates: DuplicateGroup[] = [];
      for (const [normalizedNumber, items] of groups) {
        if (items.length > 1) {
          // Sort by quality score descending
          items.sort((a, b) => qualityScore(b) - qualityScore(a));
          duplicates.push({
            normalizedNumber,
            items,
            selectedKeepId: items[0].id, // Auto-select best quality item
          });
        }
      }

      // Sort by number of duplicates descending
      duplicates.sort((a, b) => b.items.length - a.items.length);

      setDuplicateGroups(duplicates);
      setScanStats({
        totalLegislation: data?.length || 0,
        duplicateGroups: duplicates.length,
        totalDuplicates: duplicates.reduce((acc, g) => acc + g.items.length - 1, 0),
      });

      toast({
        title: "Scan concluído",
        description: `Encontrados ${duplicates.length} grupos com ${duplicates.reduce((acc, g) => acc + g.items.length - 1, 0)} duplicados`,
      });
    } catch (error) {
      console.error("Scan error:", error);
      toast({
        title: "Erro no scan",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  const toggleGroupSelection = (normalizedNumber: string) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(normalizedNumber)) {
      newSelected.delete(normalizedNumber);
    } else {
      newSelected.add(normalizedNumber);
    }
    setSelectedGroups(newSelected);
  };

  const selectAllGroups = () => {
    if (selectedGroups.size === duplicateGroups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(duplicateGroups.map(g => g.normalizedNumber)));
    }
  };

  const setKeepItem = (groupNormalizedNumber: string, itemId: string) => {
    setDuplicateGroups(prev => 
      prev.map(g => 
        g.normalizedNumber === groupNormalizedNumber 
          ? { ...g, selectedKeepId: itemId }
          : g
      )
    );
  };

  const mergeSelectedGroups = async () => {
    const groupsToMerge = duplicateGroups.filter(g => selectedGroups.has(g.normalizedNumber));
    
    if (groupsToMerge.length === 0) {
      toast({
        title: "Nenhum grupo selecionado",
        description: "Selecione pelo menos um grupo para fundir",
        variant: "destructive",
      });
      return;
    }

    setIsMerging(true);
    let mergedCount = 0;
    let deletedCount = 0;

    try {
      for (const group of groupsToMerge) {
        const keepItem = group.items.find(i => i.id === group.selectedKeepId);
        if (!keepItem) continue;

        const itemsToDelete = group.items.filter(i => i.id !== group.selectedKeepId);

        // Merge data from deleted items into keep item
        let mergedTitle = keepItem.title;
        let mergedSummary = keepItem.summary;
        let mergedEntity = keepItem.entity;
        let mergedPublicationDate = keepItem.publication_date;
        let mergedEffectiveDate = keepItem.effective_date;
        let mergedDocumentUrl = keepItem.document_url;

        for (const item of itemsToDelete) {
          // Use better title if current is generic
          if (item.title && item.title.length > mergedTitle.length) {
            const isCurrentGeneric = /^(decreto-lei|lei|portaria|regulamento|diretiva)\s*n/i.test(mergedTitle);
            const isNewGeneric = /^(decreto-lei|lei|portaria|regulamento|diretiva)\s*n/i.test(item.title);
            if (isCurrentGeneric && !isNewGeneric) {
              mergedTitle = item.title;
            }
          }
          
          // Use longer summary
          if (item.summary && (!mergedSummary || item.summary.length > mergedSummary.length)) {
            mergedSummary = item.summary;
          }
          
          // Use entity if missing
          if (item.entity && !mergedEntity) {
            mergedEntity = item.entity;
          }
          
          // Use dates if missing
          if (item.publication_date && !mergedPublicationDate) {
            mergedPublicationDate = item.publication_date;
          }
          if (item.effective_date && !mergedEffectiveDate) {
            mergedEffectiveDate = item.effective_date;
          }
          
          // Use document URL if missing
          if (item.document_url && !mergedDocumentUrl) {
            mergedDocumentUrl = item.document_url;
          }
        }

        // Update the keep item with merged data
        const { error: updateError } = await supabase
          .from("legislation")
          .update({
            title: mergedTitle,
            summary: mergedSummary,
            entity: mergedEntity,
            publication_date: mergedPublicationDate,
            effective_date: mergedEffectiveDate,
            document_url: mergedDocumentUrl,
          })
          .eq("id", keepItem.id);

        if (updateError) {
          console.error("Update error:", updateError);
          continue;
        }

        // Transfer category mappings from deleted items to keep item
        for (const item of itemsToDelete) {
          // Get mappings from item to delete
          const { data: mappings } = await supabase
            .from("legislation_category_mapping")
            .select("category_id")
            .eq("legislation_id", item.id);

          if (mappings && mappings.length > 0) {
            // Check existing mappings on keep item
            const { data: existingMappings } = await supabase
              .from("legislation_category_mapping")
              .select("category_id")
              .eq("legislation_id", keepItem.id);

            const existingCategoryIds = new Set(existingMappings?.map(m => m.category_id) || []);

            // Add missing mappings
            for (const mapping of mappings) {
              if (!existingCategoryIds.has(mapping.category_id)) {
                await supabase
                  .from("legislation_category_mapping")
                  .insert({
                    legislation_id: keepItem.id,
                    category_id: mapping.category_id,
                  });
              }
            }
          }

          // Transfer organization legislation assignments
          const { data: orgAssignments } = await supabase
            .from("organization_legislation")
            .select("organization_id, notes")
            .eq("legislation_id", item.id);

          if (orgAssignments && orgAssignments.length > 0) {
            const { data: existingAssignments } = await supabase
              .from("organization_legislation")
              .select("organization_id")
              .eq("legislation_id", keepItem.id);

            const existingOrgIds = new Set(existingAssignments?.map(a => a.organization_id) || []);

            for (const assignment of orgAssignments) {
              if (!existingOrgIds.has(assignment.organization_id)) {
                await supabase
                  .from("organization_legislation")
                  .insert({
                    legislation_id: keepItem.id,
                    organization_id: assignment.organization_id,
                    notes: assignment.notes,
                  });
              }
            }
          }

          // Transfer relations
          // Update source relations
          await supabase
            .from("legislation_relations")
            .update({ source_legislation_id: keepItem.id })
            .eq("source_legislation_id", item.id);

          // Update target relations
          await supabase
            .from("legislation_relations")
            .update({ target_legislation_id: keepItem.id })
            .eq("target_legislation_id", item.id);

          // Delete mappings from item to delete
          await supabase
            .from("legislation_category_mapping")
            .delete()
            .eq("legislation_id", item.id);

          // Delete organization assignments from item to delete
          await supabase
            .from("organization_legislation")
            .delete()
            .eq("legislation_id", item.id);
        }

        // Delete duplicate items
        const deleteIds = itemsToDelete.map(i => i.id);
        const { error: deleteError } = await supabase
          .from("legislation")
          .delete()
          .in("id", deleteIds);

        if (deleteError) {
          console.error("Delete error:", deleteError);
          continue;
        }

        mergedCount++;
        deletedCount += itemsToDelete.length;
      }

      // Remove merged groups from state
      setDuplicateGroups(prev => 
        prev.filter(g => !selectedGroups.has(g.normalizedNumber))
      );
      setSelectedGroups(new Set());

      toast({
        title: "Fusão concluída!",
        description: `${mergedCount} grupos fundidos, ${deletedCount} duplicados eliminados`,
      });

      // Update stats
      if (scanStats) {
        setScanStats({
          ...scanStats,
          duplicateGroups: scanStats.duplicateGroups - mergedCount,
          totalDuplicates: scanStats.totalDuplicates - deletedCount,
        });
      }
    } catch (error) {
      console.error("Merge error:", error);
      toast({
        title: "Erro na fusão",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Limpeza de Duplicados
        </CardTitle>
        <CardDescription>
          Identifique e funda legislação duplicada na base de dados. O sistema analisa números similares e permite fundir os dados mantendo o registo mais completo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scan button and stats */}
        <div className="flex items-center gap-4">
          <Button 
            onClick={scanForDuplicates} 
            disabled={isScanning}
            variant="outline"
          >
            {isScanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Procurar Duplicados
          </Button>

          {scanStats && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Total: {scanStats.totalLegislation}</span>
              <span>Grupos: {scanStats.duplicateGroups}</span>
              <Badge variant={scanStats.totalDuplicates > 0 ? "destructive" : "secondary"}>
                {scanStats.totalDuplicates} duplicados
              </Badge>
            </div>
          )}
        </div>

        {/* Duplicate groups list */}
        {duplicateGroups.length > 0 && (
          <>
            <Separator />

            {/* Filter controls */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtrar:</span>
              </div>
              <Select value={incompleteFilter} onValueChange={setIncompleteFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os grupos ({duplicateGroups.length})</SelectItem>
                  <SelectItem value="incomplete">
                    Dados incompletos ({incompleteCount})
                  </SelectItem>
                  <SelectItem value="complete">Dados completos ({duplicateGroups.length - incompleteCount})</SelectItem>
                  <SelectItem value="missing-summary">Sem sumário</SelectItem>
                  <SelectItem value="missing-entity">Sem entidade</SelectItem>
                  <SelectItem value="missing-effective-date">Sem data de vigor</SelectItem>
                  <SelectItem value="missing-publication-date">Sem data de publicação</SelectItem>
                </SelectContent>
              </Select>
              
              {incompleteCount > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {incompleteCount} grupos com dados em falta
                </Badge>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedGroups.size === filteredGroups.length && filteredGroups.length > 0}
                  onCheckedChange={() => {
                    if (selectedGroups.size === filteredGroups.length) {
                      setSelectedGroups(new Set());
                    } else {
                      setSelectedGroups(new Set(filteredGroups.map(g => g.normalizedNumber)));
                    }
                  }}
                />
                <span className="text-sm">
                  Selecionar visíveis ({selectedGroups.size}/{filteredGroups.length})
                </span>
              </div>

              <Button
                onClick={mergeSelectedGroups}
                disabled={isMerging || selectedGroups.size === 0}
                variant="default"
              >
                {isMerging ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Merge className="h-4 w-4 mr-2" />
                )}
                Fundir Selecionados ({selectedGroups.size})
              </Button>
            </div>

            <ScrollArea className="h-[500px] border rounded-lg p-4">
              <div className="space-y-4">
                {filteredGroups.length > 0 ? (
                  filteredGroups.map((group) => (
                    <DuplicateGroupCard
                      key={group.normalizedNumber}
                      group={group}
                      isSelected={selectedGroups.has(group.normalizedNumber)}
                      onToggleSelection={() => toggleGroupSelection(group.normalizedNumber)}
                      onSetKeepItem={(itemId) => setKeepItem(group.normalizedNumber, itemId)}
                      incompleteInfo={groupHasIncompleteData(group)}
                    />
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
                    Nenhum grupo corresponde ao filtro selecionado
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {!isScanning && duplicateGroups.length === 0 && scanStats && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
            Nenhum duplicado encontrado
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  isSelected: boolean;
  onToggleSelection: () => void;
  onSetKeepItem: (itemId: string) => void;
  incompleteInfo: { incomplete: boolean; issues: string[] };
}

function DuplicateGroupCard({ group, isSelected, onToggleSelection, onSetKeepItem, incompleteInfo }: DuplicateGroupCardProps) {
  return (
    <div className={`border rounded-lg p-4 ${isSelected ? 'border-primary bg-primary/5' : ''} ${incompleteInfo.incomplete ? 'border-l-4 border-l-amber-400' : ''}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelection}
          className="mt-1"
        />
        
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="font-medium flex items-center gap-2">
              {group.items[0].number}
              <Badge variant="outline">
                {group.items.length} registos
              </Badge>
            </div>
            {incompleteInfo.incomplete && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Falta: {incompleteInfo.issues.join(", ")}
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            {group.items.map((item, index) => (
              <div 
                key={item.id}
                className={`text-sm p-3 rounded border cursor-pointer transition-colors ${
                  group.selectedKeepId === item.id 
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/30' 
                    : 'border-border hover:border-muted-foreground'
                }`}
                onClick={() => onSetKeepItem(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {group.selectedKeepId === item.id ? (
                        <Badge variant="default" className="bg-green-600 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Manter
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          <Trash2 className="h-3 w-3 mr-1" />
                          Eliminar
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        Score: {qualityScore(item)}
                      </Badge>
                    </div>
                    
                    <p className="font-medium truncate" title={item.title}>
                      {item.title}
                    </p>
                    
                    {item.summary && (
                      <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-3 mt-3 pt-2 border-t text-xs text-muted-foreground">
                      {item.entity && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {item.entity}
                        </span>
                      )}
                      {item.publication_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Pub: {format(new Date(item.publication_date), "dd/MM/yyyy", { locale: pt })}
                        </span>
                      )}
                      {item.effective_date ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <Calendar className="h-3 w-3" />
                          Vigor: {format(new Date(item.effective_date), "dd/MM/yyyy", { locale: pt })}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-500">
                          <AlertTriangle className="h-3 w-3" />
                          Sem data de vigor
                        </span>
                      )}
                      {item.document_url && (
                        <a 
                          href={item.document_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Link
                        </a>
                      )}
                      {item.source && (
                        <Badge variant="outline" className="text-xs">
                          {item.source}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
