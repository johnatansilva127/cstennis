"use server";

import { cookies } from "next/headers";
import { actionAuth, isAuthed } from "@/lib/auth";
import { allValues, str } from "@/lib/actions";
import { fromDbError, type ActionState } from "@/lib/errors";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { sessionCookieOptions } from "@/lib/supabase/cookies";
import { passwordProblem } from "@/lib/password";

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await actionAuth("any");
  if (!isAuthed(auth)) return auth;
  const theme = parseTheme(str(fd, "theme"));
  const name = str(fd, "full_name");
  if (name.length > 120) return { ok: false, fieldErrors: { full_name: "Nome muito longo." }, values: allValues(fd) };
  const { error } = await auth.supabase.rpc("update_my_profile", { p_full_name: name, p_theme: theme });
  if (error) return fromDbError(error, allValues(fd));
  (await cookies()).set(THEME_COOKIE, theme, { ...sessionCookieOptions(), maxAge: 60 * 60 * 24 * 365 });
  return { ok: true, message: "Preferências salvas." };
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const auth = await actionAuth("any");
  if (!isAuthed(auth)) return auth;
  const password = str(fd, "password");
  const problem = passwordProblem(password, str(fd, "confirm"));
  if (problem) return { ok: false, fieldErrors: { password: problem } };
  const { error } = await auth.supabase.auth.updateUser({ password });
  if (error) {
    if (/reauth/i.test(error.message)) {
      return { ok: false, message: "Por segurança, a troca de senha exige login recente. Saia e entre novamente, ou use “Esqueci a senha”." };
    }
    return { ok: false, fieldErrors: { password: /weak|pwned/i.test(error.message) ? "Senha fraca. Escolha outra." : "Não foi possível trocar a senha." } };
  }
  await auth.supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Senha alterada. Outras sessões abertas foram encerradas." };
}

export async function signOutOthersAction(_: ActionState): Promise<ActionState> {
  const auth = await actionAuth("any");
  if (!isAuthed(auth)) return auth;
  await auth.supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Outras sessões foram encerradas." };
}
