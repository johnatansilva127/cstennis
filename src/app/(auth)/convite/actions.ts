"use server";

import { cookies } from "next/headers";
import { getSupabase } from "@/lib/auth";
import { logServerError, type ActionState } from "@/lib/errors";
import { passwordProblem } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { THEME_COOKIE } from "@/lib/theme";
import { sessionCookieOptions } from "@/lib/supabase/cookies";

const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

export type InvitePreview = {
  status: "valid" | "invalid" | "expired" | "used" | "revoked" | "locked" | "rate_limited";
  kind?: "student" | "guardian";
  organization_name?: string;
  masked_email?: string;
  /** E-mail do convite (login); só quando o convite é válido. */
  email?: string;
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
  if (preview.status === "valid") {
    const { data: email } = await admin.rpc("invitation_email", { p_token: token });
    preview.email = email ?? undefined;
  }
  const supabase = await getSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims?.sub) {
    const userEmail = String(claims.claims.email ?? "").toLowerCase();
    preview.session = { signedIn: true, matches: !!preview.email && preview.email === userEmail, email: userEmail };
  } else {
    preview.session = { signedIn: false, matches: false };
  }
  return preview;
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
  (await cookies()).set(THEME_COOKIE, "system", { ...sessionCookieOptions(), maxAge: 60 * 60 * 24 * 365 });
  return { ok: true, message: "Convite aceito!", redirectTo: "/app" };
}

const INVITE_GONE: ActionState = { ok: false, message: "Este convite não está mais válido." };

async function signInAndAccept(token: string, email: string, password: string): Promise<ActionState> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, fieldErrors: { password: "Senha incorreta." } };
  return acceptWithSession(token);
}

/** Conta nova: o link secreto e de uso único é a prova do convite; a pessoa cria a senha aqui. */
export async function activateInviteAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!TOKEN_RE.test(token)) return { ok: false, message: "Convite inválido." };
  const password = String(fd.get("password") ?? "");
  const problem = passwordProblem(password, String(fd.get("confirm") ?? ""));
  if (problem) return { ok: false, fieldErrors: { password: problem } };
  if (!(await rateLimit("invite:activate:ip", await clientIp(), 20, 3600)) || !(await rateLimit("invite:activate", token, 10, 900))) {
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const admin = createSupabaseAdminClient();
  const { data: email } = await admin.rpc("invitation_email", { p_token: token });
  if (!email) return INVITE_GONE;
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error?.code === "email_exists") return { ok: true, data: { existingAccount: true } };
  if (error?.code === "weak_password") return { ok: false, fieldErrors: { password: "Senha fraca. Escolha outra." } };
  if (error) {
    logServerError("invite:activate", error);
    return { ok: false, message: "Não foi possível ativar o acesso agora. Tente de novo em instantes." };
  }
  return signInAndAccept(token, email, password);
}

/** E-mail que já tem conta: entra com a senha atual e aceita o convite. */
export async function loginAndAcceptInviteAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!TOKEN_RE.test(token)) return { ok: false, message: "Convite inválido." };
  const password = String(fd.get("password") ?? "");
  if (!password) return { ok: false, fieldErrors: { password: "Digite sua senha." } };
  if (!(await rateLimit("invite:login:ip", await clientIp(), 20, 3600)) || !(await rateLimit("invite:login", token, 5, 900))) {
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos." };
  }
  const { data: email } = await createSupabaseAdminClient().rpc("invitation_email", { p_token: token });
  if (!email) return INVITE_GONE;
  return signInAndAccept(token, email, password);
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
