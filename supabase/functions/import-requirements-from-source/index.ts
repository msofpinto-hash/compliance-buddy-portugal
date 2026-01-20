import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Requirement {
  article: string;
  requirement_text: string;
}

// Regex to detect malformed articles containing diploma type keywords
const MALFORMED_ARTICLE_PATTERNS = [
  /\bDespacho\b/i,
  /\bPortaria\b/i,
  /\bDecreto\b/i,
  /\bRegulamento\b/i,
  /\bLei\s+n/i,
  /\bDiretiva\b/i,
  /\bDecisão\b/i,
  /\bDeclaração\b/i,
];

// Function to validate and clean article field
function cleanArticle(article: string | undefined | null): string {
  if (!article) return 'Geral';
  
  const trimmed = article.trim();
  
  // Check if article contains diploma-type keywords (malformed)
  const isMalformed = MALFORMED_ARTICLE_PATTERNS.some(pattern => pattern.test(trimmed));
  
  if (isMalformed) {
    // Try to extract just the article part if it exists
    const articleMatch = trimmed.match(/\b(Art(?:igo)?\.?\s*\d+[ºª]?(?:\s*,?\s*n\.?º?\s*\d+)?)/i);
    if (articleMatch) {
      return articleMatch[1].substring(0, 50);
    }
    
    // Check for Anexo pattern
    const anexoMatch = trimmed.match(/\b(Anexo\s+[IVX\d]+)/i);
    if (anexoMatch) {
      return anexoMatch[1].substring(0, 50);
    }
    
    return 'Geral';
  }
  
  return trimmed.substring(0, 50);
}

// Use Lovable AI gateway
const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { legislationId, source, url, text } = body;

    if (!legislationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'legislationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (source !== 'url' && source !== 'text') {
      return new Response(
        JSON.stringify({ success: false, error: 'source must be "url" or "text"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let contentToProcess = '';

    // If source is URL, scrape the content
    if (source === 'url') {
      if (!url) {
        return new Response(
          JSON.stringify({ success: false, error: 'url is required for source="url"' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!firecrawlApiKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'Firecrawl connector not configured. Enable it in Settings.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Scraping URL:', url);

      // Scrape the URL using Firecrawl
      const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      });

      const scrapeData = await scrapeResponse.json();

      if (!scrapeResponse.ok || !scrapeData.success) {
        console.error('Firecrawl error:', scrapeData);
        return new Response(
          JSON.stringify({ success: false, error: scrapeData.error || 'Failed to scrape URL' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      contentToProcess = scrapeData.data?.markdown || scrapeData.markdown || '';
      console.log('Scraped content length:', contentToProcess.length);
    } else {
      // Source is text
      if (!text) {
        return new Response(
          JSON.stringify({ success: false, error: 'text is required for source="text"' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      contentToProcess = text;
    }

    if (!contentToProcess || contentToProcess.length < 50) {
      return new Response(
        JSON.stringify({ success: false, error: 'Conteúdo demasiado curto para extrair requisitos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate if too long (keep first 50000 chars for context window)
    if (contentToProcess.length > 50000) {
      contentToProcess = contentToProcess.substring(0, 50000);
      console.log('Content truncated to 50000 chars');
    }

    // Build AI prompt to extract requirements
    const prompt = `Analisa o seguinte texto legal e extrai TODOS os requisitos, obrigações e artigos.

TEXTO:
${contentToProcess}

INSTRUÇÕES CRÍTICAS:
1. Extrai TODOS os artigos encontrados no texto (Art. 1.º, Art. 2.º, etc.)
2. Para cada artigo, extrai o texto completo das obrigações
3. Também extrai Anexos, Considerandos, ou qualquer secção relevante
4. Se não houver artigos estruturados, divide o texto em partes lógicas
5. Cada requisito deve ter máximo 1500 caracteres

FORMATO DE SAÍDA:
Retorna APENAS um array JSON válido, sem markdown, sem explicações:
[
  {"article": "Art. 1.º", "requirement_text": "Texto do artigo..."},
  {"article": "Art. 2.º", "requirement_text": "Texto do artigo..."},
  {"article": "Anexo I", "requirement_text": "Texto do anexo..."}
]

Se não conseguires extrair requisitos, retorna: []`;

    console.log('Calling AI for extraction...');

    const aiResponse = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'És um assistente especializado em análise de legislação portuguesa e europeia. Extrai requisitos legais de forma estruturada em JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';

    console.log('AI response length:', aiContent.length);

    // Parse JSON from AI response
    let requirements: Requirement[] = [];

    try {
      // Try to extract JSON array from response
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          requirements = parsed
            .filter((r: any) => r && typeof r.requirement_text === 'string' && r.requirement_text.trim())
            .map((r: any) => ({
              article: cleanArticle(r.article),
              requirement_text: String(r.requirement_text).trim().substring(0, 1500),
            }));
        }
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw AI content:', aiContent.substring(0, 500));
    }

    console.log(`Extracted ${requirements.length} requirements`);

    return new Response(
      JSON.stringify({
        success: true,
        requirements,
        source,
        contentLength: contentToProcess.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Import requirements error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
