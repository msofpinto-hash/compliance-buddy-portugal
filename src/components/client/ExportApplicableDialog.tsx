import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, type SheetData } from "@/lib/excelUtils";
import { toast } from "@/hooks/use-toast";
import type { LegislationWithCategories } from "@/hooks/useLegislation";

const APPLICABLE_TYPES = [
  "aplicavel_direto",
  "aplicavel_indireto",
  "aplicavel_condicionado",
];

const TYPE_LABELS: Record<string, string> = {
  aplicavel_direto: "Aplicável Direto",
  aplicavel_indireto: "Aplicável Indireto",
  aplicavel_condicionado: "Aplicável Condicionado",
  nao_aplicavel: "Não Aplicável",
  informativo: "Informativo",
  nao_avaliado: "Não Avaliado",
};

const STATUS_LABELS: Record<string, string> = {
  conforme: "Conforme",
  nao_conforme: "Não Conforme",
  parcialmente_conforme: "Parcialmente Conforme",
  nao_avaliado: "Não Avaliado",
  nao_aplicavel: "Não Aplicável",
};

interface ThemeOption {
  id: string;
  name: string;
}

interface Props {
  organizationId?: string;
  organizationName?: string;
  themes?: ThemeOption[];
  legislation?: LegislationWithCategories[];
}

function safeSheetName(prefix: string, theme: string, used: Set<string>) {
  let base = `${prefix} - ${theme}`.replace(/[\\/*?:[\]]/g, "").slice(0, 31);
  let name = base;
  let i = 2;
  while (used.has(name)) {
    name = `${base.slice(0, 28)}(${i})`;
    i++;
  }
  used.add(name);
  return name;
}

export function ExportApplicableDialog({
  organizationId,
  organizationName,
  themes = [],
  legislation = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [includeRequirements, setIncludeRequirements] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setSelectedThemes(themes.map((t) => t.name));
  }, [open, themes]);

  const toggleTheme = (name: string) =>
    setSelectedThemes((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  const handleExport = async () => {
    if (!organizationId) {
      toast({
        title: "Sem organização",
        description: "Selecione uma organização para exportar.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      // Applicability of diplomas for this organization
      const { data: orgLeg, error: orgLegError } = await supabase
        .from("organization_legislation")
        .select("legislation_id, applicability_type")
        .eq("organization_id", organizationId);
      if (orgLegError) throw orgLegError;

      const applicabilityMap = new Map<string, string>();
      (orgLeg || []).forEach((r) => {
        if (r.applicability_type)
          applicabilityMap.set(r.legislation_id, r.applicability_type);
      });

      // Only applicable diplomas, grouped by selected theme
      const byTheme = new Map<string, LegislationWithCategories[]>();
      selectedThemes.forEach((t) => byTheme.set(t, []));

      for (const leg of legislation) {
        const type = applicabilityMap.get(leg.id);
        if (!type || !APPLICABLE_TYPES.includes(type)) continue;
        const themeNames = Array.from(
          new Set(leg.categories.map((c) => c.theme_name).filter(Boolean)),
        );
        for (const tn of themeNames) {
          if (byTheme.has(tn)) byTheme.get(tn)!.push(leg);
        }
      }

      const allIds = Array.from(
        new Set(
          Array.from(byTheme.values())
            .flat()
            .map((l) => l.id),
        ),
      );

      if (allIds.length === 0) {
        toast({
          title: "Nada para exportar",
          description:
            "Não existem diplomas aplicáveis nos temas selecionados.",
        });
        setLoading(false);
        return;
      }

      // Requirements + their applicability for this organization
      const reqByLeg = new Map<string, any[]>();
      const reqApplicability = new Map<string, any>();
      if (includeRequirements) {
        const chunk = 200;
        for (let i = 0; i < allIds.length; i += chunk) {
          const slice = allIds.slice(i, i + chunk);
          const { data: reqs, error: reqError } = await supabase
            .from("legal_requirements")
            .select("id, legislation_id, article, requirement_text, display_order")
            .in("legislation_id", slice);
          if (reqError) throw reqError;
          (reqs || []).forEach((r) => {
            reqByLeg.set(r.legislation_id, [
              ...(reqByLeg.get(r.legislation_id) || []),
              r,
            ]);
          });
        }

        const reqIds = Array.from(reqByLeg.values())
          .flat()
          .map((r) => r.id);
        for (let i = 0; i < reqIds.length; i += chunk) {
          const slice = reqIds.slice(i, i + chunk);
          const { data: apps, error: appError } = await supabase
            .from("applicabilities")
            .select(
              "requirement_id, is_applicable, applicability_type, compliance_status, notes",
            )
            .eq("organization_id", organizationId)
            .in("requirement_id", slice);
          if (appError) throw appError;
          (apps || []).forEach((a) => reqApplicability.set(a.requirement_id, a));
        }
      }

      const sheets: SheetData[] = [];
      const used = new Set<string>();

      for (const themeName of selectedThemes) {
        const legs = (byTheme.get(themeName) || []).sort((a, b) =>
          (a.number || "").localeCompare(b.number || ""),
        );
        if (legs.length === 0) continue;

        sheets.push({
          name: safeSheetName("Diplomas", themeName, used),
          columns: [
            { header: "Número", key: "number", width: 24 },
            { header: "Título", key: "title", width: 70 },
            { header: "Origem", key: "origin", width: 12 },
            { header: "Entidade", key: "entity", width: 24 },
            { header: "Publicação", key: "publication", width: 14 },
            { header: "Entrada em vigor", key: "effective", width: 16 },
            { header: "Aplicabilidade", key: "applicability", width: 22 },
            { header: "Categorias", key: "categories", width: 40 },
            { header: "Link", key: "url", width: 45 },
          ],
          rows: legs.map((l) => ({
            number: l.number,
            title: l.title,
            origin: l.origin === "eurlex" || l.origin === "EU" ? "UE" : "PT",
            entity: l.entity || "",
            publication: l.publication_date || "",
            effective: l.effective_date || "",
            applicability:
              TYPE_LABELS[applicabilityMap.get(l.id) || ""] || "—",
            categories: l.categories
              .filter((c) => c.theme_name === themeName)
              .map((c) => c.name)
              .join("; "),
            url: l.document_url || "",
          })),
        });

        if (includeRequirements) {
          const rows: Record<string, any>[] = [];
          for (const l of legs) {
            const reqs = (reqByLeg.get(l.id) || []).sort(
              (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
            );
            for (const r of reqs) {
              const app = reqApplicability.get(r.id);
              if (app && app.is_applicable === false) continue;
              rows.push({
                number: l.number,
                title: l.title,
                article: r.article || "",
                text: (r.requirement_text || "").replace(/\s+/g, " ").trim(),
                applicability:
                  TYPE_LABELS[app?.applicability_type || ""] || "Aplicável",
                status:
                  STATUS_LABELS[app?.compliance_status || ""] ||
                  "Não Avaliado",
                notes: app?.notes || "",
              });
            }
          }
          if (rows.length > 0) {
            sheets.push({
              name: safeSheetName("Requisitos", themeName, used),
              columns: [
                { header: "Diploma", key: "number", width: 24 },
                { header: "Título do diploma", key: "title", width: 50 },
                { header: "Artigo", key: "article", width: 18 },
                { header: "Requisito", key: "text", width: 90 },
                { header: "Aplicabilidade", key: "applicability", width: 22 },
                { header: "Conformidade", key: "status", width: 22 },
                { header: "Notas", key: "notes", width: 40 },
              ],
              rows,
            });
          }
        }
      }

      if (sheets.length === 0) {
        toast({
          title: "Nada para exportar",
          description:
            "Não existem diplomas aplicáveis nos temas selecionados.",
        });
        setLoading(false);
        return;
      }

      const stamp = new Date().toISOString().split("T")[0];
      const orgSlug = (organizationName || "organizacao")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_");
      await exportToExcel(sheets, `Aplicaveis_${orgSlug}_${stamp}.xlsx`);

      toast({
        title: "Exportação concluída",
        description: `${sheets.length} folha(s) geradas.`,
      });
      setOpen(false);
    } catch (e: any) {
      toast({
        title: "Erro na exportação",
        description: e?.message || "Não foi possível gerar o ficheiro.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0">
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Exportar aplicáveis por tema
          </DialogTitle>
          <DialogDescription>
            Gera um Excel com os diplomas aplicáveis (e respetivos requisitos
            legais) de cada tema selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ScrollArea className="max-h-[220px] rounded-md border p-3">
            <div className="space-y-3">
              {themes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sem temas atribuídos.
                </p>
              )}
              {themes.map((t) => (
                <div key={t.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={`exp-${t.id}`}
                    checked={selectedThemes.includes(t.name)}
                    onCheckedChange={() => toggleTheme(t.name)}
                  />
                  <Label
                    htmlFor={`exp-${t.id}`}
                    className="text-sm font-normal cursor-pointer flex-1"
                  >
                    {t.name}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex items-center space-x-3">
            <Checkbox
              id="exp-reqs"
              checked={includeRequirements}
              onCheckedChange={(v) => setIncludeRequirements(!!v)}
            />
            <Label htmlFor="exp-reqs" className="text-sm font-normal cursor-pointer">
              Incluir requisitos legais aplicáveis
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={loading || selectedThemes.length === 0}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Exportar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
