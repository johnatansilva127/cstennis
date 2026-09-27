import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { participantContext } from "@/lib/participant";
import { formatDate, monthLabel, todayInTz } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { INVOICE_STATUS, PAYMENT_METHOD, RESTRICTION_LEVEL } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Mensalidades" };

export default async function ParticipantFinance() {
  const { supabase, student, tz, who } = await participantContext();
  const today = todayInTz(tz);
  const [invoices, payments, restriction, terms, org] = await Promise.all([
    supabase.from("invoices").select("id, competence, amount_cents, due_date, status").eq("student_id", student.id).order("competence", { ascending: false }).limit(36),
    supabase.from("payments").select("id, amount_cents, paid_on, method, reversed_at, invoice_id").eq("student_id", student.id).order("paid_on", { ascending: false }).limit(24),
    supabase.rpc("student_restriction", { p_student_id: student.id }),
    supabase.from("tuition_terms").select("amount_cents, due_day, starts_month, ends_month").eq("student_id", student.id).order("starts_month", { ascending: false }).limit(1),
    supabase.rpc("organization_public_info"),
  ]);
  const r = restriction.data as { level: string; mode: string; grace_days: number; overdue_count: number; oldest_due_date: string | null; effective_from: string | null; override_kind: string | null; override_expires_at: string | null } | null;
  const open = (invoices.data ?? []).filter((i) => i.status === "open" || i.status === "under_review");
  const closed = (invoices.data ?? []).filter((i) => i.status === "paid" || i.status === "cancelled");
  const term = terms.data?.[0];
  const contact = (org.data as { contact_info: string | null }[] | null)?.[0]?.contact_info;

  return (
    <>
      <PageHeader title="Mensalidades" description={who !== "você" ? student.full_name : "Pagamento por Pix no app do seu banco; depois envie o comprovante aqui."} />
      {r && r.level !== "none" ? (
        <Alert tone={RESTRICTION_LEVEL[r.level].tone} title={RESTRICTION_LEVEL[r.level].label} className="mb-4">
          {RESTRICTION_LEVEL[r.level].description}
          {r.overdue_count > 0 && r.mode !== "warn_only" && r.level === "warn" && r.effective_from
            ? ` Se não houver pagamento confirmado, a restrição começa em ${formatDate(r.effective_from)}.` : ""}
          {r.override_kind === "release" && r.override_expires_at ? " Liberação temporária concedida pelo professor." : ""}
          {" "}Enviar comprovante não suspende restrições: elas saem quando o professor confirma o pagamento.
        </Alert>
      ) : null}
      {term ? <p className="mb-4 text-sm text-muted">Plano atual: <strong className="text-text">{formatBRL(term.amount_cents)}</strong> por mês, vencimento todo dia {term.due_day}.</p> : null}

      <Card className="mb-5">
        <CardHeader title="Em aberto" />
        {open.length === 0 ? <EmptyState title="Tudo em dia" description="Não há mensalidades em aberto." /> : (
          <ul className="divide-y divide-border">
            {open.map((i) => {
              const overdue = i.due_date < today;
              const st = overdue ? INVOICE_STATUS.overdue : INVOICE_STATUS[i.status];
              return (
                <li key={i.id}>
                  <Link href={`/app/financeiro/${i.id}`} className="flex min-h-16 items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold capitalize">{monthLabel(i.competence)}</span>
                      <span className="block text-sm text-muted">{formatBRL(i.amount_cents)} · vence {formatDate(i.due_date)}</span>
                    </span>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    <ChevronRight aria-hidden className="size-4 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Histórico de cobranças" />
          {closed.length === 0 ? <p className="text-sm text-muted">Sem histórico.</p> : (
            <ul className="divide-y divide-border text-sm">
              {closed.map((i) => (
                <li key={i.id}>
                  <Link href={`/app/financeiro/${i.id}`} className="flex min-h-11 items-center justify-between gap-2 py-2">
                    <span className="capitalize">{monthLabel(i.competence)} · {formatBRL(i.amount_cents)}</span>
                    <StatusBadge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Pagamentos confirmados" />
          {(payments.data ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum pagamento confirmado.</p> : (
            <ul className="divide-y divide-border text-sm">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
                  <span>{formatDate(p.paid_on)} · {formatBRL(p.amount_cents)} · {PAYMENT_METHOD[p.method]}</span>
                  {p.reversed_at ? <StatusBadge tone="warning">Estornado</StatusBadge> : <StatusBadge tone="success">Confirmado</StatusBadge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {contact ? <Card className="mt-5"><CardHeader title="Dúvidas sobre pagamento" /><p className="whitespace-pre-line text-sm text-muted">{contact}</p></Card> : null}
    </>
  );
}
