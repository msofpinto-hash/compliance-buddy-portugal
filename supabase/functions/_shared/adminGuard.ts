import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const guardCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

/**
 * Allows internal service-role calls (pg_cron / other edge functions) or an
 * authenticated user. Returns a Response when access must be denied, else null.
 */
export async function requireUser(req: Request): Promise<Response | null> {
  const token = bearer(req);
  if (!token) return deny(401, "Autenticação necessária");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return null;

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
  const token = bearer(req);
  if (!token) return deny(401, "Autenticação necessária");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return deny(401, "Sessão inválida");

  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleError) return deny(500, "Não foi possível validar permissões");
  if (!isAdmin) return deny(403, "Acesso restrito a administradores");

  return null;
}
