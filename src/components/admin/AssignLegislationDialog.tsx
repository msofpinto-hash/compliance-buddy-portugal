import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileText, Plus, Search, X, Building2, Check } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

type Organization = Tables<"organizations">;
type Legislation = Tables<"legislation">;

interface AssignLegislationDialogProps {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignLegislationDialog({ organization, open, onOpenChange }: AssignLegislationDialogProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch all legislation
  const { data: allLegislation, isLoading: loadingLegislation } = useQuery({
    queryKey: ["all-legislation-for-assign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select("*")
        .order("publication_date", { ascending: false });
      
      if (error) throw error;
      return data as Legislation[];
    },
    enabled: open,
  });

  // Fetch already assigned legislation
  const { data: assignedLegislation } = useQuery({
    queryKey: ["org-assigned-legislation", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_legislation")
        .select("legislation_id")
        .eq("organization_id", organization.id);
      
      if (error) throw error;
      return new Set(data.map(d => d.legislation_id));
    },
    enabled: open,
  });

  // Filter legislation
  const filteredLegislation = allLegislation?.filter(leg => {
    if (!searchTerm) return true;
    return leg.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
           leg.title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Assign legislation mutation
  const assignMutation = useMutation({
    mutationFn: async () => {
      const toAssign = Array.from(selectedIds).filter(id => !assignedLegislation?.has(id));
      
      if (toAssign.length === 0) {
        throw new Error("Nenhum diploma novo selecionado");
      }

      const { error } = await supabase
        .from("organization_legislation")
        .insert(
          toAssign.map(legislation_id => ({
            organization_id: organization.id,
            legislation_id,
          }))
        );
      
      if (error) throw error;
      return toAssign.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["org-assigned-legislation", organization.id] });
      queryClient.invalidateQueries({ queryKey: ["org-legislation-count", organization.id] });
      toast.success(`${count} diploma(s) atribuído(s) com sucesso`);
      setSelectedIds(new Set());
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (!filteredLegislation) return;
    const unassignedIds = filteredLegislation
      .filter(leg => !assignedLegislation?.has(leg.id))
      .map(leg => leg.id);
    setSelectedIds(new Set(unassignedIds));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const newSelectionsCount = Array.from(selectedIds).filter(id => !assignedLegislation?.has(id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Atribuir Diplomas
          </DialogTitle>
          <DialogDescription>
            Selecione os diplomas a atribuir a {organization.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar diplomas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Selecionar Todos
            </Button>
            {selectedIds.size > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                Limpar ({selectedIds.size})
              </Button>
            )}
          </div>

          <ScrollArea className="h-[400px] border rounded-lg">
            {loadingLegislation ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : filteredLegislation?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum diploma encontrado</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredLegislation?.map((leg) => {
                  const isAssigned = assignedLegislation?.has(leg.id);
                  const isSelected = selectedIds.has(leg.id);

                  return (
                    <div
                      key={leg.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                        isAssigned
                          ? "bg-muted/50 opacity-60"
                          : isSelected
                          ? "bg-primary/5 border-primary"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => !isAssigned && handleToggle(leg.id)}
                    >
                      <Checkbox
                        checked={isAssigned || isSelected}
                        disabled={isAssigned}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="shrink-0">
                            {leg.number}
                          </Badge>
                          {isAssigned && (
                            <Badge variant="secondary" className="gap-1">
                              <Check className="h-3 w-3" />
                              Atribuído
                            </Badge>
                          )}
                          {leg.source && (
                            <Badge variant="secondary">
                              {leg.source === "dre" ? "DRE" : leg.source === "eurlex" ? "EUR-Lex" : leg.source}
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-sm mt-1 line-clamp-1">{leg.title}</p>
                        {leg.publication_date && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(leg.publication_date), "d 'de' MMMM 'de' yyyy", { locale: pt })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={newSelectionsCount === 0 || assignMutation.isPending}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {assignMutation.isPending
              ? "A atribuir..."
              : `Atribuir ${newSelectionsCount} diploma(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Component to show assigned legislation count
export function OrganizationLegislationBadge({ organizationId }: { organizationId: string }) {
  const { data: count } = useQuery({
    queryKey: ["org-legislation-count", organizationId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("organization_legislation")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      
      if (error) throw error;
      return count || 0;
    },
  });

  return (
    <Badge variant="secondary" className="gap-1">
      <FileText className="h-3 w-3" />
      {count ?? "..."} diplomas
    </Badge>
  );
}
