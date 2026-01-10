import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileEdit, ExternalLink, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { LegislationWithCategories } from "@/hooks/useLegislation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface EditLegislationDialogProps {
  legislation: LegislationWithCategories | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditLegislationDialog({
  legislation,
  open,
  onOpenChange,
}: EditLegislationDialogProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Form fields
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [entity, setEntity] = useState("");
  const [origin, setOrigin] = useState<string>("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [revocationDate, setRevocationDate] = useState("");

  useEffect(() => {
    if (legislation) {
      setNumber(legislation.number || "");
      setTitle(legislation.title || "");
      setSummary(legislation.summary || "");
      setEntity(legislation.entity || "");
      setOrigin(legislation.origin || "");
      setDocumentUrl(legislation.document_url || "");
      setPublicationDate(legislation.publication_date || "");
      setEffectiveDate(legislation.effective_date || "");
      setRevocationDate((legislation as any).revocation_date || "");
    }
  }, [legislation]);

  const handleSave = async () => {
    if (!legislation) return;

    if (!number.trim() || !title.trim()) {
      toast.error("O número e o título são obrigatórios");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("legislation")
        .update({
          number: number.trim(),
          title: title.trim(),
          summary: summary.trim() || null,
          entity: entity.trim() || null,
          origin: origin || null,
          document_url: documentUrl.trim() || null,
          publication_date: publicationDate || null,
          effective_date: effectiveDate || null,
          revocation_date: revocationDate || null,
        })
        .eq("id", legislation.id);

      if (error) throw error;

      toast.success("Legislação atualizada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao atualizar legislação: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!legislation) return;

    setIsDeleting(true);
    try {
      // First delete related records
      await supabase.from("legislation_category_mapping").delete().eq("legislation_id", legislation.id);
      await supabase.from("legislation_relations").delete().or(`source_legislation_id.eq.${legislation.id},target_legislation_id.eq.${legislation.id}`);
      await supabase.from("legal_requirements").delete().eq("legislation_id", legislation.id);
      await supabase.from("organization_legislation").delete().eq("legislation_id", legislation.id);
      
      // Then delete the legislation
      const { error } = await supabase
        .from("legislation")
        .delete()
        .eq("id", legislation.id);

      if (error) throw error;

      toast.success("Legislação eliminada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro ao eliminar legislação: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Generate EUR-Lex URL from CELEX number
  const generateEurlexUrl = () => {
    if (number && origin === "EU") {
      const celexNumber = number.replace(/\s/g, "");
      return `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celexNumber}`;
    }
    return "";
  };

  const autoFillEurlexUrl = () => {
    const url = generateEurlexUrl();
    if (url) {
      setDocumentUrl(url);
      toast.success("URL EUR-Lex gerado automaticamente");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5" />
            Editar Legislação
          </DialogTitle>
          <DialogDescription>
            Corrija os dados da legislação. Todos os campos podem ser editados.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Dados Básicos</TabsTrigger>
            <TabsTrigger value="dates">Datas</TabsTrigger>
            <TabsTrigger value="details">Detalhes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="number">Número *</Label>
                <Input
                  id="number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="Ex: Decreto-Lei n.º 123/2024"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="origin">Origem</Label>
                <Select value={origin} onValueChange={setOrigin}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PT">Portugal (DRE)</SelectItem>
                    <SelectItem value="EU">União Europeia (EUR-Lex)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título completo do diploma"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="summary">Resumo</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Resumo ou descrição do diploma"
                rows={3}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="entity">Entidade Emissora</Label>
              <Input
                id="entity"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                placeholder="Ex: Ministério do Ambiente"
              />
            </div>
          </TabsContent>
          
          <TabsContent value="dates" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="publicationDate">Data de Publicação</Label>
              <Input
                id="publicationDate"
                type="date"
                value={publicationDate}
                onChange={(e) => setPublicationDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Data em que o diploma foi publicado oficialmente
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="effectiveDate">Data de Entrada em Vigor</Label>
              <Input
                id="effectiveDate"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Data em que o diploma entrou/entra em vigor
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="revocationDate">Data de Revogação</Label>
              <Input
                id="revocationDate"
                type="date"
                value={revocationDate}
                onChange={(e) => setRevocationDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Data em que o diploma foi revogado (se aplicável)
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="details" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="documentUrl">URL do Documento</Label>
              <div className="flex gap-2">
                <Input
                  id="documentUrl"
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                {documentUrl && (
                  <Button 
                    variant="outline" 
                    size="icon"
                    asChild
                  >
                    <a href={documentUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
              {origin === "EU" && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="p-0 h-auto text-xs"
                  onClick={autoFillEurlexUrl}
                >
                  Gerar URL EUR-Lex automaticamente
                </Button>
              )}
            </div>
            
            <div className="rounded-lg border p-4 bg-muted/50">
              <h4 className="font-medium mb-2">Informações do Sistema</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>ID:</strong> {legislation?.id}</p>
                <p><strong>Source:</strong> {legislation?.source || "N/A"}</p>
                <p><strong>External ID:</strong> {legislation?.external_id || "N/A"}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar Legislação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação irá eliminar permanentemente a legislação "{legislation?.number}" e todos os seus dados associados (categorias, requisitos, relações, atribuições a organizações).
                  Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Eliminar Permanentemente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Alterações
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
