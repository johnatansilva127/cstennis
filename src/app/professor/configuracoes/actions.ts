"use server";

import { allValues, opt, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { normalizePixKey, type PixKeyType } from "@/lib/pix/keys";

export async function updatePixAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const type = str(fd, "key_type") as PixKeyType;
  const errors: Record<string, string> = {};
  if (!["cpf", "cnpj", "email", "phone", "evp"].includes(type)) errors.key_type = "Escolha o tipo de chave.";
  else if (!normalizePixKey(type, str(fd, "pix_key"))) errors.pix_key = "Chave inválida para o tipo escolhido.";
  if (str(fd, "receiver_name").length < 2) errors.receiver_name = "Informe o nome do recebedor.";
  if (str(fd, "city").length < 2) errors.city = "Informe a cidade.";
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, values };
  return runRpc("coach", "update_pix_settings", {
    p_receiver_name: str(fd, "receiver_name"), p_key_type: type, p_pix_key: str(fd, "pix_key"), p_city: str(fd, "city"),
    p_brcode_enabled: fd.get("brcode_enabled") === "on",
  }, { values, success: "Dados Pix atualizados. A alteração foi registrada e você recebeu um aviso." });
}

export async function orgPolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const grace = Number(str(fd, "grace_days"));
  if (!Number.isInteger(grace) || grace < 0 || grace > 60) return { ok: false, fieldErrors: { grace_days: "Entre 0 e 60 dias." }, values: allValues(fd) };
  return runRpc("coach", "set_access_policy", { p_student_id: null, p_mode: str(fd, "mode"), p_grace_days: grace },
    { values: allValues(fd), success: "Regra geral salva. Indicadores foram recalculados." });
}

export async function orgSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const num = (k: string) => Number(str(fd, k));
  const settings: Record<string, unknown> = {
    name: str(fd, "name"),
    invitation_ttl_hours: num("invitation_ttl_hours"),
    invoice_lead_days: num("invoice_lead_days"),
    default_travel_buffer_minutes: num("default_travel_buffer_minutes"),
    lesson_reminder_hours: num("lesson_reminder_hours"),
    due_soon_days: num("due_soon_days"),
    contact_info: opt(fd, "contact_info"),
  };
  return runRpc("coach", "update_organization_settings", { p_settings: settings }, { values, success: "Configurações salvas." });
}

export async function privacySettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const retention = opt(fd, "proof_retention_days");
  if (retention && (!Number.isInteger(Number(retention)) || Number(retention) < 30)) {
    return { ok: false, fieldErrors: { proof_retention_days: "Mínimo de 30 dias (ou deixe vazio para manter)." }, values: allValues(fd) };
  }
  return runRpc("coach", "update_organization_settings", {
    p_settings: {
      privacy_controller: opt(fd, "privacy_controller"), privacy_contact: opt(fd, "privacy_contact"),
      proof_retention_days: retention ? Number(retention) : null,
    },
  }, { values: allValues(fd), success: "Configurações de privacidade salvas." });
}

export async function resolvePrivacyAction(requestId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runRpc("coach", "resolve_privacy_request", { p_request_id: requestId, p_status: str(fd, "status"), p_resolution: opt(fd, "resolution") },
    { values: allValues(fd), success: "Solicitação atualizada." });
}
