"use server";

import { cookies } from "next/headers";
import { getUserContext, STUDENT_COOKIE } from "@/lib/auth";
import { sessionCookieOptions } from "@/lib/supabase/cookies";
import type { ActionState } from "@/lib/errors";

/** Troca o aluno em contexto — somente para vínculos válidos da conta. */
export async function selectStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getUserContext();
  const id = String(fd.get("student_id") ?? "");
  if (!ctx || !ctx.students.some((s) => s.id === id)) return { ok: false, message: "Aluno inválido." };
  (await cookies()).set(STUDENT_COOKIE, id, { ...sessionCookieOptions(), maxAge: 60 * 60 * 24 * 180 });
  return { ok: true };
}
