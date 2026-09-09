// Resolve official Diário da República document URLs via the ELI redirect service.
// data.dre.pt/eli/<slug>/<number>/<yyyy>/<mm>/<dd>/p/dre/pt/html redirects to the
// canonical /dr/detalhe/... page (with its internal id). Unknown documents land on /dr/error.

const SLUG_RULES: Array<[RegExp, string[]]> = [
  [/^lei constitucional/i, ["leiconst"]],
  [/^lei org/i, ["lei-org", "leiorg"]],
  [/^lei/i, ["lei"]],
  [/^decreto-lei/i, ["dec-lei"]],
  [/^decreto regulamentar regional/i, ["dec-reg-reg", "dec-reg"]],
  [/^decreto regulamentar/i, ["dec-reg", "decreg"]],
  [/^decreto legislativo regional/i, ["dec-leg-reg", "declegreg"]],
  [/^decreto/i, ["decreto", "dec"]],
  [/^portaria/i, ["port"]],
  [/^despacho normativo/i, ["desp-norm"]],
  [/^despacho/i, ["desp"]],
  [/^resolu[çc][ãa]o do conselho de ministros/i, ["res-cm"]],
  [/^resolu[çc][ãa]o da assembleia/i, ["res-ar"]],
  [/^resolu[çc][ãa]o/i, ["res", "res-ar", "res-cm"]],
  [/^declara[çc][ãa]o de retifica/i, ["dec-ret"]],
  [/^declara[çc][ãa]o/i, ["decl"]],
  [/^aviso/i, ["aviso"]],
  [/^regulamento/i, ["regul"]],
];

export function isDreSearchUrl(url?: string | null): boolean {
  if (!url) return false;
  return /diariodarepublica\.pt\/dr\/pesquisa|search\/basic/i.test(url);
}

function slugsFor(numberText: string): string[] {
  for (const [re, slugs] of SLUG_RULES) {
    if (re.test(numberText.trim())) return slugs;
  }
  return [];
}

function numberPart(numberText: string): string | null {
  const m = numberText.match(/n\.?[ºo°]?\s*([0-9]+[-\w]*)\s*\/\s*(\d{2,4})/i) ||
    numberText.match(/([0-9]+[-\w]*)\s*\/\s*(\d{2,4})/);
  return m ? m[1] : null;
}

/** Returns the canonical /dr/detalhe/... URL, or null when it cannot be resolved. */
export async function resolveDreUrl(
  numberText: string,
  publicationDate?: string | null,
): Promise<string | null> {
  if (!numberText || !publicationDate) return null;
  const [y, m, d] = publicationDate.split("-");
  if (!y || !m || !d) return null;
  const num = numberPart(numberText);
  if (!num) return null;

  for (const slug of slugsFor(numberText)) {
    const eli = `https://data.dre.pt/eli/${slug}/${num}/${y}/${m}/${d}/p/dre/pt/html`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(eli, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      clearTimeout(timer);
      const finalUrl = res.url || "";
      if (finalUrl.includes("/dr/detalhe/")) return finalUrl;
    } catch (_err) {
      // try next slug
    }
  }
  return null;
}
