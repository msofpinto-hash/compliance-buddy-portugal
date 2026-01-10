import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Save, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { LegislationWithCategories } from "@/hooks/useLegislation";

interface LegalRequirement {
  id: string;
  legislation_id: string;
  article: string | null;
  requirement_text: string;
  notes: string | null;
}

interface ManageRequirementsDialogProps {
  legislation: LegislationWithCategories | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageRequirementsDialog({ legislation, open, onOpenChange }: ManageRequirementsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newRequirement, setNewRequirement] = useState({ article: "", requirement_text: "", notes: "" });

  const { data: requirements, isLoading } = useQuery({
    queryKey: ["legal-requirements", legislation?.id],
    queryFn: async () => {
      if (!legislation) return [];
      const { data, error } = await supabase
        .from("legal_requirements")
        .select("*")
        .eq("legislation_id", legislation.id)
        .order("article");

      if (error) throw error;
      return data as LegalRequirement[];
    },
    enabled: !!legislation && open,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!legislation || !newRequirement.requirement_text.trim()) return;

      const { error } = await supabase.from("legal_requirements").insert({
        legislation_id: legislation.id,
        article: newRequirement.article || null,
        requirement_text: newRequirement.requirement_text,
        notes: newRequirement.notes || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-requirements", legislation?.id] });
      setNewRequirement({ article: "", requirement_text: "", notes: "" });
      toast({ title: "Requisito adicionado" });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao adicionar",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (requirementId: string) => {
      const { error } = await supabase
        .from("legal_requirements")
        .delete()
        .eq("id", requirementId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-requirements", legislation?.id] });
      toast({ title: "Requisito removido" });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao remover",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Requisitos Legais
          </DialogTitle>
          <DialogDescription>
            {legislation?.number} - {legislation?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add new requirement form */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h4 className="font-medium">Adicionar Novo Requisito</h4>
              
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="article">Artigo</Label>
                  <Input
                    id="article"
                    placeholder="Art. 5º"
                    value={newRequirement.article}
                    onChange={(e) => setNewRequirement(prev => ({ ...prev, article: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="requirement">Requisito *</Label>
                  <Textarea
                    id="requirement"
                    placeholder="Descreva o requisito legal..."
                    value={newRequirement.requirement_text}
                    onChange={(e) => setNewRequirement(prev => ({ ...prev, requirement_text: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  placeholder="Observações adicionais..."
                  value={newRequirement.notes}
                  onChange={(e) => setNewRequirement(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>

              <Button
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !newRequirement.requirement_text.trim()}
                className="w-full"
              >
                {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Requisito
              </Button>
            </CardContent>
          </Card>

          {/* Existing requirements */}
          <div className="space-y-3">
            <h4 className="font-medium">
              Requisitos Existentes ({requirements?.length || 0})
            </h4>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : requirements && requirements.length > 0 ? (
              <div className="space-y-3">
                {requirements.map((req) => (
                  <Card key={req.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          {req.article && (
                            <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {req.article}
                            </span>
                          )}
                          <p className="text-sm">{req.requirement_text}</p>
                          {req.notes && (
                            <p className="text-xs text-muted-foreground italic">{req.notes}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(req.id)}
                          disabled={deleteMutation.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>Nenhum requisito legal definido</p>
                <p className="text-sm">Adicione requisitos usando o formulário acima</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
