import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Tags, FolderTree, CheckCheck, X } from "lucide-react";
import { useLegislationWithCategories, type LegislationWithCategories } from "@/hooks/useLegislation";
import { BulkAssignCategoriesDialog } from "./BulkAssignCategoriesDialog";
import { cn } from "@/lib/utils";

const STOPWORDS = new Set([
  "a","à","às","ao","aos","as","o","os","um","uma","uns","umas","de","do","da","dos","das","e","em","no","na","nos","nas",
  "por","para","com","sem","que","se","ou","como","sobre","entre","pelo","pela","pelos","pelas","seu","sua","seus","suas",
  "este","esta","estes","estas","esse","essa","isso","aquele","aquela","ser","são","foi","será","ter","tem","têm","há",
  "mais","menos","também","não","já","até","após","ainda","seja","sejam","bem","cada","qual","quais","nº","n.º","art",
  "artigo","artigos","decreto","lei","decreto-lei","portaria","despacho","regulamento","diretiva","aviso","deliberação",
  "declaração","retificação","resolução","conselho","ministros","república","diário","altera","alterado","alteração",
  "aprova","aprovado","estabelece","define","procede","primeira","segunda","terceira","quarta","quinta","republicação",
  "presente","diploma","texto","termos","efeitos","âmbito","nomeadamente","respetivamente","janeiro","fevereiro","março",
  "abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro","ue","ce","comissão","parlamento",
  "europeu","europeia","união","número","dos_termos","referente","relativo","relativa","relativos","relativas","matéria",
]);

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zà-ÿ\s-]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

interface KeywordGroup {
  keyword: string;
  ids: Set<string>;
}

export function KeywordGroupsPanel() {
  const { data: legislation, isLoading } = useLegislationWithCategories();

  const [keywordSearch, setKeywordSearch] = useState("");
  const [customKeyword, setCustomKeyword] = useState("");
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [onlyWithoutCategory, setOnlyWithoutCategory] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);

  const pool = useMemo<LegislationWithCategories[]>(() => {
    const list = legislation || [];
    return onlyWithoutCategory ? list.filter((l) => (l.categories?.length || 0) === 0) : list;
  }, [legislation, onlyWithoutCategory]);

  // Build keyword groups (unigrams + bigrams) from summary + title
  const groups = useMemo<KeywordGroup[]>(() => {
    const unigram = new Map<string, Set<string>>();
    const bigram = new Map<string, Set<string>>();

    pool.forEach((leg) => {
      const text = `${leg.summary || ""} ${leg.title || ""}`;
      const words = tokenize(text);
      const seenU = new Set<string>();
      const seenB = new Set<string>();
      words.forEach((w, i) => {
        if (!seenU.has(w)) {
          seenU.add(w);
          if (!unigram.has(w)) unigram.set(w, new Set());
          unigram.get(w)!.add(leg.id);
        }
        if (i < words.length - 1) {
          const b = `${w} ${words[i + 1]}`;
          if (!seenB.has(b)) {
            seenB.add(b);
            if (!bigram.has(b)) bigram.set(b, new Set());
            bigram.get(b)!.add(leg.id);
          }
        }
      });
    });

    const result: KeywordGroup[] = [];
    bigram.forEach((ids, keyword) => {
      if (ids.size >= 3) result.push({ keyword, ids });
    });
    unigram.forEach((ids, keyword) => {
      if (ids.size >= 3) result.push({ keyword, ids });
    });

    result.sort((a, b) => b.ids.size - a.ids.size || a.keyword.localeCompare(b.keyword, "pt"));
    return result.slice(0, 400);
  }, [pool]);

  const filteredGroups = useMemo(() => {
    const q = normalize(keywordSearch.trim());
    if (!q) return groups;
    return groups.filter((g) => normalize(g.keyword).includes(q));
  }, [groups, keywordSearch]);

  // Diplomas of the active keyword (custom keyword falls back to free-text match)
  const groupItems = useMemo<LegislationWithCategories[]>(() => {
    if (!activeKeyword) return [];
    const group = groups.find((g) => g.keyword === activeKeyword);
    if (group) return pool.filter((l) => group.ids.has(l.id));
    const q = normalize(activeKeyword);
    return pool.filter((l) => normalize(`${l.summary || ""} ${l.title || ""}`).includes(q));
  }, [activeKeyword, groups, pool]);

  const selectedList = useMemo(
    () => (legislation || []).filter((l) => selectedIds.has(l.id)),
    [legislation, selectedIds]
  );

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllInGroup = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      groupItems.forEach((l) => next.add(l.id));
      return next;
    });
  };

  const pickKeyword = (keyword: string) => {
    setActiveKeyword(keyword);
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tags className="h-5 w-5 text-primary" />
            Agrupar por palavras-chave do sumário
          </CardTitle>
          <CardDescription>
            Escolhe uma palavra-chave, seleciona os diplomas e atribui-lhes descritores e subdescritores de uma só vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keywordSearch}
              onChange={(e) => setKeywordSearch(e.target.value)}
              placeholder="Procurar palavra-chave (ex.: resíduos, captações, ruído)"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={customKeyword}
              onChange={(e) => setCustomKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customKeyword.trim()) pickKeyword(customKeyword.trim());
              }}
              placeholder="Expressão livre no sumário"
              className="w-full sm:w-56"
            />
            <Button
              variant="secondary"
              disabled={!customKeyword.trim()}
              onClick={() => pickKeyword(customKeyword.trim())}
            >
              Filtrar
            </Button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Checkbox
              id="kw-no-cat"
              checked={onlyWithoutCategory}
              onCheckedChange={(v) => {
                setOnlyWithoutCategory(!!v);
                setSelectedIds(new Set());
              }}
            />
            <Label htmlFor="kw-no-cat" className="text-sm cursor-pointer">
              Só sem descritor
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Keyword list */}
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardDescription>{filteredGroups.length} palavras-chave</CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="h-[520px] pr-2">
              <div className="space-y-1">
                {filteredGroups.map((g) => (
                  <button
                    key={g.keyword}
                    onClick={() => pickKeyword(g.keyword)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                      activeKeyword === g.keyword && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <span className="truncate">{g.keyword}</span>
                    <Badge variant="secondary" className="shrink-0">{g.ids.size}</Badge>
                  </button>
                ))}
                {filteredGroups.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">Sem palavras-chave para esta pesquisa.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Diplomas of selected keyword */}
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base truncate">
                  {activeKeyword ? `"${activeKeyword}"` : "Escolhe uma palavra-chave"}
                </CardTitle>
                <CardDescription>
                  {groupItems.length} diplomas · {selectedIds.size} selecionados
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAllInGroup} disabled={!groupItems.length}>
                  <CheckCheck className="mr-1.5 h-4 w-4" />
                  Selecionar todos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={!selectedIds.size}
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Limpar
                </Button>
                <Button size="sm" disabled={!selectedIds.size} onClick={() => setAssignOpen(true)}>
                  <FolderTree className="mr-1.5 h-4 w-4" />
                  Atribuir descritores ({selectedIds.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="h-[520px] pr-2">
              <div className="space-y-2">
                {groupItems.map((leg) => (
                  <div
                    key={leg.id}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-3",
                      selectedIds.has(leg.id) && "border-primary bg-primary/5"
                    )}
                  >
                    <Checkbox
                      className="mt-1"
                      checked={selectedIds.has(leg.id)}
                      onCheckedChange={() => toggleId(leg.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{leg.number}</span>
                        {leg.origin && (
                          <Badge variant="outline" className="text-[10px]">{leg.origin === "EU" ? "UE" : "PT"}</Badge>
                        )}
                        {(leg.categories?.length || 0) === 0 ? (
                          <Badge variant="destructive" className="text-[10px]">Sem descritor</Badge>
                        ) : (
                          leg.categories.map((c: any) => (
                            <Badge key={c.id} variant="secondary" className="text-[10px]">
                              {c.theme_name ? `${c.theme_name} → ${c.name}` : c.name}
                            </Badge>
                          ))
                        )}
                      </div>
                      <p className="mt-1 text-sm text-foreground/90 break-words">{leg.title}</p>
                      {leg.summary && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-3 break-words">{leg.summary}</p>
                      )}
                    </div>
                  </div>
                ))}
                {!groupItems.length && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Seleciona uma palavra-chave à esquerda para ver os diplomas correspondentes.
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <BulkAssignCategoriesDialog
        legislationList={selectedList}
        open={assignOpen}
        onOpenChange={(o) => {
          setAssignOpen(o);
          if (!o) setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
