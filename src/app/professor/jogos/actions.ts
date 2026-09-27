"use server";

import { runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";

export async function addCommentAction(matchId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!str(fd, "body")) return { ok: false, fieldErrors: { body: "Escreva o comentário." } };
  return runRpc("coach", "add_match_comment", { p_match_id: matchId, p_body: str(fd, "body") }, { success: "Comentário publicado. O aluno foi avisado." });
}

export async function editCommentAction(commentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (!str(fd, "body")) return { ok: false, fieldErrors: { body: "Escreva o comentário." } };
  return runRpc("coach", "update_match_comment", { p_comment_id: commentId, p_body: str(fd, "body") }, { success: "Comentário atualizado." });
}
