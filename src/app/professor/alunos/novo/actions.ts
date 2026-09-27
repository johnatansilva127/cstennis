"use server";

import { allValues, opt, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { parseBRLToCents } from "@/lib/money";
import { isValidDate } from "@/lib/dates";

type Created = { student_id: string; guardian_id: string | null; invitation: { token: string; expires_at: string } | null };

export async function createStudentAction(_: ActionState, fd: FormData): Promise<ActionState<Created>> {
  const values = allValues(fd);
  const errors: Record<string, string> = {};
  const kind = str(fd, "kind");
  if (kind !== "adult" && kind !== "child") errors.kind = "Escolha adulto ou criança.";
  const fullName = str(fd, "full_name");
  if (fullName.length < 2) errors.full_name = "Informe o nome completo.";
  const email = opt(fd, "email")?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "E-mail inválido.";
  const phone = opt(fd, "phone");
  if (kind === "adult" && !email && !phone) errors.email = "Informe e-mail ou telefone do aluno.";
  const invite = fd.get("invite") === "on";
  if (invite && kind === "adult" && !email) errors.email = "O convite precisa do e-mail do aluno.";

  const payload: Record<string, unknown> = {
    full_name: fullName, kind, email, phone, level: opt(fd, "level"), private_note: opt(fd, "private_note"), invite,
  };

  if (kind === "child") {
    const mode = str(fd, "guardian_mode");
    if (mode === "existing") {
      const id = str(fd, "guardian_id");
      if (!id) errors.guardian_id = "Escolha o responsável.";
      payload.guardian = { id };
    } else {
      const gName = str(fd, "guardian_full_name");
      const gEmail = opt(fd, "guardian_email")?.toLowerCase() ?? null;
      const gPhone = opt(fd, "guardian_phone");
      if (gName.length < 2) errors.guardian_full_name = "Informe o nome do responsável.";
      if (gEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(gEmail)) errors.guardian_email = "E-mail inválido.";
      if (!gEmail && !gPhone) errors.guardian_email = "Informe e-mail ou telefone do responsável.";
      if (invite && !gEmail) errors.guardian_email = "O convite precisa do e-mail do responsável.";
      payload.guardian = { full_name: gName, email: gEmail, phone: gPhone, relationship: opt(fd, "guardian_relationship") };
    }
  }

  const amount = opt(fd, "tuition_amount");
  if (amount) {
    const cents = parseBRLToCents(amount);
    const dueDay = Number(str(fd, "tuition_due_day"));
    const month = str(fd, "tuition_start_month");
    if (!cents) errors.tuition_amount = "Valor inválido (ex.: 250,00).";
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) errors.tuition_due_day = "Dia entre 1 e 31.";
    if (!/^\d{4}-\d{2}$/.test(month)) errors.tuition_start_month = "Escolha o mês inicial.";
    payload.tuition = { amount_cents: cents, due_day: dueDay, starts_month: `${month}-01` };
  }

  const seriesIds = fd.getAll("series_ids").map(String).filter(Boolean);
  const enrollFrom = opt(fd, "enroll_from");
  if (seriesIds.length && enrollFrom && !isValidDate(enrollFrom)) errors.enroll_from = "Data inválida.";
  if (seriesIds.length) payload.enrollments = seriesIds.map((id) => ({ series_id: id, valid_from: enrollFrom }));

  if (Object.keys(errors).length) {
    return { ok: false, fieldErrors: errors, values, message: "Revise os campos destacados." };
  }
  return runRpc<Created>("coach", "create_student", { p_payload: payload }, { values, success: "Aluno cadastrado." });
}
