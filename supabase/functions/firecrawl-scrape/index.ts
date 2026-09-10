import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { requireAdmin } from "../_shared/adminGuard.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Allowed domains for URL scraping (security: prevent SSRF attacks)
const ALLOWED_DOMAINS = [
  'dre.pt',
  'diariodarepublica.pt',
  'eur-lex.europa.eu',
  'publications.europa.eu',
  'data.europa.eu',
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Block private IP ranges (RFC 1918, loopback, link-local)
    const privatePatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^169\.254\./,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^fe80:/i,
      /^fc00:/i,
      /^ff00:/i,
    ];
    
    for (const pattern of privatePatterns) {
      if (pattern.test(hostname)) {
        return false;
      }
    }
    
    // Check against allowlist
    return ALLOWED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// Direct page read used when Firecrawl has no credits
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));
}

async function nativeFetchScrape(url: string): Promise<{ markdown: string; metadata: Record<string, string> } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) {
      console.error('Native fetch failed:', res.status);
      return null;
    }
    const html = await res.text();

    const pick = (re: RegExp) => decodeEntities((html.match(re)?.[1] || '').trim());

    const metadata: Record<string, string> = {
      title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
      description:
        pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
        pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
      'og:title': pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
      sourceURL: url,
    };

    const text = decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (!metadata.title && text.length < 200) return null;

    return { markdown: text.slice(0, 100000), metadata };
  } catch (e) {
    console.error('Native fetch error:', e);
    return null;
  }
}

// Reader render service (no API key) — renders JS pages such as DRE/EUR-Lex
async function readerScrape(url: string): Promise<{ markdown: string; metadata: Record<string, string> } | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
        'User-Agent': 'Mozilla/5.0 (compatible; IDComplianceLex/1.0)',
      },
    });
    if (!res.ok) {
      console.error('Reader fetch failed:', res.status);
      return null;
    }
    const raw = await res.text();
    if (!raw || raw.length < 200) return null;

    const titleLine = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || '';
    const bodyIdx = raw.indexOf('Markdown Content:');
    const markdown = bodyIdx >= 0 ? raw.slice(bodyIdx + 'Markdown Content:'.length).trim() : raw;

    return {
      markdown: markdown.slice(0, 150000),
      metadata: { title: titleLine, description: '', sourceURL: url },
    };
  } catch (e) {
    console.error('Reader error:', e);
    return null;
  }
}

const MONTHS: Record<string, string> = {
  janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

// Best-effort structured extraction from the rendered page text
function extractDiplomaFields(markdown: string, title: string, url: string) {
  const head = markdown.slice(0, 20000);
  const plain = head
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Number
  const ptNum = plain.match(
    /((?:Decreto-Lei|Decreto Legislativo Regional|Decreto Regulamentar|Decreto|Lei Constitucional|Lei Orgânica|Lei|Portaria|Despacho Normativo|Despacho|Resolução do Conselho de Ministros|Resolução da Assembleia da República|Resolução|Regulamento|Declaração de Retificação|Declaração|Aviso|Deliberação|Edital)\s*n\.?[ºo°]?\s*[\d]+[-\w]*\/\d{4}(?:\/\d+)?)/i,
  )?.[1];
  const euNum = plain.match(
    /((?:Regulamento|Diretiva|Directiva|Decisão|Recomendação|Comunicação)\s*(?:Delegad[ao]\s*|de Execução\s*)?\((?:UE|CE|CEE|Euratom)(?:,\s*Euratom)?\)\s*(?:n\.?[ºo°]?\s*)?\d+\/\d+)/i,
  )?.[1];

  // Publication date "de 12 de Agosto de 2005" or "de 12 de Agosto"
  let publication_date = '';
  const dm = plain.match(/de\s+(\d{1,2})\s+de\s+([A-Za-zçÇ]+)(?:\s+de\s+(\d{4}))?/i);
  if (dm) {
    const month = MONTHS[dm[2].toLowerCase()];
    let year = dm[3];
    if (!year) year = (ptNum || euNum || url).match(/(\d{4})/g)?.slice(-1)[0] || '';
    if (month && year && /^\d{4}$/.test(year)) {
      publication_date = `${year}-${month}-${String(dm[1]).padStart(2, '0')}`;
    }
  }
  if (!publication_date) {
    const iso = plain.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
    if (iso) publication_date = `${iso[3]}-${iso[2]}-${iso[1]}`;
  }

  // Entity
  const entity =
    plain.match(/(Assembleia da República|Presidência do Conselho de Ministros|Ministério[^\n,.]{0,60}|Parlamento Europeu e do Conselho|Comissão Europeia|Conselho da União Europeia|Câmara Municipal[^\n,.]{0,40})/i)?.[1]?.trim() || '';

  // Summary: first substantial paragraph after the heading/date lines
  const paragraphs = plain
    .split(/\n{1,}/)
    .map((p) => p.replace(/^[#>*\s|-]+/, '').trim())
    .filter(
      (p) =>
        p.length > 80 &&
        !/https?:\/\//i.test(p) &&
        !/^(Sumário|Índice|Ir para|Partilhar|Descarregar|Imprimir|Voltar|Início)/i.test(p) &&
        /\s/.test(p),
    );
  const summary = paragraphs[0]?.slice(0, 800) || '';

  // Title fallback: first heading line
  const firstLine =
    plain
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 5 && !/^(URL Source|Title|Markdown Content)\s*:/i.test(l)) || '';
  const cleanTitle = (title || firstLine).replace(/\s*\|\s*DRE.*$/i, '').replace(/\s*-\s*EUR-Lex.*$/i, '').trim();

  return {
    number: (ptNum || euNum || '').replace(/\s+/g, ' ').trim(),
    title: cleanTitle,
    summary,
    entity,
    publication_date,
  };
}

// Check if user is admin
async function checkAdminRole(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const guardResponse = await requireAdmin(req);
  if (guardResponse) return guardResponse;

  try {
    // Verify authentication
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    const userId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Only admins can use the scraping function
    const isAdmin = await checkAdminRole(supabase, userId);
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden - admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Authenticated admin user: ${userId}`);

    const { url, options } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKeys = [
      Deno.env.get('FIRECRAWL_API_KEY'),
      Deno.env.get('FIRECRAWL_API_KEY_2'),
      Deno.env.get('FIRECRAWL_API_KEY_3'),
    ].filter((k): k is string => !!k);

    if (apiKeys.length === 0) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // Validate URL is in allowed domains (prevent SSRF)
    if (!isAllowedUrl(formattedUrl)) {
      console.error('URL not in allowed domains:', formattedUrl);
      return new Response(
        JSON.stringify({ success: false, error: 'URL not allowed - only official legislation sources permitted' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scraping URL:', formattedUrl);

    let response: Response | null = null;
    let data: any = null;

    for (const key of apiKeys) {
      response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formattedUrl,
          formats: options?.formats || ['markdown'],
          onlyMainContent: options?.onlyMainContent ?? true,
          waitFor: options?.waitFor,
          location: options?.location,
        }),
      });

      data = await response.json().catch(() => ({}));

      // Try the next key when this one is out of credits or rate-limited
      if (response.status === 402 || response.status === 429) {
        console.warn(`Firecrawl key exhausted (status ${response.status}), trying next key if available`);
        continue;
      }
      break;
    }

    const firecrawlOk = !!response && response.ok && !!(data?.data?.markdown || data?.markdown);

    if (!firecrawlOk) {
      console.warn('Firecrawl unavailable — using reader fallback');
      const fallback = (await readerScrape(formattedUrl)) || (await nativeFetchScrape(formattedUrl));
      if (fallback && /A página não se encontra disponível|página que acedeu não se encontra/i.test(fallback.markdown)) {
        return new Response(
          JSON.stringify({
            success: false,
            error_code: 'page_not_found',
            error: 'A página oficial indicada não existe ou já não está disponível. Verifique o endereço.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (fallback) {
        const extracted = extractDiplomaFields(fallback.markdown, fallback.metadata.title || '', formattedUrl);
        return new Response(
          JSON.stringify({ success: true, fallback: 'reader', data: { ...fallback, extracted } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          error_code: 'scrape_failed',
          error: 'Não foi possível ler a página oficial automaticamente. Preencha manualmente ou tente novamente.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scrape successful');
    const md = data?.data?.markdown || data?.markdown || '';
    const meta = data?.data?.metadata || data?.metadata || {};
    const extracted = extractDiplomaFields(md, meta.title || meta['og:title'] || '', formattedUrl);
    const payload = data?.data
      ? { ...data, data: { ...data.data, extracted } }
      : { ...data, extracted };
    return new Response(
      JSON.stringify(payload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
