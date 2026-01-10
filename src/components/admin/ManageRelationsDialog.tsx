import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Plus, Trash2, ExternalLink } from "lucide-react";
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

export function ManageRelationsDialog({
  legislation,
  open,
  onOpenChange,
}: ManageRelationsDialogProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");

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

  const handleAddRelation = async () => {
    if (!legislation || !selectedType || !selectedTargetId) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("legislation_relations")
        .insert({
          source_legislation_id: legislation.id,
          target_legislation_id: selectedTargetId,
          relation_type: selectedType,
        } as any);

      if (error) throw error;

      toast.success("Relação adicionada com sucesso");
      setSelectedType("");
      setSelectedTargetId("");
      refetchRelations();
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
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
                        <a href={rel.target_legislation.document_url} target="_blank" rel="noopener noreferrer">
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
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
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

            <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
              <SelectTrigger>
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
              onClick={handleAddRelation}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
