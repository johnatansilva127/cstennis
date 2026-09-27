"use server";

import { allValues, opt, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { isValidDate, isValidTime } from "@/lib/dates";

function seriesPayload(fd: FormData, errors: Record<string, string>) {
  const weekday = Number(str(fd, "weekday"));
  const start = str(fd, "start_time");
  const duration = Number(str(fd, "duration_minutes"));
  const format = str(fd, "format");
  const capacity = Number(str(fd, "capacity") || "0");
  const buffer = str(fd, "travel_buffer_minutes");
  if (!(weekday >= 1 && weekday <= 7)) errors.weekday = "Escolha o dia.";
  if (!isValidTime(start)) errors.start_time = "Horário inválido.";
  if (!(duration >= 15 && duration <= 300)) errors.duration_minutes = "Entre 15 e 300 minutos.";
  if (!["individual", "double", "group"].includes(format)) errors.format = "Escolha o formato.";
  if (format === "group" && !(capacity >= 2 && capacity <= 40)) errors.capacity = "Turmas: 2 a 40 alunos.";
  if (!str(fd, "location_id")) errors.location_id = "Escolha o local.";
  return {
    weekday, start_time: start, duration_minutes: duration, format, capacity: format === "group" ? capacity : undefined,
    location_id: str(fd, "location_id"), court_id: opt(fd, "court_id"),
    travel_buffer_minutes: buffer === "" ? undefined : Number(buffer), level: opt(fd, "level"), title: opt(fd, "title"),
  };
}

export async function createSeriesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const errors: Record<string, string> = {};
  const payload = seriesPayload(fd, errors);
  const from = str(fd, "valid_from");
  const until = opt(fd, "valid_until");
  if (!isValidDate(from)) errors.valid_from = "Data inválida.";
  if (until && !isValidDate(until)) errors.valid_until = "Data inválida.";
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, values, message: "Revise os campos." };
  return runRpc<string>("coach", "create_series", { p_payload: { ...payload, valid_from: from, valid_until: until } },
    { values, success: "Horário criado.", redirectTo: (id) => `/professor/agenda/horarios/${id}` });
}

export async function previewSeriesAction(seriesId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const errors: Record<string, string> = {};
  const payload = seriesPayload(fd, errors);
  const effective = str(fd, "effective_date");
  if (!isValidDate(effective)) errors.effective_date = "Data inválida.";
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, values };
  if (str(fd, "intent") === "apply") {
    return runRpc<string>("coach", "update_series_from", { p_series_id: seriesId, p_effective_date: effective, p_payload: payload },
      { values, success: "Horário atualizado. Aulas passadas foram preservadas.", redirectTo: (id) => `/professor/agenda/horarios/${id}` });
  }
  const res = await runRpc("coach", "preview_series_change", { p_series_id: seriesId, p_effective_date: effective, p_payload: payload }, { values });
  return { ...res, values, message: undefined };
}

export async function endSeriesAction(seriesId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const last = str(fd, "last_date");
  if (!isValidDate(last)) return { ok: false, fieldErrors: { last_date: "Data inválida." }, values };
  if (str(fd, "reason").length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo." }, values };
  return runRpc("coach", "end_series", { p_series_id: seriesId, p_last_date: last, p_reason: str(fd, "reason") },
    { values, success: "Horário encerrado." });
}

export async function unavailabilityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const a = str(fd, "starts_on");
  const b = str(fd, "ends_on") || a;
  if (!isValidDate(a) || !isValidDate(b)) return { ok: false, fieldErrors: { starts_on: "Datas inválidas." }, values };
  if (str(fd, "reason").length < 2) return { ok: false, fieldErrors: { reason: "Informe o motivo." }, values };
  return runRpc("coach", "create_unavailability", { p_starts_on: a, p_ends_on: b, p_location_id: opt(fd, "location_id"), p_reason: str(fd, "reason") },
    { values, success: "Indisponibilidade registrada. As aulas afetadas foram canceladas e os alunos avisados." });
}

export async function saveAttendanceAction(occurrenceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const marks = fd.getAll("student_id").map((id) => ({ student_id: String(id), status: str(fd, `status_${id}`) || null }));
  return runRpc("coach", "save_attendance", { p_occurrence_id: occurrenceId, p_marks: marks },
    { values: allValues(fd), success: "Chamada salva." });
}

export async function updateOccurrenceAction(occurrenceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const date = str(fd, "local_date");
  const start = str(fd, "start_time");
  if (!isValidDate(date)) return { ok: false, fieldErrors: { local_date: "Data inválida." }, values };
  if (!isValidTime(start)) return { ok: false, fieldErrors: { start_time: "Horário inválido." }, values };
  return runRpc("coach", "update_occurrence", {
    p_occurrence_id: occurrenceId,
    p_payload: {
      local_date: date, start_time: start, duration_minutes: Number(str(fd, "duration_minutes")),
      location_id: str(fd, "location_id"), court_id: str(fd, "court_id"), note: opt(fd, "note"),
    },
  }, { values, success: "Aula remarcada. Os alunos foram avisados." });
}

export async function cancelOccurrenceAction(occurrenceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "reason").length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo." }, values: allValues(fd) };
  return runRpc("coach", "cancel_occurrence", { p_occurrence_id: occurrenceId, p_reason: str(fd, "reason") },
    { success: "Aula cancelada. Os alunos foram avisados; não há crédito ou reposição automática." });
}

export async function restoreOccurrenceAction(occurrenceId: string, _: ActionState): Promise<ActionState> {
  return runRpc("coach", "restore_occurrence", { p_occurrence_id: occurrenceId }, { success: "Aula reativada." });
}

export async function decideRequestAction(requestId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const approve = str(fd, "intent") === "approve";
  const from = opt(fd, "valid_from");
  if (from && !isValidDate(from)) return { ok: false, fieldErrors: { valid_from: "Data inválida." }, values };
  if (!approve && str(fd, "reason").length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo da recusa (o aluno verá)." }, values };
  return runRpc("coach", "decide_enrollment_request", {
    p_request_id: requestId, p_approve: approve, p_reason: opt(fd, "reason"), p_valid_from: from,
    p_override_restriction: fd.get("override") === "on",
  }, { values, success: approve ? "Pedido aprovado e vaga confirmada." : "Pedido recusado." });
}
