import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/errors";

export type StudentSummary = {
  id: string;
  full_name: string;
  kind: "adult" | "child";
  status: "active" | "paused" | "archived";
  relation: "student" | "guardian" | null;
  restriction: "none" | "warn" | "block_requests" | "restrict_modules";
};

export type UserContext = {
  user_id: string;
  email: string;
  full_name: string;
  theme: "system" | "light" | "dark";
  aal: "aal1" | "aal2";
  is_coach: boolean;
  organizations: { id: string; name: string; role: "coach" | "participant"; timezone: string }[];
  students: StudentSummary[];
};

export const getSupabase = cache(async () => createSupabaseServerClient());

/** Claims verificados do JWT (assinatura validada pelo Supabase Auth). */
export const getClaims = cache(async () => {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims as { sub: string; aal?: string; email?: string; session_id?: string };
});

export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const claims = await getClaims();
  if (!claims) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("my_context");
  if (error || !data) return null;
  return data as UserContext;
});

export async function requireCoach() {
  const ctx = await getUserContext();
  if (!ctx) redirect("/entrar");
  // Aluno/responsável na área do professor volta ao app (sem vínculo, o app leva a /acesso-negado).
  if (!ctx.is_coach) redirect("/app");
  const org = ctx.organizations.find((o) => o.role === "coach");
  if (!org) redirect("/acesso-negado");
  return { supabase: await getSupabase(), ctx, org };
}

export async function requireParticipant() {
  const ctx = await getUserContext();
  if (!ctx) redirect("/entrar");
  if (ctx.is_coach) redirect("/professor");
  if (ctx.students.length === 0) redirect("/acesso-negado");
  return { supabase: await getSupabase(), ctx };
}

export const STUDENT_COOKIE = "cs-aluno";

/** Aluno selecionado (contexto) — sempre validado contra os vínculos atuais. */
export async function currentStudent(ctx: UserContext): Promise<StudentSummary> {
  const store = await cookies();
  const selected = store.get(STUDENT_COOKIE)?.value;
  return ctx.students.find((s) => s.id === selected) ?? ctx.students[0];
}

type AuthedAction = { supabase: Awaited<ReturnType<typeof getSupabase>>; ctx: UserContext };

/** Para Server Actions: retorna estado de erro em vez de redirecionar. */
export async function actionAuth(kind: "coach" | "participant" | "any"): Promise<AuthedAction | ActionState> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, message: "Sessão expirada. Entre novamente.", redirectTo: "/entrar" };
  if (kind === "coach" && !ctx.is_coach) {
    return { ok: false, message: "Acesso restrito ao professor." };
  }
  if (kind === "participant" && ctx.is_coach) {
    return { ok: false, message: "Ação disponível apenas para alunos e responsáveis." };
  }
  return { supabase: await getSupabase(), ctx };
}

export function isAuthed(x: AuthedAction | ActionState): x is AuthedAction {
  return "supabase" in x;
}
