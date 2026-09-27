"use server";

import { allValues, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { isValidDate } from "@/lib/dates";
import { SKILLS } from "@/lib/labels";

export async function saveAssessmentAction(studentId: string, assessmentId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const date = str(fd, "assessed_on");
  if (!isValidDate(date)) return { ok: false, fieldErrors: { assessed_on: "Data inválida." }, values };
  const scores: Record<string, { score: number | null; comment: string | null }> = {};
  for (const sk of SKILLS) {
    const raw = str(fd, `score_${sk.key}`);
    const n = raw === "" ? null : Number(raw);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 5)) return { ok: false, fieldErrors: { [`score_${sk.key}`]: "Nota de 1 a 5." }, values };
    scores[sk.key] = { score: n, comment: str(fd, `comment_${sk.key}`) || null };
  }
  const saved = await runRpc<string>("coach", "save_assessment", {
    p_assessment_id: assessmentId, p_student_id: studentId,
    p_payload: { assessed_on: date, summary: str(fd, "summary") || null, private_note: str(fd, "private_note"), scores },
  }, { values });
  if (!saved.ok) return saved;
  if (str(fd, "intent") === "publish") {
    const pub = await runRpc("coach", "publish_assessment", { p_assessment_id: saved.data }, { values });
    if (!pub.ok) return { ...pub, redirectTo: undefined };
    return { ok: true, message: "Avaliação publicada.", redirectTo: `/professor/alunos/${studentId}?aba=evolucao` };
  }
  return { ok: true, message: "Rascunho salvo.", redirectTo: assessmentId ? undefined : `/professor/alunos/${studentId}/avaliacoes/${saved.data}` };
}

export async function deleteDraftAction(studentId: string, assessmentId: string, _: ActionState): Promise<ActionState> {
  return runRpc("coach", "delete_assessment_draft", { p_assessment_id: assessmentId },
    { success: "Rascunho apagado.", redirectTo: `/professor/alunos/${studentId}?aba=evolucao` });
}
