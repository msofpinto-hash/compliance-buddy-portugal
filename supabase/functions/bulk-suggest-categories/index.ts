import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LegislationItem {
  id: string;
  number: string;
  title: string;
  summary?: string | null;
}

const MIN_SUMMARY_LENGTH = 20;

async function resolveLegislationIds(
  supabase: any,
  providedIds: string[] | undefined,
  limit: number,
): Promise<string[]> {
  if (Array.isArray(providedIds) && providedIds.length > 0) {
    return [...new Set(providedIds.filter(Boolean))];
  }

  const expandedLimit = Math.min(Math.max(limit, 1) * 3, 300);
  const { data, error } = await supabase.rpc("get_legislation_without_categories_ids" as any, {
    p_limit: expandedLimit,
  });

  if (error) throw error;

  return [...new Set((data || []).map((row: any) => row.id).filter(Boolean))];
}

async function processLegislationBatch(
  supabase: any,
  legislationIds: string[],
  syncLogId: string,
  autoAssign: boolean
) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const { data: categories, error: catError } = await supabase
    .from("theme_categories")
    .select(`
      id,
      name,
      keywords,
      parent_id,
      themes:theme_id (
        id,
        name
      )
    `);

  if (catError) throw catError;

  const parentIds = new Set<string>();
  categories?.forEach((cat: any) => {
    if (cat.parent_id) {
      parentIds.add(cat.parent_id);
    }
  });

  const leafCategories = categories?.filter((cat: any) => !parentIds.has(cat.id)) || [];

  const categoryList = leafCategories.map((cat: any) => ({
    id: cat.id,
    name: cat.name,
    theme: cat.themes?.name || "Sem tema",
    keywords: cat.keywords || []
  }));

  const categoryContext = categoryList.map((c: any) =>
    `- ID: ${c.id} | Tema: ${c.theme} | Categoria: ${c.name}${c.keywords.length > 0 ? ` | Palavras-chave: ${c.keywords.join(", ")}` : ""}`
  ).join("\n");

  const { data: legislationItems, error: legError } = await supabase
    .from("legislation")
    .select("id, number, title, summary")
    .in("id", legislationIds);

  if (legError) throw legError;

  const eligibleItems = (legislationItems || []).filter((leg: LegislationItem) => {
    const summary = leg.summary?.replace(/\s+/g, " ").trim() || "";
    return summary.length >= MIN_SUMMARY_LENGTH;
  });

  const { data: existingMappings } = await supabase
    .from("legislation_category_mapping")
    .select("legislation_id, category_id")
    .in("legislation_id", eligibleItems.map((item) => item.id));

  const existingByLegislation = new Map<string, Set<string>>();
  existingMappings?.forEach((m: any) => {
    if (!existingByLegislation.has(m.legislation_id)) {
      existingByLegislation.set(m.legislation_id, new Set());
    }
    existingByLegislation.get(m.legislation_id)!.add(m.category_id);
  });

  let processed = 0;
  let added = 0;
  let errors = 0;
  let skipped = Math.max(0, legislationIds.length - eligibleItems.length);

  const validCategoryIds = new Set(categoryList.map((c: any) => c.id));

  for (const leg of eligibleItems) {
    try {
      const cleanSummary = leg.summary?.replace(/\s+/g, " ").trim() || "Sem sumário";
      const legislationText = `
Número: ${leg.number || "N/A"}
Título: ${leg.title || "Sem título"}
Sumário: ${cleanSummary}
      `.trim();

      const systemPrompt = `És um especialista em classificação de legislação portuguesa e europeia.
A tua tarefa é analisar um diploma legal e sugerir as categorias mais apropriadas da lista fornecida.

CATEGORIAS DISPONÍVEIS:
${categoryContext}

INSTRUÇÕES:
1. Analisa o título e sumário do diploma
2. Identifica os temas principais abordados
3. Seleciona 1 a 5 categorias mais relevantes
4. Ordena por relevância (mais relevante primeiro)
5. Retorna APENAS os IDs das categorias selecionadas

IMPORTANTE:
- Usa apenas categorias da lista fornecida
- Considera palavras-chave associadas a cada categoria
- Prioriza categorias específicas sobre genéricas
- Se não houver correspondência clara, retorna lista vazia`;

      const userPrompt = `Analisa este diploma e sugere as categorias mais apropriadas:

${legislationText}

Responde APENAS com um array JSON de IDs de categorias, ordenados por relevância.
Exemplo de resposta: ["uuid1", "uuid2", "uuid3"]
Se não encontrares categorias apropriadas, responde: []`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
        }),
      });

      if (!response.ok) {
        console.error(`AI error for ${leg.number}:`, response.status);
        errors++;
        continue;
      }

      const aiData = await response.json();
      const aiResponse = aiData.choices?.[0]?.message?.content || "[]";

      let suggestedIds: string[] = [];
      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          suggestedIds = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("Failed to parse AI response:", aiResponse);
      }

      const existingIds = existingByLegislation.get(leg.id) || new Set();
      const newCategories = suggestedIds
        .filter(id => validCategoryIds.has(id) && !existingIds.has(id));

      if (autoAssign && newCategories.length > 0) {
        const mappings = newCategories.map(categoryId => ({
          legislation_id: leg.id,
          category_id: categoryId,
        }));

        const { error: insertError } = await supabase
          .from("legislation_category_mapping")
          .insert(mappings);

        if (insertError) {
          console.error(`Insert error for ${leg.number}:`, insertError);
          errors++;
        } else {
          added += newCategories.length;
        }
      }

      processed++;

      if (processed % 10 === 0 || processed === eligibleItems.length) {
        await supabase
          .from("sync_logs")
          .update({
            items_processed: processed,
            items_added: added,
            error_message: errors > 0 || skipped > 0
              ? `${errors} erro(s)${skipped > 0 ? ` | ${skipped} ignorado(s) sem sumário válido` : ""}`
              : null,
          })
          .eq("id", syncLogId);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      console.error(`Error processing ${leg.number}:`, e);
      errors++;
    }
  }

  await supabase
    .from("sync_logs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      items_processed: processed,
      items_added: added,
      error_message: errors > 0 || skipped > 0
        ? `${errors} erro(s) durante o processamento${skipped > 0 ? ` | ${skipped} ignorado(s) sem sumário válido` : ""}`
        : null,
    })
    .eq("id", syncLogId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { legislationIds: providedIds, autoAssign = true, limit = 50 } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const legislationIds = await resolveLegislationIds(supabase, providedIds, limit);

    if (!legislationIds.length) {
      return new Response(JSON.stringify({ error: "Nenhum diploma elegível para categorização" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: syncLog, error: syncError } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: "bulk-suggest-categories",
        status: "running",
        items_processed: 0,
        items_added: 0,
      })
      .select()
      .single();

    if (syncError) throw syncError;

    (globalThis as any).EdgeRuntime.waitUntil(
      processLegislationBatch(supabase, legislationIds, syncLog.id, autoAssign)
    );

    return new Response(JSON.stringify({
      success: true,
      syncLogId: syncLog.id,
      total: legislationIds.length,
      message: `Processamento iniciado para ${legislationIds.length} diploma(s). Pode fechar esta janela.`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("bulk-suggest-categories error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Erro desconhecido"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});