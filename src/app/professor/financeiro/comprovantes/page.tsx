import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { formatDate, formatDateTime, monthLabel, todayInTz } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { PAYMENT_METHOD, SUBMISSION_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { buttonClasses } from "@/components/ui/button";
import { reviewSubmissionAction } from "../actions";

export const metadata: Metadata = { title: "Comprovantes" };

export default async function ProofsPage() {
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const { data } = await supabase.from("payment_submissions")
    .select("id, status, payer_note, created_at, received_at, file_id, invoice_id, student_id, students(full_name), invoices(competence, amount_cents, due_date), file_objects(detected_type, size_bytes, scan_status)")
    .in("status", ["received", "under_review"]).order("received_at");
  type P = { id: string; status: string; payer_note: string | null; created_at: string; received_at: string | null; file_id: string; invoice_id: string; student_id: string;
    students: { full_name: string }; invoices: { competence: string; amount_cents: number; due_date: string };
    file_objects: { detected_type: string; size_bytes: number; scan_status: string } };
  const rows = (data ?? []) as unknown as P[];
  return (
    <>
      <PageHeader back={{ href: "/professor/financeiro", label: "Financeiro" }} title="Comprovantes para conferir"
        description="Envio de comprovante não é pagamento: confira o crédito no seu banco antes de aprovar." />
      {rows.length === 0 ? <EmptyState title="Nenhum comprovante aguardando" /> : (
        <div className="space-y-4">
          {rows.map((p) => (
            <Card key={p.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/professor/financeiro/cobrancas/${p.invoice_id}`} className="font-display text-lg font-bold text-link">{p.students.full_name}</Link>
                  <p className="text-sm capitalize">{monthLabel(p.invoices.competence)} · <strong>{formatBRL(p.invoices.amount_cents)}</strong> · vence {formatDate(p.invoices.due_date)}</p>
                  <p className="text-sm text-muted">Enviado em {formatDateTime(p.received_at ?? p.created_at, org.timezone)} · {p.file_objects.detected_type.toUpperCase()} · {Math.ceil(p.file_objects.size_bytes / 1024)} KB</p>
                </div>
                <StatusBadge tone={SUBMISSION_STATUS[p.status].tone}>{SUBMISSION_STATUS[p.status].label}</StatusBadge>
              </div>
              {p.payer_note ? <p className="mb-3 rounded-xl bg-surface-2 p-3 text-sm">“{p.payer_note}”</p> : null}
              {p.file_objects.scan_status === "clean" ? (
                <a href={`/api/arquivos/${p.file_id}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "md")}>
                  <ExternalLink aria-hidden className="size-4" /> Abrir comprovante
                </a>
              ) : (
                <Alert tone="warning" title="Arquivo em quarentena">
                  {p.file_objects.scan_status === "pending"
                    ? "Aguardando verificação antimalware (serviço não configurado ou verificação pendente). Confira o crédito diretamente no banco."
                    : "A verificação antimalware falhou; o arquivo não pode ser aberto. Confira o crédito diretamente no banco."}
                </Alert>
              )}
              <ActionForm action={reviewSubmissionAction.bind(null, p.id)} hideSubmit className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField name="paid_on" type="date" label="Data do crédito" defaultValue={today} max={today} />
                  <SelectField name="method" label="Meio" defaultValue="pix" options={Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }))} />
                  <TextField name="reason" label="Motivo (se rejeitar)" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="intent" value="approve" pendingLabel="Confirmando…">Aprovar: crédito conferido</SubmitButton>
                  <SubmitButton name="intent" value="reject" variant="danger" pendingLabel="Rejeitando…">Rejeitar</SubmitButton>
                </div>
                <p className="text-xs text-muted">Nesta versão, a quitação é sempre do valor integral da cobrança. Se o valor pago divergir, rejeite com o motivo.</p>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
