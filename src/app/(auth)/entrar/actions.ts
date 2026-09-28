"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getSupabase } from "@/lib/auth";
import type { ActionState } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { THEME_COOKIE } from "@/lib/theme";
import { sessionCookieOptions } from "@/lib/supabase/cookies";
import { safeNext } from "@/lib/safe-redirect";

const schema = z.object({
  email: z.email("Informe um e-mail válido.").max(254),
  password: z.string().min(1, "Informe a senha.").max(200),
  next: z.string().optional(),
});

const GENERIC = "E-mail ou senha incorretos, ou conta sem acesso ativo.";

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { ok: false, fieldErrors, values };
  }
  const email = parsed.data.email.toLowerCase();
  const ip = await clientIp();
  const allowed = (await rateLimit("login:ip", ip, 30, 900)) && (await rateLimit("login:email", email, 10, 900));
  if (!allowed) {
    return { ok: false, values, message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }

  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) return { ok: false, values, message: GENERIC };

  const { data: ctx } = await supabase.rpc("my_context");
  const context = ctx as { is_coach: boolean; students: unknown[]; theme: string } | null;
  if (!context || (!context.is_coach && context.students.length === 0)) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, values, message: GENERIC };
  }
  (await cookies()).set(THEME_COOKIE, context.theme, { ...sessionCookieOptions(), maxAge: 60 * 60 * 24 * 365 });
  if (context.is_coach) return { ok: true, redirectTo: safeNext(parsed.data.next?.startsWith("/professor") ? parsed.data.next : undefined, "/professor") };
  return { ok: true, redirectTo: safeNext(parsed.data.next?.startsWith("/app") ? parsed.data.next : undefined, "/app") };
}
