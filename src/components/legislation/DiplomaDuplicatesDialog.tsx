import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type DuplicateRow = {
  id: string;
  number: string;
  title: string;
  origin: string | null;
  publication_date: string | null;
  document_url: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: DuplicateRow[];
  reason: string;
  onMerged?: () => void;
}

export function DiplomaDuplicatesDialog({ open, onOpenChange, rows, reason, onMerged }: Props) {
  const [keepId, setKeepId] = useState<string | null>(null);
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) return;
    const best = rows.find((r) => r.document_url) ?? rows[0];
    setKeepId(best?.id ?? null);
    setRemoveIds(new Set());
  }, [open, rows]);

  const toggleRemove = (id: string) => {
    setRemoveIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const merge = async () => {
    if (!keepId || removeIds.size === 0) return;
    setWorking(true);
    const { error } = await supabase.functions.invoke("merge-duplicate-legislation", {
      body: { keep_id: keepId, remove_ids: Array.from(removeIds) },
    });
    setWorking(false);
    if (error) {
      toast.error("Não foi possível eliminar", { description: error.message });
      return;
    }
    toast.success(`${removeIds.size} cópia(s) eliminada(s)`);
    onOpenChange(false);
    onMerged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cópias deste diploma</DialogTitle>
          <DialogDescription>
            {reason}. Escolha o registo a manter — o trabalho associado às cópias é transferido antes de as
            eliminar.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex-1 space-y-2 overflow-y-auto pr-1">
          {rows.map((r) => {
            const isKeep = keepId === r.id;
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-md border p-3",
                  isKeep ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{r.number}</Badge>
                      {r.publication_date && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.publication_date).toLocaleDateString("pt-PT")}
                        </span>
                      )}
                      {isKeep && <Badge>Manter</Badge>}
                    </div>
                    <p className="text-sm">{r.title}</p>
                    {r.document_url && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{r.document_url}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant={isKeep ? "default" : "outline"}
                      onClick={() => {
                        setKeepId(r.id);
                        setRemoveIds((prev) => {
                          const next = new Set(prev);
                          next.delete(r.id);
                          return next;
                        });
                      }}
                    >
                      <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                      Manter
                    </Button>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={removeIds.has(r.id)}
                        disabled={isKeep}
                        onCheckedChange={() => toggleRemove(r.id)}
                        aria-label={`Eliminar ${r.number}`}
                      />
                      Eliminar
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={working || !keepId || removeIds.size === 0}
            onClick={merge}
          >
            {working ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            Eliminar selecionadas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
