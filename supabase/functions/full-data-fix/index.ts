import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

type StartResult = {
  ok: boolean;
  name: string;
  details?: unknown;
  error?: string;
};

async function timeoutOldJobs(supabase: any, syncType: string, maxAgeMinutes = 30) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("sync_logs")
    .update({
      status: "completed_timeout",
      completed_at: new Date().toISOString(),
      error_message: "Timeout automático após execução prolongada",
    })
    .eq("status", "running")
    .eq("sync_type", syncType)
    .lt("started_at", cutoff);

  if (error) console.warn("Failed to timeout old jobs:", error);
}

async function checkConcurrency(
  supabase: any,
  syncType: string,
): Promise<{ canProceed: boolean; runningJob?: { id: string; started_at: string } }> {
  const { data, error } = await supabase
    .from("sync_logs")
    .select("id, started_at")
    .eq("sync_type", syncType)
    .eq("status", "running")
    .limit(1);

  if (error) {
    console.warn("Concurrency check failed, allowing run:", error);
    return { canProceed: true };
  }

  if (data && data.length > 0) return { canProceed: false, runningJob: data[0] };
  return { canProceed: true };
}

async function ensureAdminAndGetUserId(params: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  authHeader: string;
}) {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey, authHeader } = params;

  const token = authHeader.replace("Bearer ", "");
  const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claimsData, error: claimsError } = await authedClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return { ok: false as const, error: "Unauthorized - invalid token" };
  }

  const userId = claimsData.claims.sub;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminRole) {
    return { ok: false as const, error: "Forbidden - admin access required" };
  }

  return { ok: true as const, userId, authedClient, supabase };
}

async function startAllFixes(args: {
  supabase: any;
  invoker: any;
  logId: string;
  options: {
    ptTitlesBatchSize: number;
    dreUrlLimit: number;
    autoCategorizeLimit: number;
    euTitlesLimit: number;
    requirementsBatchSize: number;
    requirementsMaxBatches: number;
    requirementsOrigin?: "PT" | "EU" | "all";
  };
}) {
  const { supabase, invoker, logId, options } = args;

  const startedAt = Date.now();

  const updateLog = async (patch: Record<string, unknown>) => {
    await supabase.from("sync_logs").update(patch).eq("id", logId);
  };

  await updateLog({
    status: "running",
    items_processed: 0,
    items_added: 0,
    items_updated: 0,
  });

  const results: StartResult[] = [];

  // 1) Fix PT titles via reimport (fastest path, uses Firecrawl internally)
  try {
    const { data: ptLeg, error: ptLegError } = await supabase
      .from("legislation")
      .select("id, number, title, document_url")
      .or("origin.eq.PT,origin.eq.dre")
      .not("document_url", "is", null)
      .like("document_url", "%/dr/detalhe/%")
      .limit(500);

    if (ptLegError) throw ptLegError;

    const genericPattern = /^(Decreto-Lei|Lei|Portaria|Despacho|Resolução|Declaração|Acórdão|Aviso|Parecer)\s+n\.?º?\s/i;
    const toFix = (ptLeg || []).filter((leg: any) => {
      const titleEqualsNumber = leg.title === leg.number;
      const hasGenericPattern = genericPattern.test(leg.title || "") &&
        (leg.title?.length || 0) < 80 &&
        !leg.title?.includes(" - ");
      return titleEqualsNumber || hasGenericPattern || !leg.title;
    });

    const ids = toFix.slice(0, 500).map((l: any) => l.id);

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < ids.length; i += options.ptTitlesBatchSize) {
      const batch = ids.slice(i, i + options.ptTitlesBatchSize);
      if (batch.length === 0) continue;

      const { data, error } = await supabase.functions.invoke("reimport-dre-metadata", {
        body: { legislationIds: batch },
      });

      if (error) {
        fail += batch.length;
        console.error("reimport-dre-metadata error:", error);
        continue;
      }

      ok += data?.updated || 0;
    }

    results.push({
      ok: true,
      name: "fix-pt-titles",
      details: { updated: ok, attempted: ids.length, failed: fail },
    });
  } catch (e) {
    results.push({ ok: false, name: "fix-pt-titles", error: e instanceof Error ? e.message : String(e) });
  }

  // 2) Fix EU titles (bigger pass)
  try {
    const { data, error } = await supabase.functions.invoke("fix-eurlex-titles", {
      body: { limit: options.euTitlesLimit, dryRun: false },
    });
    if (error) throw error;
    results.push({ ok: true, name: "fix-eu-titles", details: data?.summary || data });
  } catch (e) {
    results.push({ ok: false, name: "fix-eu-titles", error: e instanceof Error ? e.message : String(e) });
  }

  // 3) Auto-categorize (background, so it can go long)
  try {
    const { data, error } = await supabase.functions.invoke("auto-categorize-legislation", {
      body: { limit: options.autoCategorizeLimit, background: true },
    });
    if (error) throw error;
    results.push({ ok: true, name: "auto-categorize", details: data });
  } catch (e) {
    results.push({ ok: false, name: "auto-categorize", error: e instanceof Error ? e.message : String(e) });
  }

  // 4) Find missing DRE URLs (background)
  try {
    const { data, error } = await supabase.functions.invoke("find-missing-dre-urls", {
      body: { limit: options.dreUrlLimit, background: true, dryRun: false },
    });
    if (error) throw error;
    results.push({ ok: true, name: "find-missing-dre-urls", details: data });
  } catch (e) {
    results.push({ ok: false, name: "find-missing-dre-urls", error: e instanceof Error ? e.message : String(e) });
  }

  // 5) Extract requirements (background, authenticated)
  try {
    const origin = options.requirementsOrigin && options.requirementsOrigin !== "all"
      ? options.requirementsOrigin
      : undefined;

    const { data, error } = await invoker.functions.invoke("extract-requirements-background", {
      body: {
        batchSize: options.requirementsBatchSize,
        maxBatches: options.requirementsMaxBatches,
        origin,
      },
    });

    if (error) throw error;
    results.push({ ok: true, name: "extract-requirements", details: data });
  } catch (e) {
    results.push({ ok: false, name: "extract-requirements", error: e instanceof Error ? e.message : String(e) });
  }

  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);

  const startedOk = results.filter((r) => r.ok).length;
  const startedFail = results.filter((r) => !r.ok).length;

  await updateLog({
    status: startedFail > 0 ? "completed_with_errors" : "completed",
    completed_at: new Date().toISOString(),
    items_processed: startedOk + startedFail,
    items_added: startedOk,
    items_updated: startedFail,
    error_message: JSON.stringify({ durationSeconds, results }).slice(0, 2000),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SYNC_TYPE = "full-data-fix";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized - missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsedBody = await req.json().catch(() => ({}));

    const admin = await ensureAdminAndGetUserId({
      supabaseUrl,
      supabaseAnonKey,
      supabaseServiceKey,
      authHeader,
    });

    if (!admin.ok) {
      return new Response(
        JSON.stringify({ success: false, error: admin.error }),
        { status: admin.error.startsWith("Forbidden") ? 403 : 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { supabase, userId, authedClient } = admin;

    await timeoutOldJobs(supabase, SYNC_TYPE, 60);
    const { canProceed, runningJob } = await checkConcurrency(supabase, SYNC_TYPE);
    if (!canProceed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Já existe uma execução completa em curso",
          runningJobId: runningJob?.id,
          runningJobStartedAt: runningJob?.started_at,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const options = {
      ptTitlesBatchSize: Math.max(5, Math.min(200, Number(parsedBody?.ptTitlesBatchSize ?? 50))),
      dreUrlLimit: Math.max(0, Math.min(1000, Number(parsedBody?.dreUrlLimit ?? 200))),
      autoCategorizeLimit: Math.max(0, Math.min(5000, Number(parsedBody?.autoCategorizeLimit ?? 2000))),
      euTitlesLimit: Math.max(0, Math.min(5000, Number(parsedBody?.euTitlesLimit ?? 1000))),
      requirementsBatchSize: Math.max(1, Math.min(200, Number(parsedBody?.requirementsBatchSize ?? 50))),
      requirementsMaxBatches: Math.max(1, Math.min(200, Number(parsedBody?.requirementsMaxBatches ?? 30))),
      requirementsOrigin: (parsedBody?.requirementsOrigin as "PT" | "EU" | "all" | undefined) ?? "all",
    };

    const { data: logEntry, error: logError } = await supabase
      .from("sync_logs")
      .insert({
        sync_type: SYNC_TYPE,
        status: "running",
        created_by: userId,
        started_at: new Date().toISOString(),
        items_processed: 0,
        items_added: 0,
        items_updated: 0,
      })
      .select("id")
      .single();

    if (logError) throw logError;

    const logId = logEntry.id;

    const backgroundTask = startAllFixes({
      supabase,
      invoker: authedClient,
      logId,
      options,
    });

    if (EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(backgroundTask);
    } else {
      backgroundTask.catch((e) => console.error("Background full fix failed:", e));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Correção completa iniciada. Pode fechar esta janela.",
        jobId: logId,
        syncType: SYNC_TYPE,
        options,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("full-data-fix error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
