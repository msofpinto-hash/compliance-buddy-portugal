import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Copy, Building2, FileText, ClipboardCheck, AlertTriangle, CheckCircle2, FolderTree } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Organization {
  id: string;
  name: string;
}

interface CopyOrganizationSettingsDialogProps {
  sourceOrganization: Organization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CopyOptions {
  themes: boolean;
  legislation: boolean;
  applicabilities: boolean;
  actionPlans: boolean;
}

export function CopyOrganizationSettingsDialog({
  sourceOrganization,
  open,
  onOpenChange,
}: CopyOrganizationSettingsDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [targetOrgId, setTargetOrgId] = useState<string>("");
  const [copyOptions, setCopyOptions] = useState<CopyOptions>({
    themes: true,
    legislation: true,
    applicabilities: true,
    actionPlans: false,
  });
  const [copyResult, setCopyResult] = useState<{
    themes: number;
    legislation: number;
    applicabilities: number;
    actionPlans: number;
  } | null>(null);

  // Fetch all organizations
  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch source organization stats
  const { data: sourceStats } = useQuery({
    queryKey: ["org-copy-stats", sourceOrganization?.id],
    queryFn: async () => {
      if (!sourceOrganization) return null;

      const [themesRes, legislationRes, applicabilitiesRes, actionPlansRes] = await Promise.all([
        supabase
          .from("organization_themes")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", sourceOrganization.id),
        supabase
          .from("organization_legislation")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", sourceOrganization.id),
        supabase
          .from("applicabilities")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", sourceOrganization.id),
        supabase
          .from("action_plans")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", sourceOrganization.id),
      ]);

      return {
        themes: themesRes.count || 0,
        legislation: legislationRes.count || 0,
        applicabilities: applicabilitiesRes.count || 0,
        actionPlans: actionPlansRes.count || 0,
      };
    },
    enabled: !!sourceOrganization && open,
  });

  // Copy mutation
  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!sourceOrganization || !targetOrgId) {
        throw new Error("Selecione a organização de destino");
      }

      const results = {
        themes: 0,
        legislation: 0,
        applicabilities: 0,
        actionPlans: 0,
      };

      // Copy themes
      if (copyOptions.themes) {
        const { data: sourceThemes } = await supabase
          .from("organization_themes")
          .select("theme_id")
          .eq("organization_id", sourceOrganization.id);

        if (sourceThemes && sourceThemes.length > 0) {
          // Get existing themes for target
          const { data: existingThemes } = await supabase
            .from("organization_themes")
            .select("theme_id")
            .eq("organization_id", targetOrgId);

          const existingThemeIds = new Set(existingThemes?.map(t => t.theme_id) || []);
          const newThemes = sourceThemes.filter(t => !existingThemeIds.has(t.theme_id));

          if (newThemes.length > 0) {
            const { error } = await supabase.from("organization_themes").insert(
              newThemes.map(t => ({
                organization_id: targetOrgId,
                theme_id: t.theme_id,
              }))
            );
            if (error) throw error;
            results.themes = newThemes.length;
          }
        }
      }

      // Copy legislation
      if (copyOptions.legislation) {
        const { data: sourceLegislation } = await supabase
          .from("organization_legislation")
          .select("legislation_id")
          .eq("organization_id", sourceOrganization.id);

        if (sourceLegislation && sourceLegislation.length > 0) {
          // Get existing legislation for target
          const { data: existingLegislation } = await supabase
            .from("organization_legislation")
            .select("legislation_id")
            .eq("organization_id", targetOrgId);

          const existingLegislationIds = new Set(existingLegislation?.map(l => l.legislation_id) || []);
          const newLegislation = sourceLegislation.filter(l => !existingLegislationIds.has(l.legislation_id));

          if (newLegislation.length > 0) {
            const { error } = await supabase.from("organization_legislation").insert(
              newLegislation.map(l => ({
                organization_id: targetOrgId,
                legislation_id: l.legislation_id,
              }))
            );
            if (error) throw error;
            results.legislation = newLegislation.length;
          }
        }
      }

      // Copy applicabilities (compliance status)
      if (copyOptions.applicabilities) {
        const { data: sourceApplicabilities } = await supabase
          .from("applicabilities")
          .select("*")
          .eq("organization_id", sourceOrganization.id);

        if (sourceApplicabilities && sourceApplicabilities.length > 0) {
          // Get existing applicabilities for target
          const { data: existingApplicabilities } = await supabase
            .from("applicabilities")
            .select("requirement_id")
            .eq("organization_id", targetOrgId);

          const existingReqIds = new Set(existingApplicabilities?.map(a => a.requirement_id) || []);
          const newApplicabilities = sourceApplicabilities.filter(a => !existingReqIds.has(a.requirement_id));

          if (newApplicabilities.length > 0) {
            const { error } = await supabase.from("applicabilities").insert(
              newApplicabilities.map(a => ({
                organization_id: targetOrgId,
                requirement_id: a.requirement_id,
                is_applicable: a.is_applicable,
                compliance_status: a.compliance_status,
                notes: a.notes,
                applicability_type: a.applicability_type,
              }))
            );
            if (error) throw error;
            results.applicabilities = newApplicabilities.length;
          }
        }
      }

      // Copy action plans
      if (copyOptions.actionPlans) {
        const { data: sourceActionPlans } = await supabase
          .from("action_plans")
          .select("*")
          .eq("organization_id", sourceOrganization.id);

        if (sourceActionPlans && sourceActionPlans.length > 0) {
          // Get existing action plans for target (by requirement_id to avoid duplicates)
          const { data: existingActionPlans } = await supabase
            .from("action_plans")
            .select("requirement_id")
            .eq("organization_id", targetOrgId);

          const existingReqIds = new Set(existingActionPlans?.map(a => a.requirement_id) || []);
          const newActionPlans = sourceActionPlans.filter(a => !existingReqIds.has(a.requirement_id));

          if (newActionPlans.length > 0) {
            const { error } = await supabase.from("action_plans").insert(
              newActionPlans.map(a => ({
                organization_id: targetOrgId,
                requirement_id: a.requirement_id,
                title: a.title,
                description: a.description,
                responsible: a.responsible,
                due_date: a.due_date,
                status: "pending", // Reset status for new org
              }))
            );
            if (error) throw error;
            results.actionPlans = newActionPlans.length;
          }
        }
      }

      return results;
    },
    onSuccess: (results) => {
      setCopyResult(results);
      queryClient.invalidateQueries({ queryKey: ["org-legislation-count"] });
      queryClient.invalidateQueries({ queryKey: ["org-themes-count"] });
      queryClient.invalidateQueries({ queryKey: ["org-applicabilities"] });
      
      const total = results.themes + results.legislation + results.applicabilities + results.actionPlans;
      
      toast({
        title: "Configurações copiadas",
        description: `${total} itens copiados para a organização de destino`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao copiar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const availableTargets = organizations?.filter(org => org.id !== sourceOrganization?.id) || [];
  const targetOrg = organizations?.find(org => org.id === targetOrgId);

  const handleCopy = () => {
    setCopyResult(null);
    copyMutation.mutate();
  };

  const handleClose = () => {
    setTargetOrgId("");
    setCopyResult(null);
    setCopyOptions({
      themes: true,
      legislation: true,
      applicabilities: true,
      actionPlans: false,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copiar Configurações
          </DialogTitle>
          <DialogDescription>
            Copie temas, diplomas e estados de conformidade de "{sourceOrganization?.name}" para outra organização.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Source Stats */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-medium">Origem: {sourceOrganization?.name}</span>
              </div>
              {sourceStats && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded bg-muted/50">
                    <div className="text-lg font-bold">{sourceStats.themes}</div>
                    <div className="text-xs text-muted-foreground">Temas</div>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <div className="text-lg font-bold">{sourceStats.legislation}</div>
                    <div className="text-xs text-muted-foreground">Diplomas</div>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <div className="text-lg font-bold">{sourceStats.applicabilities}</div>
                    <div className="text-xs text-muted-foreground">Conformidades</div>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <div className="text-lg font-bold">{sourceStats.actionPlans}</div>
                    <div className="text-xs text-muted-foreground">Planos</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Target Selection */}
          <div className="space-y-2">
            <Label>Organização de Destino</Label>
            <Select value={targetOrgId} onValueChange={setTargetOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a organização de destino" />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map(org => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Copy Options */}
          <div className="space-y-3">
            <Label>O que copiar:</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-themes"
                  checked={copyOptions.themes}
                  onCheckedChange={(checked) =>
                    setCopyOptions(prev => ({ ...prev, themes: !!checked }))
                  }
                />
                <label htmlFor="copy-themes" className="flex items-center gap-2 text-sm cursor-pointer">
                  <FolderTree className="h-4 w-4" />
                  Temas ({sourceStats?.themes || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-legislation"
                  checked={copyOptions.legislation}
                  onCheckedChange={(checked) =>
                    setCopyOptions(prev => ({ ...prev, legislation: !!checked }))
                  }
                />
                <label htmlFor="copy-legislation" className="flex items-center gap-2 text-sm cursor-pointer">
                  <FileText className="h-4 w-4" />
                  Diplomas atribuídos ({sourceStats?.legislation || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-applicabilities"
                  checked={copyOptions.applicabilities}
                  onCheckedChange={(checked) =>
                    setCopyOptions(prev => ({ ...prev, applicabilities: !!checked }))
                  }
                />
                <label htmlFor="copy-applicabilities" className="flex items-center gap-2 text-sm cursor-pointer">
                  <ClipboardCheck className="h-4 w-4" />
                  Estados de conformidade ({sourceStats?.applicabilities || 0})
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="copy-actionPlans"
                  checked={copyOptions.actionPlans}
                  onCheckedChange={(checked) =>
                    setCopyOptions(prev => ({ ...prev, actionPlans: !!checked }))
                  }
                />
                <label htmlFor="copy-actionPlans" className="flex items-center gap-2 text-sm cursor-pointer">
                  <AlertTriangle className="h-4 w-4" />
                  Planos de ação ({sourceStats?.actionPlans || 0})
                </label>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Nota:</p>
              <p>Itens que já existem na organização de destino não serão duplicados.</p>
            </div>
          </div>

          {/* Results */}
          {copyResult && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3 text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Cópia concluída!</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded bg-background">
                    <div className="text-lg font-bold text-green-600">{copyResult.themes}</div>
                    <div className="text-xs text-muted-foreground">Temas</div>
                  </div>
                  <div className="p-2 rounded bg-background">
                    <div className="text-lg font-bold text-green-600">{copyResult.legislation}</div>
                    <div className="text-xs text-muted-foreground">Diplomas</div>
                  </div>
                  <div className="p-2 rounded bg-background">
                    <div className="text-lg font-bold text-green-600">{copyResult.applicabilities}</div>
                    <div className="text-xs text-muted-foreground">Conformidades</div>
                  </div>
                  <div className="p-2 rounded bg-background">
                    <div className="text-lg font-bold text-green-600">{copyResult.actionPlans}</div>
                    <div className="text-xs text-muted-foreground">Planos</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {copyResult ? "Fechar" : "Cancelar"}
          </Button>
          {!copyResult && (
            <Button
              onClick={handleCopy}
              disabled={!targetOrgId || copyMutation.isPending || (!copyOptions.themes && !copyOptions.legislation && !copyOptions.applicabilities && !copyOptions.actionPlans)}
            >
              {copyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Copiar Configurações
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
