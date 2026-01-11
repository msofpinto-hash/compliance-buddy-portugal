import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  ExternalLink,
  Link as LinkIcon 
} from "lucide-react";

interface ValidationResult {
  id: string;
  number: string;
  title: string;
  document_url: string;
  status: "valid" | "invalid" | "redirect" | "timeout" | "error";
  statusCode?: number;
  error?: string;
}

interface ValidateUrlsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ValidateUrlsDialog({ open, onOpenChange }: ValidateUrlsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isValidating, setIsValidating] = useState(false);
  const [limit, setLimit] = useState(50);
  const [origin, setOrigin] = useState<string>("all");
  const [dryRun, setDryRun] = useState(true);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    valid: number;
    invalid: number;
    redirect: number;
    timeout: number;
    error: number;
  } | null>(null);

  const handleValidate = async () => {
    setIsValidating(true);
    setResults([]);
    setSummary(null);

    try {
      const { data, error } = await supabase.functions.invoke("validate-document-urls", {
        body: { 
          limit, 
          dryRun,
          origin: origin === "all" ? undefined : origin,
        },
      });

      if (error) throw error;

      if (data.success) {
        setResults(data.results || []);
        setSummary(data.summary || null);
        
        const invalidCount = data.summary?.invalid || 0;
        toast({
          title: "Validação concluída",
          description: `${data.summary?.total || 0} URLs verificadas. ${invalidCount} inválidas${!dryRun && invalidCount > 0 ? " (removidas)" : ""}.`,
        });

        if (!dryRun) {
          queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
        }
      } else {
        throw new Error(data.error || "Erro desconhecido");
      }
    } catch (error) {
      console.error("URL validation error:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao validar URLs",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const getStatusIcon = (status: ValidationResult["status"]) => {
    switch (status) {
      case "valid":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "invalid":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "redirect":
        return <ExternalLink className="h-4 w-4 text-blue-600" />;
      case "timeout":
        return <Clock className="h-4 w-4 text-amber-600" />;
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
    }
  };

  const getStatusBadge = (status: ValidationResult["status"]) => {
    const variants: Record<ValidationResult["status"], "default" | "destructive" | "secondary" | "outline"> = {
      valid: "default",
      invalid: "destructive",
      redirect: "secondary",
      timeout: "outline",
      error: "destructive",
    };
    
    const labels: Record<ValidationResult["status"], string> = {
      valid: "Válido",
      invalid: "Inválido",
      redirect: "Redirect",
      timeout: "Timeout",
      error: "Erro",
    };

    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Validar URLs de Documentos
          </DialogTitle>
          <DialogDescription>
            Verifica se os links dos documentos legislativos estão acessíveis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Limite</Label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                min={1}
                max={200}
              />
            </div>

            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="PT">🇵🇹 Portugal (DRE)</SelectItem>
                  <SelectItem value="EU">🇪🇺 União Europeia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Modo</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch
                  id="dryRun"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                />
                <Label htmlFor="dryRun" className="text-sm">
                  {dryRun ? "Apenas simular" : "Limpar inválidos"}
                </Label>
              </div>
            </div>
          </div>

          {!dryRun && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                URLs inválidas (404/410) serão removidas da base de dados.
              </AlertDescription>
            </Alert>
          )}

          {summary && (
            <div className="grid grid-cols-5 gap-2">
              <div className="p-3 rounded-lg bg-muted text-center">
                <div className="text-lg font-bold">{summary.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10 text-center">
                <div className="text-lg font-bold text-green-600">{summary.valid}</div>
                <div className="text-xs text-muted-foreground">Válidas</div>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 text-center">
                <div className="text-lg font-bold text-red-600">{summary.invalid}</div>
                <div className="text-xs text-muted-foreground">Inválidas</div>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10 text-center">
                <div className="text-lg font-bold text-blue-600">{summary.redirect}</div>
                <div className="text-xs text-muted-foreground">Redirects</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 text-center">
                <div className="text-lg font-bold text-amber-600">{summary.timeout + summary.error}</div>
                <div className="text-xs text-muted-foreground">Erros</div>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <ScrollArea className="h-[300px] border rounded-lg">
              <div className="p-2 space-y-1">
                {results.map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 text-sm"
                  >
                    {getStatusIcon(result.status)}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{result.number}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {result.title}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.statusCode && (
                        <span className="text-xs text-muted-foreground">
                          HTTP {result.statusCode}
                        </span>
                      )}
                      {result.error && !result.statusCode && (
                        <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                          {result.error}
                        </span>
                      )}
                      {getStatusBadge(result.status)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handleValidate} disabled={isValidating}>
            {isValidating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isValidating ? "A validar..." : dryRun ? "Simular Validação" : "Validar e Limpar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
