"use server";

import { randomUUID } from "node:crypto";
import { allValues, runRpc, str } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { parseBRLToCents } from "@/lib/money";
import { isValidDate } from "@/lib/dates";

export async function generateInvoicesAction(_: ActionState): Promise<ActionState> {
  const res = await runRpc<number>("coach", "generate_invoices_now", {});
  if (!res.ok) return res;
  return { ok: true, message: res.data ? `${res.data} cobrança(s) gerada(s).` : "Nenhuma cobrança nova: tudo já estava gerado." };
}

export async function reviewSubmissionAction(submissionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const intent = str(fd, "intent");
  if (intent === "reject") {
    if (str(fd, "reason").length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo (o pagador verá)." }, values };
    return runRpc("coach", "review_payment_submission", { p_submission_id: submissionId, p_action: "reject", p_reason: str(fd, "reason"), p_paid_on: null, p_method: "pix" },
      { values, success: "Comprovante rejeitado. O pagador foi avisado e pode reenviar." });
  }
  const paidOn = str(fd, "paid_on");
  if (!isValidDate(paidOn)) return { ok: false, fieldErrors: { paid_on: "Data inválida." }, values };
  return runRpc("coach", "review_payment_submission", {
    p_submission_id: submissionId, p_action: "approve", p_reason: null, p_paid_on: paidOn, p_method: str(fd, "method") || "pix",
  }, { values, success: "Pagamento confirmado." });
}

export async function manualPaymentAction(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const cents = parseBRLToCents(str(fd, "amount"));
  const paidOn = str(fd, "paid_on");
  const errors: Record<string, string> = {};
  if (!cents) errors.amount = "Valor inválido.";
  if (!isValidDate(paidOn)) errors.paid_on = "Data inválida.";
  if (str(fd, "justification").length < 5) errors.justification = "Descreva como o pagamento foi conferido.";
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors, values };
  // Chave de idempotência gerada ao renderizar o formulário: reenvios/retries não duplicam.
  const key = /^[0-9a-f-]{36}$/.test(str(fd, "idempotency_key")) ? str(fd, "idempotency_key") : randomUUID();
  return runRpc("coach", "record_manual_payment", {
    p_invoice_id: invoiceId, p_amount_cents: cents, p_paid_on: paidOn, p_method: str(fd, "method") || "pix",
    p_justification: str(fd, "justification"), p_idempotency_key: key,
  }, { values, success: "Baixa registrada." });
}

export async function adjustInvoiceAction(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  const cents = parseBRLToCents(str(fd, "amount"));
  if (!cents) return { ok: false, fieldErrors: { amount: "Valor inválido." }, values };
  if (!isValidDate(str(fd, "due_date"))) return { ok: false, fieldErrors: { due_date: "Data inválida." }, values };
  if (str(fd, "reason").length < 3) return { ok: false, fieldErrors: { reason: "Informe a justificativa." }, values };
  return runRpc("coach", "adjust_invoice", { p_invoice_id: invoiceId, p_amount_cents: cents, p_due_date: str(fd, "due_date"), p_reason: str(fd, "reason") },
    { values, success: "Cobrança ajustada." });
}

export async function cancelInvoiceAction(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "reason").length < 3) return { ok: false, fieldErrors: { reason: "Informe o motivo." }, values: allValues(fd) };
  return runRpc("coach", "cancel_invoice", { p_invoice_id: invoiceId, p_reason: str(fd, "reason") }, { success: "Cobrança cancelada." });
}

export async function reversePaymentAction(paymentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const values = allValues(fd);
  if (str(fd, "reason").length < 5) return { ok: false, fieldErrors: { reason: "Descreva o motivo do estorno." }, values };
  return runRpc("coach", "reverse_payment", { p_payment_id: paymentId, p_reason: str(fd, "reason") },
    { values, success: "Estorno registrado. A cobrança voltou a ficar em aberto." });
}

export async function startReviewAction(submissionId: string, _: ActionState): Promise<ActionState> {
  return runRpc("coach", "review_payment_submission", { p_submission_id: submissionId, p_action: "start_review", p_reason: null, p_paid_on: null, p_method: "pix" },
    { success: "Marcado como em análise." });
}

