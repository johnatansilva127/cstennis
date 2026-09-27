import Link from "next/link";
import { ActionForm, SelectField, TextField } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { Disclosure } from "@/components/ui/disclosure";
import { currentSeries } from "@/lib/data/series";
import { addDays, formatDate, formatShortDate, formatTime, endTime, weekdayLabel } from "@/lib/dates";
import { ATTENDANCE_STATUS, FORMAT_LABEL, OCCURRENCE_STATUS } from "@/lib/labels";
import type { TabProps } from "./types";
import { createEnrollmentAction, endEnrollmentAction } from "./actions";

type Lesson = { occurrence_id: string; local_date: string; start_time: string; duration_minutes: number; status: string;
  location_name: string; court_name: string | null; attendance: string | null; cancel_reason: string | null };

export async function TabAulas({ studentId, supabase, today }: TabProps) {
  const [enrollments, series, lessons] = await Promise.all([
    supabase.from("enrollments")
      .select("id, valid_from, valid_until, status, source, end_reason, recurring_slots(weekday, start_time, duration_minutes, format, title, locations(name))")
      .eq("student_id", studentId).order("valid_from", { ascending: false }),
    currentSeries(supabase, today),
    supabase.rpc("student_lessons", { p_student_id: studentId, p_from: addDays(today, -30), p_to: addDays(today, 30) }),
  ]);
  type Enr = { id: string; valid_from: string; valid_until: string | null; status: string; source: string; end_reason: string | null;
    recurring_slots: { weekday: number; start_time: string; duration_minutes: number; format: string; title: string | null; locations: { name: string } } };
  const all = (enrollments.data ?? []) as unknown as Enr[];
  const current = all.filter((e) => e.status === "active" && (!e.valid_until || e.valid_until >= today));
  const past = all.filter((e) => !current.includes(e));
  const upcoming = ((lessons.data ?? []) as Lesson[]).filter((l) => l.local_date >= today).slice(0, 10);
  const recent = ((lessons.data ?? []) as Lesson[]).filter((l) => l.local_date < today).reverse().slice(0, 10);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Vagas fixas" />
        {current.length === 0 ? <EmptyState title="Sem vagas fixas" description="Adicione o aluno a um horário abaixo." /> : (
          <ul className="space-y-3">
            {current.map((e) => (
              <li key={e.id} className="rounded-xl border border-border p-3">
                <p className="font-semibold">
                  {weekdayLabel(e.recurring_slots.weekday)} {formatTime(e.recurring_slots.start_time)}–{endTime(e.recurring_slots.start_time, e.recurring_slots.duration_minutes)}
                  {" · "}{e.recurring_slots.title ?? FORMAT_LABEL[e.recurring_slots.format]}
                </p>
                <p className="text-sm text-muted">{e.recurring_slots.locations.name} · desde {formatDate(e.valid_from)}{e.valid_until ? ` até ${formatDate(e.valid_until)}` : ""}</p>
                <div className="mt-2">
                  <Disclosure summary="Encerrar vaga">
                    <ActionForm action={endEnrollmentAction.bind(null, e.id)} submitLabel="Encerrar" submitVariant="danger">
                      <TextField name="last_date" type="date" label="Última aula" defaultValue={today} required />
                      <TextField name="reason" label="Motivo" required />
                    </ActionForm>
                  </Disclosure>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Disclosure summary="Adicionar a um horário">
            {series.length === 0 ? <p className="text-sm text-muted">Nenhum horário cadastrado.</p> : (
              <ActionForm action={createEnrollmentAction.bind(null, studentId)} submitLabel="Matricular" resetOnSuccess>
                <SelectField name="series_id" label="Horário" required placeholder="Selecione"
                  options={series.map((s) => ({ value: s.id, label: `${weekdayLabel(s.weekday)} ${formatTime(s.start_time)} · ${s.title ?? FORMAT_LABEL[s.format]} · ${s.location_name} · ${s.occupied}/${s.capacity}` }))} />
                <TextField name="valid_from" type="date" label="Início" defaultValue={today} required />
                <TextField name="valid_until" type="date" label="Fim (opcional)" />
              </ActionForm>
            )}
          </Disclosure>
        </div>
        {past.length > 0 ? (
          <div className="mt-4">
            <Disclosure summary={`Histórico de vagas (${past.length})`}>
              <ul className="space-y-2 text-sm">
                {past.map((e) => (
                  <li key={e.id} className="text-muted">
                    {weekdayLabel(e.recurring_slots.weekday)} {formatTime(e.recurring_slots.start_time)} · {formatDate(e.valid_from)} – {e.valid_until ? formatDate(e.valid_until) : "—"}
                    {e.status === "cancelled" ? " (cancelada)" : ""}{e.end_reason ? ` · ${e.end_reason}` : ""}
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Próximas aulas" />
        {upcoming.length === 0 ? <EmptyState title="Nenhuma aula nos próximos 30 dias" /> : (
          <LessonList items={upcoming} />
        )}
        <h3 className="mb-2 mt-6 font-display font-bold">Últimas aulas</h3>
        {recent.length === 0 ? <p className="text-sm text-muted">Sem aulas nos últimos 30 dias.</p> : <LessonList items={recent} />}
      </Card>
    </div>
  );
}

function LessonList({ items }: { items: Lesson[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((l) => (
        <li key={l.occurrence_id}>
          <Link href={`/professor/aulas/${l.occurrence_id}`} className="flex min-h-12 flex-wrap items-center gap-2 py-2 text-sm">
            <span className="w-24 font-semibold">{formatShortDate(l.local_date)}</span>
            <span className="w-12">{formatTime(l.start_time)}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{l.location_name}</span>
            {l.status !== "scheduled" ? <StatusBadge tone={OCCURRENCE_STATUS[l.status].tone}>{OCCURRENCE_STATUS[l.status].label}</StatusBadge> : null}
            {l.status === "completed" ? (
              <StatusBadge tone={ATTENDANCE_STATUS[l.attendance ?? "none"].tone}>{ATTENDANCE_STATUS[l.attendance ?? "none"].label}</StatusBadge>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
