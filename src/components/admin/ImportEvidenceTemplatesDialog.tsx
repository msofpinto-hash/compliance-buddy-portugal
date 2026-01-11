import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Building2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readExcelAsArray } from "@/lib/excelUtils";

interface ParsedTemplate {
  group_name: string;
  title: string;
  description?: string;
  area_ambiente: boolean;
  area_qualidade: boolean;
  area_seguranca: boolean;
  area_seguranca_alimentar: boolean;
  area_energia: boolean;
  area_florestas: boolean;
  area_saude: boolean;
  area_conciliacao: boolean;
  area_sustentabilidade: boolean;
  legislation_references: string;
  legislation_numbers: string[];
}

// Parse legislation references to extract diploma numbers
function extractLegislationNumbers(references: string): string[] {
  if (!references) return [];
  
  const numbers: string[] = [];
  
  // Split by <br/> or newlines
  const parts = references.split(/<br\s*\/?>/gi).flatMap(p => p.split('\n'));
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // Extract the diploma number (e.g., "Decreto-Lei n.º 118/2024, de 31 de dezembro")
    const match = trimmed.match(/^([^,]+)/);
    if (match) {
      numbers.push(match[1].trim());
    }
  }
  
  return numbers;
}

export function ImportEvidenceTemplatesDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [open, setOpen] = useState(false);
  const [parsedTemplates, setParsedTemplates] = useState<ParsedTemplate[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [importResult, setImportResult] = useState<{
    templatesCreated: number;
    linksCreated: number;
    requestsCreated: number;
    errors?: string[];
  } | null>(null);

  // Fetch organizations
  const { data: organizations } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const jsonData = await readExcelAsArray(file);

      // Find header row
      const headerRow = jsonData[0] as string[];
      const groupIdx = headerRow.findIndex(h => h?.toLowerCase().includes('grupo'));
      const pedidoIdx = headerRow.findIndex(h => h?.toLowerCase().includes('pedido'));
      const ambienteIdx = headerRow.findIndex(h => h?.toLowerCase() === 'ambiente');
      const qualidadeIdx = headerRow.findIndex(h => h?.toLowerCase() === 'qualidade');
      const segurancaIdx = headerRow.findIndex(h => h?.toLowerCase() === 'segurança');
      const segAlimentarIdx = headerRow.findIndex(h => h?.toLowerCase().includes('segurança alimentar'));
      const energiaIdx = headerRow.findIndex(h => h?.toLowerCase() === 'energia');
      const florestasIdx = headerRow.findIndex(h => h?.toLowerCase() === 'florestas');
      const saudeIdx = headerRow.findIndex(h => h?.toLowerCase() === 'saúde');
      const conciliacaoIdx = headerRow.findIndex(h => h?.toLowerCase().includes('conciliação'));
      const sustentabilidadeIdx = headerRow.findIndex(h => h?.toLowerCase() === 'sustentabilidade');
      const diplomasIdx = headerRow.findIndex(h => h?.toLowerCase() === 'diplomas');

      const templates: ParsedTemplate[] = [];

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || !row[groupIdx] || !row[pedidoIdx]) continue;

        const legislationRefs = String(row[diplomasIdx] || '');
        
        templates.push({
          group_name: String(row[groupIdx]).trim(),
          title: String(row[pedidoIdx]).trim(),
          area_ambiente: row[ambienteIdx] === 'x' || row[ambienteIdx] === true,
          area_qualidade: row[qualidadeIdx] === 'x' || row[qualidadeIdx] === true,
          area_seguranca: row[segurancaIdx] === 'x' || row[segurancaIdx] === true,
          area_seguranca_alimentar: row[segAlimentarIdx] === 'x' || row[segAlimentarIdx] === true,
          area_energia: row[energiaIdx] === 'x' || row[energiaIdx] === true,
          area_florestas: row[florestasIdx] === 'x' || row[florestasIdx] === true,
          area_saude: row[saudeIdx] === 'x' || row[saudeIdx] === true,
          area_conciliacao: row[conciliacaoIdx] === 'x' || row[conciliacaoIdx] === true,
          area_sustentabilidade: row[sustentabilidadeIdx] === 'x' || row[sustentabilidadeIdx] === true,
          legislation_references: legislationRefs,
          legislation_numbers: extractLegislationNumbers(legislationRefs),
        });
      }

      setParsedTemplates(templates);
      toast({ 
        title: "Ficheiro analisado", 
        description: `${templates.length} templates de evidência encontrados.` 
      });
    } catch (error) {
      console.error("Error parsing Excel:", error);
      toast({ 
        title: "Erro ao processar ficheiro", 
        description: "Verifique se o ficheiro é um Excel válido.", 
        variant: "destructive" 
      });
    }
  };

  const handleImport = async () => {
    if (parsedTemplates.length === 0) return;

    setImporting(true);
    setImportProgress(0);
    setImportResult(null);

    try {
      // Import in batches
      const batchSize = 50;
      let totalCreated = 0;
      let totalLinks = 0;
      let totalRequests = 0;
      const allErrors: string[] = [];
      const createdTemplateIds: string[] = [];

      for (let i = 0; i < parsedTemplates.length; i += batchSize) {
        const batch = parsedTemplates.slice(i, i + batchSize);
        
        const { data, error } = await supabase.functions.invoke("import-evidence-templates", {
          body: { templates: batch, organizationId: selectedOrgId || undefined }
        });

        if (error) {
          allErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else if (data) {
          totalCreated += data.templatesCreated || 0;
          totalLinks += data.linksCreated || 0;
          totalRequests += data.requestsCreated || 0;
          if (data.templateIds) createdTemplateIds.push(...data.templateIds);
          if (data.errors) allErrors.push(...data.errors);
        }

        setImportProgress(Math.min(100, Math.round(((i + batch.length) / parsedTemplates.length) * 100)));
      }

      setImportResult({
        templatesCreated: totalCreated,
        linksCreated: totalLinks,
        requestsCreated: totalRequests,
        errors: allErrors.length > 0 ? allErrors : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["evidence-templates"] });
      queryClient.invalidateQueries({ queryKey: ["evidence-request-counts"] });
      
      toast({ 
        title: "Importação concluída", 
        description: selectedOrgId 
          ? `${totalCreated} templates criados, ${totalRequests} pedidos atribuídos.`
          : `${totalCreated} templates criados, ${totalLinks} ligações a diplomas.`
      });
    } catch (error) {
      console.error("Import error:", error);
      toast({ 
        title: "Erro na importação", 
        description: "Ocorreu um erro durante a importação.", 
        variant: "destructive" 
      });
    } finally {
      setImporting(false);
    }
  };

  const resetDialog = () => {
    setParsedTemplates([]);
    setImportProgress(0);
    setImportResult(null);
    setSelectedOrgId("");
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Group templates by group_name for preview
  const groupedTemplates = parsedTemplates.reduce((acc, t) => {
    if (!acc[t.group_name]) acc[t.group_name] = [];
    acc[t.group_name].push(t);
    return acc;
  }, {} as Record<string, ParsedTemplate[]>);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetDialog(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Templates de Evidência</DialogTitle>
          <DialogDescription>
            Carregue um ficheiro Excel com os pedidos de evidência documental.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
          {/* File Upload */}
          {parsedTemplates.length === 0 && !importResult && (
            <div>
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Clique para selecionar</span> ou arraste o ficheiro
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ficheiro Excel (.xlsx, .xls)
                  </p>
                </div>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          )}

          {/* Preview parsed data */}
          {parsedTemplates.length > 0 && !importResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{parsedTemplates.length} templates encontrados</h4>
                  <p className="text-sm text-muted-foreground">
                    {Object.keys(groupedTemplates).length} grupos
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={resetDialog}>
                  Alterar ficheiro
                </Button>
              </div>

              {/* Organization selector */}
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Atribuir a organização (opcional)
                </Label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Apenas criar catálogo (sem atribuição)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Apenas criar catálogo</SelectItem>
                    {organizations?.map(org => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedOrgId && selectedOrgId !== "none"
                    ? "Os templates serão criados e atribuídos como pedidos de evidência a esta organização."
                    : "Os templates serão adicionados ao catálogo global, podendo ser atribuídos depois."}
                </p>
              </div>

              <ScrollArea className="h-[300px] border rounded-lg p-4">
                <div className="space-y-3">
                  {Object.entries(groupedTemplates).map(([groupName, templates]) => (
                    <div key={groupName} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h5 className="font-medium text-sm">{groupName}</h5>
                        <Badge variant="secondary">{templates.length}</Badge>
                      </div>
                      <div className="pl-4 space-y-1">
                        {templates.slice(0, 3).map((t, i) => (
                          <p key={i} className="text-xs text-muted-foreground truncate">
                            • {t.title}
                          </p>
                        ))}
                        {templates.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            ... e mais {templates.length - 3}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {importing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>A importar...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} />
                </div>
              )}
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div>
                  <h4 className="font-medium text-green-900">Importação concluída</h4>
                  <p className="text-sm text-green-700">
                    {importResult.templatesCreated} templates criados
                    {importResult.linksCreated > 0 && `, ${importResult.linksCreated} ligações a diplomas`}
                    {importResult.requestsCreated > 0 && `, ${importResult.requestsCreated} pedidos atribuídos`}
                  </p>
                </div>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <h5 className="font-medium text-yellow-900">Avisos ({importResult.errors.length})</h5>
                  </div>
                  <ScrollArea className="h-[100px]">
                    <ul className="text-sm text-yellow-700 space-y-1">
                      {importResult.errors.slice(0, 10).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {importResult.errors.length > 10 && (
                        <li>... e mais {importResult.errors.length - 10} avisos</li>
                      )}
                    </ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {importResult ? "Fechar" : "Cancelar"}
          </Button>
          {parsedTemplates.length > 0 && !importResult && (
            <Button onClick={handleImport} disabled={importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar {parsedTemplates.length} Templates
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
