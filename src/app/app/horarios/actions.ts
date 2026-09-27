"use server";

import { allValues, opt, runRpc } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { isValidDate } from "@/lib/dates";

export async function requestSlotAction(studentId: string, seriesId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const start = opt(fd, "desired_start");
  if (start && !isValidDate(start)) return { ok: false, fieldErrors: { desired_start: "Data inválida." }, values };
  return runRpc("participant", "request_enrollment", {
    p_student_id: studentId, p_series_id: seriesId, p_desired_start: start, p_message: opt(fd, "message"),
  }, { values, success: "Pedido enviado! O professor vai analisar; a vaga só é garantida após a aprovação." });
}

export async function cancelRequestAction(requestId: string, _: ActionState): Promise<ActionState> {
  return runRpc("participant", "cancel_enrollment_request", { p_request_id: requestId }, { success: "Pedido cancelado." });
}

