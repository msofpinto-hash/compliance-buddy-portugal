import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { legislationId, title, summary, number } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all categories with their themes
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

    // Build a set of category IDs that have children (parent categories)
    const parentIds = new Set<string>();
    categories?.forEach(cat => {
      if (cat.parent_id) {
        parentIds.add(cat.parent_id);
      }
    });

    // Filter to only include leaf categories (no children)
    const leafCategories = categories?.filter(cat => !parentIds.has(cat.id)) || [];

    // Build category list for context (only leaf categories)
    const categoryList = leafCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      theme: (cat.themes as any)?.name || "Sem tema",
      keywords: cat.keywords || []
    }));

    // Create a structured list for the AI
    const categoryContext = categoryList.map(c => 
      `- ID: ${c.id} | Tema: ${c.theme} | Categoria: ${c.name}${c.keywords.length > 0 ? ` | Palavras-chave: ${c.keywords.join(", ")}` : ""}`
    ).join("\n");

    const legislationText = `
Número: ${number || "N/A"}
Título: ${title || "Sem título"}
Sumário: ${summary || "Sem sumário"}
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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de pedidos excedido. Tente novamente mais tarde." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione fundos à sua conta." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Erro no gateway de IA");
    }

    const aiData = await response.json();
    const aiResponse = aiData.choices?.[0]?.message?.content || "[]";

    // Parse the AI response to extract category IDs
    let suggestedIds: string[] = [];
    try {
      // Try to extract JSON array from response
      const jsonMatch = aiResponse.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        suggestedIds = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", aiResponse);
    }

    // Validate that suggested IDs exist in our category list
    const validCategoryIds = new Set(categoryList.map(c => c.id));
    const validSuggestions = suggestedIds.filter(id => validCategoryIds.has(id));

    // Get full category details for the suggestions
    const suggestedCategories = validSuggestions.map(id => {
      const cat = categoryList.find(c => c.id === id);
      return cat ? { id: cat.id, name: cat.name, theme: cat.theme } : null;
    }).filter(Boolean);

    return new Response(JSON.stringify({ 
      suggestions: suggestedCategories,
      legislationId 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("suggest-categories error:", e);
    return new Response(JSON.stringify({ 
      error: e instanceof Error ? e.message : "Erro desconhecido" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
