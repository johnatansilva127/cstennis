import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { participantContext } from "@/lib/participant";
import { addDays, endTime, formatShortDate, formatTime, todayInTz, weekdayLabel, formatDate } from "@/lib/dates";
import { ATTENDANCE_STATUS, FORMAT_LABEL, OCCURRENCE_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { RestrictedNotice } from "@/components/restricted";

export const metadata: Metadata = { title: "Aulas" };

type L = { occurrence_id: string; title: string | null; local_date: string; start_time: string; duration_minutes: number; status: string;
  cancel_reason: string | null; is_exception: boolean; format: string; location_name: string; court_name: string | null; attendance: string | null };

export default async function LessonsPage() {
  const { supabase, student, tz, restricted, who } = await participantContext();
  if (restricted) return <><PageHeader title="Aulas" /><RestrictedNotice who={who} /></>;
  const today = todayInTz(tz);
  const [{ data }, { data: enrollments }] = await Promise.all([
    supabase.rpc("student_lessons", { p_student_id: student.id, p_from: addDays(today, -60), p_to: addDays(today, 60) }),
    supabase.rpc("student_enrollments", { p_student_id: student.id }),
  ]);
  const lessons = (data ?? []) as L[];
  const upcoming = lessons.filter((l) => l.local_date >= today);
  const past = lessons.filter((l) => l.local_date < today).reverse();
  return (
    <>
      <PageHeader title="Aulas" description={who !== "você" ? `Agenda de ${student.full_name}` : undefined} />
      <Card className="mb-5">
        <CardHeader title="Vagas fixas" action={<Link href="/app/horarios" className="inline-flex min-h-11 items-center text-sm font-semibold text-link">Horários e pedidos</Link>} />
        {(enrollments ?? []).length === 0 ? <p className="text-sm text-muted">Nenhuma vaga fixa no momento.</p> : (
          <ul className="space-y-2 text-sm">
            {(enrollments ?? []).map((e) => (
              <li key={e.enrollment_id} className="rounded-xl bg-surface-2 p-3">
                <span className="font-semibold">{weekdayLabel(e.weekday)} {formatTime(e.start_time)}–{endTime(e.start_time, e.duration_minutes)}</span>
                <span className="block text-muted">{e.title ?? FORMAT_LABEL[e.format]} · {e.location_name}{e.court_name ? ` · ${e.court_name}` : ""}{e.valid_until ? ` · até ${formatDate(e.valid_until)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <section aria-labelledby="prox" className="mb-6">
        <h2 id="prox" className="mb-2 font-display text-lg font-bold">Próximas</h2>
        {upcoming.length === 0 ? <EmptyState title="Nenhuma aula agendada" /> : <LessonList items={upcoming} />}
      </section>
      <section aria-labelledby="ant">
        <h2 id="ant" className="mb-2 font-display text-lg font-bold">Anteriores (60 dias)</h2>
        {past.length === 0 ? <p className="text-sm text-muted">Sem aulas anteriores no período.</p> : <LessonList items={past} showAttendance />}
      </section>
    </>
  );
}

function LessonList({ items, showAttendance }: { items: L[]; showAttendance?: boolean }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {items.map((l) => (
        <li key={l.occurrence_id}>
          <Link href={`/app/aulas/${l.occurrence_id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <span className="w-20 shrink-0 text-sm font-semibold">{formatShortDate(l.local_date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{formatTime(l.start_time)} · {l.title ?? FORMAT_LABEL[l.format]}</span>
              <span className="block truncate text-sm text-muted">{l.location_name}{l.court_name ? ` · ${l.court_name}` : ""}</span>
              <span className="mt-1 flex flex-wrap gap-1">
                {l.status !== "scheduled" ? <StatusBadge tone={OCCURRENCE_STATUS[l.status].tone}>{OCCURRENCE_STATUS[l.status].label}</StatusBadge> : null}
                {l.is_exception && l.status === "scheduled" ? <StatusBadge tone="info">Remarcada</StatusBadge> : null}
                {showAttendance && l.status === "completed" ? <StatusBadge tone={ATTENDANCE_STATUS[l.attendance ?? "none"].tone}>{ATTENDANCE_STATUS[l.attendance ?? "none"].label}</StatusBadge> : null}
              </span>
            </span>
            <ChevronRight aria-hidden className="size-4 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
