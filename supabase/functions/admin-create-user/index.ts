import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/adminGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const { email, password, fullName, role, organizationIds } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email e password são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (String(password).length < 8) {
      return new Response(JSON.stringify({ error: "A password deve ter pelo menos 8 caracteres" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userRole: "admin" | "client" = role === "admin" ? "admin" : "client";
    const orgIds: string[] = Array.isArray(organizationIds) ? organizationIds : [];

    if (userRole === "client" && orgIds.length === 0) {
      return new Response(JSON.stringify({ error: "Selecione pelo menos uma organização para um utilizador cliente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: String(email).toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? null },
    });

    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? "Não foi possível criar o utilizador" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = created.user.id;

    // Profile is created by trigger; ensure name + approval
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: fullName ?? null,
        is_approved: true,
        approved_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profileError) throw profileError;

    const rows = userRole === "admin"
      ? [{ user_id: userId, role: "admin", organization_id: null }]
      : orgIds.map((orgId) => ({ user_id: userId, role: "client", organization_id: orgId }));

    const { error: rolesError } = await admin.from("user_roles").insert(rows);
    if (rolesError) throw rolesError;

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro inesperado";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
