"use server";

import { getSupabase } from "@/lib/auth";
import type { ActionState } from "@/lib/errors";
import { passwordProblem } from "@/lib/password";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function setPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await getSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, message: "Link expirado. Solicite um novo.", redirectTo: "/recuperar-senha?erro=link" };
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) return { ok: false, fieldErrors: { password: problem } };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const msg = /weak|pwned|short/i.test(error.message)
      ? "Senha fraca ou já exposta em vazamentos. Escolha outra."
      : /same/i.test(error.message)
        ? "A nova senha precisa ser diferente da atual."
        : "Não foi possível atualizar a senha. Solicite um novo link.";
    return { ok: false, fieldErrors: { password: msg } };
  }
  // Conta criada por convite passa a ter senha própria.
  await createSupabaseAdminClient().auth.admin.updateUserById(claims.claims.sub, { app_metadata: { needs_password: false } });
  // Encerra outras sessões abertas desta conta.
  await supabase.auth.signOut({ scope: "others" });
  const { data: ctx } = await supabase.rpc("my_context");
  const isCoach = (ctx as { is_coach?: boolean } | null)?.is_coach;
  return { ok: true, message: "Senha atualizada.", redirectTo: isCoach ? "/mfa" : "/app" };
}
