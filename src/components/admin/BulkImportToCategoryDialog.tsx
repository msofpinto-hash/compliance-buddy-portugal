import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useThemesWithCategories } from "@/hooks/useThemes";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Loader2, FolderTree, Info, Link2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LineResult = {
  input: string;
  status: "linked" | "created" | "already" | "notfound" | "error";
  detail: string;
};

const HTTPS_HOSTS = ["dre.pt", "diariodarepublica.pt", "eur-lex.europa.eu", "files.dre.pt"];

function normalizeUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    u.hostname = u.hostname.toLowerCase();
    if (u.protocol === "http:" && HTTPS_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) {
      u.protocol = "https:";
    }
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return trimmed;
  }
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

/** Normaliza referências para comparação: "Decreto-Lei n.º 12/2020" -> "decreto-lei 12/2020" */
function normalizeRef(value: string) {
  return value
    .toLowerCase()
    .replace(/n\.?[ºo°]?/g, " ")
    .replace(/[.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ParsedLine = { raw: string; number?: string; title?: string; url?: string };

function parseLine(raw: string): ParsedLine {
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    return isUrl(parts[0]) ? { raw, url: parts[0] } : { raw, number: parts[0] };
  }
  const url = parts.find((p) => isUrl(p));
  const rest = parts.filter((p) => !isUrl(p));
  return { raw, number: rest[0], title: rest[1], url };
}

export function BulkImportToCategoryDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { data: themes } = useThemesWithCategories();

  const [text, setText] = useState("");
  const [themeId, setThemeId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<LineResult[]>([]);

  const theme = useMemo(() => themes?.find((t) => t.id === themeId), [themes, themeId]);
  const roots = useMemo(() => theme?.categories.filter((c) => !c.parent_id) ?? [], [theme]);
  const subs = useMemo(
    () => theme?.categories.filter((c) => c.parent_id === categoryId) ?? [],
    [theme, categoryId],
  );
  const finalCategoryId = subcategoryId || categoryId;

  const lines = useMemo(
    () => text.split("\n").map((l) => l.trim()).filter(Boolean),
    [text],
  );

  const reset = () => {
    setText("");
    setResults([]);
    setProgress(0);
  };

  const handleRun = async () => {
    if (!finalCategoryId) {
      toast.error("Escolha o descritor de destino");
      return;
    }
    if (lines.length === 0) {
      toast.error("Cole a lista de diplomas");
      return;
    }

    setRunning(true);
    setResults([]);
    setProgress(0);

    const out: LineResult[] = [];

    // Carrega referências existentes uma única vez para correspondência local
    const { data: existing } = await supabase
      .from("legislation")
      .select("id, number, title, document_url");
    const byRef = new Map<string, { id: string; number: string; title: string }>();
    const byUrl = new Map<string, { id: string; number: string; title: string }>();
    (existing ?? []).forEach((l) => {
      byRef.set(normalizeRef(l.number), l as any);
      if (l.document_url) byUrl.set(normalizeUrl(l.document_url), l as any);
    });

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseLine(lines[i]);
      try {
        let match: { id: string; number: string; title: string } | undefined;
        if (parsed.url) match = byUrl.get(normalizeUrl(parsed.url));
        if (!match && parsed.number) match = byRef.get(normalizeRef(parsed.number));

        let legislationId = match?.id;
        let created = false;

        if (!legislationId) {
          if (!parsed.number || !parsed.title) {
            out.push({
              input: parsed.raw,
              status: "notfound",
              detail: "Não existe na base. Indique 'número | título' (e endereço oficial) para o criar.",
            });
            setResults([...out]);
            setProgress(Math.round(((i + 1) / lines.length) * 100));
            continue;
          }
          const origin = parsed.url?.includes("eur-lex") ? "EU" : "PT";
          const { data: inserted, error } = await supabase
            .from("legislation")
            .insert({
              number: parsed.number,
              title: parsed.title,
              document_url: parsed.url ? normalizeUrl(parsed.url) : null,
              origin,
              source: origin === "EU" ? "eurlex" : "dre",
            })
            .select("id")
            .single();
          if (error) throw error;
          legislationId = inserted.id;
          created = true;
          byRef.set(normalizeRef(parsed.number), { id: inserted.id, number: parsed.number, title: parsed.title });
        } else if (parsed.url && !byUrl.has(normalizeUrl(parsed.url))) {
          await supabase
            .from("legislation")
            .update({ document_url: normalizeUrl(parsed.url) })
            .eq("id", legislationId)
            .is("document_url", null);
        }

        const { data: link } = await supabase
          .from("legislation_category_mapping")
          .select("id")
          .eq("legislation_id", legislationId)
          .eq("category_id", finalCategoryId)
          .maybeSingle();

        if (link) {
          out.push({
            input: parsed.raw,
            status: "already",
            detail: `${match?.number ?? parsed.number} já estava neste descritor`,
          });
        } else {
          const { error: mapError } = await supabase
            .from("legislation_category_mapping")
            .insert({ legislation_id: legislationId, category_id: finalCategoryId });
          if (mapError) throw mapError;
          out.push({
            input: parsed.raw,
            status: created ? "created" : "linked",
            detail: created
              ? `Criado e colocado no descritor`
              : `${match?.number ?? ""} colocado no descritor`,
          });
        }
      } catch (e: any) {
        out.push({ input: parsed.raw, status: "error", detail: e?.message ?? "Erro" });
      }
      setResults([...out]);
      setProgress(Math.round(((i + 1) / lines.length) * 100));
    }

    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ["legislation"] });
    queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });

    const ok = out.filter((r) => r.status === "linked" || r.status === "created").length;
    const pend = out.filter((r) => r.status === "notfound" || r.status === "error").length;
    toast.success(`${ok} diploma(s) colocado(s) no descritor${pend ? `, ${pend} por resolver` : ""}`);
  };

  const badge = (s: LineResult["status"]) => {
    switch (s) {
      case "created":
        return <Badge className="bg-emerald-600">Criado</Badge>;
      case "linked":
        return <Badge className="bg-primary">Associado</Badge>;
      case "already":
        return <Badge variant="secondary">Já estava</Badge>;
      case "notfound":
        return <Badge variant="outline" className="border-amber-500 text-amber-700">Não encontrado</Badge>;
      default:
        return <Badge variant="destructive">Erro</Badge>;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!running) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            Importar lista de diplomas para um descritor
          </DialogTitle>
          <DialogDescription>
            Escolha o tema e o descritor de destino e cole a lista. Cada linha é um diploma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Tema</Label>
              <Select
                value={themeId ?? ""}
                onValueChange={(v) => {
                  setThemeId(v);
                  setCategoryId(null);
                  setSubcategoryId(null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Escolher tema" /></SelectTrigger>
                <SelectContent>
                  {themes?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Descritor</Label>
              <Select
                value={categoryId ?? ""}
                onValueChange={(v) => {
                  setCategoryId(v);
                  setSubcategoryId(null);
                }}
                disabled={!themeId}
              >
                <SelectTrigger><SelectValue placeholder="Escolher descritor" /></SelectTrigger>
                <SelectContent>
                  {roots.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Subdescritor (opcional)</Label>
              <Select
                value={subcategoryId ?? ""}
                onValueChange={setSubcategoryId}
                disabled={subs.length === 0}
              >
                <SelectTrigger><SelectValue placeholder={subs.length ? "Escolher" : "Sem subdescritores"} /></SelectTrigger>
                <SelectContent>
                  {subs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs space-y-1">
              <div>Formatos aceites, um por linha:</div>
              <div className="font-mono">Decreto-Lei n.º 152-D/2017</div>
              <div className="font-mono">https://diariodarepublica.pt/dr/detalhe/decreto-lei/152-d-2017-114337031</div>
              <div className="font-mono">Decreto-Lei n.º 102-D/2020 | Regime geral de gestão de resíduos | https://…</div>
              <div className="text-muted-foreground">
                Diplomas já existentes são apenas associados ao descritor. Linhas só com referência que não exista na
                base ficam sinalizadas — nada é inventado.
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-1">
            <Label>Lista de diplomas {lines.length > 0 && <span className="text-muted-foreground">({lines.length} linhas)</span>}</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={"Decreto-Lei n.º 152-D/2017\nhttps://diariodarepublica.pt/dr/detalhe/..."}
              className="font-mono text-xs"
              disabled={running}
            />
          </div>

          {running && <Progress value={progress} />}

          {results.length > 0 && (
            <div className="border rounded-md max-h-64 overflow-auto divide-y">
              {results.map((r, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 text-xs">
                  <div className="shrink-0">{badge(r.status)}</div>
                  <div className="min-w-0">
                    <div className="font-mono break-all">{r.input}</div>
                    <div className="text-muted-foreground">{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={reset} disabled={running}>Limpar</Button>
          <Button onClick={handleRun} disabled={running || !finalCategoryId || lines.length === 0}>
            {running ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A processar…</>
            ) : (
              <><Link2 className="h-4 w-4 mr-2" />Importar {lines.length || ""} para o descritor</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
