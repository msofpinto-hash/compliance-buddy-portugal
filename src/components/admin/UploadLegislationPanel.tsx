import { useState, useRef, useCallback } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ImportLegislationByUrlDialog } from "./ImportLegislationByUrlDialog";
import {
  Upload,
  Link as LinkIcon,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  FileUp,
  ListChecks,
} from "lucide-react";

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/tiff": [".tif", ".tiff"],
  "image/webp": [".webp"],
};
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const urlSchema = z
  .string()
  .trim()
  .min(10, "URL demasiado curto")
  .max(2000, "URL demasiado longo")
  .url("URL inválido")
  .refine(
    (u) =>
      /^https?:\/\//i.test(u) &&
      (u.includes("dre.pt") ||
        u.includes("diariodarepublica.pt") ||
        u.includes("eur-lex.europa.eu")),
    "Apenas URLs do DRE ou EUR-Lex são suportados"
  );

const fileMetaSchema = z.object({
  number: z.string().trim().min(2, "Número obrigatório").max(200),
  title: z.string().trim().min(3, "Título obrigatório").max(500),
  origin: z.enum(["PT", "EU"]),
});

type DupMatch = {
  type: "url" | "number" | "hash";
  legislation: { id: string; number: string; title: string; document_url: string | null };
};

async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function UploadLegislationPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----- Single URL dialog -----
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlDialogInitial, setUrlDialogInitial] = useState<string | undefined>(undefined);

  // ----- Bulk URL state -----
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkChecking, setBulkChecking] = useState(false);
  const [bulkResults, setBulkResults] = useState<
    Array<{ url: string; status: "ok" | "duplicate" | "invalid"; reason?: string; matches?: DupMatch[]; opened?: boolean }>
  >([]);

  const openImportFor = (u: string) => {
    setUrlDialogInitial(u);
    setUrlDialogOpen(true);
    setBulkResults((prev) => prev.map((r) => (r.url === u ? { ...r, opened: true } : r)));
  };


  // ----- File state -----
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string>("");
  const [meta, setMeta] = useState<{ number: string; title: string; origin: "PT" | "EU" }>({
    number: "",
    title: "",
    origin: "PT",
  });
  const [fileChecking, setFileChecking] = useState(false);
  const [fileMatches, setFileMatches] = useState<DupMatch[]>([]);
  const [fileForceUpload, setFileForceUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  const checkDuplicate = useCallback(
    async (payload: { document_url?: string; number?: string; file_hash?: string }) => {
      const { data, error } = await supabase.functions.invoke("validate-legislation-duplicate", {
        body: payload,
      });
      if (error) throw error;
      return data as { is_duplicate: boolean; matches: DupMatch[] };
    },
    []
  );

  // ===== BULK URL HANDLER =====
  const handleBulkCheck = async () => {
    const urls = bulkUrls
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast({ title: "Sem URLs", description: "Cola pelo menos um URL.", variant: "destructive" });
      return;
    }
    if (urls.length > 50) {
      toast({
        title: "Demasiados URLs",
        description: "Máximo 50 por vez.",
        variant: "destructive",
      });
      return;
    }

    setBulkChecking(true);
    setBulkResults([]);
    const results: typeof bulkResults = [];

    for (const url of urls) {
      const parsed = urlSchema.safeParse(url);
      if (!parsed.success) {
        results.push({ url, status: "invalid", reason: parsed.error.issues[0].message });
        continue;
      }
      try {
        const dup = await checkDuplicate({ document_url: url });
        if (dup.is_duplicate) {
          results.push({ url, status: "duplicate", matches: dup.matches });
        } else {
          results.push({ url, status: "ok" });
        }
      } catch (e) {
        results.push({
          url,
          status: "invalid",
          reason: e instanceof Error ? e.message : "Erro de validação",
        });
      }
    }

    setBulkResults(results);
    setBulkChecking(false);

    const okCount = results.filter((r) => r.status === "ok").length;
    const dupCount = results.filter((r) => r.status === "duplicate").length;
    toast({
      title: "Validação concluída",
      description: `${okCount} novo(s), ${dupCount} duplicado(s), ${results.length - okCount - dupCount} inválido(s).`,
    });
  };

  // ===== FILE HANDLERS =====
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.size > MAX_FILE_SIZE) {
      toast({
        title: "Ficheiro muito grande",
        description: `Máximo ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        variant: "destructive",
      });
      return;
    }
    const accepted = Object.keys(ACCEPTED_TYPES);
    if (!accepted.includes(f.type)) {
      toast({
        title: "Tipo não suportado",
        description: "PDF, Word ou imagem (JPG/PNG/TIFF/WebP).",
        variant: "destructive",
      });
      return;
    }

    setFile(f);
    setFileMatches([]);
    setFileForceUpload(false);
    setFileChecking(true);
    try {
      const hash = await sha256OfFile(f);
      setFileHash(hash);
      const dup = await checkDuplicate({ file_hash: hash });
      if (dup.is_duplicate) {
        setFileMatches(dup.matches);
      }
    } catch (err) {
      toast({
        title: "Erro a calcular hash",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setFileChecking(false);
    }
  };

  const handleMetaChange = async (field: "number" | "title" | "origin", value: string) => {
    setMeta((m) => ({ ...m, [field]: value as never }));
    if (field === "number" && value.trim().length >= 3) {
      try {
        const dup = await checkDuplicate({ number: value });
        if (dup.is_duplicate) {
          // merge with hash matches if any
          setFileMatches((prev) => {
            const merged = [...prev];
            dup.matches.forEach((m) => {
              if (!merged.find((x) => x.legislation.id === m.legislation.id)) merged.push(m);
            });
            return merged;
          });
        }
      } catch {
        /* silent */
      }
    }
  };

  const handleFileUpload = async () => {
    if (!file || !fileHash) {
      toast({ title: "Sem ficheiro", variant: "destructive" });
      return;
    }
    const parsed = fileMetaSchema.safeParse(meta);
    if (!parsed.success) {
      toast({
        title: "Dados inválidos",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }
    if (fileMatches.length > 0 && !fileForceUpload) {
      toast({
        title: "Duplicado detetado",
        description: "Confirma a continuação para forçar o upload.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // Upload to storage
      const ext = file.name.split(".").pop() || "bin";
      const path = `${parsed.data.origin.toLowerCase()}/${fileHash}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("legislation-uploads")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from("legislation-uploads")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      const { data: inserted, error: insErr } = await supabase
        .from("legislation")
        .insert({
          number: parsed.data.number,
          title: parsed.data.title,
          origin: parsed.data.origin,
          source: "manual_upload",
          file_hash: fileHash,
          uploaded_file_url: signed?.signedUrl ?? null,
          uploaded_file_name: file.name,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // Log to sync_logs
      await supabase.from("sync_logs").insert({
        sync_type: "manual_upload_file",
        status: "completed",
        items_processed: 1,
        items_added: 1,
        completed_at: new Date().toISOString(),
      });

      toast({
        title: "Diploma carregado",
        description: `"${parsed.data.number}" adicionado. ID: ${inserted.id.slice(0, 8)}…`,
      });

      // Reset
      setFile(null);
      setFileHash("");
      setMeta({ number: "", title: "", origin: "PT" });
      setFileMatches([]);
      setFileForceUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = "";

      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      queryClient.invalidateQueries({ queryKey: ["sync_logs"] });
      queryClient.invalidateQueries({ queryKey: ["upload-history"] });
    } catch (e) {
      toast({
        title: "Erro no upload",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading">
          <Upload className="h-5 w-5 text-primary" />
          Carregar Diplomas
        </CardTitle>
        <CardDescription>
          Adiciona novos diplomas por URL (DRE/EUR-Lex) ou através de upload de ficheiro.
          Os duplicados são detetados automaticamente por URL, número e hash do ficheiro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="url" className="space-y-4">
          <TabsList>
            <TabsTrigger value="url" className="gap-2">
              <LinkIcon className="h-4 w-4" /> Por URL
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2">
              <ListChecks className="h-4 w-4" /> URLs em massa
            </TabsTrigger>
            <TabsTrigger value="file" className="gap-2">
              <FileUp className="h-4 w-4" /> Upload de ficheiro
            </TabsTrigger>
          </TabsList>

          {/* ---------- TAB 1: Single URL ---------- */}
          <TabsContent value="url" className="space-y-3">
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Importa <strong>um</strong> diploma com pré-visualização e seleção de categoria.
                Os metadados são extraídos automaticamente.
              </AlertDescription>
            </Alert>
            <Button onClick={() => setUrlDialogOpen(true)} className="gap-2">
              <LinkIcon className="h-4 w-4" /> Importar diploma por URL
            </Button>
            <ImportLegislationByUrlDialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen} />
          </TabsContent>

          {/* ---------- TAB 2: Bulk URLs ---------- */}
          <TabsContent value="bulk" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="bulk-urls">URLs (um por linha, máx. 50)</Label>
              <Textarea
                id="bulk-urls"
                placeholder={"https://diariodarepublica.pt/dr/detalhe/...\nhttps://eur-lex.europa.eu/legal-content/..."}
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                rows={6}
                disabled={bulkChecking}
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button onClick={handleBulkCheck} disabled={bulkChecking || !bulkUrls.trim()}>
                  {bulkChecking ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> A validar…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Validar duplicados
                    </>
                  )}
                </Button>
                {bulkResults.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBulkResults([]);
                      setBulkUrls("");
                    }}
                  >
                    <X className="h-4 w-4 mr-2" /> Limpar
                  </Button>
                )}
              </div>
            </div>

            {bulkResults.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <div className="text-sm text-muted-foreground">
                  Resultado: usa o "Por URL" individual para importar cada novo. Os duplicados são bloqueados.
                </div>
                <ScrollArea className="h-64 rounded-md border">
                  <div className="p-2 space-y-1">
                    {bulkResults.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded bg-muted/40 text-xs"
                      >
                        {r.status === "ok" && (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        )}
                        {r.status === "duplicate" && (
                          <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                        {r.status === "invalid" && (
                          <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-mono">{r.url}</div>
                          {r.status === "duplicate" && r.matches && (
                            <div className="text-muted-foreground mt-0.5">
                              Já existe: {r.matches[0].legislation.number} —{" "}
                              {r.matches[0].legislation.title.slice(0, 60)}
                            </div>
                          )}
                          {r.status === "invalid" && (
                            <div className="text-destructive mt-0.5">{r.reason}</div>
                          )}
                        </div>
                        <Badge
                          variant={
                            r.status === "ok"
                              ? "default"
                              : r.status === "duplicate"
                              ? "secondary"
                              : "destructive"
                          }
                          className="shrink-0"
                        >
                          {r.status === "ok" ? "Novo" : r.status === "duplicate" ? "Duplicado" : "Inválido"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          {/* ---------- TAB 3: File upload ---------- */}
          <TabsContent value="file" className="space-y-3">
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Suporta PDF, Word (.doc/.docx) e imagens (JPG, PNG, TIFF, WebP). Máximo 25MB.
                O hash SHA-256 do ficheiro é verificado para evitar duplicados.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="file-input">Ficheiro</Label>
              <Input
                id="file-input"
                ref={fileInputRef}
                type="file"
                accept={Object.values(ACCEPTED_TYPES).flat().join(",")}
                onChange={handleFileChange}
                disabled={uploading || fileChecking}
              />
              {file && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  {fileChecking && <Loader2 className="h-3 w-3 animate-spin" />}
                  {fileHash && !fileChecking && (
                    <span className="font-mono">hash: {fileHash.slice(0, 12)}…</span>
                  )}
                </div>
              )}
            </div>

            {file && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="file-number">Número do diploma *</Label>
                    <Input
                      id="file-number"
                      value={meta.number}
                      onChange={(e) => handleMetaChange("number", e.target.value)}
                      placeholder="Ex: Decreto-Lei n.º 123/2024"
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="file-origin">Origem</Label>
                    <select
                      id="file-origin"
                      value={meta.origin}
                      onChange={(e) => handleMetaChange("origin", e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="PT">🇵🇹 Portugal (DRE)</option>
                      <option value="EU">🇪🇺 União Europeia</option>
                    </select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="file-title">Título *</Label>
                    <Input
                      id="file-title"
                      value={meta.title}
                      onChange={(e) => handleMetaChange("title", e.target.value)}
                      placeholder="Título do diploma"
                      maxLength={500}
                    />
                  </div>
                </div>

                {fileMatches.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Duplicado detetado</AlertTitle>
                    <AlertDescription>
                      <ul className="mt-1 space-y-1 text-xs">
                        {fileMatches.map((m, i) => (
                          <li key={i}>
                            <Badge variant="outline" className="mr-1 text-[10px]">
                              {m.type === "url" ? "URL" : m.type === "number" ? "Número" : "Hash"}
                            </Badge>
                            {m.legislation.number} — {m.legislation.title.slice(0, 80)}
                          </li>
                        ))}
                      </ul>
                      <label className="flex items-center gap-2 mt-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fileForceUpload}
                          onChange={(e) => setFileForceUpload(e.target.checked)}
                        />
                        <span className="text-xs">
                          Quero criar mesmo assim (será criado um novo registo separado)
                        </span>
                      </label>
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleFileUpload}
                  disabled={
                    uploading ||
                    fileChecking ||
                    !meta.number ||
                    !meta.title ||
                    (fileMatches.length > 0 && !fileForceUpload)
                  }
                  className="gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" /> Carregar diploma
                    </>
                  )}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
