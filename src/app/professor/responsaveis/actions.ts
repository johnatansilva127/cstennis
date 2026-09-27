"use server";

import { allValues, opt, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";

export async function createGuardianAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  if (str(fd, "full_name").length < 2) return { ok: false, fieldErrors: { full_name: "Informe o nome." }, values };
  if (!opt(fd, "email") && !opt(fd, "phone")) return { ok: false, fieldErrors: { email: "Informe e-mail ou telefone." }, values };
  return runRpc<string>("coach", "create_guardian", {
    p_payload: { full_name: str(fd, "full_name"), email: opt(fd, "email")?.toLowerCase() ?? null, phone: opt(fd, "phone") },
  }, { values, success: "Responsável cadastrado.", redirectTo: (id) => `/professor/responsaveis/${id}` });
}

export async function updateGuardianAction(guardianId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  if (!opt(fd, "email") && !opt(fd, "phone")) return { ok: false, fieldErrors: { email: "Informe e-mail ou telefone." }, values };
  return runRpc("coach", "update_guardian", {
    p_guardian_id: guardianId, p_payload: { full_name: str(fd, "full_name"), email: opt(fd, "email")?.toLowerCase() ?? null, phone: opt(fd, "phone") },
  }, { values, success: "Responsável atualizado." });
}

export async function linkChildAction(guardianId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!str(fd, "student_id")) return { ok: false, fieldErrors: { student_id: "Escolha a criança." } };
  return runRpc("coach", "link_guardian_student", { p_guardian_id: guardianId, p_student_id: str(fd, "student_id"), p_relationship: opt(fd, "relationship") },
    { success: "Criança vinculada." });
}
