"use server";

import { opt, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";

export async function privacyRequestAction(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const kind = str(fd, "kind");
  if (!["access", "correction", "export", "deletion"].includes(kind)) return { ok: false, fieldErrors: { kind: "Escolha o tipo." } };
  return runRpc("participant", "create_privacy_request", { p_student_id: studentId, p_kind: kind, p_details: opt(fd, "details") },
    { success: "Solicitação registrada. O professor responderá pelos canais de contato." });
}
