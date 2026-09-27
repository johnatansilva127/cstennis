"use server";

import { z } from "zod";
import { env } from "@/lib/env";
import type { ActionState } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSupabaseAnonClient } from "@/lib/supabase/admin";

const DONE = "Se houver uma conta com este e-mail, enviaremos um link para redefinir a senha. O link expira em 15 minutos.";

export async function requestResetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.email().max(254).safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { ok: false, fieldErrors: { email: "Informe um e-mail válido." }, values: { email: String(formData.get("email") ?? "") } };
  const ip = await clientIp();
  if (!(await rateLimit("reset:ip", ip, 10, 3600)) || !(await rateLimit("reset:email", parsed.data, 3, 3600))) {
    // Mesma resposta para não revelar se a conta existe.
    return { ok: true, message: DONE };
  }
  const supabase = createSupabaseAnonClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${env().APP_URL}/auth/confirm` });
  return { ok: true, message: DONE };
}
