import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2, RefreshCcw } from "lucide-react";
import { requireCoach } from "@/lib/auth";
import { addMonths, formatDate, monthLabel, todayInTz } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { INVOICE_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, Stat } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { ActionForm } from "@/components/ui/form";
import { generateInvoicesAction } from "./actions";

export const metadata: Metadata = { title: "Financeiro" };

type Summary = {
  expected_cents: number; expected_count: number; received_cents: number; received_count: number; receivable_cents: number;
  overdue_cents: number; overdue_count: number; under_review_cents: number; under_review_count: number; cancelled_cents: number;
  cancelled_count: number; reversed_cents: number; reversed_count: number;
};

export default async function FinancePage({ searchParams }: PageProps<"/professor/financeiro">) {
  const sp = await searchParams;
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const month = today.slice(0, 7);
  const from = typeof sp.de === "string" && /^\d{4}-\d{2}$/.test(sp.de) ? sp.de : month;
  const to = typeof sp.ate === "string" && /^\d{4}-\d{2}$/.test(sp.ate) && sp.ate >= from ? sp.ate : from;
  const status = typeof sp.status === "string" ? sp.status : "all";
  const studentId = typeof sp.aluno === "string" && /^[0-9a-f-]{36}$/.test(sp.aluno) ? sp.aluno : null;

  let invoiceQuery = supabase.from("invoices").select("id, competence, amount_cents, due_date, status, student_id, students(full_name)")
    .gte("competence", `${from}-01`).lte("competence", `${to}-01`).order("due_date").limit(300);
  if (studentId) invoiceQuery = invoiceQuery.eq("student_id", studentId);
  if (status === "overdue") invoiceQuery = invoiceQuery.in("status", ["open", "under_review"]).lt("due_date", today);
  else if (status !== "all") invoiceQuery = invoiceQuery.eq("status", status as "open" | "under_review" | "paid" | "cancelled");

  const [summary, invoices, students, proofs] = await Promise.all([
    supabase.rpc("finance_summary", { p_from_month: `${from}-01`, p_to_month: `${to}-01`, p_student_id: studentId as string }),
    invoiceQuery,
    supabase.from("students").select("id, full_name").order("full_name"),
    supabase.from("payment_submissions").select("id", { count: "exact", head: true }).in("status", ["received", "under_review"]),
  ]);
  const s = summary.data as Summary | null;
  type Inv = { id: string; competence: string; amount_cents: number; due_date: string; status: string; student_id: string; students: { full_name: string } };

  return (
    <>
      <PageHeader title="Financeiro" description="Mensalidades por Pix manual. O sistema não movimenta dinheiro: você confere no banco."
        actions={<>
          <ButtonLink href="/professor/financeiro/comprovantes" variant={proofs.count ? "primary" : "secondary"}>
            <FileCheck2 aria-hidden className="size-4" /> Comprovantes{proofs.count ? ` (${proofs.count})` : ""}
          </ButtonLink>
          <ButtonLink href="/professor/configuracoes/pix" variant="secondary">Dados Pix</ButtonLink>
        </>} />

      <form method="get" className="mb-4 grid gap-2 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-5">
        <label className="text-sm"><span className="label-caps block text-muted">De</span>
          <input type="month" name="de" defaultValue={from} className="mt-1 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3" /></label>
        <label className="text-sm"><span className="label-caps block text-muted">Até</span>
          <input type="month" name="ate" defaultValue={to} className="mt-1 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3" /></label>
        <label className="text-sm"><span className="label-caps block text-muted">Situação</span>
          <select name="status" defaultValue={status} className="mt-1 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3">
            <option value="all">Todas</option><option value="open">Em aberto</option><option value="under_review">Em análise</option>
            <option value="overdue">Em atraso</option><option value="paid">Pagas</option><option value="cancelled">Canceladas</option>
          </select></label>
        <label className="text-sm"><span className="label-caps block text-muted">Aluno</span>
          <select name="aluno" defaultValue={studentId ?? ""} className="mt-1 min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3">
            <option value="">Todos</option>
            {(students.data ?? []).map((st) => <option key={st.id} value={st.id}>{st.full_name}</option>)}
          </select></label>
        <div className="flex items-end"><button type="submit" className={buttonClasses("secondary", "md", true)}>Filtrar</button></div>
      </form>

      {s ? (
        <section aria-label="Indicadores" className="mb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Previsto" value={formatBRL(s.expected_cents)} hint={`${s.expected_count} cobrança(s) da competência`} />
            <Stat label="Recebido" value={formatBRL(s.received_cents)} tone="success" hint={`${s.received_count} pagamento(s) confirmados`} />
            <Stat label="A receber" value={formatBRL(s.receivable_cents)} hint="Em aberto, ainda no prazo" />
            <Stat label="Vencido" value={formatBRL(s.overdue_cents)} tone="danger" hint={`${s.overdue_count} em atraso`} />
            <Stat label="Em análise" value={formatBRL(s.under_review_cents)} tone="warning" hint={`${s.under_review_count} com comprovante`} />
          </div>
          <details className="rounded-xl bg-surface-2 p-3 text-sm">
            <summary className="min-h-11 cursor-pointer font-semibold">Como cada indicador é calculado</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li><strong>Previsto:</strong> soma das cobranças não canceladas cuja competência está no período.</li>
              <li><strong>Recebido:</strong> pagamentos confirmados por você (aprovação de comprovante ou baixa manual), pela data do pagamento, excluindo estornos.</li>
              <li><strong>A receber / Vencido:</strong> cobranças da competência ainda não pagas, separadas pelo vencimento em relação a hoje ({formatDate(today)}, horário de Brasília).</li>
              <li><strong>Em análise:</strong> cobranças com comprovante enviado aguardando conferência. Não é receita recebida.</li>
              <li>Cancelamentos ({s.cancelled_count}, {formatBRL(s.cancelled_cents)}) e estornos ({s.reversed_count}, {formatBRL(s.reversed_cents)}) aparecem à parte e não entram nos totais acima.</li>
            </ul>
          </details>
        </section>
      ) : null}

      <Card>
        <CardHeader title={`Cobranças · ${from === to ? monthLabel(`${from}-01`) : `${monthLabel(`${from}-01`)} a ${monthLabel(`${to}-01`)}`}`}
          action={<ActionForm action={generateInvoicesAction} submitLabel="Gerar cobranças agora" submitVariant="secondary" submitFull={false} pendingLabel="Gerando…">
            <span className="sr-only"><RefreshCcw /> Gera cobranças pendentes do mês atual e do próximo (conforme antecedência)</span>
          </ActionForm>} />
        {(invoices.data ?? []).length === 0 ? <EmptyState title="Nenhuma cobrança no filtro" description="As cobranças são geradas automaticamente pelos planos de mensalidade." /> : (
          <ul className="divide-y divide-border">
            {((invoices.data ?? []) as unknown as Inv[]).map((i) => {
              const overdue = (i.status === "open" || i.status === "under_review") && i.due_date < today;
              const st = overdue ? INVOICE_STATUS.overdue : INVOICE_STATUS[i.status];
              return (
                <li key={i.id}>
                  <Link href={`/professor/financeiro/cobrancas/${i.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:bg-surface-2">
                    <span className="min-w-40 flex-1 font-semibold">{i.students.full_name}</span>
                    <span className="capitalize text-muted">{monthLabel(i.competence)}</span>
                    <span className="w-24 font-semibold">{formatBRL(i.amount_cents)}</span>
                    <span className="w-28 text-muted">vence {formatDate(i.due_date)}</span>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Navegar: <Link className="text-link" href={`/professor/financeiro?de=${addMonths(`${from}-01`, -1).slice(0, 7)}&ate=${addMonths(`${from}-01`, -1).slice(0, 7)}`}>mês anterior</Link> · <Link className="text-link" href={`/professor/financeiro?de=${addMonths(`${to}-01`, 1).slice(0, 7)}&ate=${addMonths(`${to}-01`, 1).slice(0, 7)}`}>próximo mês</Link></p>
    </>
  );
}
