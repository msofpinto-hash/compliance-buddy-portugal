import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  document_url?: string;
  number?: string;
  file_hash?: string;
}

// Hosts that always serve HTTPS — used to upgrade http→https for consistency
const HTTPS_HOSTS = [
  "dre.pt",
  "diariodarepublica.pt",
  "eur-lex.europa.eu",
  "files.dre.pt",
];

// Canonical URL normalization (must mirror frontend `normalizeUrlInput`):
// - trim
// - lowercase host only (preserve path/query case)
// - upgrade http→https for known secure hosts
// - strip default ports (80/443)
// - drop fragment (#...)
// - remove trailing slash from path (except root)
function normalizeUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    u.hostname = u.hostname.toLowerCase();
    if (
      u.protocol === "http:" &&
      HTTPS_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))
    ) {
      u.protocol = "https:";
    }
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
      u.port = "";
    }
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return trimmed;
  }
}

function normalizeNumber(num: string): string {
  // Remove punctuation/spaces variations to catch "DL 12/2024" vs "Decreto-Lei n.º 12/2024"
  return num
    .toLowerCase()
    .replace(/n\.?[ºo°]?/gi, "")
    .replace(/\s+/g, "")
    .replace(/[.,;]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is authenticated admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    const { document_url, number, file_hash } = body;

    if (!document_url && !number && !file_hash) {
      return new Response(
        JSON.stringify({ error: "At least one of document_url, number, or file_hash is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const matches: Array<{
      type: "url" | "number" | "hash";
      legislation: { id: string; number: string; title: string; document_url: string | null };
    }> = [];

    // 1) URL match (exact + normalized)
    if (document_url) {
      const normalized = normalizeUrl(document_url);
      const { data } = await admin
        .from("legislation")
        .select("id, number, title, document_url")
        .or(`document_url.eq.${document_url},document_url.eq.${normalized}`)
        .limit(5);
      data?.forEach((l) =>
        matches.push({ type: "url", legislation: l })
      );
    }

    // 2) Number match (normalized)
    if (number) {
      const norm = normalizeNumber(number);
      // Pull recent candidates and filter in JS (PostgreSQL regex would also work)
      const { data: all } = await admin
        .from("legislation")
        .select("id, number, title, document_url")
        .ilike("number", `%${number.replace(/[%_]/g, "").substring(0, 30)}%`)
        .limit(50);
      all?.forEach((l) => {
        if (normalizeNumber(l.number) === norm) {
          if (!matches.find((m) => m.legislation.id === l.id)) {
            matches.push({ type: "number", legislation: l });
          }
        }
      });
    }

    // 3) File hash match
    if (file_hash) {
      const { data } = await admin
        .from("legislation")
        .select("id, number, title, document_url")
        .eq("file_hash", file_hash)
        .limit(5);
      data?.forEach((l) => {
        if (!matches.find((m) => m.legislation.id === l.id)) {
          matches.push({ type: "hash", legislation: l });
        }
      });
    }

    return new Response(
      JSON.stringify({
        is_duplicate: matches.length > 0,
        matches,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("validate-legislation-duplicate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
