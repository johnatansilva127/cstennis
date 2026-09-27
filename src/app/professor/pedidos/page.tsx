import type { Metadata } from "next";
import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { formatDate, formatDateTime, formatTime, todayInTz, weekdayLabel } from "@/lib/dates";
import { FORMAT_LABEL, REQUEST_STATUS, RESTRICTION_LEVEL } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert, StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { ActionForm, CheckboxField, SubmitButton, TextField } from "@/components/ui/form";
import { decideRequestAction } from "../agenda/actions";

export const metadata: Metadata = { title: "Pedidos de vaga" };

export default async function RequestsPage() {
  const { supabase, org } = await requireCoach();
  const today = todayInTz(org.timezone);
  const { data } = await supabase.from("enrollment_requests")
    .select("id, status, desired_start, message, created_at, decided_at, decision_reason, student_id, students(full_name), recurring_slots(weekday, start_time, format, capacity, title, locations(name))")
    .order("created_at", { ascending: false }).limit(60);
  type R = { id: string; status: string; desired_start: string; message: string | null; created_at: string; decided_at: string | null; decision_reason: string | null;
    student_id: string; students: { full_name: string }; recurring_slots: { weekday: number; start_time: string; format: string; capacity: number; title: string | null; locations: { name: string } } };
  const rows = (data ?? []) as unknown as R[];
  const pending = rows.filter((r) => r.status === "pending");
  const restrictions = await Promise.all(pending.map((r) => supabase.rpc("student_restriction", { p_student_id: r.student_id })));
  const history = rows.filter((r) => r.status !== "pending");

  return (
    <>
      <PageHeader title="Pedidos de vaga" description="Pedidos pendentes não ocupam vaga. A aprovação revalida capacidade, conflitos e restrições." />
      {pending.length === 0 ? <EmptyState title="Nenhum pedido pendente" /> : (
        <div className="space-y-4">
          {pending.map((r, i) => {
            const level = (restrictions[i].data as { level: string } | null)?.level ?? "none";
            const s = r.recurring_slots;
            return (
              <Card key={r.id}>
                <div className="mb-3">
                  <Link href={`/professor/alunos/${r.student_id}`} className="font-display text-lg font-bold text-link">{r.students.full_name}</Link>
                  <p className="text-sm">{weekdayLabel(s.weekday)} {formatTime(s.start_time)} · {s.title ?? FORMAT_LABEL[s.format]} · {s.locations.name}</p>
                  <p className="text-sm text-muted">Início desejado {formatDate(r.desired_start)} · pedido em {formatDateTime(r.created_at, org.timezone)}</p>
                  {r.message ? <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">“{r.message}”</p> : null}
                </div>
                {level !== "none" ? <Alert tone={RESTRICTION_LEVEL[level].tone} className="mb-3" title={RESTRICTION_LEVEL[level].label}>{RESTRICTION_LEVEL[level].description}</Alert> : null}
                <ActionForm action={decideRequestAction.bind(null, r.id)} hideSubmit>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField name="valid_from" type="date" label="Início da vaga" defaultValue={r.desired_start < today ? today : r.desired_start} min={today} />
                    <TextField name="reason" label="Mensagem / motivo (obrigatório para recusar)" />
                  </div>
                  {level === "block_requests" || level === "restrict_modules" ? (
                    <CheckboxField name="override" label="Aprovar mesmo com restrição financeira (fica registrado)" />
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton name="intent" value="approve" pendingLabel="Processando…">Aprovar</SubmitButton>
                    <SubmitButton name="intent" value="reject" variant="danger" pendingLabel="Processando…">Recusar</SubmitButton>
                  </div>
                </ActionForm>
              </Card>
            );
          })}
        </div>
      )}
      {history.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold">Decididos recentemente</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="flex-1 font-semibold">{r.students.full_name} · {weekdayLabel(r.recurring_slots.weekday, true)} {formatTime(r.recurring_slots.start_time)}</span>
                {r.decision_reason ? <span className="text-muted">{r.decision_reason}</span> : null}
                <StatusBadge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
