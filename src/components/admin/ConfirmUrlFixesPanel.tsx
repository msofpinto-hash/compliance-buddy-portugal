import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Search, ShieldCheck, Eraser, RefreshCw, AlertTriangle,
  CheckCircle2, XCircle, ExternalLink, ListChecks
} from "lucide-react";

type ScanStatus = "valid" | "invalid" | "redirect" | "timeout" | "error";
type Action = "clear" | "update" | "keep";

interface ScanItem {
  id: string;
  number: string;
  title: string;
  document_url: string;
  status: ScanStatus;
  statusCode?: number;
  error?: string;
}

interface RowState {
  selected: boolean;
  action: Action;
  newUrl: string;
}

function suggestAction(s: ScanStatus): Action {
  if (s === "invalid") return "clear";
  if (s === "timeout" || s === "error") return "keep";
  return "keep";
}

function statusBadge(s: ScanStatus) {
  const map: Record<ScanStatus, { label: string; variant: any; icon: any }> = {
    valid: { label: "Válido", variant: "default", icon: CheckCircle2 },
    invalid: { label: "Inválido", variant: "destructive", icon: XCircle },
    redirect: { label: "Redirect", variant: "secondary", icon: ExternalLink },
    timeout: { label: "Timeout", variant: "outline", icon: AlertTriangle },
    error: { label: "Erro", variant: "destructive", icon: AlertTriangle },
  };
  const cfg = map[s];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

export function ConfirmUrlFixesPanel() {
  const [limit, setLimit] = useState(100);
  const [origin, setOrigin] = useState<"PT" | "EU" | "all">("PT");
  const [filter, setFilter] = useState<"problems" | "all">("problems");
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const handleScan = async () => {
    setScanning(true);
    setItems([]);
    setRows({});
    try {
      const { data, error } = await supabase.functions.invoke("validate-document-urls", {
        body: { limit, dryRun: true, origin: origin === "all" ? undefined : origin, background: false },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha no scan");
      const results: ScanItem[] = data.results || [];
      setItems(results);
      const initial: Record<string, RowState> = {};
      for (const r of results) {
        const sug = suggestAction(r.status);
        initial[r.id] = {
          selected: r.status === "invalid",
          action: sug,
          newUrl: r.document_url,
        };
      }
      setRows(initial);
      toast.success(`Scan concluído: ${results.length} URLs analisadas`);
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const visible = items.filter((i) =>
    filter === "all" ? true : i.status !== "valid"
  );

  const selectedItems = visible.filter((i) => rows[i.id]?.selected);
  const counts = {
    total: items.length,
    problems: items.filter((i) => i.status !== "valid").length,
    selected: selectedItems.length,
    clear: selectedItems.filter((i) => rows[i.id]?.action === "clear").length,
    update: selectedItems.filter((i) => rows[i.id]?.action === "update").length,
  };

  const updateRow = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const toggleAll = (checked: boolean) => {
    setRows((prev) => {
      const next = { ...prev };
      for (const i of visible) next[i.id] = { ...next[i.id], selected: checked };
      return next;
    });
  };

  const setAllAction = (action: Action) => {
    setRows((prev) => {
      const next = { ...prev };
      for (const i of visible) {
        if (next[i.id]?.selected) next[i.id] = { ...next[i.id], action };
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (selectedItems.length === 0) {
      toast.error("Nenhuma URL selecionada");
      return;
    }
    // Validate update rows
    for (const i of selectedItems) {
      const r = rows[i.id];
      if (r.action === "update" && !/^https?:\/\/.+/i.test(r.newUrl || "")) {
        toast.error(`URL inválida em ${i.number}`);
        return;
      }
    }
    const confirmMsg = `Vai aplicar:\n• ${counts.clear} a remover\n• ${counts.update} a atualizar\n\nContinuar?`;
    if (!confirm(confirmMsg)) return;

    setApplying(true);
    try {
      const payload = selectedItems.map((i) => ({
        legislation_id: i.id,
        action: rows[i.id].action,
        new_url: rows[i.id].action === "update" ? rows[i.id].newUrl : undefined,
      }));
      const { data, error } = await supabase.functions.invoke("apply-url-fixes", {
        body: { items: payload },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao aplicar");
      const s = data.summary;
      toast.success(`Aplicado: ${s.cleared} removidas · ${s.updated} atualizadas · ${s.failed} falhas`);
      // Remove processed from list
      const processedIds = new Set(payload.map((p) => p.legislation_id));
      setItems((prev) => prev.filter((i) => !processedIds.has(i.id)));
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  const allVisibleSelected = visible.length > 0 && visible.every((i) => rows[i.id]?.selected);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Corrigir URLs com confirmação
        </CardTitle>
        <CardDescription>
          1) Faz scan em modo simulação. 2) Seleciona linhas e ação (remover/atualizar/manter). 3) Confirma e aplica só o que escolheste.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Phase 1: Scan controls */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Quantidade</Label>
            <Input
              type="number"
              min={10}
              max={1000}
              step={10}
              value={limit}
              onChange={(e) => setLimit(Math.max(10, Math.min(1000, Number(e.target.value) || 100)))}
              disabled={scanning}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Origem</Label>
            <Select value={origin} onValueChange={(v: any) => setOrigin(v)} disabled={scanning}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PT">🇵🇹 Portugal (DRE)</SelectItem>
                <SelectItem value="EU">🇪🇺 União Europeia</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs opacity-0">Ação</Label>
            <Button onClick={handleScan} disabled={scanning} className="w-full">
              {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              {scanning ? "A analisar…" : "Fazer scan (simulação)"}
            </Button>
          </div>
        </div>

        {items.length > 0 && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="rounded-md border p-2 text-center">
                <div className="text-lg font-bold">{counts.total}</div>
                <div className="text-xs text-muted-foreground">Analisadas</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <div className="text-lg font-bold text-destructive">{counts.problems}</div>
                <div className="text-xs text-muted-foreground">Com problemas</div>
              </div>
              <div className="rounded-md border p-2 text-center bg-muted/40">
                <div className="text-lg font-bold">{counts.selected}</div>
                <div className="text-xs text-muted-foreground">Selecionadas</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <div className="text-lg font-bold">{counts.clear}</div>
                <div className="text-xs text-muted-foreground">A remover</div>
              </div>
              <div className="rounded-md border p-2 text-center">
                <div className="text-lg font-bold">{counts.update}</div>
                <div className="text-xs text-muted-foreground">A atualizar</div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-md border bg-muted/30">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(c) => toggleAll(!!c)}
                  id="select-all"
                />
                <Label htmlFor="select-all" className="text-xs cursor-pointer">
                  Selecionar tudo visível
                </Label>
              </div>
              <div className="h-4 w-px bg-border" />
              <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="problems">Só com problemas</SelectItem>
                  <SelectItem value="all">Mostrar todas</SelectItem>
                </SelectContent>
              </Select>
              <div className="h-4 w-px bg-border" />
              <span className="text-xs text-muted-foreground">Ação em massa:</span>
              <Button size="sm" variant="outline" onClick={() => setAllAction("clear")}>
                <Eraser className="h-3 w-3 mr-1" /> Remover
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAllAction("keep")}>
                Manter
              </Button>
              <div className="ml-auto">
                <Button
                  onClick={handleApply}
                  disabled={applying || counts.selected === 0}
                  size="sm"
                >
                  {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ListChecks className="h-4 w-4 mr-2" />}
                  Aplicar {counts.selected > 0 ? `(${counts.selected})` : ""}
                </Button>
              </div>
            </div>

            {counts.selected > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Vais alterar {counts.selected} registo(s). Esta ação é definitiva — confirma antes de aplicar.
                </AlertDescription>
              </Alert>
            )}

            {/* List */}
            <ScrollArea className="h-[420px] border rounded-md">
              <div className="divide-y">
                {visible.map((i) => {
                  const r = rows[i.id] || { selected: false, action: "keep" as Action, newUrl: i.document_url };
                  return (
                    <div key={i.id} className="p-3 flex items-start gap-3 hover:bg-muted/30">
                      <Checkbox
                        checked={r.selected}
                        onCheckedChange={(c) => updateRow(i.id, { selected: !!c })}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{i.number}</span>
                          {statusBadge(i.status)}
                          {i.statusCode && (
                            <span className="text-xs text-muted-foreground">HTTP {i.statusCode}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{i.title}</div>
                        <a
                          href={i.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline break-all flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {i.document_url}
                        </a>
                        {r.selected && (
                          <div className="flex items-center gap-2 pt-1">
                            <Select
                              value={r.action}
                              onValueChange={(v: any) => updateRow(i.id, { action: v })}
                            >
                              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="clear">Remover URL</SelectItem>
                                <SelectItem value="update">Atualizar URL</SelectItem>
                                <SelectItem value="keep">Manter</SelectItem>
                              </SelectContent>
                            </Select>
                            {r.action === "update" && (
                              <Input
                                value={r.newUrl}
                                onChange={(e) => updateRow(i.id, { newUrl: e.target.value })}
                                placeholder="https://…"
                                className="h-8 text-xs flex-1"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visible.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Nada para mostrar com os filtros atuais.
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {items.length === 0 && !scanning && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <RefreshCw className="h-3 w-3" />
            Faz um scan para começar. Nada é alterado nesta fase.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
