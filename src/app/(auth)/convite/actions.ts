"use server";

import { cookies } from "next/headers";
import { getSupabase } from "@/lib/auth";
import type { ActionState } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient, createSupabaseAnonClient } from "@/lib/supabase/admin";
import { THEME_COOKIE } from "@/lib/theme";
import { sessionCookieOptions } from "@/lib/supabase/cookies";

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

export type InvitePreview = {
  status: "valid" | "invalid" | "expired" | "used" | "revoked" | "locked" | "rate_limited";
  kind?: "student" | "guardian";
  organization_name?: string;
  masked_email?: string;
  expires_at?: string;
  session?: { signedIn: boolean; matches: boolean; email?: string };
};

export async function previewInviteAction(token: string): Promise<InvitePreview> {
  if (!TOKEN_RE.test(token)) return { status: "invalid" };
  if (!(await rateLimit("invite:preview", await clientIp(), 60, 600))) return { status: "rate_limited" };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("invitation_preview", { p_token: token });
  if (error || !data) return { status: "invalid" };
  const preview = data as InvitePreview;
  const supabase = await getSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.sub) {
    const { data: email } = await admin.rpc("invitation_email", { p_token: token });
    const userEmail = String(claims.claims.email ?? "").toLowerCase();
    preview.session = { signedIn: true, matches: !!email && email === userEmail, email: userEmail };
  } else {
    preview.session = { signedIn: false, matches: false };
  }
  return preview;
}

export async function sendInviteCodeAction(token: string): Promise<ActionState> {
  const generic: ActionState = { ok: true, message: "Enviamos um código de 6 dígitos para o e-mail do convite. Ele expira em 15 minutos." };
  if (!TOKEN_RE.test(token)) return { ok: false, message: "Convite inválido." };
  const ip = await clientIp();
  if (!(await rateLimit("invite:code:ip", ip, 10, 3600)) || !(await rateLimit("invite:code:token", token, 5, 3600))) {
    return { ok: false, message: "Muitos envios. Aguarde alguns minutos antes de pedir outro código." };
  }
  const admin = createSupabaseAdminClient();
  const { data: email, error } = await admin.rpc("invitation_email_for_code", { p_token: token });
  if (error) return { ok: false, message: error.code?.startsWith("CS") ? error.message : "Não foi possível enviar o código." };
  if (!email) return { ok: false, message: "Este convite não está mais válido." };
  // Conta sem senha e já confirmada: só é acessível pelo código enviado ao
  // próprio e-mail (prova de posse). Se já existir, é reutilizada.
  await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { needs_password: true } });
  const anon = createSupabaseAnonClient();
  const { error: otpError } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (otpError) {
    return { ok: false, message: "Não foi possível enviar o código agora. Aguarde um minuto e tente de novo." };
  }
  return generic;
}

const ACCEPT_MESSAGES: Record<string, string> = {
  invalid: "Convite inválido.",
  expired: "Este convite expirou. Peça um novo link ao professor.",
  revoked: "Este convite foi cancelado. Peça um novo link ao professor.",
  used: "Este convite já foi utilizado.",
  locked: "Este convite foi bloqueado por tentativas incorretas. Peça um novo link ao professor.",
  wrong_recipient: "Este convite foi enviado para outro e-mail.",
  target_already_linked: "Este cadastro já tem uma conta de acesso. Fale com o professor.",
  user_already_student: "Sua conta já está vinculada a outro cadastro de aluno. Fale com o professor.",
  user_already_guardian: "Sua conta já está vinculada a outro cadastro de responsável. Fale com o professor.",
  coach_account: "A conta do professor não pode aceitar convites de aluno.",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos.",
  not_authenticated: "Sessão expirada. Tente novamente.",
};

async function acceptWithSession(token: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { ok: false, message: "Não foi possível aceitar o convite." };
  const result = data as { ok: boolean; code: string };
  if (!result.ok) return { ok: false, message: ACCEPT_MESSAGES[result.code] ?? "Não foi possível aceitar o convite." };
  const { data: user } = await supabase.auth.getUser();
  (await cookies()).set(THEME_COOKIE, "system", { ...sessionCookieOptions(), maxAge: 60 * 60 * 24 * 365 });
  const needsPassword = user.user?.app_metadata?.needs_password === true;
  return { ok: true, message: "Convite aceito!", redirectTo: needsPassword ? "/definir-senha" : "/app" };
}

export async function verifyInviteCodeAction(token: string, code: string): Promise<ActionState> {
  if (!TOKEN_RE.test(token)) return { ok: false, message: "Convite inválido." };
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return { ok: false, fieldErrors: { code: "Digite os 6 números recebidos por e-mail." } };
  if (!(await rateLimit("invite:verify", token, 10, 900))) {
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const admin = createSupabaseAdminClient();
  const { data: email } = await admin.rpc("invitation_email", { p_token: token });
  if (!email) return { ok: false, message: "Este convite não está mais válido." };
  const supabase = await getSupabase();
  const { error } = await supabase.auth.verifyOtp({ email, token: clean, type: "email" });
  if (error) return { ok: false, fieldErrors: { code: "Código inválido ou expirado." } };
  return acceptWithSession(token);
}

export async function acceptInviteSignedInAction(token: string): Promise<ActionState> {
  if (!TOKEN_RE.test(token)) return { ok: false, message: "Convite inválido." };
  return acceptWithSession(token);
}

export async function signOutForInviteAction(): Promise<ActionState> {
  const supabase = await getSupabase();
  await supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}
