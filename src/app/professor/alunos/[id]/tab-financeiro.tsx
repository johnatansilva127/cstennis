import Link from "next/link";
import { ActionForm, TextField } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { Disclosure } from "@/components/ui/disclosure";
import { formatBRL } from "@/lib/money";
import { formatDate, monthLabel } from "@/lib/dates";
import { INVOICE_STATUS } from "@/lib/labels";
import type { TabProps } from "./types";
import { manualInvoiceAction, setTuitionAction } from "./actions";

export async function TabFinanceiro({ studentId, supabase, today }: TabProps) {
  const [terms, invoices] = await Promise.all([
    supabase.from("tuition_terms").select("*").eq("student_id", studentId).order("starts_month", { ascending: false }),
    supabase.from("invoices").select("id, competence, amount_cents, original_amount_cents, due_date, status").eq("student_id", studentId)
      .order("competence", { ascending: false }).limit(24),
  ]);
  const month = today.slice(0, 7);
  const current = (terms.data ?? []).find((t) => t.starts_month <= `${month}-01` && (!t.ends_month || t.ends_month >= `${month}-01`));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Plano de mensalidade" />
        {current ? (
          <p className="mb-3 text-sm">
            <strong className="font-display text-2xl">{formatBRL(current.amount_cents)}</strong> por mês · vence todo dia {current.due_day}
            <span className="block text-muted">Vigente desde {monthLabel(current.starts_month)}{current.ends_month ? ` até ${monthLabel(current.ends_month)}` : ""}</span>
          </p>
        ) : <p className="mb-3 text-sm text-muted">Nenhum plano vigente neste mês.</p>}
        <Disclosure summary={current ? "Reajustar ou alterar vencimento" : "Definir plano"}>
          <ActionForm action={setTuitionAction.bind(null, studentId)} submitLabel="Salvar plano">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField name="amount" label="Valor (R$)" inputMode="decimal" required placeholder="250,00" />
              <TextField name="due_day" type="number" min={1} max={31} label="Vencimento (dia)" required defaultValue={current?.due_day} />
              <TextField name="starts_month" type="month" label="A partir de" required defaultValue={month} min={month} />
            </div>
            <TextField name="notes" label="Observação (opcional)" />
            <p className="text-xs text-muted">Não há reajuste retroativo: cobranças já emitidas mantêm valor e vencimento.</p>
          </ActionForm>
        </Disclosure>
        {(terms.data ?? []).length > 1 ? (
          <div className="mt-3">
            <Disclosure summary="Histórico de planos">
              <ul className="space-y-1 text-sm text-muted">
                {(terms.data ?? []).map((t) => (
                  <li key={t.id}>{monthLabel(t.starts_month)} – {t.ends_month ? monthLabel(t.ends_month) : "atual"}: {formatBRL(t.amount_cents)}, dia {t.due_day}</li>
                ))}
              </ul>
            </Disclosure>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Cobranças" action={<Link href={`/professor/financeiro?aluno=${studentId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-link">Ver no financeiro</Link>} />
        {(invoices.data ?? []).length === 0 ? <EmptyState title="Nenhuma cobrança" description="As cobranças são geradas automaticamente a partir do plano." /> : (
          <ul className="divide-y divide-border">
            {(invoices.data ?? []).map((i) => {
              const overdue = (i.status === "open" || i.status === "under_review") && i.due_date < today;
              const st = overdue ? INVOICE_STATUS.overdue : INVOICE_STATUS[i.status];
              return (
                <li key={i.id}>
                  <Link href={`/professor/financeiro/cobrancas/${i.id}`} className="flex min-h-12 flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="flex-1 font-semibold capitalize">{monthLabel(i.competence)}</span>
                    <span>{formatBRL(i.amount_cents)}</span>
                    <span className="text-muted">vence {formatDate(i.due_date)}</span>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4">
          <Disclosure summary="Criar cobrança avulsa (com justificativa)">
            <ActionForm action={manualInvoiceAction.bind(null, studentId)} submitLabel="Criar cobrança" resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField name="competence" type="month" label="Competência" required defaultValue={month} />
                <TextField name="amount" label="Valor (R$)" inputMode="decimal" required />
                <TextField name="due_date" type="date" label="Vencimento" required />
              </div>
              <TextField name="reason" label="Justificativa" required />
            </ActionForm>
          </Disclosure>
        </div>
      </Card>
    </div>
  );
}
