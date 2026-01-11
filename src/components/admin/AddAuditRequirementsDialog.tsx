import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, FileText, CheckCircle2 } from "lucide-react";

interface AddAuditRequirementsDialogProps {
  auditId: string;
  organizationId: string;
  existingRequirementIds: string[];
  onAdded: () => void;
}

const applicableTypes = ["aplicavel_direto", "aplicavel_indireto", "aplicavel_condicionado"];

export function AddAuditRequirementsDialog({
  auditId,
  organizationId,
  existingRequirementIds,
  onAdded,
}: AddAuditRequirementsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([]);

  // Fetch applicable requirements for this organization
  const { data: applicableRequirements, isLoading } = useQuery({
    queryKey: ["applicable-requirements", organizationId],
    queryFn: async () => {
      // First, get the applicabilities for this organization
      const { data: applicabilities, error: appError } = await supabase
        .from("applicabilities")
        .select("requirement_id, applicability_type")
        .eq("organization_id", organizationId)
        .in("applicability_type", applicableTypes);

      if (appError) throw appError;

      if (!applicabilities?.length) return [];

      // Get the requirement details
      const requirementIds = applicabilities.map(a => a.requirement_id);
      const { data: requirements, error: reqError } = await supabase
        .from("legal_requirements")
        .select(`
          id,
          article,
          requirement_text,
          legislation_id,
          legislation(id, number, title)
        `)
        .in("id", requirementIds);

      if (reqError) throw reqError;

      // Merge with applicability type
      return requirements?.map(req => {
        const app = applicabilities.find(a => a.requirement_id === req.id);
        return {
          ...req,
          applicability_type: app?.applicability_type || "aplicavel_direto",
        };
      }) || [];
    },
    enabled: open,
  });

  const availableRequirements = applicableRequirements?.filter(
    r => !existingRequirementIds.includes(r.id)
  ) || [];

  const handleToggle = (reqId: string) => {
    setSelectedRequirements(prev =>
      prev.includes(reqId) ? prev.filter(id => id !== reqId) : [...prev, reqId]
    );
  };

  const handleSelectAll = () => {
    if (selectedRequirements.length === availableRequirements.length) {
      setSelectedRequirements([]);
    } else {
      setSelectedRequirements(availableRequirements.map(r => r.id));
    }
  };

  const handleAdd = async () => {
    if (!selectedRequirements.length) {
      toast({ title: "Selecione requisitos", variant: "destructive" });
      return;
    }

    setIsAdding(true);
    try {
      const inserts = selectedRequirements.map(reqId => {
        const req = applicableRequirements?.find(r => r.id === reqId);
        return {
          audit_id: auditId,
          requirement_id: reqId,
          legislation_id: req?.legislation_id,
          applicability_type: req?.applicability_type || "aplicavel_direto",
          compliance_status: "pending",
        };
      });

      const { error } = await supabase.from("audit_requirements").insert(inserts);
      if (error) throw error;

      toast({
        title: "Requisitos adicionados",
        description: `${selectedRequirements.length} requisitos adicionados à auditoria`,
      });

      setSelectedRequirements([]);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["audit-details", auditId] });
      queryClient.invalidateQueries({ queryKey: ["audits"] });
      onAdded();
    } catch (error) {
      console.error("Error adding requirements:", error);
      toast({ title: "Erro ao adicionar requisitos", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const getApplicabilityLabel = (type: string) => {
    switch (type) {
      case "aplicavel_direto": return "Direto";
      case "aplicavel_indireto": return "Indireto";
      case "aplicavel_condicionado": return "Condicionado";
      default: return type;
    }
  };

  const getApplicabilityColor = (type: string) => {
    switch (type) {
      case "aplicavel_direto": return "bg-green-100 text-green-700 border-green-300";
      case "aplicavel_indireto": return "bg-blue-100 text-blue-700 border-blue-300";
      case "aplicavel_condicionado": return "bg-amber-100 text-amber-700 border-amber-300";
      default: return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar Requisitos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Adicionar Requisitos à Auditoria</DialogTitle>
          <DialogDescription>
            Selecione os requisitos aplicáveis para incluir nesta auditoria
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : availableRequirements.length > 0 ? (
          <>
            <div className="flex items-center justify-between py-2 border-b">
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                {selectedRequirements.length === availableRequirements.length
                  ? "Desselecionar todos"
                  : "Selecionar todos"}
              </Button>
              <Badge variant="secondary">
                {selectedRequirements.length} de {availableRequirements.length} selecionados
              </Badge>
            </div>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {availableRequirements.map((req: any) => (
                  <div
                    key={req.id}
                    className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedRequirements.includes(req.id)
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => handleToggle(req.id)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedRequirements.includes(req.id)}
                        onCheckedChange={() => handleToggle(req.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">
                            {req.legislation?.number}
                          </span>
                          <Badge variant="outline" className={`text-xs ${getApplicabilityColor(req.applicability_type)}`}>
                            {getApplicabilityLabel(req.applicability_type)}
                          </Badge>
                        </div>
                        {req.article && (
                          <p className="text-sm font-medium text-primary">{req.article}</p>
                        )}
                        <p className="text-sm line-clamp-2">{req.requirement_text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">Todos os requisitos já foram adicionados</p>
            <p className="text-sm">
              Ou não existem requisitos aplicáveis para esta organização
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={isAdding || !selectedRequirements.length}>
            {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Adicionar {selectedRequirements.length > 0 && `(${selectedRequirements.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
