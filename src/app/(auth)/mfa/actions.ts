"use server";

import { getSupabase } from "@/lib/auth";
import type { ActionState } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-redirect";

const CODE_RE = /^\d{6}$/;

async function sessionUser() {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub as string | undefined };
}

export async function startEnrollAction(): Promise<ActionState<{ factorId: string; qr: string; secret: string }>> {
  const { supabase, userId } = await sessionUser();
  if (!userId) return { ok: false, message: "Sessão expirada. Entre novamente.", redirectTo: "/entrar" };
  if (!(await rateLimit("mfa:enroll", userId, 10, 3600))) return { ok: false, message: "Muitas tentativas. Aguarde e tente novamente." };
  // Remove fatores não verificados deixados por tentativas anteriores.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Autenticador ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { ok: false, message: "Não foi possível iniciar a configuração. Tente novamente." };
  return { ok: true, data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } };
}

export async function verifyMfaAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, userId } = await sessionUser();
  if (!userId) return { ok: false, message: "Sessão expirada. Entre novamente.", redirectTo: "/entrar" };
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!CODE_RE.test(code)) return { ok: false, fieldErrors: { code: "Digite os 6 números do aplicativo autenticador." } };
  if (!(await rateLimit("mfa:verify", userId, 10, 300))) {
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };
  }
  let factorId = String(formData.get("factorId") ?? "");
  if (!factorId) {
    const { data } = await supabase.auth.mfa.listFactors();
    factorId = data?.totp?.[0]?.id ?? "";
  }
  if (!factorId) return { ok: false, message: "Nenhum autenticador configurado." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, fieldErrors: { code: "Código inválido ou expirado. Confira o horário do celular e tente de novo." } };
  const next = safeNext(String(formData.get("next") ?? ""), "/professor");
  return { ok: true, redirectTo: next };
}
