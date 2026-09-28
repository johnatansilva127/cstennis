"use server";

import { allValues, opt, runRpc, str } from "@/lib/actions";
import { env } from "@/lib/env";
import { logServerError, type ActionState } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseBRLToCents } from "@/lib/money";
import { isValidDate, zonedLocalToIso } from "@/lib/dates";

export async function updateStudentAction(studentId: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  if (str(fd, "full_name").length < 2) return { ok: false, fieldErrors: { full_name: "Informe o nome." }, values };
  return runRpc("coach", "update_student", {
    p_student_id: studentId,
    p_payload: { full_name: str(fd, "full_name"), email: opt(fd, "email")?.toLowerCase() ?? null, phone: opt(fd, "phone"), level: opt(fd, "level") },
  }, { values, success: "Dados atualizados." });
}

export async function setPrivateNoteAction(studentId: string, _: ActionState, fd: FormData) {
  return runRpc("coach", "set_student_private_note", { p_student_id: studentId, p_note: str(fd, "note") },
    { values: allValues(fd), success: "Observação salva." });
}

export async function setStatusAction(studentId: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  const status = str(fd, "status");
  const date = str(fd, "effective_date");
  if (!["active", "paused", "archived"].includes(status)) return { ok: false, fieldErrors: { status: "Escolha a situação." }, values };
  if (!isValidDate(date)) return { ok: false, fieldErrors: { effective_date: "Data inválida." }, values };
  return runRpc("coach", "set_student_status", {
    p_student_id: studentId, p_status: status, p_effective_date: date, p_reason: opt(fd, "reason"),
    p_end_enrollments: status === "active" ? false : fd.get("end_enrollments") === "on",
  }, { values, success: "Situação atualizada." });
}

export async function createInviteAction(kind: "student" | "guardian", targetId: string): Promise<ActionState<{ token: string; expires_at: string }>> {
  return runRpc<{ token: string; expires_at: string }>("coach", "create_invitation", { p_kind: kind, p_target_id: targetId, p_email: null },
    { success: "Convite gerado." });
}

export async function revokeInviteAction(invitationId: string, _: ActionState) {
  return runRpc("coach", "revoke_invitation", { p_invitation_id: invitationId }, { success: "Convite revogado." });
}

/** Validade do link de nova senha: espelha `auth.email.otp_expiry` em supabase/config.toml. */
const PASSWORD_LINK_SECONDS = 3600;

/**
 * Link de nova senha que o professor envia pelo WhatsApp (sem e-mail). A RPC autoriza e
 * audita; o link é gerado com a chave de serviço e mostrado uma única vez.
 */
export async function createPasswordLinkAction(
  kind: "student" | "guardian", targetId: string,
): Promise<ActionState<{ url: string; expires_at: string }>> {
  const auth = await runRpc<string>("coach", "authorize_password_link", { p_kind: kind, p_target_id: targetId });
  if (!auth.ok || !auth.data) return { ok: false, message: auth.message, redirectTo: auth.redirectTo };
  const admin = createSupabaseAdminClient();
  const { data: user, error: userError } = await admin.auth.admin.getUserById(auth.data);
  const email = user?.user?.email;
  if (userError || !email) {
    logServerError("password-link:user", userError);
    return { ok: false, message: "Não foi possível gerar o link agora." };
  }
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (error) {
    logServerError("password-link", error);
    return { ok: false, message: "Não foi possível gerar o link agora." };
  }
  return {
    ok: true,
    data: {
      url: `${env().APP_URL}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery`,
      expires_at: new Date(Date.now() + PASSWORD_LINK_SECONDS * 1000).toISOString(),
    },
  };
}

export async function revokeAccessAction(kind: "student" | "guardian", targetId: string, _: ActionState, fd: FormData) {
  const reason = str(fd, "reason");
  if (reason.length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo." } };
  return runRpc("coach", "revoke_account_access", { p_kind: kind, p_target_id: targetId, p_reason: reason }, { success: "Acesso revogado." });
}

export async function linkGuardianAction(studentId: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  let guardianId = opt(fd, "guardian_id");
  if (!guardianId) {
    const name = str(fd, "guardian_full_name");
    if (name.length < 2) return { ok: false, fieldErrors: { guardian_full_name: "Informe o nome ou escolha um responsável." }, values };
    const created = await runRpc<string>("coach", "create_guardian", {
      p_payload: { full_name: name, email: opt(fd, "guardian_email")?.toLowerCase() ?? null, phone: opt(fd, "guardian_phone") },
    }, { values });
    if (!created.ok) return created;
    guardianId = created.data!;
  }
  return runRpc("coach", "link_guardian_student", { p_guardian_id: guardianId, p_student_id: studentId, p_relationship: opt(fd, "relationship") },
    { values, success: "Responsável vinculado." });
}

export async function unlinkGuardianAction(linkId: string, _: ActionState, fd: FormData) {
  const reason = str(fd, "reason");
  if (reason.length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo." } };
  return runRpc("coach", "unlink_guardian_student", { p_link_id: linkId, p_reason: reason }, { success: "Vínculo revogado." });
}

export async function createEnrollmentAction(studentId: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  const from = str(fd, "valid_from");
  const until = opt(fd, "valid_until");
  if (!str(fd, "series_id")) return { ok: false, fieldErrors: { series_id: "Escolha o horário." }, values };
  if (!isValidDate(from)) return { ok: false, fieldErrors: { valid_from: "Data inválida." }, values };
  if (until && !isValidDate(until)) return { ok: false, fieldErrors: { valid_until: "Data inválida." }, values };
  return runRpc("coach", "create_enrollment", { p_student_id: studentId, p_series_id: str(fd, "series_id"), p_valid_from: from, p_valid_until: until },
    { values, success: "Matrícula criada." });
}

export async function endEnrollmentAction(enrollmentId: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  const last = str(fd, "last_date");
  if (!isValidDate(last)) return { ok: false, fieldErrors: { last_date: "Data inválida." }, values };
  if (str(fd, "reason").length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo." }, values };
  return runRpc("coach", "end_enrollment", { p_enrollment_id: enrollmentId, p_last_date: last, p_reason: str(fd, "reason") },
    { values, success: "Matrícula encerrada." });
}

export async function setTuitionAction(studentId: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  const cents = parseBRLToCents(str(fd, "amount"));
  const due = Number(str(fd, "due_day"));
  const month = str(fd, "starts_month");
  const errors: Record<string, string> = {};
  if (!cents) errors.amount = "Valor inválido (ex.: 250,00).";
  if (!Number.isInteger(due) || due < 1 || due > 31) errors.due_day = "Dia entre 1 e 31.";
  if (!/^\d{4}-\d{2}$/.test(month)) errors.starts_month = "Escolha o mês.";
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, values };
  return runRpc("coach", "set_tuition_term", {
    p_student_id: studentId, p_amount_cents: cents, p_due_day: due, p_starts_month: `${month}-01`, p_ends_month: null, p_notes: opt(fd, "notes"),
  }, { values, success: "Plano de mensalidade salvo. Cobranças já emitidas não mudam." });
}

export async function manualInvoiceAction(studentId: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  const cents = parseBRLToCents(str(fd, "amount"));
  const month = str(fd, "competence");
  const due = str(fd, "due_date");
  const errors: Record<string, string> = {};
  if (!cents) errors.amount = "Valor inválido.";
  if (!/^\d{4}-\d{2}$/.test(month)) errors.competence = "Escolha a competência.";
  if (!isValidDate(due)) errors.due_date = "Data inválida.";
  if (str(fd, "reason").length < 3) errors.reason = "Informe a justificativa.";
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, values };
  return runRpc("coach", "create_manual_invoice", {
    p_student_id: studentId, p_competence: `${month}-01`, p_amount_cents: cents, p_due_date: due, p_reason: str(fd, "reason"),
  }, { values, success: "Cobrança criada." });
}

export async function studentPolicyAction(studentId: string, _: ActionState, fd: FormData) {
  const mode = opt(fd, "mode");
  const grace = Number(str(fd, "grace_days") || "0");
  if (!Number.isInteger(grace) || grace < 0 || grace > 60) return { ok: false, fieldErrors: { grace_days: "Entre 0 e 60 dias." }, values: allValues(fd) };
  return runRpc("coach", "set_access_policy", { p_student_id: studentId, p_mode: mode, p_grace_days: grace },
    { values: allValues(fd), success: mode ? "Regra específica salva." : "Aluno volta a seguir a regra geral." });
}

export async function createOverrideAction(studentId: string, tz: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  const kind = str(fd, "kind");
  const reason = str(fd, "reason");
  const expiresLocal = opt(fd, "expires_at");
  const expires = expiresLocal ? zonedLocalToIso(expiresLocal, tz) : null;
  if (!["release", "block_requests", "restrict_modules"].includes(kind)) return { ok: false, fieldErrors: { kind: "Escolha o tipo." }, values };
  if (reason.length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo." }, values };
  if (kind === "release" && !expires) return { ok: false, fieldErrors: { expires_at: "Liberação temporária precisa de prazo." }, values };
  return runRpc("coach", "create_access_override", { p_student_id: studentId, p_kind: kind, p_reason: reason, p_expires_at: expires },
    { values, success: "Regra registrada." });
}

export async function revokeOverrideAction(overrideId: string, _: ActionState) {
  return runRpc("coach", "revoke_access_override", { p_override_id: overrideId, p_reason: "Revogada pelo professor" }, { success: "Regra revogada." });
}

export async function saveGoalAction(goalId: string | null, studentId: string, _: ActionState, fd: FormData) {
  const values = allValues(fd);
  if (str(fd, "description").length < 3) return { ok: false, fieldErrors: { description: "Descreva a meta." }, values };
  const target = opt(fd, "target_date");
  if (target && !isValidDate(target)) return { ok: false, fieldErrors: { target_date: "Data inválida." }, values };
  return runRpc("coach", "save_goal", {
    p_goal_id: goalId, p_student_id: studentId,
    p_payload: { description: str(fd, "description"), target_date: target, status: str(fd, "status") || "open", visible_to_student: fd.get("visible") === "on" },
  }, { values: goalId ? values : undefined, success: "Meta salva." });
}
