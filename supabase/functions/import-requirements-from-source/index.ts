import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Requirement {
  article: string;
  requirement_text: string;
}

/**
 * Extract articles directly from text using regex patterns.
 * This is faster and more reliable than AI for structured legal texts.
 */
function extractArticlesFromText(text: string): Requirement[] {
  const requirements: Requirement[] = [];
  
  // Normalize line breaks and clean up
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  // Pattern to match articles: "Artigo 1.º", "Art. 2º", "ARTIGO 3", etc.
  const articlePattern = /(?:^|\n)\s*((?:ARTIGO|Artigo|Art\.?)\s*\d+[ºª°]?(?:[-–]\w)?)\s*\n?([^\n]*(?:\n(?!(?:ARTIGO|Artigo|Art\.?)\s*\d+|ANEXO|Anexo|CAPÍTULO|Capítulo|SECÇÃO|Secção|TÍTULO|Título)[^\n]*)*)/gi;
  
  // Pattern for Anexos
  const anexoPattern = /(?:^|\n)\s*(ANEXO|Anexo)\s*([\dIVXLCDM]+(?:[-–]\w)?)\s*\n?([^\n]*(?:\n(?!(?:ANEXO|Anexo)\s*[\dIVXLCDM]|ARTIGO|Artigo|Art\.?\s*\d+)[^\n]*)*)/gi;

  // Extract articles
  let match;
  while ((match = articlePattern.exec(cleanText)) !== null) {
    const articleLabel = match[1].trim();
    let articleText = (match[2] || '').trim();
    
    // Clean leading artifacts like ".º" or "º" from the text
    articleText = articleText.replace(/^[.º°ª]+\s*\n*/g, '').trim();
    
    // Skip empty articles
    if (articleText.length < 10) continue;
    
    // Truncate very long articles
    if (articleText.length > 5000) {
      articleText = articleText.substring(0, 5000) + '...';
    }
    
    requirements.push({
      article: normalizeArticleLabel(articleLabel),
      requirement_text: articleText,
    });
  }

  // Extract Anexos
  while ((match = anexoPattern.exec(cleanText)) !== null) {
    const anexoLabel = `Anexo ${match[2]}`.trim();
    let anexoText = (match[3] || '').trim();
    
    if (anexoText.length < 10) continue;
    
    if (anexoText.length > 5000) {
      anexoText = anexoText.substring(0, 5000) + '...';
    }
    
    requirements.push({
      article: anexoLabel,
      requirement_text: anexoText,
    });
  }

  return requirements;
}

/**
 * Normalize article labels for consistency
 */
function normalizeArticleLabel(label: string): string {
  // Remove extra spaces
  let normalized = label.replace(/\s+/g, ' ').trim();
  
  // Normalize "Art." to "Artigo"
  normalized = normalized.replace(/^Art\.?\s*/i, 'Artigo ');
  
  // Ensure proper format: "Artigo X.º"
  const numMatch = normalized.match(/(\d+)[ºª°]?/);
  if (numMatch) {
    const num = numMatch[1];
    normalized = `Artigo ${num}.º`;
  }
  
  return normalized.substring(0, 50);
}

/**
 * Fallback: Use AI to extract requirements when regex parsing fails
 */
async function extractWithAI(content: string, lovableApiKey: string): Promise<Requirement[]> {
  const AI_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  
  // Truncate for AI context window
  const truncatedContent = content.length > 40000 ? content.substring(0, 40000) : content;
  
  const prompt = `Analisa o seguinte texto de legislação e extrai TODOS os artigos com o seu texto integral.

TEXTO:
${truncatedContent}

INSTRUÇÕES:
1. Para cada "Artigo X.º" encontrado, extrai o texto COMPLETO desse artigo
2. Também extrai "Anexo I", "Anexo II", etc. com o respetivo texto
3. Mantém o texto integral de cada artigo, não resumas
4. O campo "article" deve ter formato "Artigo X.º" ou "Anexo Y"

FORMATO (JSON array, sem markdown):
[
  {"article": "Artigo 1.º", "requirement_text": "O presente decreto-lei estabelece..."},
  {"article": "Artigo 2.º", "requirement_text": "Para efeitos do presente diploma..."}
]`;

  console.log('Calling AI for extraction fallback...');

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
          content: 'Extrai artigos de legislação em formato JSON. Retorna apenas o array JSON sem formatação markdown.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 16000,
    }),
  });

  if (!aiResponse.ok) {
    if (aiResponse.status === 429) {
      throw new Error('Rate limit exceeded. Try again later.');
    }
    if (aiResponse.status === 402) {
      throw new Error('AI credits exhausted. Please add credits.');
    }
    const errorText = await aiResponse.text();
    console.error('AI API error:', aiResponse.status, errorText);
    throw new Error(`AI API error: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const aiContent = aiData.choices?.[0]?.message?.content || '';

  console.log('AI response length:', aiContent.length);

  // Parse JSON from AI response
  const requirements: Requirement[] = [];
  try {
    const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          if (r && typeof r.requirement_text === 'string' && r.requirement_text.trim().length > 10) {
            requirements.push({
              article: normalizeArticleLabel(r.article || 'Geral'),
              requirement_text: r.requirement_text.trim(),
            });
          }
        }
      }
    }
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
  }

  return requirements;
}

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
    const { legislationId, source, url, text, useAI = false } = body;

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

      console.log('[v2] Scraping URL:', url);

      // Try multiple methods to get content
      let scrapeSuccess = false;
      
      // Check if it's a DRE URL - try OpenData API first
      // Pattern: diariodarepublica.pt/dr/detalhe/decreto-lei/226-a-2007-340237
      const dreMatch = url.match(/diariodarepublica\.pt\/dr\/(?:detalhe|lexionario)\/([^\/]+)\/([\w-]+)-(\d{4})-(\d+)/i);
      
      if (dreMatch) {
        const docType = dreMatch[1]; // e.g., "decreto-lei"
        const docNumber = dreMatch[2]; // e.g., "226-a"
        const docYear = dreMatch[3]; // e.g., "2007"
        const dreId = dreMatch[4]; // The numeric ID at the end
        console.log(`[v2] DRE document: type=${docType}, number=${docNumber}, year=${docYear}, id=${dreId}`);
        
        // Try multiple API endpoints
        const apiEndpoints = [
          `https://dre.pt/dr/api/diploma/${dreId}`,
          `https://dre.pt/opendata/document/${dreId}`,
          `https://dre.pt/dr/api/textoIntegral/${dreId}`,
        ];
        
        for (const endpoint of apiEndpoints) {
          if (scrapeSuccess) break;
          
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            
            console.log('[v2] Trying API endpoint:', endpoint);
            const apiResponse = await fetch(endpoint, {
              method: 'GET',
              headers: {
                'Accept': 'application/json, text/html, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              signal: controller.signal,
            });
            
            clearTimeout(timeout);
            console.log('[v2] API response status:', apiResponse.status);
            
            if (apiResponse.ok) {
              const contentType = apiResponse.headers.get('content-type') || '';
              
              if (contentType.includes('application/json')) {
                const apiData = await apiResponse.json();
                console.log('[v2] API returned JSON with keys:', Object.keys(apiData).join(', '));
                
                // Try various field names for the text content
                const textField = apiData.texto || apiData.conteudo || apiData.textoIntegral || 
                                  apiData.content || apiData.body || apiData.html;
                if (textField && typeof textField === 'string' && textField.length > 100) {
                  contentToProcess = textField;
                  console.log('[v2] Found text content, length:', contentToProcess.length);
                  scrapeSuccess = true;
                } else if (apiData.artigos && Array.isArray(apiData.artigos)) {
                  contentToProcess = apiData.artigos.map((a: any) => 
                    `Artigo ${a.numero || a.artigo || ''}\n${a.texto || a.conteudo || ''}`
                  ).join('\n\n');
                  console.log('[v2] Built from artigos array, length:', contentToProcess.length);
                  scrapeSuccess = contentToProcess.length > 100;
                }
              } else if (contentType.includes('text/html')) {
                let html = await apiResponse.text();
                console.log('[v2] API returned HTML, length:', html.length);
                
                // Extract text from HTML
                if (html.length > 100) {
                  contentToProcess = html
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, '\n')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                  console.log('[v2] Extracted text from HTML, length:', contentToProcess.length);
                  scrapeSuccess = contentToProcess.length > 500;
                }
              }
            }
          } catch (apiError) {
            console.log('[v2] API error:', apiError instanceof Error ? apiError.message : 'unknown');
          }
        }
      }
      
      // Attempt 2: Firecrawl
      if (!scrapeSuccess && firecrawlApiKey) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        try {
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
              waitFor: 5000, // Increased wait time for JS-heavy pages
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);
          const scrapeData = await scrapeResponse.json();

          if (scrapeResponse.ok && scrapeData.success) {
            contentToProcess = scrapeData.data?.markdown || scrapeData.markdown || '';
            console.log('Firecrawl scraped content length:', contentToProcess.length);
            scrapeSuccess = contentToProcess.length > 100;
          } else {
            console.log('Firecrawl failed:', scrapeData.error || scrapeData.code);
          }
        } catch (fetchError: unknown) {
          clearTimeout(timeout);
          console.log('Firecrawl error:', fetchError instanceof Error ? fetchError.message : 'unknown');
        }
      }

      // Attempt 3: Try PDF URL for DRE documents
      if (!scrapeSuccess && dreMatch) {
        const dreId = dreMatch[4];
        const pdfUrl = `https://files.dre.pt/1s/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${dreId}.pdf`;
        console.log('DRE content not available, suggesting PDF alternative');
        
        // We can't easily extract from PDFs, so provide a helpful error
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Este diploma recente ainda não está disponível para extração automática. Por favor, aceda ao documento em ${url}, copie o texto integral e cole-o na aba "Colar Texto".`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If all methods failed
      if (!scrapeSuccess || contentToProcess.length < 50) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Não foi possível extrair conteúdo do URL. O site pode estar a bloquear acessos automatizados ou o documento ainda não está indexado. Copie o texto diretamente do documento e cole-o na aba "Colar Texto".' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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

    console.log('Content length to process:', contentToProcess.length);

    // First, try regex-based extraction (faster, no AI costs)
    let requirements = extractArticlesFromText(contentToProcess);
    console.log(`Regex extraction found ${requirements.length} articles`);

    // If regex found nothing or very few, use AI as fallback
    if (requirements.length < 2 && useAI) {
      console.log('Using AI fallback for extraction...');
      try {
        requirements = await extractWithAI(contentToProcess, lovableApiKey);
        console.log(`AI extraction found ${requirements.length} articles`);
      } catch (aiError) {
        console.error('AI extraction failed:', aiError);
        // If AI also fails and regex found something, use that
        if (requirements.length === 0) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: aiError instanceof Error ? aiError.message : 'AI extraction failed' 
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // If still no requirements and user didn't request AI, suggest it
    if (requirements.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          requirements: [],
          source,
          contentLength: contentToProcess.length,
          message: 'Nenhum artigo estruturado encontrado. Tente ativar a extração com IA.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Returning ${requirements.length} requirements`);

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
