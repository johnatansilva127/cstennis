import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireCoach } from "@/lib/auth";
import { formatDate, formatDateTime, monthLabel, todayInTz } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { INVOICE_STATUS, PAYMENT_METHOD, SUBMISSION_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionForm, Hidden, SelectField, TextField } from "@/components/ui/form";
import { adjustInvoiceAction, cancelInvoiceAction, manualPaymentAction, reversePaymentAction } from "../../actions";

export const metadata: Metadata = { title: "Cobrança" };

export default async function InvoicePage({ params }: PageProps<"/professor/financeiro/cobrancas/[id]">) {
  const { id } = await params;
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const { data: inv } = await supabase.from("invoices").select("*, students(id, full_name)").eq("id", id).maybeSingle();
  if (!inv) notFound();
  const [subs, payments] = await Promise.all([
    supabase.from("payment_submissions").select("id, status, created_at, received_at, reviewed_at, rejection_reason, payer_note, file_id, file_objects(scan_status, detected_type)")
      .eq("invoice_id", id).neq("status", "uploading").order("created_at", { ascending: false }),
    supabase.from("payments").select("id, amount_cents, paid_on, method, source, justification, created_at, reversed_at, payment_reversals(reason, created_at)")
      .eq("invoice_id", id).order("created_at", { ascending: false }),
  ]);
  const overdue = (inv.status === "open" || inv.status === "under_review") && inv.due_date < today;
  const st = overdue ? INVOICE_STATUS.overdue : INVOICE_STATUS[inv.status];
  const pendingProof = (subs.data ?? []).some((s) => s.status === "received" || s.status === "under_review");
  const amountInput = (inv.amount_cents / 100).toFixed(2).replace(".", ",");

  return (
    <>
      <PageHeader back={{ href: "/professor/financeiro", label: "Financeiro" }} eyebrow={monthLabel(inv.competence)}
        title={inv.students?.full_name ?? "Cobrança"}
        description={<Link href={`/professor/alunos/${inv.student_id}?aba=financeiro`} className="font-semibold text-link">Ver ficha do aluno</Link>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Cobrança" action={<StatusBadge tone={st.tone}>{st.label}</StatusBadge>} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="label-caps text-muted">Valor</dt><dd className="font-display text-2xl font-bold">{formatBRL(inv.amount_cents)}</dd></div>
            <div><dt className="label-caps text-muted">Vencimento</dt><dd className="font-semibold">{formatDate(inv.due_date)}</dd></div>
            {inv.original_amount_cents !== inv.amount_cents ? (
              <div className="col-span-2"><dt className="label-caps text-muted">Valor original</dt><dd>{formatBRL(inv.original_amount_cents)} · ajuste: {inv.adjustment_reason}</dd></div>
            ) : null}
            <div><dt className="label-caps text-muted">Origem</dt><dd>{inv.generated_by === "job" ? "Automática (plano)" : "Manual"}</dd></div>
            {inv.paid_at ? <div><dt className="label-caps text-muted">Quitada em</dt><dd>{formatDateTime(inv.paid_at, org.timezone)}</dd></div> : null}
            {inv.cancel_reason ? <div className="col-span-2"><dt className="label-caps text-muted">Cancelamento</dt><dd>{inv.cancel_reason}</dd></div> : null}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Pagamentos" />
          {(payments.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum pagamento confirmado.</p> : (
            <ul className="space-y-3">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="rounded-xl border border-border p-3 text-sm">
                  <p className="font-semibold">{formatBRL(p.amount_cents)} · {PAYMENT_METHOD[p.method]} · pago em {formatDate(p.paid_on)}</p>
                  <p className="text-muted">{p.source === "manual" ? `Baixa manual: ${p.justification}` : "Aprovação de comprovante"} · registrado {formatDateTime(p.created_at, org.timezone)}</p>
                  {p.reversed_at ? (
                    <Alert tone="warning" className="mt-2" title="Estornado">{p.payment_reversals?.[0]?.reason} · {formatDateTime(p.reversed_at, org.timezone)}</Alert>
                  ) : (
                    <div className="mt-2">
                      <Disclosure summary="Estornar este pagamento">
                        <ActionForm action={reversePaymentAction.bind(null, p.id)} submitLabel="Estornar" submitVariant="danger"
                          confirm="Estornar o pagamento? O registro é mantido e a cobrança volta a ficar em aberto.">
                          <TextField name="reason" label="Motivo do estorno" required />
                          <TextField name="mfa_code" label="Código do autenticador" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
                            hint="Ações financeiras sensíveis exigem confirmação em duas etapas." />
                        </ActionForm>
                      </Disclosure>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Comprovantes enviados" />
          {(subs.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum comprovante enviado.</p> : (
            <ul className="divide-y divide-border text-sm">
              {(subs.data ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1">Enviado {formatDateTime(s.received_at ?? s.created_at, org.timezone)}{s.rejection_reason ? ` · ${s.rejection_reason}` : ""}</span>
                  {s.file_objects?.scan_status === "clean" ? <a className="font-semibold text-link" href={`/api/arquivos/${s.file_id}`} target="_blank" rel="noopener noreferrer">Abrir</a>
                    : <StatusBadge tone="warning">Em quarentena</StatusBadge>}
                  <StatusBadge tone={SUBMISSION_STATUS[s.status].tone}>{SUBMISSION_STATUS[s.status].label}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
          {pendingProof ? <p className="mt-3 text-sm"><Link className="font-semibold text-link" href="/professor/financeiro/comprovantes">Conferir comprovante pendente</Link></p> : null}
        </Card>

        {inv.status === "open" || inv.status === "under_review" ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Ações" />
            <div className="space-y-3">
              {inv.status === "open" && !pendingProof ? (
                <Disclosure summary="Registrar baixa manual (valor integral)">
                  <ActionForm action={manualPaymentAction.bind(null, id)} submitLabel="Registrar pagamento">
                    <Hidden name="idempotency_key" value={randomUUID()} />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <TextField name="amount" label="Valor recebido (R$)" defaultValue={amountInput} inputMode="decimal" required />
                      <TextField name="paid_on" type="date" label="Data do pagamento" defaultValue={today} max={today} required />
                      <SelectField name="method" label="Meio" defaultValue="pix" options={Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }))} />
                    </div>
                    <TextField name="justification" label="Justificativa / conferência" required placeholder="Ex.: Pix conferido no extrato em 05/10" />
                  </ActionForm>
                </Disclosure>
              ) : null}
              {inv.status === "open" ? (
                <Disclosure summary="Ajustar valor ou vencimento">
                  <ActionForm action={adjustInvoiceAction.bind(null, id)} submitLabel="Salvar ajuste">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField name="amount" label="Novo valor (R$)" defaultValue={amountInput} inputMode="decimal" required />
                      <TextField name="due_date" type="date" label="Novo vencimento" defaultValue={inv.due_date} required />
                    </div>
                    <TextField name="reason" label="Justificativa" required />
                  </ActionForm>
                </Disclosure>
              ) : null}
              <Disclosure summary="Cancelar cobrança">
                <ActionForm action={cancelInvoiceAction.bind(null, id)} submitLabel="Cancelar cobrança" submitVariant="danger"
                  confirm="Cancelar esta cobrança? O registro permanece no histórico.">
                  <TextField name="reason" label="Motivo" required />
                </ActionForm>
              </Disclosure>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
