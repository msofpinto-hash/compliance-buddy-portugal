import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CalendarX, FileQuestion, Loader2, Save, ExternalLink, Plus } from "lucide-react";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { IDTopNav } from "@/components/client/IDTopNav";

type DiplomaSemData = {
  id: string;
  number: string;
  title: string;
  origin: string | null;
  entity: string | null;
  document_url: string | null;
  publication_date: string | null;
  effective_date: string | null;
};

type DiplomaSemReq = {
  id: string;
  number: string;
  title: string;
  origin: string | null;
  document_url: string | null;
};

export default function CorrigirDiplomas() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { publication_date: string; effective_date: string }>>({});
  const [reqDrafts, setReqDrafts] = useState<Record<string, { article: string; text: string }>>({});

  const { data: semData = [], isLoading: loadingDatas } = useQuery({
    queryKey: ["corrigir-sem-data"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legislation")
        .select("id, number, title, origin, entity, document_url, publication_date, effective_date")
        .is("publication_date", null)
        .order("number");
      if (error) throw error;
      return (data ?? []) as DiplomaSemData[];
    },
  });

  const { data: semReq = [], isLoading: loadingReq } = useQuery({
    queryKey: ["corrigir-sem-requisitos"],
    queryFn: async () => {
      const all: DiplomaSemReq[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("legislation")
          .select("id, number, title, origin, document_url")
          .order("number")
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as DiplomaSemReq[]));
        if (data.length < 1000) break;
        from += 1000;
      }
      const withReq = new Set<string>();
      from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("legal_requirements")
          .select("legislation_id")
          .range(from, from + 999);
        if (error) throw error;
        if (!data || data.length === 0) break;
        data.forEach((r) => withReq.add(r.legislation_id));
        if (data.length < 1000) break;
        from += 1000;
      }
      return all.filter((l) => !withReq.has(l.id));
    },
  });

  const saveDates = useMutation({
    mutationFn: async (item: DiplomaSemData) => {
      const d = drafts[item.id];
      if (!d?.publication_date) throw new Error("Indique a data de publicação.");
      const { error } = await supabase
        .from("legislation")
        .update({
          publication_date: d.publication_date,
          effective_date: d.effective_date || null,
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datas guardadas.");
      queryClient.invalidateQueries({ queryKey: ["corrigir-sem-data"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRequirement = useMutation({
    mutationFn: async (item: DiplomaSemReq) => {
      const d = reqDrafts[item.id];
      if (!d?.text?.trim()) throw new Error("Escreva o texto do requisito.");
      const { error } = await supabase.from("legal_requirements").insert({
        legislation_id: item.id,
        article: d.article?.trim() || null,
        requirement_text: d.text.trim(),
      });
      if (error) throw error;
    },
    onSuccess: (_v, item) => {
      toast.success("Requisito adicionado.");
      setReqDrafts((s) => ({ ...s, [item.id]: { article: "", text: "" } }));
      queryClient.invalidateQueries({ queryKey: ["corrigir-sem-requisitos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <RouteSeo />
      <IDTopNav />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading">Corrigir Diplomas</h1>
          <p className="text-muted-foreground text-sm">
            Corrija manualmente os diplomas que ficaram sem data de publicação ou sem requisitos legais.
          </p>
        </div>

        <Tabs defaultValue="datas">
          <TabsList>
            <TabsTrigger value="datas" className="gap-2">
              <CalendarX className="h-4 w-4" /> Sem data ({semData.length})
            </TabsTrigger>
            <TabsTrigger value="requisitos" className="gap-2">
              <FileQuestion className="h-4 w-4" /> Sem requisitos ({semReq.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="datas" className="space-y-3 mt-4">
            {loadingDatas && (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
            )}
            {!loadingDatas && semData.length === 0 && (
              <Card><CardContent className="py-6 text-sm text-muted-foreground">Não há diplomas sem data. 🎉</CardContent></Card>
            )}
            {semData.map((l) => {
              const d = drafts[l.id] ?? { publication_date: "", effective_date: "" };
              return (
                <Card key={l.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {l.number}
                      <Badge variant="outline">{l.origin ?? "?"}</Badge>
                      {l.entity && <Badge variant="secondary">{l.entity}</Badge>}
                      {l.document_url && (
                        <a href={l.document_url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 text-xs font-normal">
                          Fonte <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </CardTitle>
                    <CardDescription>{l.title}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`pub-${l.id}`}>Data de publicação</Label>
                      <Input
                        id={`pub-${l.id}`}
                        type="date"
                        value={d.publication_date}
                        onChange={(e) => setDrafts((s) => ({ ...s, [l.id]: { ...d, publication_date: e.target.value } }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`eff-${l.id}`}>Entrada em vigor</Label>
                      <Input
                        id={`eff-${l.id}`}
                        type="date"
                        value={d.effective_date}
                        onChange={(e) => setDrafts((s) => ({ ...s, [l.id]: { ...d, effective_date: e.target.value } }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={!d.publication_date || saveDates.isPending}
                      onClick={() => saveDates.mutate(l)}
                    >
                      <Save className="h-4 w-4" /> Guardar
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="requisitos" className="space-y-3 mt-4">
            {loadingReq && (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>
            )}
            {!loadingReq && semReq.length === 0 && (
              <Card><CardContent className="py-6 text-sm text-muted-foreground">Não há diplomas sem requisitos. 🎉</CardContent></Card>
            )}
            {semReq.map((l) => {
              const d = reqDrafts[l.id] ?? { article: "", text: "" };
              return (
                <Card key={l.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      {l.number}
                      <Badge variant="outline">{l.origin ?? "?"}</Badge>
                      {l.document_url && (
                        <a href={l.document_url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 text-xs font-normal">
                          Fonte <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </CardTitle>
                    <CardDescription>{l.title}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`art-${l.id}`}>Artigo</Label>
                        <Input
                          id={`art-${l.id}`}
                          placeholder="Ex.: Artigo 5.º"
                          value={d.article}
                          onChange={(e) => setReqDrafts((s) => ({ ...s, [l.id]: { ...d, article: e.target.value } }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`txt-${l.id}`}>Texto do requisito</Label>
                        <Textarea
                          id={`txt-${l.id}`}
                          placeholder="Cole aqui o texto do requisito legal…"
                          rows={2}
                          value={d.text}
                          onChange={(e) => setReqDrafts((s) => ({ ...s, [l.id]: { ...d, text: e.target.value } }))}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={!d.text.trim() || addRequirement.isPending}
                      onClick={() => addRequirement.mutate(l)}
                    >
                      <Plus className="h-4 w-4" /> Adicionar requisito
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
