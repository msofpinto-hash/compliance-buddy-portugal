import { supabase } from "@/integrations/supabase/client";

interface LogAiUsageParams {
  operation: string;
  model?: string;
  legislationId?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  autoApplied?: boolean;
  humanValidated?: boolean;
}

/**
 * Registo auditável de utilizações de IA
 * (Regulamento (UE) 2024/1689 — rastreabilidade e supervisão humana).
 * Falha em silêncio: nunca deve bloquear o fluxo do utilizador.
 */
export async function logAiUsage({
  operation,
  model,
  legislationId,
  inputSummary,
  outputSummary,
  autoApplied = false,
  humanValidated = false,
}: LogAiUsageParams) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;

    await supabase.from("ai_usage_log").insert({
      operation,
      model: model ?? "google/gemini-2.5-flash",
      legislation_id: legislationId ?? null,
      input_summary: inputSummary?.slice(0, 500) ?? null,
      output_summary: outputSummary?.slice(0, 1000) ?? null,
      auto_applied: autoApplied,
      human_validated: humanValidated,
      validated_by: humanValidated ? userId : null,
      validated_at: humanValidated ? new Date().toISOString() : null,
      triggered_by: userId,
    });
  } catch (e) {
    console.warn("logAiUsage failed", e);
  }
}
