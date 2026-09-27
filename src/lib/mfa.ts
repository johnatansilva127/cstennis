import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionState } from "@/lib/errors";

/**
 * Step-up: confirma um código TOTP novo antes de ações sensíveis (troca de
 * Pix, estorno, exportação, anonimização). Renova o carimbo `amr` exigido pelo banco.
 */
export async function stepUpWithCode(supabase: SupabaseClient, code: string): Promise<ActionState | null> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return { ok: false, fieldErrors: { mfa_code: "Digite o código de 6 dígitos do autenticador." } };
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp?.[0];
  if (!factor) return { ok: false, message: "Nenhum autenticador configurado." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: clean });
  if (error) return { ok: false, fieldErrors: { mfa_code: "Código inválido ou expirado." } };
  return null;
}
