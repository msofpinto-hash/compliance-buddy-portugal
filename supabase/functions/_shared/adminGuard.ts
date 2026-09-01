import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const guardCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

function deny(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...guardCors, "Content-Type": "application/json" },
  });
}

function bearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}


function isServiceRoleToken(token: string): boolean {
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}


/**
 * Internal service token used by pg_cron jobs. The token lives in the private
 * `internal.service_tokens` table and is only readable with the service role.
 */
async function hasValidInternalToken(req: Request): Promise<boolean> {
  const provided = req.headers.get("x-internal-token");
  if (!provided) return false;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data, error } = await admin.rpc("verify_internal_token", { _token: provided });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Allows internal service-role calls (pg_cron / other edge functions) or an
 * authenticated user. Returns a Response when access must be denied, else null.
 */
export async function requireUser(req: Request): Promise<Response | null> {
  if (await hasValidInternalToken(req)) return null;
  const token = bearer(req);
  if (!token) return deny(401, "Autenticação necessária");

  if (isServiceRoleToken(token)) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return deny(401, "Sessão inválida");
  return null;
}

/**
 * Allows internal service-role calls or authenticated users with the admin role.
 */
export async function requireAdmin(req: Request): Promise<Response | null> {
  if (await hasValidInternalToken(req)) return null;
  const token = bearer(req);
  if (!token) return deny(401, "Autenticação necessária");

  if (isServiceRoleToken(token)) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    console.error("[adminGuard] getUser failed:", userError?.message);
    return deny(401, "Sessão inválida ou expirada. Volte a iniciar sessão.");
  }


  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleError) return deny(500, "Não foi possível validar permissões");
  if (!isAdmin) return deny(403, "Acesso restrito a administradores");

  return null;
}
