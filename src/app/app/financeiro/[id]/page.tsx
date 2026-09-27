import type { Metadata } from "next";
import { participantContext } from "@/lib/participant";
import { formatDate, formatDateTime, monthLabel, todayInTz } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { displayPixKey, PIX_KEY_LABELS, type PixKeyType } from "@/lib/pix/keys";
import { pixQr } from "@/lib/pix/qr";
import { INVOICE_STATUS, SUBMISSION_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { AccessDenied } from "@/components/ui/states";
import { CopyButton } from "@/components/ui/copy-button";
import { ActionForm } from "@/components/ui/form";
import { Disclosure } from "@/components/ui/disclosure";
import { ProofUpload } from "./proof-upload";
import { withdrawSubmissionAction } from "./actions";

export const metadata: Metadata = { title: "Mensalidade" };

type Instructions = { configured: boolean; receiver_name: string | null; key_type: PixKeyType | null; pix_key: string | null; city: string | null;
  brcode_enabled: boolean; amount_cents: number; competence: string; due_date: string; invoice_status: string };

export default async function InvoiceDetail({ params }: PageProps<"/app/financeiro/[id]">) {
  const { id } = await params;
  const { supabase, student, tz } = await participantContext();
  const { data: inv } = await supabase.from("invoices").select("id, competence, amount_cents, due_date, status, student_id, adjustment_reason, cancel_reason")
    .eq("id", id).eq("student_id", student.id).maybeSingle();
  if (!inv) return <><PageHeader title="Mensalidade" back={{ href: "/app/financeiro", label: "Mensalidades" }} /><AccessDenied backHref="/app/financeiro" /></>;
  const [{ data: instr }, { data: subs }] = await Promise.all([
    supabase.rpc("payment_instructions", { p_invoice_id: id }),
    supabase.from("payment_submissions").select("id, status, created_at, received_at, rejection_reason, file_id, file_objects(scan_status)")
      .eq("invoice_id", id).in("status", ["received", "under_review", "approved", "rejected"]).order("created_at", { ascending: false }),
  ]);
  const p = instr as Instructions;
  const today = todayInTz(tz);
  const overdue = (inv.status === "open" || inv.status === "under_review") && inv.due_date < today;
  const st = overdue ? INVOICE_STATUS.overdue : INVOICE_STATUS[inv.status];
  const payable = inv.status === "open" || inv.status === "under_review";
  const pending = (subs ?? []).find((s) => s.status === "received" || s.status === "under_review");
  const qr = payable && p.configured && p.brcode_enabled && p.pix_key && p.receiver_name && p.city
    ? await pixQr({ pixKey: p.pix_key, receiverName: p.receiver_name, city: p.city, amountCents: inv.amount_cents })
    : null;

  return (
    <>
      <PageHeader back={{ href: "/app/financeiro", label: "Mensalidades" }} eyebrow={monthLabel(inv.competence)} title={formatBRL(inv.amount_cents)}
        description={`Vencimento ${formatDate(inv.due_date)}`} />
      <div className="mb-4"><StatusBadge tone={st.tone}>{st.label}</StatusBadge></div>
      {inv.status === "paid" ? <Alert tone="success" className="mb-4" title="Pagamento confirmado pelo professor" /> : null}
      {inv.status === "cancelled" ? <Alert tone="neutral" className="mb-4" title="Cobrança cancelada">{inv.cancel_reason}</Alert> : null}

      {payable ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="1. Pague pelo Pix no app do seu banco" />
            {!p.configured ? <Alert tone="warning">O professor ainda não cadastrou os dados Pix. Fale com ele.</Alert> : (
              <div className="space-y-4">
                <dl className="space-y-3 text-sm">
                  <div><dt className="label-caps text-muted">Recebedor</dt><dd className="text-base font-semibold">{p.receiver_name}</dd></div>
                  <div><dt className="label-caps text-muted">Chave Pix ({PIX_KEY_LABELS[p.key_type!]})</dt>
                    <dd className="mt-1 break-all rounded-xl bg-surface-2 p-3 font-mono text-base">{displayPixKey(p.key_type!, p.pix_key!)}</dd></div>
                  <div><dt className="label-caps text-muted">Valor</dt><dd className="font-display text-2xl font-bold">{formatBRL(inv.amount_cents)}</dd></div>
                </dl>
                <CopyButton value={p.pix_key!} label="Copiar chave Pix" variant="primary" full />
                <Alert tone="info">
                  No app do banco, antes de confirmar, confira se o recebedor é <strong>{p.receiver_name}</strong> e o valor é{" "}
                  <strong>{formatBRL(inv.amount_cents)}</strong>. O CS Tennis não movimenta dinheiro nem confirma créditos automaticamente.
                </Alert>
                {qr ? (
                  <Disclosure summary="Usar QR Code ou Pix Copia e Cola">
                    <div className="space-y-3">
                      <div className="flex justify-center rounded-2xl bg-white p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qr.dataUrl} alt={`QR Code Pix de ${formatBRL(inv.amount_cents)} para ${p.receiver_name}`} width={220} height={220} />
                      </div>
                      <p className="break-all rounded-xl bg-surface-2 p-3 font-mono text-xs">{qr.payload}</p>
                      <CopyButton value={qr.payload} label="Copiar Pix Copia e Cola" />
                    </div>
                  </Disclosure>
                ) : null}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="2. Envie o comprovante" />
            {pending ? (
              <div className="space-y-3">
                <Alert tone="warning" title="Comprovante em análise">Enviado em {formatDateTime(pending.received_at ?? pending.created_at, tz)}. Aguarde a conferência do professor.</Alert>
                <ActionForm action={withdrawSubmissionAction.bind(null, pending.id)} submitLabel="Cancelar este envio" submitVariant="secondary"
                  confirm="Cancelar o envio para mandar outro arquivo?">
                  <p className="text-sm text-muted">Enviou o arquivo errado? Cancele e envie outro.</p>
                </ActionForm>
              </div>
            ) : <ProofUpload invoiceId={id} />}
          </Card>
        </div>
      ) : null}

      {(subs ?? []).length > 0 ? (
        <Card className="mt-5">
          <CardHeader title="Comprovantes enviados" />
          <ul className="divide-y divide-border text-sm">
            {(subs ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1">
                  {formatDateTime(s.received_at ?? s.created_at, tz)}
                  {s.rejection_reason ? <span className="block font-semibold text-danger">Motivo: {s.rejection_reason}</span> : null}
                </span>
                {s.file_objects?.scan_status === "clean" ? <a href={`/api/arquivos/${s.file_id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-link">Ver arquivo</a> : null}
                <StatusBadge tone={SUBMISSION_STATUS[s.status].tone}>{SUBMISSION_STATUS[s.status].label}</StatusBadge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
