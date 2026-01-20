import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Trash2, FileText, Brain, AlertTriangle, Pencil, X, Check, GripVertical, RefreshCcw, Import } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { LegislationWithCategories } from "@/hooks/useLegislation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImportRequirementsDialog } from "./ImportRequirementsDialog";

interface LegalRequirement {
  id: string;
  legislation_id: string;
  article: string | null;
  requirement_text: string;
  notes: string | null;
  display_order: number | null;
}

interface ManageRequirementsDialogProps {
  legislation: LegislationWithCategories | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SortableRequirementCardProps {
  requirement: LegalRequirement;
  isEditing: boolean;
  editForm: { article: string; requirement_text: string; notes: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ article: string; requirement_text: string; notes: string }>>;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onDelete: () => void;
  isUpdating: boolean;
  isDeleting: boolean;
  disableActions: boolean;
  hasOrderMismatch?: boolean;
}

function SortableRequirementCard({
  requirement,
  isEditing,
  editForm,
  setEditForm,
  onStartEditing,
  onCancelEditing,
  onSaveEditing,
  onDelete,
  isUpdating,
  isDeleting,
  disableActions,
  hasOrderMismatch,
}: SortableRequirementCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: requirement.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`${isEditing ? "ring-2 ring-primary" : ""} ${isDragging ? "shadow-lg" : ""}`}
    >
      <CardContent className="pt-4">
        {isEditing ? (
          // Editing mode
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Artigo</Label>
                <Input
                  value={editForm.article}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, article: e.target.value }))}
                  placeholder="Art. 5º"
                  className="h-8"
                />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label className="text-xs">Requisito *</Label>
                <Textarea
                  value={editForm.requirement_text}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, requirement_text: e.target.value }))}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Input
                value={editForm.notes}
                onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Observações..."
                className="h-8"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onCancelEditing} disabled={isUpdating}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={onSaveEditing}
                disabled={isUpdating || !editForm.requirement_text.trim()}
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          // View mode
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {requirement.article && (
                  <span className="inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {requirement.article}
                  </span>
                )}
                {hasOrderMismatch && (
                  <span 
                    className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                    title="A ordem semântica deste requisito não corresponde ao display_order guardado. Clique em 'Recalcular Ordem' para corrigir."
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Ordem incorreta
                  </span>
                )}
              </div>
              <p className="text-sm">{requirement.requirement_text}</p>
              {requirement.notes && (
                <p className="text-xs text-muted-foreground italic">{requirement.notes}</p>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onStartEditing}
                disabled={disableActions}
                className="h-8 w-8"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={isDeleting || disableActions}
                className="h-8 w-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ManageRequirementsDialog({ legislation, open, onOpenChange }: ManageRequirementsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newRequirement, setNewRequirement] = useState({ article: "", requirement_text: "", notes: "" });
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ article: "", requirement_text: "", notes: "" });
  const [showImportDialog, setShowImportDialog] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: requirements, isLoading } = useQuery({
    queryKey: ["legal-requirements", legislation?.id],
    queryFn: async () => {
      if (!legislation) return [];
      const { data, error } = await supabase
        .from("legal_requirements")
        .select("*")
        .eq("legislation_id", legislation.id)
        .order("display_order", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as LegalRequirement[];
    },
    enabled: !!legislation && open,
  });

  // Compute which requirements have order mismatch
  const orderMismatchMap = useMemo(() => {
    if (!requirements || requirements.length === 0) return new Set<string>();

    // Semantic sort key extractor (same as recalculate logic)
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

    const getSortKey = (article: string | null) => {
      const a = (article || "").trim();
      const lower = a.toLowerCase();

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
        const mRoman = a.match(/anexo\s+([IVXLCDM]+)/i);
        const mNum = a.match(/anexo\s+(\d+)/i);
        if (mRoman) n1 = romanToInt(mRoman[1]);
        else if (mNum) n1 = parseInt(mNum[1], 10);
        else n1 = 0;
      }

      return { typeRank, n1, n2, raw: a };
    };

    // Create sorted copy
    const sorted = [...requirements].sort((x, y) => {
      const ax = getSortKey(x.article);
      const ay = getSortKey(y.article);

      if (ax.typeRank !== ay.typeRank) return ax.typeRank - ay.typeRank;
      if (ax.n1 !== ay.n1) return ax.n1 - ay.n1;
      if (ax.n2 !== ay.n2) return ax.n2 - ay.n2;
      return ax.raw.localeCompare(ay.raw, "pt");
    });

    // Build expected order map: id -> expected position
    const expectedOrder = new Map<string, number>();
    sorted.forEach((req, idx) => expectedOrder.set(req.id, idx + 1));

    // Find mismatches: current display_order != expected semantic order
    const mismatches = new Set<string>();
    requirements.forEach((req, idx) => {
      const currentOrder = req.display_order ?? (idx + 1);
      const expected = expectedOrder.get(req.id);
      if (expected !== undefined && currentOrder !== expected) {
        mismatches.add(req.id);
      }
    });

    return mismatches;
  }, [requirements]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!legislation || !newRequirement.requirement_text.trim()) return;

      // Get max display_order for this legislation
      const maxOrder = requirements?.reduce((max, r) => Math.max(max, r.display_order || 0), 0) || 0;

      const { error } = await supabase.from("legal_requirements").insert({
        legislation_id: legislation.id,
        article: newRequirement.article || null,
        requirement_text: newRequirement.requirement_text,
        notes: newRequirement.notes || null,
        display_order: maxOrder + 1,
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

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Update each requirement with its new order
      const updates = orderedIds.map((id, index) =>
        supabase
          .from("legal_requirements")
          .update({ display_order: index + 1 })
          .eq("id", id)
      );

      const results = await Promise.all(updates);
      const error = results.find((r) => r.error)?.error;
      if (error) throw error;
    },
    onError: (error) => {
      toast({
        title: "Erro ao reordenar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["legal-requirements", legislation?.id] });
    },
  });

  // Recalculate display_order based on article parsing (Considerandos > Artigos > Anexos)
  const recalculateOrderMutation = useMutation({
    mutationFn: async () => {
      if (!requirements || requirements.length === 0) return;

      // Roman numeral to integer converter
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

      // Sort key extractor
      const getSortKey = (article: string | null) => {
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
          const mRoman = a.match(/anexo\s+([IVXLCDM]+)/i);
          const mNum = a.match(/anexo\s+(\d+)/i);
          if (mRoman) n1 = romanToInt(mRoman[1]);
          else if (mNum) n1 = parseInt(mNum[1], 10);
          else n1 = 0;
        }

        return { typeRank, n1, n2, raw: a };
      };

      // Sort requirements by semantic order
      const sorted = [...requirements].sort((x, y) => {
        const ax = getSortKey(x.article);
        const ay = getSortKey(y.article);

        if (ax.typeRank !== ay.typeRank) return ax.typeRank - ay.typeRank;
        if (ax.n1 !== ay.n1) return ax.n1 - ay.n1;
        if (ax.n2 !== ay.n2) return ax.n2 - ay.n2;
        return ax.raw.localeCompare(ay.raw, "pt");
      });

      // Update each requirement with its new display_order
      const updates = sorted.map((req, index) =>
        supabase
          .from("legal_requirements")
          .update({ display_order: index + 1 })
          .eq("id", req.id)
      );

      const results = await Promise.all(updates);
      const error = results.find((r) => r.error)?.error;
      if (error) throw error;

      return sorted.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["legal-requirements", legislation?.id] });
      queryClient.invalidateQueries({ queryKey: ["legislation-requirements", legislation?.id] });
      toast({ title: "Ordem recalculada", description: `${count} requisitos reordenados.` });
    },
    onError: (error) => {
      toast({
        title: "Erro ao recalcular ordem",
        description: error instanceof Error ? error.message : "Erro desconhecido",
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, article, requirement_text, notes }: { id: string; article: string; requirement_text: string; notes: string }) => {
      const { error } = await supabase
        .from("legal_requirements")
        .update({
          article: article || null,
          requirement_text,
          notes: notes || null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-requirements", legislation?.id] });
      setEditingId(null);
      toast({ title: "Requisito atualizado" });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar",
        variant: "destructive",
      });
    },
  });

  const startEditing = (req: LegalRequirement) => {
    setEditingId(req.id);
    setEditForm({
      article: req.article || "",
      requirement_text: req.requirement_text,
      notes: req.notes || "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({ article: "", requirement_text: "", notes: "" });
  };

  const saveEditing = () => {
    if (!editingId || !editForm.requirement_text.trim()) return;
    updateMutation.mutate({
      id: editingId,
      article: editForm.article,
      requirement_text: editForm.requirement_text,
      notes: editForm.notes,
    });
  };

  const handleAIExtract = async (replaceExisting: boolean) => {
    if (!legislation) return;
    
    setIsExtracting(true);
    setShowReplaceConfirm(false);

    try {
      // If replacing, delete existing requirements first
      if (replaceExisting && requirements && requirements.length > 0) {
        const { error: deleteError } = await supabase
          .from("legal_requirements")
          .delete()
          .eq("legislation_id", legislation.id);
        
        if (deleteError) throw deleteError;
      }

      const { data, error } = await supabase.functions.invoke("extract-requirements", {
        body: { 
          legislationIds: [legislation.id],
          dryRun: false 
        },
      });

      if (error) throw error;

      if (data.success) {
        const result = data.results?.[0];
        if (result?.error) {
          throw new Error(result.error);
        }
        
        toast({
          title: "Extração concluída",
          description: `${result?.requirementsCount || 0} requisitos extraídos via IA`,
        });
        
        queryClient.invalidateQueries({ queryKey: ["legal-requirements", legislation.id] });
        queryClient.invalidateQueries({ queryKey: ["requirements-stats"] });
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("AI extraction error:", error);
      toast({
        title: "Erro na extração",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAIExtractClick = () => {
    if (requirements && requirements.length > 0) {
      setShowReplaceConfirm(true);
    } else {
      handleAIExtract(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && requirements) {
      const oldIndex = requirements.findIndex((r) => r.id === active.id);
      const newIndex = requirements.findIndex((r) => r.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(requirements, oldIndex, newIndex);
        // Optimistically update the cache
        queryClient.setQueryData(
          ["legal-requirements", legislation?.id],
          newOrder
        );
        // Persist the new order
        reorderMutation.mutate(newOrder.map((r) => r.id));
      }
    }
  };

  return (
    <>
      <AlertDialog open={showReplaceConfirm} onOpenChange={setShowReplaceConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Diploma já tem requisitos
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este diploma já tem <strong>{requirements?.length || 0} requisitos</strong> definidos. 
              O que pretende fazer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAIExtract(false)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Adicionar aos existentes
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleAIExtract(true)}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Substituir todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => addMutation.mutate()}
                  disabled={addMutation.isPending || !newRequirement.requirement_text.trim()}
                  className="flex-1"
                >
                  {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Manual
                </Button>
                <Button
                  onClick={handleAIExtractClick}
                  disabled={isExtracting}
                  variant="outline"
                  className="gap-2"
                >
                  {isExtracting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4" />
                  )}
                  Extrair via IA
                </Button>
                <Button
                  onClick={() => setShowImportDialog(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <Import className="h-4 w-4" />
                  Importar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Existing requirements */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="font-medium">
                Requisitos Existentes ({requirements?.length || 0})
              </h4>
              <div className="flex items-center gap-2">
                {requirements && requirements.length > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => recalculateOrderMutation.mutate()}
                      disabled={recalculateOrderMutation.isPending}
                      className="h-7 text-xs gap-1"
                    >
                      {recalculateOrderMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-3 w-3" />
                      )}
                      Recalcular Ordem
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      ou arraste para reordenar
                    </span>
                  </>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : requirements && requirements.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={requirements.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {requirements.map((req) => (
                      <SortableRequirementCard
                        key={req.id}
                        requirement={req}
                        isEditing={editingId === req.id}
                        editForm={editForm}
                        setEditForm={setEditForm}
                        onStartEditing={() => startEditing(req)}
                        onCancelEditing={cancelEditing}
                        onSaveEditing={saveEditing}
                        onDelete={() => deleteMutation.mutate(req.id)}
                        isUpdating={updateMutation.isPending}
                        isDeleting={deleteMutation.isPending}
                        disableActions={editingId !== null && editingId !== req.id}
                        hasOrderMismatch={orderMismatchMap.has(req.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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
    
    {legislation && (
      <ImportRequirementsDialog
        legislationId={legislation.id}
        legislationNumber={legislation.number}
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        existingRequirementsCount={requirements?.length || 0}
      />
    )}
    </>
  );
}
